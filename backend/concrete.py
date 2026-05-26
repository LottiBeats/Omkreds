"""
concrete.py - RC beam module (EN 1992-1-1)
Unit-aware with forallpeople. No manual conversions.

Closed-form and FEM/imported-action workflow:
- default: calculate M_Ed from wL^2/8
- optional: pass beam_results with imported M_Ed / V_Ed / delta values
"""

import hashlib
import tempfile
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from pathlib import Path

import forallpeople as si
si.environment('structural', top_level=True)

from calc_core import S, T, N, MH, CheckContext, FIG, CALC_ROW


def _section_plot_beam(b_mm, h_mm, d_mm, As_req_mm2, As_prov_mm2, tmp_dir):
    """Draw beam cross-section with steel at effective depth and dimension annotations."""
    aspect = h_mm / b_mm
    fig_h  = max(3.0, 2.4 * aspect) + 0.7
    fig, ax = plt.subplots(figsize=(2.6, fig_h))

    # Concrete outline
    ax.add_patch(mpatches.Rectangle(
        (0, 0), b_mm, h_mm,
        linewidth=2, edgecolor='#333333', facecolor='#ede8e1',
    ))

    # Approximate neutral axis depth (0.45·d compression zone)
    y_na   = h_mm - 0.45 * d_mm   # top of compression zone relative to bottom
    ax.add_patch(mpatches.Rectangle(
        (0, y_na), b_mm, h_mm - y_na,
        linewidth=0, facecolor='#c5d8ea', alpha=0.50,
    ))

    # Effective depth dashed line
    y_steel = h_mm - d_mm
    ax.plot([0, b_mm], [y_steel, y_steel],
            color='#3a7bbf', lw=1.4, ls='--', zorder=4)

    # Reinforcement bars (visual representation)
    cover_v  = h_mm - d_mm
    r_vis    = max(4.0, min(cover_v * 0.45, b_mm * 0.09))
    spacing  = r_vis * 2.8
    n_bars   = max(2, int((b_mm - 2 * cover_v) / spacing))
    for i in range(n_bars):
        x_bar = cover_v + (b_mm - 2 * cover_v) / max(n_bars - 1, 1) * i
        ax.add_patch(mpatches.Circle(
            (x_bar, y_steel), r_vis, color='#1a1a1a', zorder=5
        ))

    mx = b_mm * 0.45
    my = h_mm * 0.16
    ax.set_xlim(-mx, b_mm + mx * 2.2)
    ax.set_ylim(-my, h_mm + my * 0.8)
    ax.set_aspect('equal')
    ax.axis('off')

    arr = dict(arrowprops=dict(arrowstyle='<->', color='#555555', lw=1.1,
                               mutation_scale=10))
    # b dimension (below)
    ax.annotate('', xy=(b_mm, -my*0.45), xytext=(0, -my*0.45), **arr)
    ax.text(b_mm/2, -my*0.80, f'b = {b_mm:.0f} mm',
            ha='center', va='top', fontsize=8)
    # h dimension (right)
    x_h = b_mm + mx * 0.55
    ax.annotate('', xy=(x_h, h_mm), xytext=(x_h, 0), **arr)
    ax.text(x_h + mx*0.18, h_mm/2, f'h = {h_mm:.0f} mm',
            ha='left', va='center', fontsize=8, rotation=90)
    # d dimension (further right, blue)
    x_d = b_mm + mx * 1.20
    arr_d = dict(arrowprops=dict(arrowstyle='<->', color='#3a7bbf', lw=1.1,
                                 mutation_scale=10))
    ax.annotate('', xy=(x_d, y_steel), xytext=(x_d, h_mm), **arr_d)
    ax.text(x_d + mx*0.18, (h_mm + y_steel) / 2, f'd = {d_mm:.0f} mm',
            ha='left', va='center', fontsize=8, color='#3a7bbf', rotation=90)

    # As label box at bottom
    as_lines = [f'As,req = {As_req_mm2:.0f} mm²']
    if As_prov_mm2 is not None:
        as_lines.append(f'As,prov = {As_prov_mm2:.0f} mm²')
    ax.text(b_mm / 2, -my * 0.08, '\n'.join(as_lines),
            ha='center', va='top', fontsize=8,
            bbox=dict(boxstyle='round,pad=0.3', facecolor='white',
                      alpha=0.85, edgecolor='#cccccc'))

    ax.set_title('Cross-section', fontsize=10, pad=5)
    plt.tight_layout()
    out_path = Path(tmp_dir) / 'section_beam.png'
    fig.savefig(str(out_path), dpi=130, bbox_inches='tight')
    plt.close(fig)
    return str(out_path)


