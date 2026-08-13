"""
general_frame_fem.py
====================
General 2D elastic frame/truss FEM solver using OpenSeesPy.

Accepts arbitrary nodes, elements, supports and loads — not limited
to any fixed frame topology.

Node DOFs (2D, ndf=3): [ux, uy, rz]

Element types
-------------
'beam'  → elasticBeamColumn (axial + shear + bending)
'truss' → Truss (axial only, no bending)

Moment releases (beam elements only)
-------------------------------------
'none'  → fully rigid both ends
'start' → pin at node i
'end'   → pin at node j
'both'  → pin at both ends

Sign conventions
----------------
- eleLoad wy < 0 → downward (gravity direction)
- Nodal load Fx/Fy/Mz in global axes (x=right, y=up)
- eleForce returns [N_i, V_i, M_i, N_j, V_j, M_j] local coords

Dependencies: openseespy, opsvis, matplotlib
"""

# Catch Exception, not ImportError: openseespy ships a compiled extension, and
# an installed-but-unloadable build (missing MSVC runtime, unsupported Python)
# raises RuntimeError from its own import wrapper. Importing this module must
# degrade to "solver unavailable" in that case, not crash the whole backend.
try:
    import openseespy.opensees as ops
    _OPS_AVAILABLE = True
except Exception:
    ops = None
    _OPS_AVAILABLE = False

try:
    import opsvis as opsv
    _OPSVIS_AVAILABLE = True
except Exception:
    opsv = None
    _OPSVIS_AVAILABLE = False

import math
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import io
import base64


# ---------------------------------------------------------------------------
# Model validation
# ---------------------------------------------------------------------------

class ModelError(ValueError):
    """
    The model cannot be analysed, or the analysis produced a result that is not
    a structural response.

    Carries a message written for the engineer using the block, not a stack
    trace: the endpoint passes it straight through as the 422 detail.
    """
    pass


def _rz_stiffness_ends(el):
    """
    (bool, bool) — does this element restrain rotation at its i-end / j-end?

    Truss elements carry axial force only. A beam with both end moments
    released does the same. Neither contributes anything to the rz degree of
    freedom at its nodes.
    """
    if el.get('type', 'beam') == 'truss':
        return False, False
    rel = el.get('release', 'none')
    return rel not in ('start', 'both'), rel not in ('end', 'both')


def _rigid_body_rank(supports, dict_nodes, equal_dofs):
    """
    Rank of the support constraints against the three rigid-body modes of a
    plane structure: translation x, translation y, rotation about z.

    A constrained DOF kills one linear combination of (tx, ty, theta), where a
    rigid-body displacement at (x, y) is  ux = tx - theta*y,  uy = ty + theta*x.
    Rank 3 means the structure cannot move as a rigid body; anything less is a
    mechanism and the stiffness matrix is singular.

    equalDOF ties are folded in first: tying a DOF of one node to the same DOF
    of a restrained node restrains it too, at its own coordinates — which can
    contribute rank of its own.
    """
    import numpy as np

    fixed = {}   # node_id → set of dof numbers (1=ux, 2=uy, 3=rz)
    for sup in supports:
        nid = sup['node_id']
        s = fixed.setdefault(nid, set())
        if sup.get('ux'): s.add(1)
        if sup.get('uy'): s.add(2)
        if sup.get('rz'): s.add(3)

    # Propagate through equalDOF ties until nothing new appears. The tie is an
    # equality, so restraint travels in both directions.
    for _ in range(len(equal_dofs or []) + 1):
        changed = False
        for eq in (equal_dofs or []):
            r, c = eq['r_node'], eq['c_node']
            tied = {int(d) for d in eq.get('dofs', [1, 2])}
            for a, b in ((r, c), (c, r)):
                gained = (fixed.get(a, set()) & tied) - fixed.get(b, set())
                if gained:
                    fixed.setdefault(b, set()).update(gained)
                    changed = True
        if not changed:
            break

    rows = []
    for nid, dofs in fixed.items():
        n = dict_nodes.get(nid)
        if n is None:
            continue
        if 1 in dofs: rows.append([1.0, 0.0, -float(n['y'])])
        if 2 in dofs: rows.append([0.0, 1.0,  float(n['x'])])
        if 3 in dofs: rows.append([0.0, 0.0,  1.0])

    if not rows:
        return 0
    return int(np.linalg.matrix_rank(np.array(rows), tol=1e-9))


def validate_model(nodes, elements, supports, loads=None, equal_dofs=None):
    """
    Reject models that cannot produce a meaningful result, before they reach
    the solver.

    This exists because OpenSees does not reject them either. A singular
    stiffness matrix — a mechanism, a node with no rotational stiffness, a
    floating node — is solved by the BandGeneral solver without complaint:
    analyze() returns 0 and the displacements come back as whatever the
    factorisation produced, typically many metres. Those numbers then look
    exactly like a result. Catching the cause here is the only place the user
    can be told what is actually wrong with their model.

    Raises ModelError listing every problem found, so the engineer can fix them
    in one pass instead of one per run.
    """
    errors = []

    if not nodes:
        raise ModelError('Modellen har ingen knuder.')
    if not elements:
        raise ModelError('Modellen har ingen elementer.')

    # ── Identity ──────────────────────────────────────────────────────────────
    seen = set()
    for n in nodes:
        if n['id'] in seen:
            errors.append(f'Knude {n["id"]} er defineret mere end én gang.')
        seen.add(n['id'])
    dict_nodes = {n['id']: n for n in nodes}

    seen = set()
    for el in elements:
        if el['id'] in seen:
            errors.append(f'Element {el["id"]} er defineret mere end én gang.')
        seen.add(el['id'])

    # ── Element geometry and section properties ───────────────────────────────
    for el in elements:
        eid = el['id']
        for end, nid in (('start', el['ni']), ('slut', el['nj'])):
            if nid not in dict_nodes:
                errors.append(f'Element {eid} har {end}knude {nid}, som ikke findes.')
        if el['ni'] in dict_nodes and el['nj'] in dict_nodes:
            ni, nj = dict_nodes[el['ni']], dict_nodes[el['nj']]
            if math.hypot(nj['x'] - ni['x'], nj['y'] - ni['y']) < 1e-9:
                errors.append(
                    f'Element {eid} har længden 0 — knude {el["ni"]} og {el["nj"]} '
                    f'ligger samme sted. Brug en equalDOF-binding i stedet for et '
                    f'element, hvis de skal kobles sammen.')
        for key, label in (('E_GPa', 'E'), ('A_cm2', 'A'), ('Iz_cm4', 'I')):
            if key == 'Iz_cm4' and el.get('type', 'beam') == 'truss':
                continue   # a truss carries axial force only — I is not used
            # Absent is fine: solve() supplies the same defaults it always has.
            # Present but zero or negative is not — that is a member with no
            # stiffness, which makes the matrix singular.
            if el.get(key) is None:
                continue
            try:
                v = float(el[key])
            except (TypeError, ValueError):
                errors.append(f'Element {eid} har en ugyldig værdi for {label}.')
                continue
            if v <= 0.0:
                errors.append(f'Element {eid} har {label} = {v:g}. '
                              f'Vælg et profil eller indtast tværsnitsdata.')

    # ── Supports and constraints reference real nodes ─────────────────────────
    for sup in supports:
        if sup['node_id'] not in dict_nodes:
            errors.append(f'Understøtning er sat på knude {sup["node_id"]}, som ikke findes.')
    for eq in (equal_dofs or []):
        for role, nid in (('fastholdt', eq['r_node']), ('bundet', eq['c_node'])):
            if nid not in dict_nodes:
                errors.append(f'equalDOF henviser til {role} knude {nid}, som ikke findes.')
        if eq['r_node'] == eq['c_node']:
            errors.append(f'equalDOF binder knude {eq["r_node"]} til sig selv.')

    # ── Loads reference real targets ──────────────────────────────────────────
    elem_ids = {el['id'] for el in elements}
    for ld in (loads or []):
        if ld.get('type') == 'nodal':
            if ld.get('node_id') not in dict_nodes:
                errors.append(f'Der er en knudelast på knude {ld.get("node_id")}, som ikke findes.')
        elif ld.get('type') == 'udl':
            if ld.get('elem_id') not in elem_ids:
                errors.append(f'Der er en linjelast på element {ld.get("elem_id")}, som ikke findes.')

    # ── Floating nodes ────────────────────────────────────────────────────────
    connected = set()
    for el in elements:
        connected.add(el['ni']); connected.add(el['nj'])
    tied = set()
    for eq in (equal_dofs or []):
        tied.add(eq['r_node']); tied.add(eq['c_node'])
    for n in nodes:
        if n['id'] not in connected and n['id'] not in tied:
            errors.append(
                f'Knude {n["id"]} er ikke forbundet til noget element. '
                f'Fjern den, eller forbind den.')

    # ── Rotational stiffness ──────────────────────────────────────────────────
    # The failure mode behind most "60 m deflection" results: a node that only
    # touches truss elements or doubly-released beams has an rz degree of
    # freedom with no stiffness at all, and the model is built with ndf=3.
    has_rz = {n['id']: False for n in nodes}
    for el in elements:
        si, sj = _rz_stiffness_ends(el)
        if si and el['ni'] in has_rz: has_rz[el['ni']] = True
        if sj and el['nj'] in has_rz: has_rz[el['nj']] = True
    rz_fixed = {s['node_id'] for s in supports if s.get('rz')}
    for eq in (equal_dofs or []):
        if 3 in {int(d) for d in eq.get('dofs', [1, 2])}:
            # rz is tied — the pair only needs stiffness or restraint once
            r, c = eq['r_node'], eq['c_node']
            ok = has_rz.get(r) or has_rz.get(c) or r in rz_fixed or c in rz_fixed
            if ok:
                has_rz[r] = has_rz[c] = True
    loose = sorted(nid for nid, ok in has_rz.items()
                   if not ok and nid not in rz_fixed and nid in connected)
    if loose:
        errors.append(
            ('Knude ' if len(loose) == 1 else 'Knuderne ') +
            ', '.join(str(i) for i in loose) +
            ' har ingen rotationsstivhed: der er kun truss-elementer eller bjælker med '
            'momentudløsning i begge ender. Fasthold rotationen (rz) i knuden, eller '
            'lad mindst ét element optage moment der.')

    # ── Rigid-body stability ──────────────────────────────────────────────────
    rank = _rigid_body_rank(supports, dict_nodes, equal_dofs)
    if rank < 3:
        missing = {0: 'ingen understøtninger', 1: 'kun én', 2: 'kun to'}.get(rank, '')
        errors.append(
            f'Understøtningerne fastholder ikke konstruktionen — {missing} af de tre '
            f'stivlegemebevægelser (flytning x, flytning y, rotation) er låst. '
            f'Konstruktionen er en mekanisme og kan ikke regnes.')

    if errors:
        raise ModelError('Modellen kan ikke regnes:\n· ' + '\n· '.join(errors))


