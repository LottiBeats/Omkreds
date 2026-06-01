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

try:
    import openseespy.opensees as ops
    _OPS_AVAILABLE = True
except ImportError:
    _OPS_AVAILABLE = False

try:
    import opsvis as opsv
    _OPSVIS_AVAILABLE = True
except ImportError:
    _OPSVIS_AVAILABLE = False

import math
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import io
import base64


# ---------------------------------------------------------------------------
# Solver
# ---------------------------------------------------------------------------

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
# Buckling mode shape figures
# ---------------------------------------------------------------------------

def plot_buckling_modes(title, nodes, elements, eigen_modes, ref_size):
    """
    Plot buckled mode shapes returned by solve() (eigen_modes list).
    Returns a list of base64 PNG strings — one per mode.
    """
    if not eigen_modes:
        return []

    dict_nodes = {n['id']: n for n in nodes}
    sz = ref_size * 0.055

    C_UNDEFO = '#AEAEB2'
    C_MODE   = '#E74825'

    figs_out = []
    for md in eigen_modes:
        mode_num = md['mode']
        omega    = md['omega']
        vecs     = md['vectors']

        # Scale eigenvectors so max displacement ≈ 15 % of structure size
        max_d = max((math.hypot(v[0], v[1]) for v in vecs.values()), default=1.0)
        scale = (ref_size * 0.15) / max_d if max_d > 1e-10 else 1.0

        fig, ax = plt.subplots(figsize=(13, 7))
        fig.patch.set_facecolor('white')
        ax.set_facecolor('white')

        # Undeformed (dashed grey)
        for el in elements:
            ni = dict_nodes[el['ni']]; nj = dict_nodes[el['nj']]
            ax.plot([ni['x'], nj['x']], [ni['y'], nj['y']],
                    color=C_UNDEFO, lw=1.5, ls='--', zorder=2)

        # Buckled shape
        for el in elements:
            ni = dict_nodes[el['ni']]; nj = dict_nodes[el['nj']]
            vi = vecs.get(ni['id'], [0.0, 0.0])
            vj = vecs.get(nj['id'], [0.0, 0.0])
            xi_d = ni['x'] + scale*vi[0]; yi_d = ni['y'] + scale*vi[1]
            xj_d = nj['x'] + scale*vj[0]; yj_d = nj['y'] + scale*vj[1]
            lw  = 2.5 if el.get('type', 'beam') == 'beam' else 1.8
            ls  = '-' if el.get('type', 'beam') == 'beam' else '--'
            ax.plot([xi_d, xj_d], [yi_d, yj_d],
                    color=C_MODE, lw=lw, ls=ls, zorder=3)

        # Node dots on buckled shape
        for n in nodes:
            v  = vecs.get(n['id'], [0.0, 0.0])
            xd = n['x'] + scale*v[0]; yd = n['y'] + scale*v[1]
            ax.plot(xd, yd, 'o', color=C_MODE, ms=4.5,
                    markerfacecolor='white', markeredgewidth=1.5, zorder=4)

        ax.set_aspect('equal')
        ax.set_title(f'Mode {mode_num}  —  ω = {omega:.3f} rad/s',
                     fontsize=12, fontweight='bold', color='#1C1C1E', pad=10)
        ax.set_xlabel('x  [m]', fontsize=9, color='#555', labelpad=5)
        ax.set_ylabel('y  [m]', fontsize=9, color='#555', labelpad=5)
        ax.tick_params(colors='#888', labelsize=8)
        ax.grid(True, ls=':', lw=0.5, color='#E5E5EA', zorder=0)
        for sp in ax.spines.values():
            sp.set_color('#E5E5EA'); sp.set_linewidth(0.8)

        ax.autoscale()
        xl, yl = ax.get_xlim(), ax.get_ylim()
        pw = max((xl[1]-xl[0])*0.2, sz*3)
        ph = max((yl[1]-yl[0])*0.2, sz*3)
        ax.set_xlim(xl[0]-pw, xl[1]+pw)
        ax.set_ylim(yl[0]-ph, yl[1]+ph)

        handles = [
            plt.Line2D([0],[0], color=C_UNDEFO, lw=1.5, ls='--', label='Undeformed'),
            plt.Line2D([0],[0], color=C_MODE,   lw=2.5, label=f'Mode {mode_num} shape'),
        ]
        ax.legend(handles=handles, fontsize=8, frameon=False, loc='upper right')
        fig.suptitle(title, fontsize=10, color='#6E6E73', y=0.98, style='italic')
        fig.tight_layout(rect=[0, 0, 1, 0.96])

        buf = io.BytesIO()
        fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                    facecolor='white', edgecolor='none')
        buf.seek(0)
        plt.close(fig)
        figs_out.append(base64.b64encode(buf.read()).decode())

    return figs_out


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

    ele_forces = {}
    for el in elements:
        if el.get('type', 'beam') != 'truss':
            ele_forces[el['id']] = ops.eleForce(el['id'])
        else:
            # Truss returns [N_i, N_j] — pad to 6 for consistent shape
            f = ops.eleForce(el['id'])
            ele_forces[el['id']] = [f[0], 0, 0, f[1] if len(f) > 1 else -f[0], 0, 0]

    # ── Eigenvalue analysis — mode shapes ────────────────────────────────────
    # Assign unit masses so ops.eigen() has a mass matrix to work with.
    # The resulting mode shapes (eigenvectors) approximate the buckled
    # configurations of the loaded frame; eigenvalues ω are natural frequencies.
    eigen_modes = []
    try:
        n_req = min(3, max(1, len(nodes)))
        for n in nodes:
            ops.mass(n['id'], 1.0, 1.0, 1e-6)
        lambdas = ops.eigen(n_req)
        for k in range(1, len(lambdas) + 1):
            vecs = {}
            for n in nodes:
                nid = n['id']
                vecs[nid] = [
                    ops.nodeEigenvector(nid, k, 1),
                    ops.nodeEigenvector(nid, k, 2),
                ]
            eigen_modes.append({
                'mode':   k,
                'omega':  round(math.sqrt(max(lambdas[k-1], 0.0)), 4),
                'lambda': round(lambdas[k-1], 4),
                'vectors': vecs,
            })
    except Exception:
        eigen_modes = []

    return {
        'node_disps':     node_disps,
        'node_reactions': node_reactions,
        'ele_forces':     ele_forces,
        'eigen_modes':    eigen_modes,
    }


