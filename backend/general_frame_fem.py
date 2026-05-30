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

def solve(nodes, elements, supports, loads):
    """
    Build and solve a 2D linear elastic frame/truss model.

    Parameters
    ----------
    nodes : list of dict
        Each: {id: int, x: float, y: float}
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

    # Elements
    for el in elements:
        eid  = el['id']
        ni   = el['ni']
        nj   = el['nj']
        E    = float(el.get('E_GPa',  210.0)) * 1e9
        A    = float(el.get('A_cm2',  50.0))  * 1e-4
        Iz   = float(el.get('Iz_cm4', 5000.0))* 1e-8
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
                ops.load(ld['node_id'],
                         float(ld.get('Fx_kN',  0.0)) * 1e3,
                         float(ld.get('Fy_kN',  0.0)) * 1e3,
                         float(ld.get('Mz_kNm', 0.0)) * 1e3)
            elif ld['type'] == 'udl':
                wy = -abs(float(ld.get('wy_kNm', 0.0))) * 1e3 if ld.get('wy_kNm', 0) != 0 \
                     else float(ld.get('wy_kNm', 0.0)) * 1e3
                # wy_kNm: positive = downward in UI → negative in OpenSeesPy local y
                wy_ops = -float(ld.get('wy_kNm', 0.0)) * 1e3
                wx_ops =  float(ld.get('wx_kNm', 0.0)) * 1e3
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

    return {
        'node_disps':     node_disps,
        'node_reactions': node_reactions,
        'ele_forces':     ele_forces,
    }


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

    # ── Nodes ─────────────────────────────────────────────────────────────────
    for n in nodes:
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
        wy = float(ld.get('wy_kNm', 0) or 0)
        if ld.get('type') == 'combo_udl':
            wy = 1.0   # placeholder — show as symbolic if not yet resolved
        if abs(wy) < 1e-10 and ld.get('type') != 'combo_udl': continue
        sign = -1 if wy >= 0 else 1   # positive wy = downward
        n_arr = max(4, int(L / (ref_size * 0.12)) + 1)
        # Draw arrows perpendicular to element
        for k in range(n_arr + 1):
            t  = k / n_arr
            px = xi + t*(xj - xi); py = yi + t*(yj - yi)
            ox = -sa * arr * sign; oy = ca * arr * sign
            ax.annotate('', xy=(px, py), xytext=(px + ox, py + oy),
                        arrowprops=dict(arrowstyle='->', color=C_LOAD, lw=1.0,
                                        mutation_scale=8), zorder=6)
        # Connecting line at tips
        tip_xs = [xi - sa*arr*sign + k/n_arr*(xj-xi) for k in range(n_arr+1)]
        tip_ys = [yi + ca*arr*sign + k/n_arr*(yj-yi) for k in range(n_arr+1)]
        ax.plot(tip_xs, tip_ys, color=C_LOAD, lw=1.2, zorder=5)
        # Label
        lbl = f'{abs(wy):.1f} kN/m' if ld.get('type') != 'combo_udl' else 'w_Ed [combo]'
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
            'Fx_kN':  round(R[0] * 1e-3, 3),
            'Fy_kN':  round(R[1] * 1e-3, 3),
            'Mz_kNm': round(R[2] * 1e-3, 3),
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
            # End i (local)
            'N_i_kN':  round(f[0] * 1e-3, 3),
            'V_i_kN':  round(f[1] * 1e-3, 3),
            'M_i_kNm': round(f[2] * 1e-3, 3),
            # End j (local)
            'N_j_kN':  round(f[3] * 1e-3, 3),
            'V_j_kN':  round(f[4] * 1e-3, 3),
            'M_j_kNm': round(f[5] * 1e-3, 3),
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
        'max_moment_kNm': round(max_M * 1e-3, 3),
        'max_moment_ele': el_max_M['id'] if el_max_M else None,
        # Detailed tables
        'reactions':       reactions,
        'node_disp_table': node_disp_table,
        'ele_force_table': ele_force_table,
        'loads_table':     loads_table,
    }