def check_results(nodes, node_disps, ele_forces, ref_size):
    """
    Refuse to report a solution that is not a structural response.

    Two things are caught. Non-finite numbers, which mean the factorisation
    failed outright. And displacements far beyond the size of the structure:
    the analysis is linear and small-displacement, so a result of that
    magnitude is not a deflection the theory can describe — it is a
    near-singular stiffness matrix that happened to factor.

    The limit is span/10, roughly twenty times any serviceability limit, so a
    genuinely flexible structure still gets its answer.
    """
    for nid, d in node_disps.items():
        if not all(math.isfinite(v) for v in d):
            raise ModelError(
                f'Beregningen gav et ugyldigt resultat i knude {nid}. '
                f'Stivhedsmatricen er singulær — modellen er underfastholdt.')
    for eid, f in ele_forces.items():
        if not all(math.isfinite(v) for v in f):
            raise ModelError(
                f'Beregningen gav en ugyldig snitkraft i element {eid}. '
                f'Stivhedsmatricen er singulær — modellen er underfastholdt.')

    limit = max(ref_size, 1.0) / 10.0
    worst_nid, worst = None, 0.0
    for nid, d in node_disps.items():
        u = math.hypot(d[0], d[1])
        if u > worst:
            worst_nid, worst = nid, u
    if worst > limit:
        mm = f'{worst * 1e3:,.0f}'.replace(',', '.')   # Danish thousands separator
        raise ModelError(
            f'Beregningen gav en flytning på {mm} mm i knude {worst_nid} '
            f'({worst / max(ref_size, 1e-9):.1f} gange konstruktionens udstrækning). '
            f'Det er ikke en flytning — det er en næsten singulær stivhedsmatrix. '
            f'Kontrollér understøtninger, elementforbindelser og tværsnitsdata.')


# ---------------------------------------------------------------------------
# Section forces between the element ends
# ---------------------------------------------------------------------------

def section_forces_2d(pl, x, wy=0.0, wx=0.0):
    """
    Section forces (N, V, M) at distance *x* from end i of a plane frame element.

        N(x) = -N_i - wx*x
        V(x) =  V_i + wy*x
        M(x) = -M_i + V_i*x + wy*x^2/2

    where (N_i, V_i, M_i) are the element's *local* end forces and (wy, wx) are
    the values handed to eleLoad -beamUniform. This is the same distribution
    opsvis integrates to draw the diagrams, so the reported figures and the
    reported numbers describe one structure.
    """
    N_i, V_i, M_i = pl[0], pl[1], pl[2]
    return (-N_i - wx * x,
             V_i + wy * x,
            -M_i + V_i * x + 0.5 * wy * x * x)


def section_force_extremes(pl, L, wy=0.0, wx=0.0):
    """
    The largest N, V and M anywhere along the element, not only at its ends.

    An element under a distributed load reaches its greatest moment between the
    nodes: for a simply supported member the ends carry no moment at all while
    midspan carries wL²/8. Reading design actions off the end forces alone —
    which is all eleForce reports — therefore understates them, silently, on
    every member that carries a distributed load.

    N and V vary linearly, so their extremes are at the ends. M is quadratic in
    x, so the stationary point is included when it falls inside the element.
    Values are returned signed, picking whichever extreme is largest in
    magnitude, together with where along the element it occurs.
    """
    xs = [0.0, L]
    if abs(wy) > 1e-12:
        x_stat = -pl[1] / wy          # V(x) = 0
        if 0.0 < x_stat < L:
            xs.append(x_stat)

    best = {'N_kN': 0.0, 'V_kN': 0.0, 'M_kNm': 0.0,
            'x_N_m': 0.0, 'x_V_m': 0.0, 'x_M_m': 0.0}
    for x in xs:
        N, V, M = section_forces_2d(pl, x, wy, wx)
        if abs(N) > abs(best['N_kN']):  best['N_kN'],  best['x_N_m'] = N, x
        if abs(V) > abs(best['V_kN']):  best['V_kN'],  best['x_V_m'] = V, x
        if abs(M) > abs(best['M_kNm']): best['M_kNm'], best['x_M_m'] = M, x
    return best


# ---------------------------------------------------------------------------
# Buckling lengths — Wood's stiffness-distribution method (EN 1993-1-1 Annex B)
# ---------------------------------------------------------------------------

