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


def make_figures(title, nodes, elements, supports, loads,
                 ele_forces, ref_size):
    """
    Generate deformed shape, bending moment and shear force diagrams
    using OpsVis. Returns list of 3 base64 PNG strings.
    """
    if not _OPSVIS_AVAILABLE:
        raise ImportError("opsvis is required. pip install opsvis")

    def _capture():
        buf = io.BytesIO()
        plt.gcf().savefig(buf, format='png', dpi=130, bbox_inches='tight')
        buf.seek(0)
        return base64.b64encode(buf.read()).decode()

    # Auto scale factors
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

    # Deformed shape
    plt.close('all')
    opsv.plot_defo(
        fig_wi_he=(12, 6),
        fmt_defo={'color': 'red', 'linestyle': (0, (4, 5)), 'linewidth': 1.5},
        fmt_undefo={'color': '#555', 'linestyle': 'solid', 'linewidth': 1.5},
    )
    plt.title(f'{title} — Deflection')
    plt.xlabel('x [m]'); plt.ylabel('y [m]'); plt.grid(True); plt.tight_layout()
    figs.append(_capture())
    plt.close('all')

    # Bending moment
    if beam_eles:
        opsv.section_force_diagram_2d('M', mFac, fig_wi_he=(12, 6),
                                      fmt_secforce1={'color': 'green'},
                                      fmt_secforce2={'color': 'green'})
        plt.title(f'{title} — Bending Moment')
        plt.xlabel('x [m]'); plt.ylabel('y [m]'); plt.grid(True); plt.tight_layout()
        figs.append(_capture())
        plt.close('all')

        # Shear
        opsv.section_force_diagram_2d('V', vFac, fig_wi_he=(12, 6),
                                      fmt_secforce1={'color': 'steelblue'},
                                      fmt_secforce2={'color': 'steelblue'})
        plt.title(f'{title} — Shear Force')
        plt.xlabel('x [m]'); plt.ylabel('y [m]'); plt.grid(True); plt.tight_layout()
        figs.append(_capture())
        plt.close('all')

    return figs


def summarise(nodes, elements, node_disps, node_reactions, ele_forces, supports):
    """Return structured summary dict."""
    # Max displacements
    max_ux = max((abs(node_disps[n['id']][0]) for n in nodes), default=0.0)
    max_uy = max((abs(node_disps[n['id']][1]) for n in nodes), default=0.0)
    node_max_ux = max(nodes, key=lambda n: abs(node_disps[n['id']][0]))
    node_max_uy = max(nodes, key=lambda n: abs(node_disps[n['id']][1]))

    # Max moment
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

    # Reactions at supported nodes
    sup_node_ids = {s['node_id'] for s in supports}
    reactions = {}
    for nid in sup_node_ids:
        R = node_reactions[nid]
        reactions[str(nid)] = {
            'Fx_kN':  round(R[0] * 1e-3, 3),
            'Fy_kN':  round(R[1] * 1e-3, 3),
            'Mz_kNm': round(R[2] * 1e-3, 3),
        }

    return {
        'max_ux_mm':     round(max_ux * 1e3, 3),
        'max_ux_node':   node_max_ux['id'],
        'max_uy_mm':     round(max_uy * 1e3, 3),
        'max_uy_node':   node_max_uy['id'],
        'max_moment_kNm': round(max_M * 1e-3, 3),
        'max_moment_ele': el_max_M['id'] if el_max_M else None,
        'reactions':     reactions,
    }
