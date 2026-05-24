"""
concrete.py - RC beam module (EN 1992-1-1)
Unit-aware with forallpeople. No manual conversions.

Closed-form and FEM/imported-action workflow:
- default: calculate M_Ed from wL^2/8
- optional: pass beam_results with imported M_Ed / V_Ed / delta values
"""

import forallpeople as si
si.environment('structural', top_level=True)

from calc_core import S, T, N, MH, CheckContext, FIG, CALC_ROW


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
        f"Simply supported RC beam {b}x{h}, effective depth d = {d}. "
        f"Concrete C{float(f_ck / MPa):.0f}/37, reinforcement B500B. Span = {span}."
    ))

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
    blocks.append(cc.check("Bending: M_Ed / M_Rd,max (singly-reinforced limit)", M_Ed, M_Rd_max))
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
        blocks.append(cc.check("As,prov ≥ As,req", As_req, As_prov))
        blocks.append(cc.check("As,prov ≥ As,min", As_min, As_prov))

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
        blocks.append(cc.check("Shear: V_Ed / V_Rd,max (§6.2.3 strut limit)", V_Ed, V_Rd_max))
        blocks.append(N(
            "V_Rd,max is the upper limit on shear capacity set by concrete crushing of the "
            "compression strut (EN 1992-1-1 §6.2.3, inclined-strut model with θ = 21.8°). "
            "Shear links must be designed to carry V_Ed; minimum-link design is not performed here. "
            "If V_Ed < V_Rd,c (concrete without shear reinforcement, §6.2.2), nominal links may suffice."
        ))

    return blocks
