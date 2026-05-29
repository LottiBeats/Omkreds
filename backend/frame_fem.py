"""
frame_fem.py — 2D Frame / Truss FEM solver using OpenSeesPy
===========================================================

Supports:
  • Euler-Bernoulli beam elements  (elasticBeamColumn)
  • Truss / bar elements            (Truss)
  • Pin, roller, fixed supports
  • Nodal loads  (Fx, Fy, Mz)
  • Element UDL  (global y = vertical, global x = horizontal)

Sign conventions (returned results)
  N : axial force,  positive = tension
  V : shear force,  positive = upward on left face
  M : bending moment, positive = sagging (tension at bottom)

Thread safety
  OpenSeesPy uses a global model object; a threading.Lock serialises
  concurrent requests so the global state is never shared.
"""

import threading
import numpy as np
import io
import base64

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.gridspec import GridSpec
from matplotlib.patches import FancyArrowPatch

_OPS_LOCK = threading.Lock()


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def solve_and_plot(nodes, elements, supports, loads, title="2D Frame Analysis"):
    """
    Run the FEM analysis and generate a result figure.

    Parameters
    ----------
    nodes    : list[dict]  {id, x, y}                       (m)
    elements : list[dict]  {id, ni, nj, type:'beam'|'truss',
                             E_GPa, A_cm2, I_cm4}
    supports : list[dict]  {node_id, ux:bool, uy:bool, rz:bool}
    loads    : list[dict]  {type:'nodal', node_id, Fx_kN, Fy_kN, Mz_kNm}
                        or {type:'udl',   elem_id, wy_kNm, wx_kNm}
               wy_kNm: vertical load (positive = downward / gravity direction)
               wx_kNm: horizontal load (positive = rightward)
    title    : str

    Returns
    -------
    dict with keys:
      fig_b64          : base64-encoded PNG of the results figure
      node_disps       : list of node displacement dicts
      reactions        : list of reaction dicts
      element_results  : list of element force dicts
      summary          : {max_M_kNm, max_V_kN, max_N_kN, max_disp_mm}
    """
    with _OPS_LOCK:
        return _run(nodes, elements, supports, loads, title)


# ─────────────────────────────────────────────────────────────────────────────
# Internal solver
# ─────────────────────────────────────────────────────────────────────────────