def rc_beam_bending(
    label,
    span,
    g_k,
    q_k,
    b,
    h,
    d,
    f_ck=None,
    f_yk=None,
    As_prov=None,
    gamma_C=1.5,
    gamma_S=1.15,
    beam_results=None,
    figure_path=None,
    figure_caption="",
):
    if f_ck is None:
        f_ck = 30 * MPa
    if f_yk is None:
        f_yk = 500 * MPa

    cc = CheckContext()
    blocks = []

    blocks.append(MH(f"RC beam - {b}x{h}",
                     f"{label}  |  EN 1992-1-1", material="concrete"))

    blocks.append(S("Design parameters"))
    blocks.append(T(
        f"Simply supported RC beam {b}×{h}, effective depth d = {d}. "
        f"Concrete C{float(f_ck / MPa):.0f}, reinforcement B500B. Span = {span}."
    ))
    blocks.extend([
        CALC_ROW("L",     "span",                          str(span)),
        CALC_ROW("b",     "section width",                 str(b)),
        CALC_ROW("h",     "section height",                str(h)),
        CALC_ROW("d",     "effective depth",               str(d)),
        CALC_ROW("g_k",   "characteristic permanent load", str(g_k)),
        CALC_ROW("q_k",   "characteristic variable load",  str(q_k)),
        CALC_ROW("f_ck",  "char. concrete strength",       str(f_ck)),
        CALC_ROW("f_yk",  "char. steel yield strength",    str(f_yk)),
        CALC_ROW("γ_C",   "partial factor — concrete",     str(gamma_C)),
        CALC_ROW("γ_S",   "partial factor — steel",        str(gamma_S)),
    ])

    if beam_results is None:
        blocks.append(S("ULS loading and design moment"))
        w_Ed = 1.35 * g_k + 1.5 * q_k
        M_Ed = (w_Ed * span**2) / 8
        V_Ed = (w_Ed * span) / 2
        blocks.extend([
            CALC_ROW("w_Ed", "= 1.35·g_k + 1.5·q_k", str(w_Ed)),
            CALC_ROW("M_Ed", "= w_Ed·L²/8",           str(M_Ed)),
            CALC_ROW("V_Ed", "= w_Ed·L/2",            str(V_Ed)),
        ])
        blocks.append(N("Closed-form actions used: simply supported beam under full-span UDL."))
    else:
        blocks.append(S("Imported beam analysis actions"))
        source = beam_results.get("source", "Beam analysis")
        case_name = beam_results.get("case_name", "")
        if case_name:
            blocks.append(T(f"Moment and shear imported from {source}: {case_name}."))
        else:
            blocks.append(T(f"Moment and shear imported from {source}."))

        M_Ed = beam_results["M_Ed"]
        V_Ed = beam_results.get("V_Ed")
        blocks.extend([
            CALC_ROW("M_Ed", "imported design moment", str(M_Ed)),
            CALC_ROW("V_Ed", "imported design shear",
                     str(V_Ed) if V_Ed is not None else "—"),
        ])

        delta_max = beam_results.get("delta_max")
        if delta_max is not None:
            blocks.append(CALC_ROW("δ_max", "imported max deflection", str(delta_max)))

    if figure_path:
        blocks.append(S("Beam analysis diagram"))
        blocks.append(FIG(figure_path,
                          figure_caption or "Moment, shear and deflection overlays from beam analysis."))

    blocks.append(S("Material design strengths"))
    f_cd = (0.85 * f_ck) / gamma_C
    f_yd = f_yk / gamma_S
    blocks.extend([
        CALC_ROW("f_cd", "= 0.85·f_ck / γ_C", str(f_cd)),
        CALC_ROW("f_yd", "= f_yk / γ_S",       str(f_yd)),
    ])

    # ── Bending capacity check (singly-reinforced section limit) ─────────────
    blocks.append(S("Bending capacity — EN 1992-1-1 §6.1"))
    x_lim = 0.45 * d
    M_Rd_max = 0.8 * x_lim * b * f_cd * (d - 0.4 * x_lim)
    blocks.extend([
        CALC_ROW("x_lim",    "= 0.45·d",                             str(x_lim)),
        CALC_ROW("M_Rd,max", "= 0.8·x_lim·b·f_cd·(d − 0.4·x_lim)", str(M_Rd_max)),
    ])
    eta_bend = float(M_Ed / M_Rd_max)
    blocks.append(CALC_ROW("η_bend", "= M_Ed / M_Rd,max", f"{eta_bend:.3f}"))
    blocks.append(cc.check("Bending §6.1 — singly reinforced limit", eta_bend, 1.0))
    blocks.append(N(
        "M_Rd,max is the maximum moment a singly-reinforced rectangular section can carry "
        "(EN 1992-1-1 §6.1, x/d = 0.45 for ductility class B). If M_Ed > M_Rd,max, "
        "either compression reinforcement or a larger cross-section is required."
    ))

    blocks.append(S("Required reinforcement area"))
    z = 0.9 * d
    As_req = M_Ed / (f_yd * z)
    blocks.extend([
        CALC_ROW("z",      "= 0.9·d",           str(z)),
        CALC_ROW("As,req", "= M_Ed / (f_yd·z)", str(As_req)),
    ])
    blocks.append(N(
        "z = 0.9d is a conservative estimate. "
        "Verify with iterative z per EN 1992 cl. 6.1 for final design."
    ))

    # ── Cross-section diagram ─────────────────────────────────────────────────
    _b_raw      = float(b / mm)
    _h_raw      = float(h / mm)
    _d_raw      = float(d / mm)
    _As_req_raw = float(As_req / mm**2)
    _As_prov_raw = float(As_prov / mm**2) if As_prov is not None else None
    with tempfile.TemporaryDirectory() as _sec_tmp:
        _sec_img = _section_plot_beam(_b_raw, _h_raw, _d_raw, _As_req_raw, _As_prov_raw, _sec_tmp)
        with open(_sec_img, 'rb') as _f:
            _sec_bytes = _f.read()
    _sec_hash = hashlib.md5(_sec_bytes).hexdigest()[:12]
    _sec_out   = Path(tempfile.gettempdir()) / f'section_beam_{_sec_hash}.png'
    if not _sec_out.exists():
        _sec_out.write_bytes(_sec_bytes)
    blocks.append(FIG(str(_sec_out), 'Reinforced concrete beam cross-section.', width_mm=85))

    blocks.append(S("Minimum reinforcement — EN 1992-1-1 cl. 9.2.1.1"))
    f_ctm    = 0.3 * (f_ck / MPa)**(2/3) * MPa
    rho_min_1 = 0.26 * float(f_ctm / f_yk)
    As_min_1  = rho_min_1 * float(b / mm) * float(d / mm) * mm**2
    As_min_2  = 0.0013    * float(b / mm) * float(d / mm) * mm**2
    As_min    = As_min_1 if float(As_min_1 / As_min_2) >= 1.0 else As_min_2
    blocks.extend([
        CALC_ROW("f_ctm",    "= 0.3·(f_ck)^(2/3)",  str(f_ctm)),
        CALC_ROW("ρ_min,1",  "= 0.26·f_ctm / f_yk", f"{rho_min_1:.4f}"),
        CALC_ROW("As,min,1", "= ρ_min,1·b·d",        str(As_min_1)),
        CALC_ROW("As,min,2", "= 0.0013·b·d",         str(As_min_2)),
        CALC_ROW("As,min",   "governing minimum",     str(As_min)),
    ])
    if float(As_min_1 / As_min_2) >= 1.0:
        blocks.append(N("As_min governed by 0.26 f_ctm / f_yk × b × d."))
    else:
        blocks.append(N("As_min governed by 0.0013 × b × d."))

    if As_prov is not None:
        blocks.append(S("Reinforcement provided"))
        eta_req = float(As_req / As_prov)
        eta_min = float(As_min / As_prov)
        blocks.extend([
            CALC_ROW("As,prov",   "provided area",          str(As_prov)),
            CALC_ROW("η_As,req",  "= As,req / As,prov",     f"{eta_req:.3f}"),
            cc.check("As,prov ≥ As,req",                    eta_req, 1.0),
            CALC_ROW("η_As,min",  "= As,min / As,prov",     f"{eta_min:.3f}"),
            cc.check("As,prov ≥ As,min  §9.2.1.1",         eta_min, 1.0),
        ])

    if V_Ed is not None:
        blocks.append(S("Shear — EN 1992-1-1 §6.2.3"))
        nu_1      = 0.6 * (1.0 - float(f_ck / (250 * MPa)))
        z_v       = 0.9 * d
        V_Rd_max  = nu_1 * f_cd * b * z_v / (2.5 + 1.0 / 2.5)
        blocks.extend([
            CALC_ROW("ν₁",       "= 0.6·(1 − f_ck/250)",        f"{nu_1:.3f}"),
            CALC_ROW("z_v",      "= 0.9·d",                      str(z_v)),
            CALC_ROW("V_Rd,max", "= ν₁·f_cd·b·z_v/(2.5+1/2.5)", str(V_Rd_max)),
        ])
        eta_shear = float(V_Ed / V_Rd_max)
        blocks.append(CALC_ROW("η_shear", "= V_Ed / V_Rd,max", f"{eta_shear:.3f}"))
        blocks.append(cc.check("Shear §6.2.3 — strut limit", eta_shear, 1.0))
        blocks.append(N(
            "V_Rd,max is the upper limit on shear capacity set by concrete crushing of the "
            "compression strut (EN 1992-1-1 §6.2.3, inclined-strut model with θ = 21.8°). "
            "Shear links must be designed to carry V_Ed; minimum-link design is not performed here. "
            "If V_Ed < V_Rd,c (concrete without shear reinforcement, §6.2.2), nominal links may suffice."
        ))

    return blocks