def compute_buckling_lengths(nodes, elements, supports, ele_forces):
    """
    Estimate effective buckling lengths per beam element using Wood's simplified
    stiffness-distribution formulas (equivalent to EN 1993-1-1 Annex B).

    Returns
    -------
    dict  { elem_id: {L_m, eta_i, eta_j,
                      k_ns, L_cr_ns_m,   # non-sway
                      k_sw, L_cr_sw_m,   # sway
                      N_Ed_kN} }
    Only beam elements are included.
    """
    from collections import defaultdict

    dict_nodes = {n['id']: n for n in nodes}

    # Support condition → rotational fixity
    fixed_rot = {s['node_id'] for s in supports if s.get('rz', False)}
    pin_sup   = {s['node_id'] for s in supports
                 if s.get('ux') and s.get('uy') and not s.get('rz')}

    # EI/L (kN·m) per beam element
    ei_l = {}
    for el in elements:
        if el.get('type', 'beam') != 'beam':
            continue
        ni = dict_nodes[el['ni']]; nj = dict_nodes[el['nj']]
        L  = math.hypot(nj['x'] - ni['x'], nj['y'] - ni['y'])
        E  = float(el.get('E_GPa', 210)) * 1e6     # kN/m²
        Iz = float(el.get('Iz_cm4', 5000)) * 1e-8   # m⁴
        ei_l[el['id']] = (E * Iz / L) if L > 1e-9 else 0.0

    # Sum of EI/L at each node (all connected beam elements)
    node_sum = defaultdict(float)
    for el in elements:
        if el.get('type', 'beam') != 'beam':
            continue
        for nid in (el['ni'], el['nj']):
            node_sum[nid] += ei_l.get(el['id'], 0.0)

    results = {}
    for el in elements:
        if el.get('type', 'beam') != 'beam':
            continue
        eid = el['id']
        ni  = dict_nodes[el['ni']]; nj = dict_nodes[el['nj']]
        L   = math.hypot(nj['x'] - ni['x'], nj['y'] - ni['y'])
        f   = ele_forces.get(eid, [0.0]*6)
        N   = (f[0] + f[3]) / 2.0   # average axial force (kN)
        K_e = ei_l.get(eid, 0.0)

        def _eta(nid):
            if nid in fixed_rot:
                return 0.0   # fixed support → full rotational restraint
            if nid in pin_sup:
                return 1.0   # pin support → no rotational restraint
            total = node_sum.get(nid, K_e)
            return (K_e / total) if total > 1e-12 else 1.0

        e1, e2 = _eta(el['ni']), _eta(el['nj'])

        # Wood's non-sway formula (k ∈ [0.5, 1.0])
        d_ns = 2 - 0.364*(e1+e2) - 0.247*e1*e2
        k_ns = max(0.5, (1 + 0.145*(e1+e2) - 0.265*e1*e2) / d_ns) if abs(d_ns) > 1e-9 else 1.0

        # Wood's sway formula (k ≥ 1.0)
        d_sw = 1 - 0.8*(e1+e2) + 0.6*e1*e2
        if abs(d_sw) < 1e-6:
            k_sw = 5.0
        else:
            k_sw = max(1.0, math.sqrt(max((1 - 0.2*(e1+e2) - 0.12*e1*e2) / d_sw, 0.0)))

        results[eid] = {
            'L_m':       round(L,       3),
            'eta_i':     round(e1,      3),
            'eta_j':     round(e2,      3),
            'k_ns':      round(k_ns,    3),
            'L_cr_ns_m': round(k_ns*L,  3),
            'k_sw':      round(k_sw,    3),
            'L_cr_sw_m': round(k_sw*L,  3),
            'N_Ed_kN':   round(N,       3),
        }
    return results


# ---------------------------------------------------------------------------
# Sway stability — alpha_cr per EN 1993-1-1 § 5.2.1(4)B
# ---------------------------------------------------------------------------

def _columns(nodes, elements, supports):
    """
    The storey columns: beam members that rise from a supported node.

    Deliberately not "whatever is more vertical than horizontal" — a rafter
    steeper than 45 degrees would be swept up by that rule, corrupting both the
    column count and the eaves level. Anchoring on the supports also fixes what
    the result means: this is the bottom storey, which is what
    § 5.2.1(4)B is applied to per storey and is normally the governing one.
    """
    dn = {n['id']: n for n in nodes}
    sup_ids = {s['node_id'] for s in supports}
    out = []
    for el in elements:
        if el.get('type', 'beam') != 'beam':
            continue
        ni, nj = dn.get(el['ni']), dn.get(el['nj'])
        if not ni or not nj:
            continue
        for bot, top in ((ni, nj), (nj, ni)):
            if bot['id'] in sup_ids and top['y'] - bot['y'] > 1e-6:
                out.append({'elem': el, 'top': top, 'bot': bot})
                break
    return out


def _roof_slope_deg(nodes, elements, supports):
    """Steepest slope among the beam members that are not storey columns."""
    dn = {n['id']: n for n in nodes}
    col_ids = {c['elem']['id'] for c in _columns(nodes, elements, supports)}
    worst = 0.0
    for el in elements:
        if el.get('type', 'beam') != 'beam' or el['id'] in col_ids:
            continue
        ni, nj = dn.get(el['ni']), dn.get(el['nj'])
        if not ni or not nj:
            continue
        dx, dy = nj['x'] - ni['x'], nj['y'] - ni['y']
        if abs(dx) < 1e-9:
            continue                      # truly vertical — not a rafter
        worst = max(worst, abs(math.degrees(math.atan2(dy, dx))))
    return worst


def compute_alpha_cr(nodes, elements, supports, ele_forces, node_reactions,
                     equal_dofs=None):
    """
    Sway stability of the frame, expressed as alpha_cr = F_cr / F_Ed.

    Method — EN 1993-1-1 § 5.2.1(4)B:

        alpha_cr = (H_Ed / V_Ed) x (h / delta_H,Ed)

    H_Ed/delta_H is a sway stiffness, and for a linear analysis delta_H scales
    with H_Ed, so the ratio does not depend on the size of the horizontal load
    used to measure it.  That matters here: most load combinations have no
    lateral load at all.  We therefore probe the frame with the equivalent
    horizontal forces for the sway imperfection (§ 5.3.2(7)), H = phi x V_Ed,
    which are forces the engineer would have to apply anyway — so the numbers
    in the report mean something rather than being an arbitrary unit load.

    Returns None when the frame has no identifiable columns, and marks the
    result as out of scope when the standard's own conditions are not met.
    """
    if not _OPS_AVAILABLE:
        return None

    cols = _columns(nodes, elements, supports)
    if not cols:
        return None

    dn = {n['id']: n for n in nodes}
    sup_ids = {s['node_id'] for s in supports}
    if not sup_ids:
        return None

    base_y  = sum(dn[i]['y'] for i in sup_ids if i in dn) / len(sup_ids)
    top_ids = sorted({c['top']['id'] for c in cols})
    top_y   = sum(dn[i]['y'] for i in top_ids) / len(top_ids)
    h = top_y - base_y
    if h <= 1e-6:
        return None

    # V_Ed — total vertical load carried, read off the support reactions
    V_Ed = sum(node_reactions.get(i, [0, 0, 0])[1] for i in sup_ids)
    V_Ed = abs(V_Ed)
    if V_Ed < 1e-6:
        return None

    # Sway imperfection, § 5.3.2(3):  phi = phi_0 x alpha_h x alpha_m
    m = len(cols)
    alpha_h = max(2.0 / 3.0, min(1.0, 2.0 / math.sqrt(h)))
    alpha_m = math.sqrt(0.5 * (1.0 + 1.0 / m)) if m else 1.0
    phi = (1.0 / 200.0) * alpha_h * alpha_m

    H_probe = phi * V_Ed
    probe_loads = [
        {'type': 'nodal', 'node_id': nid, 'Fx_kN': H_probe / len(top_ids),
         'Fy_kN': 0.0, 'Mz_kNm': 0.0}
        for nid in top_ids
    ]

    try:
        probe = solve(nodes, elements, supports, probe_loads, equal_dofs)
    except Exception:
        return None

    ux_top  = sum(probe['node_disps'][i][0] for i in top_ids) / len(top_ids)
    ux_base = (sum(probe['node_disps'][i][0] for i in sup_ids if i in dn)
               / len(sup_ids)) if sup_ids else 0.0
    delta_H = abs(ux_top - ux_base)

    # A frame stiff enough to barely sway is not a stability problem; reporting
    # a huge number would only invite false precision.
    if delta_H < 1e-9:
        alpha_cr = float('inf')
    else:
        alpha_cr = (H_probe / V_Ed) * (h / delta_H)

    if   alpha_cr >= 10.0: klasse, konsekvens = 'ikke svajfølsom', (
        'Andenordens effekter kan ignoreres — førsteordens analyse er tilstrækkelig '
        '(EN 1993-1-1 § 5.2.1(3)).')
    elif alpha_cr >= 3.0:  klasse, konsekvens = 'svajfølsom', (
        f'Andenordens effekter skal medtages. Sidesvajmomenterne kan forstærkes med '
        f'faktoren 1/(1-1/alpha_cr) = {1.0/(1.0 - 1.0/alpha_cr):.3f} '
        f'(§ 5.2.2(5)B), eller der kan regnes fuld andenordens analyse.')
    else:                  klasse, konsekvens = 'meget svajfølsom', (
        'alpha_cr < 3 — forstærkningsmetoden må ikke anvendes. Der skal regnes fuld '
        'andenordens analyse med imperfektioner (§ 5.2.2).')

    # § 5.2.1(4)B applies to portal frames with shallow roof slopes and to
    # beam-and-column plane frames. Say so when we are outside that.
    slope = _roof_slope_deg(nodes, elements, supports)
    forbehold = []
    if slope > 26.0:
        forbehold.append(
            f'Taghældningen er {slope:.0f}°. § 5.2.1(4)B gælder for flade '
            f'taghældninger (under 26°) — alpha_cr skal her bestemmes ved en '
            f'egenværdianalyse i stedet.')
    forbehold.append(
        'Formlen forudsætter desuden, at normalkraften i bjælker og spær ikke er '
        'betydende (§ 5.2.1(4)B). Kontrollér dette for det aktuelle system.')
    forbehold.append(
        'alpha_cr er bestemt for den nederste etage, som normalt er den afgørende. '
        'Ved flere etager bør de øvrige etager efterses særskilt.')

    return {
        'alpha_cr':    round(alpha_cr, 2) if alpha_cr != float('inf') else None,
        'klasse':      klasse,
        'konsekvens':  konsekvens,
        'forbehold':   forbehold,
        'metode':      'EN 1993-1-1 § 5.2.1(4)B',
        # The inputs, so the number can be checked by hand
        'h_m':         round(h, 3),
        'V_Ed_kN':     round(V_Ed, 2),
        'H_probe_kN':  round(H_probe, 3),
        'delta_H_mm':  round(delta_H * 1000.0, 3),
        'phi':         round(phi, 5),
        'alpha_h':     round(alpha_h, 3),
        'alpha_m':     round(alpha_m, 3),
        'antal_soejler': m,
        'taghaeldning_deg': round(slope, 1),
    }