def _run(nodes, elements, supports, loads, title):
    import openseespy.opensees as ops

    # ── Build model ───────────────────────────────────────────────────────────
    ops.wipe()
    ops.model("basic", "-ndm", 2, "-ndf", 3)

    node_map = {}           # user id  → ops tag  (1-indexed)
    for idx, n in enumerate(nodes):
        tag = idx + 1
        node_map[n["id"]] = tag
        ops.node(tag, float(n["x"]), float(n["y"]))

    ops.geomTransf("Linear", 1)

    nid_map = {n["id"]: n for n in nodes}

    # Nodes with at least one RIGID beam connection — these must NOT have rz auto-fixed.
    beam_nodes: set = set()

    # elasticBeamColumn -release codes for pinned-end beams:
    #   0=rigid  1=pin at i  2=pin at j  3=pin both ends
    _rcode = {"none": 0, "start": 1, "end": 2, "both": 3}

    elem_info = {}
    for idx, elem in enumerate(elements):
        ops_tag  = idx + 1
        etype    = elem.get("type", "beam")
        releases = elem.get("releases", "none") if etype == "beam" else "none"
        rcode    = _rcode.get(releases, 0)

        ni_id = elem["ni"]
        nj_id = elem["nj"]
        ni_tag = node_map[ni_id]
        nj_tag = node_map[nj_id]

        xi, yi = float(nid_map[ni_id]["x"]), float(nid_map[ni_id]["y"])
        xj, yj = float(nid_map[nj_id]["x"]), float(nid_map[nj_id]["y"])
        dx, dy = xj - xi, yj - yi
        L = (dx**2 + dy**2) ** 0.5
        c, s = dx / L, dy / L

        E = float(elem["E_GPa"]) * 1e6
        A = float(elem["A_cm2"]) * 1e-4
        I = float(elem.get("I_cm4", 0.0)) * 1e-8

        if etype == "truss":
            mat_tag = idx + 1
            ops.uniaxialMaterial("Elastic", mat_tag, E)
            ops.element("Truss", ops_tag, ni_tag, nj_tag, A, mat_tag)
            force_src = "truss"
        else:
            # elasticBeamColumn for all beam elements.
            # -release rcode adds moment releases (0=rigid, 1=pin-i, 2=pin-j, 3=both).
            # Section forces are extracted via localForce + beam equilibrium (exact).
            if rcode == 0:
                ops.element("elasticBeamColumn", ops_tag,
                            ni_tag, nj_tag, A, E, I, 1)
            else:
                ops.element("elasticBeamColumn", ops_tag,
                            ni_tag, nj_tag, A, E, I, 1,
                            "-release", rcode)
            if releases not in ("both", "start"):
                beam_nodes.add(ni_id)
            if releases not in ("both", "end"):
                beam_nodes.add(nj_id)
            force_src = "beam"

        elem_info[elem["id"]] = {
            "ops_tag":   ops_tag, "elem": elem,
            "c": c, "s": s, "L": L,
            "xi": xi, "yi": yi, "xj": xj, "yj": yj,
            "force_src": force_src,
        }

    # ── Boundary conditions ───────────────────────────────────────────────────
    # First: fix rotation DOFs on truss-only nodes (prevent singular K)
    fixed_rz: set = set()
    for sup in supports:
        if sup.get("rz", False):
            fixed_rz.add(sup["node_id"])
    for n in nodes:
        nid = n["id"]
        if nid not in beam_nodes and nid not in fixed_rz:
            ops.fix(node_map[nid], 0, 0, 1)
            fixed_rz.add(nid)

    # Then apply user-specified supports
    for sup in supports:
        n_tag = node_map[sup["node_id"]]
        ux = 1 if sup.get("ux", False) else 0
        uy = 1 if sup.get("uy", False) else 0
        rz = 1 if sup.get("rz", False) else 0
        if ux or uy or rz:
            ops.fix(n_tag, ux, uy, rz)

    # ── Loads ─────────────────────────────────────────────────────────────────
    ops.timeSeries("Linear", 1)
    ops.pattern("Plain", 1, 1)

    # Keep track of local distributed loads for section force computation
    elem_distrib: dict = {}   # user elem_id → {wy_local, wx_local}

    for ld in loads:
        ltype = ld.get("type", "")

        if ltype == "nodal":
            nid = ld.get("node_id")
            if nid is None or nid not in node_map:
                continue
            n_tag = node_map[nid]
            ops.load(n_tag,
                     float(ld.get("Fx_kN", 0.0)),
                     float(ld.get("Fy_kN", 0.0)),
                     float(ld.get("Mz_kNm", 0.0)))

        elif ltype == "udl":
            eid = ld.get("elem_id")
            if eid is None or eid not in elem_info:
                continue   # UDL row with no element selected — skip silently
            ei  = elem_info[eid]
            if ei["elem"].get("type", "beam") == "truss":
                continue   # OpenSeesPy Truss elements don't support eleLoad
            c, s = ei["c"], ei["s"]

            # User inputs in GLOBAL coords:
            #   wy_kNm positive → downward (gravity); internally that's global Fy = -wy_kNm
            #   wx_kNm positive → rightward; globally Fx = +wx_kNm
            wy_g = -float(ld.get("wy_kNm", 0.0))   # global y component (upward = positive)
            wx_g =  float(ld.get("wx_kNm", 0.0))   # global x component (rightward = positive)

            # Project into local element coordinates
            # local x = (c, s), local y = (-s, c)
            wx_local = c * wx_g + s * wy_g
            wy_local = -s * wx_g + c * wy_g

            ops.eleLoad("-ele", ei["ops_tag"], "-type", "-beamUniform",
                        wy_local, wx_local)

            if eid not in elem_distrib:
                elem_distrib[eid] = {"wy": 0.0, "wx": 0.0}
            elem_distrib[eid]["wy"] += wy_local
            elem_distrib[eid]["wx"] += wx_local

    # ── Solve ─────────────────────────────────────────────────────────────────
    ops.system("BandGeneral")
    ops.numberer("RCM")
    ops.constraints("Transformation")
    ops.integrator("LoadControl", 1.0)
    ops.algorithm("Linear")
    ops.analysis("Static")
    ok = ops.analyze(1)
    if ok != 0:
        raise RuntimeError("OpenSeesPy analysis did not converge — check that the "
                           "structure is properly supported (not a mechanism).")

    # ── Node displacements ────────────────────────────────────────────────────
    node_disps = []
    for n in nodes:
        d = ops.nodeDisp(node_map[n["id"]])
        node_disps.append({
            "node_id": n["id"],
            "ux_mm":   round(d[0] * 1000, 6),
            "uy_mm":   round(d[1] * 1000, 6),
            "rz_mrad": round(d[2] * 1000, 6),
        })

    # ── Support reactions ─────────────────────────────────────────────────────
    ops.reactions()
    reactions = []
    for sup in supports:
        n_tag = node_map[sup["node_id"]]
        reactions.append({
            "node_id": sup["node_id"],
            "Rx_kN":  round(ops.nodeReaction(n_tag, 1), 4),
            "Ry_kN":  round(ops.nodeReaction(n_tag, 2), 4),
            "Mz_kNm": round(ops.nodeReaction(n_tag, 3), 4),
        })

    # ── Element section forces ────────────────────────────────────────────────
    elem_results = []
    n_pts = 25

    for elem in elements:
        eid   = elem["id"]
        ei    = elem_info[eid]
        etype = elem.get("type", "beam")
        L     = ei["L"]
        c, s  = ei["c"], ei["s"]
        distrib = elem_distrib.get(eid, {"wy": 0.0, "wx": 0.0})

        xs = np.linspace(0.0, L, n_pts)

        force_src = ei["force_src"]

        if force_src == "truss":
            # Axial force from axial displacement (exact for truss elements)
            ni_tag = node_map[elem["ni"]]
            nj_tag = node_map[elem["nj"]]
            di = ops.nodeDisp(ni_tag)
            dj = ops.nodeDisp(nj_tag)
            du = (dj[0] - di[0]) * c + (dj[1] - di[1]) * s
            E_  = float(elem["E_GPa"]) * 1e6
            A_  = float(elem["A_cm2"]) * 1e-4
            N_arr = np.full(n_pts, E_ * A_ * du / L)
            V_arr = np.zeros(n_pts)
            M_arr = np.zeros(n_pts)

        else:  # beam (elasticBeamColumn, with or without -release)
            # localForce = [N_i, Vy_i, Mz_i, N_j, Vy_j, Mz_j]
            # forces the element exerts ON the nodes → negate for section forces.
            # For -release elements OpenSeesPy enforces M=0 at pinned ends.
            # The beam equilibrium formulas below are exact for uniform loads.
            lf      = ops.eleResponse(ei["ops_tag"], "localForce")
            N0      = -lf[0]   # axial    (tension +)
            V0      = -lf[1]   # shear    (upward on left face +)
            M0      = -lf[2]   # moment   (sagging +)
            wy_down = -distrib["wy"]   # downward UDL (positive = downward)
            wx_axl  =  distrib["wx"]
            N_arr   = N0 + wx_axl  * xs
            V_arr   = V0 - wy_down * xs
            M_arr   = M0 + V0 * xs - wy_down * xs**2 / 2.0

        elem_results.append({
            "elem_id":     eid,
            "ni":          elem["ni"],
            "nj":          elem["nj"],
            "type":        etype,
            "L_m":         round(L, 4),
            "N_start_kN":  round(float(N_arr[0]),   4),
            "V_start_kN":  round(float(V_arr[0]),   4),
            "M_start_kNm": round(float(M_arr[0]),   4),
            "N_end_kN":    round(float(N_arr[-1]),  4),
            "V_end_kN":    round(float(V_arr[-1]),  4),
            "M_end_kNm":   round(float(M_arr[-1]),  4),
            "M_max_kNm":   round(float(np.max(np.abs(M_arr))), 4),
            "V_max_kN":    round(float(np.max(np.abs(V_arr))), 4),
            "N_max_kN":    round(float(np.max(np.abs(N_arr))), 4),
            "xs":          xs.tolist(),
            "N_arr":       N_arr.tolist(),
            "V_arr":       V_arr.tolist(),
            "M_arr":       M_arr.tolist(),
        })

    # ── Summary ───────────────────────────────────────────────────────────────
    all_M = [abs(er["M_max_kNm"]) for er in elem_results]
    all_V = [abs(er["V_max_kN"])  for er in elem_results]
    all_N = [abs(er["N_max_kN"])  for er in elem_results]
    all_disp = [abs(d["uy_mm"]) for d in node_disps] + [abs(d["ux_mm"]) for d in node_disps]

    summary = {
        "max_M_kNm":   round(max(all_M, default=0.0), 4),
        "max_V_kN":    round(max(all_V, default=0.0), 4),
        "max_N_kN":    round(max(all_N, default=0.0), 4),
        "max_disp_mm": round(max(all_disp, default=0.0), 4),
    }

    # ── OpsVis force-diagram images ───────────────────────────────────────────
    # OpsVis reads from the live OpenSeesPy model, so call before wipe().
    span = max(
        max(n["x"] for n in nodes) - min(n["x"] for n in nodes),
        max(n["y"] for n in nodes) - min(n["y"] for n in nodes),
        0.1,
    )

    def _opsvis_png(ftype, max_abs):
        import opsvis as opsv
        sfac = span * 0.12 / max(float(max_abs), 0.001)
        opsv.section_force_diagram_2d(ftype, sfac, fig_wi_he=(9, 5))
        fig = plt.gcf()
        fig.patch.set_facecolor("white")
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        return base64.b64encode(buf.read()).decode()

    try:
        ops_n_b64 = _opsvis_png("N", summary["max_N_kN"])
        ops_v_b64 = _opsvis_png("V", summary["max_V_kN"])
        ops_m_b64 = _opsvis_png("M", summary["max_M_kNm"])
    except Exception as exc:
        ops_n_b64 = ops_v_b64 = ops_m_b64 = None

    # ── Matplotlib combined figure (used by PDF export) ───────────────────────
    node_disp_dict = {d["node_id"]: d for d in node_disps}
    fig_b64 = _make_figure(
        nodes, elements, supports, loads,
        elem_results, node_disp_dict, title,
    )

    return {
        "fig_b64":         fig_b64,
        "ops_n_b64":       ops_n_b64,
        "ops_v_b64":       ops_v_b64,
        "ops_m_b64":       ops_m_b64,
        "node_disps":      node_disps,
        "reactions":       reactions,
        "element_results": elem_results,
        "summary":         summary,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Figure generation
# ─────────────────────────────────────────────────────────────────────────────

def _make_figure(nodes, elements, supports, loads,
                 elem_results, node_disp_dict, title):
    """Build a 5-panel matplotlib figure and return as base64 PNG."""

    fig = plt.figure(figsize=(14, 9), facecolor="white")
    fig.suptitle(title, fontsize=14, fontweight="bold", y=0.98)

    gs = GridSpec(2, 3, figure=fig, hspace=0.42, wspace=0.35,
                  top=0.93, bottom=0.05, left=0.04, right=0.97)
    ax_model   = fig.add_subplot(gs[0, :2])   # top-left (wide): model
    ax_deform  = fig.add_subplot(gs[0, 2])    # top-right: deformed shape
    ax_N       = fig.add_subplot(gs[1, 0])    # bottom-left: axial
    ax_V       = fig.add_subplot(gs[1, 1])    # bottom-middle: shear
    ax_M       = fig.add_subplot(gs[1, 2])    # bottom-right: moment

    node_xy  = {n["id"]: (n["x"], n["y"]) for n in nodes}
    er_by_id = {er["elem_id"]: er for er in elem_results}

    _draw_model(ax_model,  nodes, elements, supports, loads, node_xy)
    _draw_deformed(ax_deform, nodes, elements, node_disp_dict, node_xy)
    _draw_diagram(ax_N, nodes, elements, er_by_id, node_xy, "N",
                  "Axial force  N  (kN)", "#e07b39", "#fde8d8")
    _draw_diagram(ax_V, nodes, elements, er_by_id, node_xy, "V",
                  "Shear force  V  (kN)", "#2a7abb", "#daeaf8")
    _draw_diagram(ax_M, nodes, elements, er_by_id, node_xy, "M",
                  "Bending moment  M  (kNm)", "#27ae60", "#d5f0e0")

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=90, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()


# ── Individual axes ───────────────────────────────────────────────────────────

def _draw_model(ax, nodes, elements, supports, loads, node_xy):
    ax.set_title("Structural model", fontsize=10, fontweight="bold")
    ax.set_aspect("equal")
    ax.set_facecolor("#fafafa")

    # Elements
    for elem in elements:
        xi, yi = node_xy[elem["ni"]]
        xj, yj = node_xy[elem["nj"]]
        lw  = 2.5 if elem.get("type", "beam") == "beam" else 1.5
        ls  = "-"  if elem.get("type", "beam") == "beam" else "--"
        ax.plot([xi, xj], [yi, yj], color="#1e3a5f", lw=lw, ls=ls, zorder=2)

    # Nodes
    xs_n = [n["x"] for n in nodes]
    ys_n = [n["y"] for n in nodes]
    ax.scatter(xs_n, ys_n, s=40, color="#1e3a5f", zorder=4)
    for n in nodes:
        ax.annotate(str(n["id"]),
                    (n["x"], n["y"]), fontsize=8, color="#555",
                    xytext=(4, 4), textcoords="offset points")

    # Scale for support symbols
    all_x = [n["x"] for n in nodes]
    all_y = [n["y"] for n in nodes]
    span = max(max(all_x) - min(all_x), max(all_y) - min(all_y), 0.1)
    sym_sz = span * 0.06

    # Supports
    for sup in supports:
        x, y = node_xy[sup["node_id"]]
        ux, uy, rz = sup.get("ux", False), sup.get("uy", False), sup.get("rz", False)
        if ux and uy and rz:
            _draw_fixed(ax, x, y, sym_sz)
        elif ux and uy:
            _draw_pin(ax, x, y, sym_sz)
        elif uy:
            _draw_roller(ax, x, y, sym_sz)
        else:
            _draw_pin(ax, x, y, sym_sz)

    # UDL arrows
    for ld in loads:
        if ld.get("type") != "udl":
            continue
        eid = ld.get("elem_id")
        if eid is None:
            continue
        elem = next((e for e in elements if e["id"] == eid), None)
        if not elem:
            continue
        xi, yi = node_xy[elem["ni"]]
        xj, yj = node_xy[elem["nj"]]
        wy = float(ld.get("wy_kNm", 0.0))
        if abs(wy) < 1e-9:
            continue
        # Draw 5 small arrows downward along element
        for t in np.linspace(0.1, 0.9, 5):
            xx = xi + t * (xj - xi)
            yy = yi + t * (yj - yi)
            dy_arrow = -sym_sz * 1.2 * np.sign(wy)
            ax.annotate("", xy=(xx, yy), xytext=(xx, yy - dy_arrow),
                        arrowprops=dict(arrowstyle="-|>",
                                        color="#e07b39", lw=1.2,
                                        mutation_scale=8))

    # Nodal loads
    for ld in loads:
        if ld.get("type") != "nodal":
            continue
        nid = ld.get("node_id")
        if nid is None:
            continue
        x, y = node_xy[nid]
        Fx = float(ld.get("Fx_kN", 0.0))
        Fy = float(ld.get("Fy_kN", 0.0))
        mag = (Fx**2 + Fy**2)**0.5
        if mag > 1e-9:
            ax.annotate("", xy=(x, y),
                        xytext=(x - Fx / mag * sym_sz * 2,
                                y - Fy / mag * sym_sz * 2),
                        arrowprops=dict(arrowstyle="-|>", color="#c0392b",
                                        lw=1.4, mutation_scale=10))

    ax.autoscale_view()
    _set_axis_style(ax)


def _draw_deformed(ax, nodes, elements, node_disp_dict, node_xy):
    ax.set_title("Deformed shape", fontsize=10, fontweight="bold")
    ax.set_aspect("equal")
    ax.set_facecolor("#fafafa")

    # Undeformed (grey dashed)
    for elem in elements:
        xi, yi = node_xy[elem["ni"]]
        xj, yj = node_xy[elem["nj"]]
        ax.plot([xi, xj], [yi, yj], color="#ccc", lw=1, ls="--", zorder=1)

    # Find scale factor so max displacement ≈ 10% of span
    all_ux = [node_disp_dict[n["id"]]["ux_mm"] * 1e-3 for n in nodes]
    all_uy = [node_disp_dict[n["id"]]["uy_mm"] * 1e-3 for n in nodes]
    all_x  = [n["x"] for n in nodes]
    all_y  = [n["y"] for n in nodes]
    span   = max(max(all_x) - min(all_x), max(all_y) - min(all_y), 0.1)
    max_d  = max(max(abs(v) for v in all_ux + all_uy), 1e-12)
    scale  = (span * 0.12) / max_d

    node_def = {}
    for n in nodes:
        d = node_disp_dict[n["id"]]
        node_def[n["id"]] = (
            n["x"] + d["ux_mm"] * 1e-3 * scale,
            n["y"] + d["uy_mm"] * 1e-3 * scale,
        )

    # Deformed (blue)
    for elem in elements:
        xid, yid = node_def[elem["ni"]]
        xjd, yjd = node_def[elem["nj"]]
        ax.plot([xid, xjd], [yid, yjd], color="#2a7abb", lw=2, zorder=2)

    # Deformed node positions
    xd = [node_def[n["id"]][0] for n in nodes]
    yd = [node_def[n["id"]][1] for n in nodes]
    ax.scatter(xd, yd, s=30, color="#2a7abb", zorder=3)

    ax.text(0.02, 0.97, f"Scale ×{scale:.0f}", transform=ax.transAxes,
            fontsize=7, va="top", color="#888")

    ax.autoscale_view()
    _set_axis_style(ax)


def _draw_diagram(ax, nodes, elements, er_by_id, node_xy, force_type,
                  title_str, line_color, fill_color):
    ax.set_title(title_str, fontsize=10, fontweight="bold")
    ax.set_aspect("equal")
    ax.set_facecolor("#fafafa")

    # Undeformed skeleton
    for elem in elements:
        xi, yi = node_xy[elem["ni"]]
        xj, yj = node_xy[elem["nj"]]
        ax.plot([xi, xj], [yi, yj], color="#ddd", lw=1, ls="--", zorder=1)

    # Gather max force for normalisation
    all_vals = []
    for er in er_by_id.values():
        arr = er[f"{force_type}_arr"]
        all_vals.extend(arr)
    max_abs = max((abs(v) for v in all_vals), default=1.0) or 1.0

    all_x = [n["x"] for n in nodes]
    all_y = [n["y"] for n in nodes]
    span   = max(max(all_x) - min(all_x), max(all_y) - min(all_y), 0.1)
    depth  = max(max(all_y) - min(all_y), 0.5)   # structural depth (height)
    # Cap diagram height to 60% of structural depth so it never overlaps
    # members on the other chord.  Also cap at 18% of span for wide frames.
    diag_height = min(depth * 0.60, span * 0.18)
    diag_scale  = diag_height / max_abs

    # Plot diagrams per element
    for elem in elements:
        eid = elem["id"]
        er  = er_by_id.get(eid)
        if er is None:
            continue

        xi, yi = node_xy[elem["ni"]]
        xj, yj = node_xy[elem["nj"]]
        L  = er["L_m"]
        c  = (xj - xi) / L
        s  = (yj - yi) / L
        # perpendicular direction (rotated 90° CCW from element axis)
        px, py = -s, c

        xs   = np.array(er["xs"])
        vals = np.array(er[f"{force_type}_arr"])

        # Global positions along element
        gx  = xi + xs * c
        gy  = yi + xs * s
        # Offset perpendicular by diagram value
        # For M: positive (sagging) → offset in -perpendicular (visual convention)
        sign = -1.0 if force_type == "M" else 1.0
        ox  = gx + sign * vals * diag_scale * px
        oy  = gy + sign * vals * diag_scale * py

        # Fill polygon between element axis and diagram
        poly_x = np.concatenate([gx, ox[::-1]])
        poly_y = np.concatenate([gy, oy[::-1]])
        ax.fill(poly_x, poly_y, color=fill_color, alpha=0.8, zorder=2)
        ax.plot(ox, oy, color=line_color, lw=1.5, zorder=3)
        # Close diagram lines at element ends
        ax.plot([gx[0], ox[0]],   [gy[0], oy[0]],   color=line_color, lw=0.8)
        ax.plot([gx[-1], ox[-1]], [gy[-1], oy[-1]], color=line_color, lw=0.8)

        # Annotate max value
        idx_max = np.argmax(np.abs(vals))
        v_max   = vals[idx_max]
        if abs(v_max) > 1e-6:
            lbl_x = gx[idx_max] + sign * v_max * diag_scale * px
            lbl_y = gy[idx_max] + sign * v_max * diag_scale * py
            ax.text(lbl_x, lbl_y, f"{v_max:.1f}",
                    fontsize=7, ha="center", va="center",
                    color=line_color, fontweight="bold")

    ax.autoscale_view()
    _set_axis_style(ax)


# ── Support symbols ───────────────────────────────────────────────────────────

def _draw_pin(ax, x, y, sz):
    tri = plt.Polygon([[x, y], [x - sz, y - sz], [x + sz, y - sz]],
                      closed=True, facecolor="#aaa", edgecolor="#555", lw=1, zorder=3)
    ax.add_patch(tri)
    ax.plot([x - sz, x + sz], [y - sz, y - sz], color="#555", lw=1.5, zorder=3)


def _draw_roller(ax, x, y, sz):
    tri = plt.Polygon([[x, y], [x - sz, y - sz], [x + sz, y - sz]],
                      closed=True, facecolor="#ccc", edgecolor="#555", lw=1, zorder=3)
    ax.add_patch(tri)
    circle_y = y - sz * 1.25
    circ = plt.Circle((x, circle_y), sz * 0.2, color="#555", zorder=3)
    ax.add_patch(circ)
    ax.plot([x - sz, x + sz], [y - sz * 1.5, y - sz * 1.5], color="#555", lw=1.5, zorder=3)


def _draw_fixed(ax, x, y, sz):
    ax.plot([x, x], [y, y - sz], color="#555", lw=2, zorder=3)
    for dy in np.linspace(0, -sz, 5):
        ax.plot([x - sz * 0.5, x], [y + dy - sz * 0.15, y + dy], color="#555", lw=1)


def _set_axis_style(ax):
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.tick_params(labelsize=7)