# ---------------------------------------------------------------------------
# Multi-combination solver (Frame Load Cases)
# ---------------------------------------------------------------------------

def _project_load(ld, elements, dict_nodes):
    """
    Convert a frame-load-case load to the internal eleLoad/nodal format
    used by solve(), applying geometry-based projection where needed.

    Directions
    ----------
    'vertical'   : global Y downward — projects onto local element axes.
                   For horizontal elements this is simply wy = -p.
    'projected'  : snow on horizontal projection.
                   p [kN/m horizontal] → wy_local = -p·cos²α, wx_local = -p·cosα·sinα
    'horizontal' : global X (wind) → wy_local = -p·sinα, wx_local = p·cosα
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
        # local y: dot((0,-1), (-sa, ca))  = -ca  →  wy = -p·ca²
        # local x: dot((0,-1), ( ca, sa))  = -sa  →  wx = -p·ca·sa
        wy = -p * ca * ca
        wx = -p * ca * sa

    elif direction == 'horizontal':
        # Wind: p kN/m globally rightward (positive X).
        # local y: dot((1,0), (-sa, ca))  = -sa  →  wy = -p·sa
        # local x: dot((1,0), ( ca, sa))  =  ca  →  wx =  p·ca
        wy = -p * sa
        wx =  p * ca

    elif direction == 'perpendicular':
        # Load perpendicular to element surface.
        # Positive p = pressing INTO surface from outside (e.g. wind pressure).
        # Negative p = suction (pulling away from surface).
        # solve() does: wy_ops = -wy_kNm, so returning wy = +p gives wy_ops = -p
        # which is negative local y = pressing into surface. ✓
        wy = p
        wx = 0.0

    else:  # 'vertical' or default — global Y downward
        # local y: dot((0,-1), (-sa, ca))  = -ca  →  wy = -p·ca
        # local x: dot((0,-1), ( ca, sa))  = -sa  →  wx = -p·sa
        wy = -p * ca
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
            'eigen_modes':        result.get('eigen_modes', []),
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
        plt.Line2D([0],[0], color=C_BEAM,    lw=2.5, label='Beam element'),
        plt.Line2D([0],[0], color=C_TRUSS,   lw=1.8, ls='--', label='Truss element'),
        plt.Line2D([0],[0], color=C_LOAD,    lw=1.5, label='Applied load'),
        plt.Line2D([0],[0], marker='o', color=C_RELEASE, ms=7,
                   markerfacecolor='white', lw=0, label='Moment release'),
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
    figs.append(_style_and_capture('Deflected shape'))

    if beam_eles:
        opsv.section_force_diagram_2d('M', mFac, fig_wi_he=(13, 7),
                                      fmt_secforce1={'color': '#1A6640'},
                                      fmt_secforce2={'color': '#1A6640'})
        figs.append(_style_and_capture('Bending moment  [kNm]'))

        opsv.section_force_diagram_2d('V', vFac, fig_wi_he=(13, 7),
                                      fmt_secforce1={'color': '#1A4FA0'},
                                      fmt_secforce2={'color': '#1A4FA0'})
        figs.append(_style_and_capture('Shear force  [kN]'))

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
    figs.append(_style_and_capture('Axial force  [kN]'))

    return figs


def summarise(nodes, elements, node_disps, node_reactions, ele_forces, supports, loads):
    """Return structured summary dict including full element and node detail."""
    import math

    # ── Max displacements ─────────────────────────────────────────────────────
    max_ux = max((abs(node_disps[n['id']][0]) for n in nodes), default=0.0)
    max_uy = max((abs(node_disps[n['id']][1]) for n in nodes), default=0.0)
    node_max_ux = max(nodes, key=lambda n: abs(node_disps[n['id']][0]))
    node_max_uy = max(nodes, key=lambda n: abs(node_disps[n['id']][1]))

    # ── Max moment ────────────────────────────────────────────────────────────
    beam_eles = [el for el in elements if el.get('type', 'beam') == 'beam']
    if beam_eles:
        el_max_M = max(beam_eles,
                       key=lambda el: max(abs(ele_forces[el['id']][2]),
                                          abs(ele_forces[el['id']][5])))
        max_M = max(abs(ele_forces[el_max_M['id']][2]),
                    abs(ele_forces[el_max_M['id']][5]))
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
            # End i (local) — already in kN / kN·m
            'N_i_kN':  round(f[0], 3),
            'V_i_kN':  round(f[1], 3),
            'M_i_kNm': round(f[2], 3),
            # End j (local)
            'N_j_kN':  round(f[3], 3),
            'V_j_kN':  round(f[4], 3),
            'M_j_kNm': round(f[5], 3),
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