def solve(nodes, elements, supports, loads, equal_dofs=None):
    """
    Build and solve a 2D linear elastic frame/truss model.

    Parameters
    ----------
    nodes : list of dict
        Each: {id: int, x: float, y: float}
    equal_dofs : list of dict, optional
        Each: {r_node: int, c_node: int, dofs: list[int]}
        Ties the listed DOFs of c_node to r_node (1=ux, 2=uy, 3=rz).
        Use to model pin joints between co-located nodes:
          equalDOF(ridge_left, ridge_right, [1, 2])  →  shared translation, free rotation
    elements : list of dict
        Each: {id, ni, nj, type ('beam'|'truss'),
               E_GPa, A_cm2, Iz_cm4,
               release ('none'|'start'|'end'|'both')}
    supports : list of dict
        Each: {node_id: int, ux: bool, uy: bool, rz: bool}
    loads : list of dict
        Each (nodal):  {type:'nodal', node_id, Fx_kN, Fy_kN, Mz_kNm}
        Each (udl):    {type:'udl',   elem_id, wy_kNm, wx_kNm}

    Returns
    -------
    dict with node_disps, node_reactions, ele_forces
    """
    if not _OPS_AVAILABLE:
        raise ImportError("openseespy is required. pip install openseespy")

    # Reject unanalysable models here rather than letting OpenSees "solve" them:
    # it does not report a singular stiffness matrix, it factors it anyway.
    validate_model(nodes, elements, supports, loads, equal_dofs)

    ops.wipe()
    ops.model('basic', '-ndm', 2, '-ndf', 3)

    # Geometric transformation (one per orientation — reuse tags)
    _transf_cache = {}

    def _transf_tag(ni_id, nj_id):
        nx = dict_nodes[ni_id]; ny = dict_nodes[nj_id]
        dx = ny['x'] - nx['x']; dy = ny['y'] - nx['y']
        length = math.hypot(dx, dy)
        if length < 1e-12:
            raise ValueError(f"Element connecting node {ni_id}→{nj_id} has zero length.")
        # Use Linear transform for all; tag = 1 (reuse)
        if 1 not in _transf_cache:
            ops.geomTransf('Linear', 1)
            _transf_cache[1] = True
        return 1

    # Index nodes by id
    dict_nodes = {n['id']: n for n in nodes}

    # Define nodes
    for n in nodes:
        ops.node(n['id'], float(n['x']), float(n['y']))

    # Supports
    for sup in supports:
        ops.fix(sup['node_id'],
                1 if sup.get('ux') else 0,
                1 if sup.get('uy') else 0,
                1 if sup.get('rz') else 0)

    # Equal-DOF constraints (pin joints between co-located nodes)
    for eq in (equal_dofs or []):
        dofs = [int(d) for d in eq.get('dofs', [1, 2])]
        ops.equalDOF(int(eq['r_node']), int(eq['c_node']), *dofs)

    # Elements
    for el in elements:
        eid  = el['id']
        ni   = el['ni']
        nj   = el['nj']
        # Use kN/m unit system: E in kN/m² (kPa), A in m², Iz in m⁴
        # → eleForce returns kN and kN·m, OpsVis labels in kN / kN·m
        E    = float(el.get('E_GPa',  210.0)) * 1e6   # GPa → kN/m²
        A    = float(el.get('A_cm2',  50.0))  * 1e-4  # cm² → m²
        Iz   = float(el.get('Iz_cm4', 5000.0))* 1e-8  # cm⁴ → m⁴
        etype   = el.get('type', 'beam')
        release = el.get('release', 'none')

        ttag = _transf_tag(ni, nj)

        if etype == 'truss':
            from openseespy.opensees import uniaxialMaterial
            mat_tag = 1000 + eid
            ops.uniaxialMaterial('Elastic', mat_tag, E)
            ops.element('Truss', eid, ni, nj, A, mat_tag)
        else:
            rel_code = {'none': 0, 'start': 1, 'end': 2, 'both': 3}.get(release, 0)
            if rel_code == 0:
                ops.element('elasticBeamColumn', eid, ni, nj, A, E, Iz, ttag)
            else:
                ops.element('elasticBeamColumn', eid, ni, nj, A, E, Iz, ttag,
                            '-release', rel_code)

    # Loads
    # The uniform load on each element is kept as it was handed to eleLoad, so
    # the section forces between the nodes can be reconstructed afterwards.
    ele_udl = {}
    has_loads = bool(loads)
    if has_loads:
        ops.timeSeries('Constant', 1)
        ops.pattern('Plain', 1, 1)
        for ld in loads:
            if ld['type'] == 'nodal':
                # Loads already in kN / kN·m — pass directly
                ops.load(ld['node_id'],
                         float(ld.get('Fx_kN',  0.0)),
                         float(ld.get('Fy_kN',  0.0)),
                         float(ld.get('Mz_kNm', 0.0)))
            elif ld['type'] == 'udl':
                direction = ld.get('direction')
                if direction is not None:
                    # New-style load: project from global direction to local element axes
                    proj = _project_load(
                        {'load_type': 'udl', 'elem_id': ld['elem_id'],
                         'direction': direction,
                         'value_kNm': float(ld.get('value_kNm', 0.0))},
                        elements, dict_nodes,
                    )
                    if proj is None:
                        continue
                    wy_ops = -float(proj['wy_kNm'])
                    wx_ops =  float(proj['wx_kNm'])
                else:
                    # Legacy: direct local axes (wy positive = downward in UI)
                    wy_ops = -float(ld.get('wy_kNm', 0.0))
                    wx_ops =  float(ld.get('wx_kNm', 0.0))
                ops.eleLoad('-ele', ld['elem_id'], '-type', '-beamUniform', wy_ops, wx_ops)
                # Several loads can share an element — they superpose
                prev_y, prev_x = ele_udl.get(ld['elem_id'], (0.0, 0.0))
                ele_udl[ld['elem_id']] = (prev_y + wy_ops, prev_x + wx_ops)

    # Analysis
    ops.system('BandGeneral')
    ops.numberer('RCM')
    ops.constraints('Transformation')
    ops.integrator('LoadControl', 1)
    ops.algorithm('Linear')
    ops.analysis('Static')
    ok = ops.analyze(1)
    if ok != 0:
        raise RuntimeError("OpenSeesPy analysis failed.")

    ops.reactions()

    # Extract results
    node_disps     = {n['id']: ops.nodeDisp(n['id'])     for n in nodes}
    node_reactions = {n['id']: ops.nodeReaction(n['id']) for n in nodes}

    # Element forces — in LOCAL axes.
    #
    # eleForce returns the resisting forces in *global* axes, so reading them
    # as [N, V, M] only happens to work for members that run along x. On a
    # rafter it reported the global vertical component as the axial force. The
    # local set is what N and V are supposed to mean, and it is what opsvis
    # draws its diagrams from, so both now come from the same place.
    ele_forces   = {}
    ele_extremes = {}
    for el in elements:
        eid = el['id']
        ni, nj = dict_nodes[el['ni']], dict_nodes[el['nj']]
        L = math.hypot(nj['x'] - ni['x'], nj['y'] - ni['y'])

        if el.get('type', 'beam') == 'truss':
            # Axial only. eleResponse gives it directly; eleForce would need
            # resolving out of the global components.
            axial = ops.eleResponse(eid, 'axialForce')
            N = float(axial[0]) if axial else 0.0
            ele_forces[eid]   = [N, 0.0, 0.0, -N, 0.0, 0.0]
            ele_extremes[eid] = {'N_kN': -N, 'V_kN': 0.0, 'M_kNm': 0.0,
                                 'x_N_m': 0.0, 'x_V_m': 0.0, 'x_M_m': 0.0}
            continue

        pl = ops.eleResponse(eid, 'localForces')
        if len(pl) == 6:
            wy, wx = ele_udl.get(eid, (0.0, 0.0))
            ele_extremes[eid] = section_force_extremes(pl, L, wy, wx)
        else:
            # Unexpected build — fall back to what was read before so the
            # analysis still returns something, and record that the span
            # maximum is unknown rather than reporting the end value as one.
            pl = list(ops.eleForce(eid))
            ele_extremes[eid] = None
        ele_forces[eid] = list(pl)

    # A model can pass validate_model() and still be near-singular — a joint
    # braced only by a nearly-parallel pair of members, say. The result is the
    # same "structure moved 60 m" answer, so it is caught on the way out too.
    xs = [n['x'] for n in nodes]; ys = [n['y'] for n in nodes]
    ref_size = max(max(xs) - min(xs), max(ys) - min(ys), 1.0)
    check_results(nodes, node_disps, ele_forces, ref_size)

    # NOTE — there used to be an ops.eigen() call here whose mode shapes were
    # reported as buckling modes. They were not: the transformation is Linear,
    # so there is no geometric stiffness, and the masses were fictitious unit
    # masses. The result was the vibration modes of an imaginary system, with
    # no relation to alpha_cr. Stability is now assessed by compute_alpha_cr()
    # against EN 1993-1-1 § 5.2.1(4)B instead.

    return {
        'node_disps':     node_disps,
        'node_reactions': node_reactions,
        'ele_forces':     ele_forces,
        'ele_extremes':   ele_extremes,
            }


# ---------------------------------------------------------------------------
# Multi-combination solver (Frame Load Cases)
# ---------------------------------------------------------------------------

def _project_load(ld, elements, dict_nodes):
    """
    Convert a frame-load-case load to the internal eleLoad/nodal format
    used by solve(), applying geometry-based projection where needed.

    Sign convention
    ---------------
    The returned wy is in *input* convention — positive means the load acts in
    the direction the engineer chose (downward for gravity, +X for wind, into
    the surface for perpendicular) — because solve() negates it on the way into
    eleLoad, whose local y points 90 degrees anticlockwise from the element
    axis. Returning OpenSees convention here instead would double-negate and
    apply gravity upwards.

    Directions
    ----------
    'vertical'   : global Y downward — projects onto local element axes.
                   For horizontal elements this is simply wy = p.
    'projected'  : snow on horizontal projection.
                   p [kN/m horizontal] → wy = p·cos²α, wx_local = -p·cosα·sinα
    'horizontal' : global X (wind) → wy = p·sinα, wx_local = p·cosα
    """
    if ld.get('load_type') == 'nodal':
        return {
            'type':    'nodal',
            'node_id': ld['node_id'],
            'Fx_kN':   float(ld.get('Fx_kN',  0.0)),
            'Fy_kN':   float(ld.get('Fy_kN',  0.0)),
            'Mz_kNm':  float(ld.get('Mz_kNm', 0.0)),
        }

    eid = ld['elem_id']
    el  = next((e for e in elements if e['id'] == eid), None)
    if el is None:
        return None

    ni = dict_nodes[el['ni']]; nj = dict_nodes[el['nj']]
    dx = nj['x'] - ni['x'];   dy = nj['y'] - ni['y']
    L  = math.hypot(dx, dy) or 1e-9
    ca = dx / L   # cos of element angle from horizontal
    sa = dy / L   # sin of element angle from horizontal

    p   = float(ld.get('value_kNm', 0.0))
    direction = ld.get('direction', 'vertical')

    if direction == 'projected':
        # Snow load per unit horizontal length, global downward.
        # Per unit element length: p·cosα downward.
        # local y: dot((0,-1), (-sa, ca))  = -ca  →  eleLoad wy = -p·ca², so
        #          the input-convention value solve() will negate is +p·ca²
        # local x: dot((0,-1), ( ca, sa))  = -sa  →  wx = -p·ca·sa (not negated)
        wy =  p * ca * ca
        wx = -p * ca * sa

    elif direction == 'horizontal':
        # Wind: p kN/m globally rightward (positive X).
        # local y: dot((1,0), (-sa, ca))  = -sa  →  eleLoad wy = -p·sa,
        #          so the input-convention value is +p·sa
        # local x: dot((1,0), ( ca, sa))  =  ca  →  wx =  p·ca (not negated)
        wy = p * sa
        wx = p * ca

    elif direction == 'perpendicular':
        # Load perpendicular to element surface.
        # Positive p = pressing INTO surface from outside (e.g. wind pressure).
        # Negative p = suction (pulling away from surface).
        # solve() does: wy_ops = -wy_kNm, so returning wy = +p gives wy_ops = -p
        # which is negative local y = pressing into surface. ✓
        wy = p
        wx = 0.0

    else:  # 'vertical' or default — global Y downward
        # local y: dot((0,-1), (-sa, ca))  = -ca  →  eleLoad wy = -p·ca,
        #          so the input-convention value solve() will negate is +p·ca
        # local x: dot((0,-1), ( ca, sa))  = -sa  →  wx = -p·sa (not negated)
        wy =  p * ca
        wx = -p * sa

    return {'type': 'udl', 'elem_id': eid, 'wy_kNm': wy, 'wx_kNm': wx}


def solve_combinations(nodes, elements, supports, combinations, equal_dofs=None,
                       make_figs=False, ref_size=1.0):
    """
    Run the FEM once per load combination and return envelope results.

    Parameters
    ----------
    combinations : list of dicts
        Each: { name: str, loads: [frame-load-case load dicts] }
    make_figs : bool
        If True, generate OpsVis figures immediately after each solve() call
        (while the OpenSeesPy model still reflects that combination) and store
        them in all_results[i]['figs'].  Must be True when per-combo diagrams
        are needed — calling make_figures() after the loop produces wrong results
        because opsvis reads from the live model which is always the last combo.

    Returns
    -------
    envelope        : dict  {elem_id: {M_max_kNm, M_combo, M_duration, ...}}
    timber_envelope : dict  {elem_id: {1: {M_Ed_kNm, V_Ed_kN, duration, combo}, 2: ..., 3: ...}}
    all_results     : list of {name, governing_duration, node_disps, ele_forces, node_reactions[, figs]}
    """
    dict_nodes = {n['id']: n for n in nodes}
    all_results = []

    for combo in combinations:
        resolved = []
        for ld in combo.get('loads', []):
            proj = _project_load(ld, elements, dict_nodes)
            if proj is not None:
                resolved.append(proj)

        result = solve(nodes, elements, supports, resolved, equal_dofs)
        entry = {
            'name':               combo['name'],
            'governing_duration': combo.get('governing_duration', 'short'),
            'node_disps':         result['node_disps'],
            'node_reactions':     result['node_reactions'],
            'ele_forces':         result['ele_forces'],
            'ele_extremes':       result.get('ele_extremes', {}),
        }
        # Generate figures NOW, while the OpenSeesPy model reflects this combo
        if make_figs and _OPSVIS_AVAILABLE:
            entry['figs'] = make_figures(
                combo['name'], nodes, elements, supports, [],
                result['ele_forces'], result['node_disps'], ref_size,
            )
        all_results.append(entry)

    # k_mod per service class and load duration  (EN 1995-1-1 Table 3.1)
    _KMOD = {
        1: {'permanent': 0.60, 'long': 0.70, 'medium': 0.80, 'short': 0.90, 'instant': 1.10},
        2: {'permanent': 0.60, 'long': 0.70, 'medium': 0.80, 'short': 0.90, 'instant': 1.10},
        3: {'permanent': 0.50, 'long': 0.55, 'medium': 0.65, 'short': 0.70, 'instant': 0.90},
    }

    # Envelope — worst-case M, V, N per element across all combinations (for steel/RC)
    # timber_envelope — combination governing max(M/k_mod) per service class (EN 1995-1-1 §2.2.3)
    envelope         = {}
    timber_envelope  = {}   # {sc: {eid: {M_Ed, V_Ed, duration, combo}}}

    for el in elements:
        eid  = el['id']
        best = {'M': 0.0, 'M_combo': '', 'M_duration': 'short',
                'V': 0.0, 'V_combo': '', 'V_duration': 'short',
                'N': 0.0, 'N_combo': '', 'N_duration': 'short'}
        timber_best = {sc: {'ratio': 0.0, 'M_Ed': 0.0, 'V_Ed': 0.0, 'dur': 'short', 'combo': ''}
                       for sc in (1, 2, 3)}
        for r in all_results:
            f = r['ele_forces'].get(eid, [0.0] * 6)
            # The envelope is what the member checks are designed against, so
            # it has to be the worst value anywhere along the element, not the
            # worst of its two ends.
            ext = (r.get('ele_extremes') or {}).get(eid)
            if ext:
                M, V, N = abs(ext['M_kNm']), abs(ext['V_kN']), abs(ext['N_kN'])
            else:
                M = max(abs(f[2]), abs(f[5]))
                V = max(abs(f[1]), abs(f[4]))
                N = max(abs(f[0]), abs(f[3]))
            dur = r.get('governing_duration', 'short')
            if M > best['M']: best['M'] = M; best['M_combo'] = r['name']; best['M_duration'] = dur
            if V > best['V']: best['V'] = V; best['V_combo'] = r['name']; best['V_duration'] = dur
            if N > best['N']: best['N'] = N; best['N_combo'] = r['name']; best['N_duration'] = dur
            # Timber governing: max(M / k_mod) per service class
            for sc in (1, 2, 3):
                kmod = _KMOD[sc].get(dur, 0.9)
                ratio = M / kmod if kmod > 0 else 0.0
                if ratio > timber_best[sc]['ratio']:
                    timber_best[sc] = {'ratio': ratio, 'M_Ed': M, 'V_Ed': V,
                                       'dur': dur, 'combo': r['name']}
        envelope[eid] = {
            'M_max_kNm':   round(best['M'], 3), 'M_combo': best['M_combo'], 'M_duration': best['M_duration'],
            'V_max_kN':    round(best['V'], 3), 'V_combo': best['V_combo'], 'V_duration': best['V_duration'],
            'N_max_kN':    round(best['N'], 3), 'N_combo': best['N_combo'], 'N_duration': best['N_duration'],
        }
        timber_envelope[eid] = {
            sc: {
                'M_Ed_kNm':  round(timber_best[sc]['M_Ed'], 3),
                'V_Ed_kN':   round(timber_best[sc]['V_Ed'], 3),
                'duration':  timber_best[sc]['dur'],
                'combo':     timber_best[sc]['combo'],
            }
            for sc in (1, 2, 3)
        }

    return envelope, timber_envelope, all_results


def plot_model(title, nodes, elements, supports, loads, ref_size):
    """
    Draw the static structural model: geometry, supports, releases, loads.
    Pure matplotlib — no OpenSeesPy required.
    Returns a base64 PNG string.
    """
    dict_nodes = {n['id']: n for n in nodes}

    # ── Palette ───────────────────────────────────────────────────────────────
    C_BEAM    = '#1C1C1E'
    C_TRUSS   = '#1C1C1E'
    C_NODE    = '#1C1C1E'
    C_SUPPORT = '#4B5563'
    C_LOAD    = '#DC2626'
    C_RELEASE = '#E74825'
    C_LABEL   = '#6E6E73'
    C_GRID    = '#E5E5EA'

    def elem_geom(el):
        ni = dict_nodes[el['ni']]; nj = dict_nodes[el['nj']]
        xi, yi = ni['x'], ni['y']; xj, yj = nj['x'], nj['y']
        L  = math.hypot(xj - xi, yj - yi) or 1e-9
        ca = (xj - xi) / L; sa = (yj - yi) / L
        return xi, yi, xj, yj, L, ca, sa

    sz = ref_size * 0.055   # support symbol size

    fig, ax = plt.subplots(figsize=(13, 7))
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')

    # ── Elements ──────────────────────────────────────────────────────────────
    for el in elements:
        xi, yi, xj, yj, L, ca, sa = elem_geom(el)
        ls   = '-'  if el.get('type', 'beam') == 'beam' else '--'
        lw   = 2.8  if el.get('type', 'beam') == 'beam' else 1.8
        col  = C_BEAM if el.get('type', 'beam') == 'beam' else C_TRUSS
        ax.plot([xi, xj], [yi, yj], color=col, lw=lw, ls=ls,
                solid_capstyle='round', zorder=3)

        # Element ID label at midpoint (offset perpendicular)
        mx, my = (xi+xj)/2 - sa*sz*0.6, (yi+yj)/2 + ca*sz*0.6
        ax.text(mx, my, str(el['id']), fontsize=7.5, color=C_LABEL,
                ha='center', va='center', zorder=5,
                bbox=dict(fc='white', ec='none', pad=0.5))

        # Moment release symbols (open circles at element ends)
        rel = el.get('release', 'none')
        r_circ = sz * 0.22
        if rel in ('start', 'both'):
            cx = xi + ca * r_circ * 1.5
            cy = yi + sa * r_circ * 1.5
            circ = plt.Circle((cx, cy), r_circ, fc='white', ec=C_RELEASE, lw=1.5, zorder=6)
            ax.add_patch(circ)
        if rel in ('end', 'both'):
            cx = xj - ca * r_circ * 1.5
            cy = yj - sa * r_circ * 1.5
            circ = plt.Circle((cx, cy), r_circ, fc='white', ec=C_RELEASE, lw=1.5, zorder=6)
            ax.add_patch(circ)

    # ── Interior member nodes (suppress dots/labels) ──────────────────────────
    # A node is interior if it connects exactly two elements of the same member
    # and is not a support.
    interior_nodes: set = set()
    if any(el.get('member_id') is not None for el in elements):
        from collections import defaultdict
        _node_mids   = defaultdict(set)   # node → {member_ids of connected elements}
        _node_n_elem = defaultdict(int)   # node → number of connected elements
        for el in elements:
            mid = el.get('member_id')
            _node_mids[el['ni']].add(mid)
            _node_mids[el['nj']].add(mid)
            _node_n_elem[el['ni']] += 1
            _node_n_elem[el['nj']] += 1
        _sup_nodes = {s['node_id'] for s in supports}
        for _nid, _mids in _node_mids.items():
            if (len(_mids) == 1 and None not in _mids
                    and _node_n_elem[_nid] == 2
                    and _nid not in _sup_nodes):
                interior_nodes.add(_nid)

    # ── Nodes ─────────────────────────────────────────────────────────────────
    for n in nodes:
        if n['id'] in interior_nodes:
            continue   # mid-member connection — no dot or label
        ax.plot(n['x'], n['y'], 'o', color=C_NODE, ms=5,
                markerfacecolor='white', markeredgewidth=1.8, zorder=7)
        ax.text(n['x'] + sz*0.35, n['y'] + sz*0.35,
                str(n['id']), fontsize=7.5, color=C_LABEL,
                ha='left', va='bottom', zorder=8)

    # ── Supports ──────────────────────────────────────────────────────────────
    for sup in supports:
        n  = dict_nodes[sup['node_id']]
        x, y = n['x'], n['y']
        ux = sup.get('ux', False); uy = sup.get('uy', False); rz = sup.get('rz', False)

        if ux and uy and rz:
            # Fixed — wall rectangle
            rect = plt.Rectangle((x - sz*0.55, y - sz), sz*1.1, sz,
                                  fc='#D1D5DB', ec=C_SUPPORT, lw=1.2, zorder=4)
            ax.add_patch(rect)
            for k in range(5):
                hx = x - sz*0.45 + k * sz*0.22
                ax.plot([hx, hx - sz*0.18], [y - sz, y - sz*1.3],
                        color=C_SUPPORT, lw=0.9, zorder=4)
        elif ux and uy:
            # Pin
            tri = plt.Polygon([[x, y], [x - sz*0.55, y - sz], [x + sz*0.55, y - sz]],
                               fc='white', ec=C_SUPPORT, lw=1.2, zorder=4)
            ax.add_patch(tri)
            ax.plot([x - sz*0.7, x + sz*0.7], [y - sz, y - sz],
                    color=C_SUPPORT, lw=1.5, zorder=4)
            for k in range(5):
                hx = x - sz*0.6 + k * sz*0.3
                ax.plot([hx, hx - sz*0.15], [y - sz, y - sz*1.25],
                        color=C_SUPPORT, lw=0.8, zorder=4)
        elif uy:
            # Roller
            circ = plt.Circle((x, y - sz*0.55), sz*0.28,
                               fc='white', ec=C_SUPPORT, lw=1.2, zorder=4)
            ax.add_patch(circ)
            ax.plot([x - sz*0.7, x + sz*0.7], [y - sz*0.9, y - sz*0.9],
                    color=C_SUPPORT, lw=1.5, zorder=4)
        elif ux:
            # Horizontal roller — rotated triangle
            tri = plt.Polygon([[x, y], [x - sz, y - sz*0.55], [x - sz, y + sz*0.55]],
                               fc='white', ec=C_SUPPORT, lw=1.2, zorder=4)
            ax.add_patch(tri)
            ax.plot([x - sz, x - sz], [y - sz*0.7, y + sz*0.7],
                    color=C_SUPPORT, lw=1.5, zorder=4)

    # ── Applied loads ──────────────────────────────────────────────────────────
    udl_by_elem = {}
    for ld in loads:
        if ld.get('type') in ('udl', 'combo_udl'):
            udl_by_elem[ld.get('elem_id')] = ld

    arr = sz * 1.5   # arrow length

    for eid, ld in udl_by_elem.items():
        el = next((e for e in elements if e['id'] == eid), None)
        if not el: continue
        xi, yi, xj, yj, L, ca, sa = elem_geom(el)
        direction = ld.get('direction')
        value     = float(ld.get('value_kNm', 0) or 0)
        wy_raw    = float(ld.get('wy_kNm',    0) or 0)
        if ld.get('type') == 'combo_udl':
            value = wy_raw = 1.0   # placeholder
        # Choose arrow direction based on load type
        if direction == 'vertical' or direction == 'projected':
            # Arrow straight down (global -y)
            draw_wy = value; ox_unit = 0.0; oy_unit = -1.0
        elif direction == 'horizontal':
            # Arrow in global +x (or -x if negative)
            draw_wy = value; ox_unit = math.copysign(1.0, value) if value else 1.0; oy_unit = 0.0
            draw_wy = abs(value)
        else:
            # Legacy perpendicular-to-element (local wy)
            draw_wy = wy_raw if direction is None else value
            ox_unit = -sa; oy_unit = ca
        if abs(draw_wy) < 1e-10 and ld.get('type') != 'combo_udl': continue
        if direction in ('vertical', 'projected'):
            sign = 1   # downward arrow tail above point
        elif direction == 'horizontal':
            sign = 1
        else:
            sign = -1 if wy_raw >= 0 else 1
        n_arr = max(4, int(L / (ref_size * 0.12)) + 1)
        for k in range(n_arr + 1):
            t  = k / n_arr
            px = xi + t*(xj - xi); py = yi + t*(yj - yi)
            ox = ox_unit * arr * sign; oy = oy_unit * arr * sign
            ax.annotate('', xy=(px, py), xytext=(px + ox, py + oy),
                        arrowprops=dict(arrowstyle='->', color=C_LOAD, lw=1.0,
                                        mutation_scale=8), zorder=6)
        # Connecting line at tips
        tip_xs = [xi + ox_unit*arr*sign + k/n_arr*(xj-xi) for k in range(n_arr+1)]
        tip_ys = [yi + oy_unit*arr*sign + k/n_arr*(yj-yi) for k in range(n_arr+1)]
        ax.plot(tip_xs, tip_ys, color=C_LOAD, lw=1.2, zorder=5)
        # Label
        lbl = f'{abs(draw_wy):.1f} kN/m' if ld.get('type') != 'combo_udl' else 'w_Ed [combo]'
        ax.text((xi+xj)/2 - sa*arr*sign*1.6, (yi+yj)/2 + ca*arr*sign*1.6,
                lbl, fontsize=7.5, color=C_LOAD, ha='center', va='center',
                bbox=dict(fc='white', ec='none', pad=1), zorder=7)

    for ld in loads:
        if ld.get('type') != 'nodal': continue
        n = dict_nodes.get(ld.get('node_id'))
        if not n: continue
        Fx = float(ld.get('Fx_kN', 0)); Fy = float(ld.get('Fy_kN', 0))
        F  = math.hypot(Fx, Fy)
        if F < 1e-10: continue
        scale = arr / F
        ax.annotate('', xy=(n['x'], n['y']),
                    xytext=(n['x'] - Fx*scale, n['y'] - Fy*scale),
                    arrowprops=dict(arrowstyle='->', color=C_LOAD,
                                    lw=1.8, mutation_scale=13), zorder=8)
        ax.text(n['x'] - Fx*scale*1.3, n['y'] - Fy*scale*1.3,
                f'{F:.1f} kN', fontsize=7.5, color=C_LOAD,
                ha='center', va='center',
                bbox=dict(fc='white', ec='none', pad=1), zorder=9)

    # ── Styling ───────────────────────────────────────────────────────────────
    ax.set_aspect('equal')
    for sp in ax.spines.values():
        sp.set_color(C_GRID)
    ax.tick_params(colors='#888', labelsize=8)
    ax.set_xlabel('x  [m]', fontsize=9, color='#555', labelpad=5)
    ax.set_ylabel('y  [m]', fontsize=9, color='#555', labelpad=5)
    ax.set_title('Statisk model', fontsize=12, fontweight='bold', color='#1C1C1E', pad=10)
    ax.grid(True, ls=':', lw=0.5, color=C_GRID, zorder=0)

    ax.autoscale()
    xl, yl = ax.get_xlim(), ax.get_ylim()
    pw = max((xl[1]-xl[0]) * 0.18, sz * 3)
    ph = max((yl[1]-yl[0]) * 0.18, sz * 3)
    ax.set_xlim(xl[0]-pw, xl[1]+pw)
    ax.set_ylim(yl[0]-ph, yl[1]+ph)

    # Legend entries
    handles = [
        plt.Line2D([0],[0], color=C_BEAM,    lw=2.5, label='Bjælkeelement'),
        plt.Line2D([0],[0], color=C_TRUSS,   lw=1.8, ls='--', label='Truss-element'),
        plt.Line2D([0],[0], color=C_LOAD,    lw=1.5, label='Påført last'),
        plt.Line2D([0],[0], marker='o', color=C_RELEASE, ms=7,
                   markerfacecolor='white', lw=0, label='Momentudløsning'),
    ]
    ax.legend(handles=handles, fontsize=8, frameon=False, loc='upper right')

    fig.suptitle(title, fontsize=10, color='#6E6E73', y=0.98, style='italic')
    fig.tight_layout(rect=[0, 0, 1, 0.96])

    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    buf.seek(0)
    plt.close(fig)
    return base64.b64encode(buf.read()).decode()


def make_figures(title, nodes, elements, supports, loads,
                 ele_forces, node_disps, ref_size):
    """
    Generate OpsVis figures for the frame analysis.
    Returns list of base64 PNG strings: [deformed shape, M diagram, V diagram].
    """
    if not _OPSVIS_AVAILABLE:
        raise ImportError("opsvis is required. pip install opsvis")

    def _style_and_capture(subtitle):
        """Apply clean styling to the current OpsVis figure, then capture it."""
        fig = plt.gcf()
        fig.patch.set_facecolor('white')
        fig.set_size_inches(13, 7)

        for ax in fig.axes:
            ax.set_facecolor('white')
            ax.set_title(subtitle, fontsize=12, fontweight='bold',
                         color='#1C1C1E', pad=10)
            ax.set_xlabel('x  [m]', fontsize=9, color='#555', labelpad=5)
            ax.set_ylabel('y  [m]', fontsize=9, color='#555', labelpad=5)
            ax.tick_params(colors='#888', labelsize=8)
            ax.grid(True, ls=':', lw=0.5, color='#E5E5EA', zorder=0)
            for spine in ax.spines.values():
                spine.set_color('#E5E5EA')
                spine.set_linewidth(0.8)

        fig.suptitle(title, fontsize=10, color='#6E6E73',
                     y=0.98, style='italic')
        fig.tight_layout(rect=[0, 0, 1, 0.96])

        buf = io.BytesIO()
        fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                    facecolor='white', edgecolor='none')
        buf.seek(0)
        plt.close(fig)
        return base64.b64encode(buf.read()).decode()

    beam_eles = [el for el in elements if el.get('type', 'beam') == 'beam']
    max_M = max(
        (max(abs(ele_forces[el['id']][2]), abs(ele_forces[el['id']][5]))
         for el in beam_eles if el['id'] in ele_forces),
        default=1.0,
    )
    max_V = max(
        (max(abs(ele_forces[el['id']][1]), abs(ele_forces[el['id']][4]))
         for el in beam_eles if el['id'] in ele_forces),
        default=1.0,
    )
    mFac = (ref_size * 0.25) / max_M if max_M > 1e-6 else 5e-6
    vFac = (ref_size * 0.25) / max_V if max_V > 1e-6 else 15e-6

    figs = []

    plt.close('all')
    opsv.plot_defo(
        fig_wi_he=(13, 7),
        fmt_defo={'color': '#E74825', 'linestyle': (0, (4, 5)), 'linewidth': 2.2},
        fmt_undefo={'color': '#AEAEB2', 'linestyle': 'solid', 'linewidth': 1.5},
    )
    figs.append(_style_and_capture('Deformeret form'))

    if beam_eles:
        opsv.section_force_diagram_2d('M', mFac, fig_wi_he=(13, 7),
                                      fmt_secforce1={'color': '#1A6640'},
                                      fmt_secforce2={'color': '#1A6640'})
        figs.append(_style_and_capture('Momentkurve  [kNm]'))

        opsv.section_force_diagram_2d('V', vFac, fig_wi_he=(13, 7),
                                      fmt_secforce1={'color': '#1A4FA0'},
                                      fmt_secforce2={'color': '#1A4FA0'})
        figs.append(_style_and_capture('Forskydningskurve  [kN]'))

    # Axial force — all element types
    max_N = max(
        (max(abs(ele_forces[el['id']][0]), abs(ele_forces[el['id']][3]))
         for el in elements if el['id'] in ele_forces),
        default=1.0,
    )
    nFac = (ref_size * 0.25) / max_N if max_N > 1e-6 else 5e-6
    opsv.section_force_diagram_2d('N', nFac, fig_wi_he=(13, 7),
                                  fmt_secforce1={'color': '#B45309'},
                                  fmt_secforce2={'color': '#B45309'})
    figs.append(_style_and_capture('Normalkraftkurve  [kN]'))

    return figs


def summarise(nodes, elements, node_disps, node_reactions, ele_forces, supports, loads,
              ele_extremes=None):
    """Return structured summary dict including full element and node detail."""
    import math

    ele_extremes = ele_extremes or {}

    def _worst(eid, f):
        """Worst N, V, M along the element — falling back to its ends."""
        ext = ele_extremes.get(eid)
        if ext:
            return abs(ext['N_kN']), abs(ext['V_kN']), abs(ext['M_kNm'])
        return (max(abs(f[0]), abs(f[3])),
                max(abs(f[1]), abs(f[4])),
                max(abs(f[2]), abs(f[5])))

    # ── Max displacements ─────────────────────────────────────────────────────
    max_ux = max((abs(node_disps[n['id']][0]) for n in nodes), default=0.0)
    max_uy = max((abs(node_disps[n['id']][1]) for n in nodes), default=0.0)
    node_max_ux = max(nodes, key=lambda n: abs(node_disps[n['id']][0]))
    node_max_uy = max(nodes, key=lambda n: abs(node_disps[n['id']][1]))

    # ── Max moment ────────────────────────────────────────────────────────────
    beam_eles = [el for el in elements if el.get('type', 'beam') == 'beam']
    if beam_eles:
        el_max_M = max(beam_eles,
                       key=lambda el: _worst(el['id'], ele_forces[el['id']])[2])
        max_M = _worst(el_max_M['id'], ele_forces[el_max_M['id']])[2]
    else:
        el_max_M = None
        max_M = 0.0

    # ── Reactions ─────────────────────────────────────────────────────────────
    sup_node_ids = {s['node_id'] for s in supports}
    reactions = {}
    for nid in sup_node_ids:
        R = node_reactions[nid]
        reactions[str(nid)] = {
            'Fx_kN':  round(R[0], 3),
            'Fy_kN':  round(R[1], 3),
            'Mz_kNm': round(R[2], 3),
        }

    # ── Full node displacement table ──────────────────────────────────────────
    node_disp_table = []
    for n in nodes:
        d = node_disps[n['id']]
        node_disp_table.append({
            'id':    n['id'],
            'x_m':  round(n['x'], 4),
            'y_m':  round(n['y'], 4),
            'ux_mm': round(d[0] * 1e3, 4),
            'uy_mm': round(d[1] * 1e3, 4),
            'rz_mrad': round(d[2] * 1e3, 4),
        })

    # ── Full element force table ──────────────────────────────────────────────
    dict_nodes = {n['id']: n for n in nodes}
    ele_force_table = []
    for el in elements:
        eid = el['id']
        f   = ele_forces[eid]
        ni  = dict_nodes[el['ni']]
        nj  = dict_nodes[el['nj']]
        L   = math.hypot(nj['x'] - ni['x'], nj['y'] - ni['y'])
        ele_force_table.append({
            'id':      eid,
            'ni':      el['ni'],
            'nj':      el['nj'],
            'type':    el.get('type', 'beam'),
            'release': el.get('release', 'none'),
            'L_m':     round(L, 3),
            'E_GPa':   el.get('E_GPa', 210),
            'A_cm2':   el.get('A_cm2', 0),
            'Iz_cm4':  el.get('Iz_cm4', 0),
            # Section reference — carried through so the member check generated
            # from this element inherits it instead of being picked again.
            'material': el.get('material'),
            'section':  el.get('section'),
            'grade':    el.get('grade'),
            'section_resolved': el.get('_section_resolved'),
            'section_error':    el.get('_section_error'),
            # End i (local) — already in kN / kN·m
            'N_i_kN':  round(f[0], 3),
            'V_i_kN':  round(f[1], 3),
            'M_i_kNm': round(f[2], 3),
            # End j (local)
            'N_j_kN':  round(f[3], 3),
            'V_j_kN':  round(f[4], 3),
            'M_j_kNm': round(f[5], 3),
            # Worst anywhere along the element, and where. On a member carrying
            # a distributed load this is the design action; the end values above
            # can be far smaller, and are zero on a simply supported span.
            'N_max_kN':   round(_worst(eid, f)[0], 3),
            'V_max_kN':   round(_worst(eid, f)[1], 3),
            'M_max_kNm':  round(_worst(eid, f)[2], 3),
            'x_M_max_m':  round(ele_extremes.get(eid, {}).get('x_M_m', 0.0), 3)
                          if ele_extremes.get(eid) else None,
        })

    # ── Applied loads summary ─────────────────────────────────────────────────
    loads_table = []
    for ld in loads:
        if ld['type'] == 'nodal':
            loads_table.append({
                'type':    'Nodal',
                'target':  f"Node {ld['node_id']}",
                'Fx_kN':   round(float(ld.get('Fx_kN',  0)), 3),
                'Fy_kN':   round(float(ld.get('Fy_kN',  0)), 3),
                'Mz_kNm':  round(float(ld.get('Mz_kNm', 0)), 3),
                'wy_kNm':  None,
                'wx_kNm':  None,
            })
        elif ld['type'] == 'udl':
            loads_table.append({
                'type':    'UDL',
                'target':  f"Elem {ld['elem_id']}",
                'Fx_kN':   None,
                'Fy_kN':   None,
                'Mz_kNm':  None,
                'wy_kNm':  round(float(ld.get('wy_kNm', 0)), 3),
                'wx_kNm':  round(float(ld.get('wx_kNm', 0)), 3),
            })

    return {
        # Headline figures
        'max_ux_mm':      round(max_ux * 1e3, 3),
        'max_ux_node':    node_max_ux['id'],
        'max_uy_mm':      round(max_uy * 1e3, 3),
        'max_uy_node':    node_max_uy['id'],
        'max_moment_kNm': round(max_M, 3),
        'max_moment_ele': el_max_M['id'] if el_max_M else None,
        # Detailed tables
        'reactions':       reactions,
        'node_disp_table': node_disp_table,
        'ele_force_table': ele_force_table,
        'loads_table':     loads_table,
    }
