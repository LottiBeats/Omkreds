"""
timber.py - Timber beam module (EN 1995-1-1)
Unit-aware with forallpeople. No manual conversions.

Closed-form and FEM/imported-action workflow:
- default: calculate M_Ed and V_Ed from wL^2/8 and wL/2
- optional: pass beam_results with imported M_Ed / V_Ed / delta values
"""

import forallpeople as si
si.environment('structural', top_level=True)

from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext, FIG
from timber_grades import get_timber_grade

KMOD = {
    (1, "permanent"): 0.60, (1, "long"): 0.70, (1, "medium"): 0.80,
    (1, "short"): 0.90,     (1, "instant"): 1.10,
    (2, "permanent"): 0.60, (2, "long"): 0.70, (2, "medium"): 0.80,
    (2, "short"): 0.90,     (2, "instant"): 1.10,
    (3, "permanent"): 0.50, (3, "long"): 0.55, (3, "medium"): 0.65,
    (3, "short"): 0.70,     (3, "instant"): 0.90,
}


def timber_beam(
    label,
    span,
    g_k,
    q_k,
    b,
    h,
    timber_grade=None,
    f_mk=None,
    f_vk=None,
    E_0_05=None,
    service_class=1,
    load_duration="medium",
    gamma_M=1.3,
    beam_results=None,
    fire_design=None,
    l_ef=None,
    compression_edge_restrained=False,
    torsional_restraint_at_supports=True,
    support_length=None,
    bearing_force=None,
    f_c_90_k=None,
    k_c_90=None,
    support_material="solid_timber",
    load_near_support=False,
    end_distance=None,
    figure_path=None,
    figure_caption="",
):
    grade_key = None
    grade_data = None
    if timber_grade is not None:
        grade_key, grade_data = get_timber_grade(timber_grade)

    if f_mk is None and grade_data is not None:
        f_mk = grade_data["f_mk"]
    if f_mk is None:
        f_mk = 24 * MPa
    if f_vk is None and grade_data is not None:
        f_vk = grade_data["f_vk"]
    if f_vk is None:
        f_vk = 4.0 * MPa
    if E_0_05 is None and grade_data is not None:
        E_0_05 = grade_data["E_0_05"]
    if E_0_05 is None:
        E_0_05 = 7_400 * MPa
    if f_c_90_k is None and grade_data is not None:
        f_c_90_k = grade_data["f_c_90_k"]
    if f_c_90_k is None:
        f_c_90_k = 2.5 * MPa
    if support_material == "solid_timber" and grade_data is not None:
        support_material = grade_data["support_material"]

    kmod = KMOD.get((service_class, load_duration), 0.80)
    cc = CheckContext()
    blocks = []

    _b_mm = int(round(b / mm))
    _h_mm = int(round(h / mm))
    blocks.append(MH(f"Timber beam — {_b_mm}×{_h_mm} mm",
                     f"{label}  |  EN 1995-1-1", material="timber"))

    # ── Design parameters ─────────────────────────────────────────────────────
    blocks.append(S("Design parameters"))
    blocks.append(T(
        f"Simply supported {(grade_data['description'] if grade_data is not None else 'C24 solid timber')} beam, span {span}. "
        f"Service class {service_class}, load duration: {load_duration}. "
        f"k_mod = {kmod}, gamma_M = {gamma_M}."
    ))
    blocks.extend([
        CALC_ROW("L",        "span",                        str(span)),
        CALC_ROW("g_k",      "permanent load",              str(g_k)),
        CALC_ROW("q_k",      "variable load",               str(q_k)),
        CALC_ROW("b",        "width",                       str(b)),
        CALC_ROW("h",        "depth",                       str(h)),
        CALC_ROW("Grade",    "",                            grade_key if grade_key is not None else "manual"),
        CALC_ROW("f_m,k",    "char. bending strength",      str(f_mk)),
        CALC_ROW("f_v,k",    "char. shear strength",        str(f_vk)),
        CALC_ROW("E_0,05",   "5th-percentile modulus",      str(E_0_05)),
        CALC_ROW("f_c,90,k", "perp-grain bearing strength", str(f_c_90_k)),
        CALC_ROW("k_mod",    "modification factor",         f"{kmod:.2f}"),
        CALC_ROW("γ_M",      "partial factor",              f"{gamma_M:.2f}"),
    ])

    # ── Loading ───────────────────────────────────────────────────────────────
    if beam_results is None:
        blocks.append(S("ULS loading"))

        w_Ed = 1.35 * g_k + 1.5 * q_k
        M_Ed = (w_Ed * span**2) / 8
        V_Ed = (w_Ed * span) / 2

        blocks.extend([
            CALC_ROW("w_Ed", "= 1.35·g_k + 1.5·q_k",  str(w_Ed)),
            CALC_ROW("M_Ed", "= w_Ed·L²/8",             str(M_Ed)),
            CALC_ROW("V_Ed", "= w_Ed·L/2",              str(V_Ed)),
        ])
        blocks.append(N("Closed-form actions used: simply supported beam under full-span UDL."))

    else:
        blocks.append(S("Imported beam analysis actions"))
        source    = beam_results.get("source", "Beam analysis")
        case_name = beam_results.get("case_name", "")
        if case_name:
            blocks.append(T(f"Moment and shear imported from {source}: {case_name}."))
        else:
            blocks.append(T(f"Moment and shear imported from {source}."))

        M_Ed = beam_results["M_Ed"]
        V_Ed = beam_results["V_Ed"]

        blocks.extend([
            CALC_ROW("M_Ed", "imported design moment", str(M_Ed)),
            CALC_ROW("V_Ed", "imported design shear",  str(V_Ed)),
        ])

        delta_max = beam_results.get("delta_max")
        if delta_max is not None:
            blocks.append(CALC_ROW("δ_max", "imported max deflection", str(delta_max)))

        x_M = beam_results.get("x_M_Ed")
        x_V = beam_results.get("x_V_Ed")
        loc_parts = []
        if x_M is not None:
            loc_parts.append(f"|M| max at x = {x_M}")
        if x_V is not None:
            loc_parts.append(f"|V| max at x = {x_V}")
        if loc_parts:
            blocks.append(N(" ; ".join(loc_parts)))

    if figure_path:
        blocks.append(S("Beam analysis diagram"))
        blocks.append(FIG(figure_path, figure_caption or "Moment, shear and deflection overlays from beam analysis."))

    # ── Bending resistance ────────────────────────────────────────────────────
    blocks.append(S("Bending resistance — EN 1995-1-1 cl. 6.1.6"))

    W_y    = (b * h**2) / 6
    f_md   = kmod * f_mk / gamma_M
    sigma_md = M_Ed / W_y

    blocks.extend([
        CALC_ROW("W_y",    "= b·h²/6",            str(W_y)),
        CALC_ROW("f_m,d",  "= k_mod·f_m,k / γ_M", str(f_md)),
        CALC_ROW("σ_m,d",  "= M_Ed / W_y",         str(sigma_md)),
    ])
    blocks.append(cc.check("Bending: σ_m,d / f_m,d", sigma_md, f_md))

    # ── Lateral buckling (kipning) ────────────────────────────────────────────
    blocks.append(S("Lateral buckling / kipning — EN 1995-1-1 cl. 6.3.3"))

    if compression_edge_restrained and torsional_restraint_at_supports:
        k_crit = 1.0
        blocks.append(N(
            "Compression edge is restrained throughout and torsional rotation is prevented at supports. "
            "k_crit = 1.0 — lateral buckling is neglected."
        ))
    else:
        if l_ef is None:
            l_ef = span + 0.2 * h
            blocks.append(N(
                "No effective buckling length provided. "
                "Using l_ef = L + 0.2h for a simply supported rectangular beam."
            ))
        else:
            blocks.append(N(f"Effective buckling length: l_ef = {l_ef}."))

        sigma_m_crit  = 0.78 * E_0_05 * b**2 / (h * l_ef)
        lambda_rel_m  = float(f_mk / sigma_m_crit) ** 0.5

        blocks.extend([
            CALC_ROW("l_ef",       "effective buckling length",       str(l_ef)),
            CALC_ROW("σ_m,crit",   "= 0.78·E_0,05·b²/(h·l_ef)",     str(sigma_m_crit)),
            CALC_ROW("λ_rel,m",    "= √(f_m,k / σ_m,crit)",          f"{lambda_rel_m:.3f}"),
        ])

        if lambda_rel_m <= 0.75:
            k_crit = 1.0
            blocks.append(CALC_ROW("k_crit", "= 1.0  (λ_rel,m ≤ 0.75)", f"{k_crit:.3f}"))
        elif lambda_rel_m <= 1.4:
            k_crit = 1.56 - 0.75 * lambda_rel_m
            blocks.append(CALC_ROW("k_crit", "= 1.56 − 0.75·λ_rel,m", f"{k_crit:.3f}"))
        else:
            k_crit = 1.0 / lambda_rel_m**2
            blocks.append(CALC_ROW("k_crit", "= 1 / λ_rel,m²", f"{k_crit:.3f}"))

    blocks.append(cc.check("Kipning: σ_m,d / (k_crit·f_m,d)", sigma_md, k_crit * f_md))

    # ── Shear resistance ──────────────────────────────────────────────────────
    blocks.append(S("Shear resistance — EN 1995-1-1 cl. 6.1.7"))

    A     = b * h
    f_vd  = kmod * f_vk / gamma_M
    tau_d = (1.5 * V_Ed) / A

    blocks.extend([
        CALC_ROW("A",     "= b·h",               str(A)),
        CALC_ROW("f_v,d", "= k_mod·f_v,k / γ_M", str(f_vd)),
        CALC_ROW("τ_d",   "= 1.5·V_Ed / A",       str(tau_d)),
    ])
    blocks.append(cc.check("Shear: τ_d / f_v,d", tau_d, f_vd))

    # ── Bearing at support ────────────────────────────────────────────────────
    if support_length is not None:
        blocks.append(S("Bearing at support / vederlag — EN 1995-1-1 cl. 6.1.5"))

        if bearing_force is None:
            bearing_force = V_Ed
            blocks.append(N("No bearing force provided — using support reaction from V_Ed."))
        else:
            blocks.append(N(f"Bearing force provided: F_c,90,Ed = {bearing_force}."))

        if k_c_90 is None:
            if load_near_support:
                k_c_90 = 1.0
                blocks.append(N("Load close to support → k_c,90 = 1.0."))
            else:
                k_c_90 = 1.75 if support_material == "glulam" else 1.5
                blocks.append(N(
                    f"Load away from support; k_c,90 = {k_c_90} for {support_material}."
                ))
        else:
            blocks.append(N(f"Bearing factor provided: k_c,90 = {k_c_90}."))

        if end_distance is None:
            add_length = 30 * mm
            blocks.append(N("No end distance provided — A_ef = b·(l + 30 mm)."))
        elif end_distance >= 30 * mm:
            add_length = 60 * mm
            blocks.append(N("End distance ≥ 30 mm → A_ef = b·(l + 60 mm)."))
        else:
            add_length = 30 * mm
            blocks.append(N("End distance < 30 mm → A_ef = b·(l + 30 mm)."))

        f_c_90_d   = kmod * f_c_90_k / gamma_M
        A_ef       = b * (support_length + add_length)
        sigma_c_90_d = bearing_force / A_ef
        F_c_90_Rd  = k_c_90 * f_c_90_d * A_ef

        blocks.extend([
            CALC_ROW("l_sup",       "support length",                   str(support_length)),
            CALC_ROW("f_c,90,d",    "= k_mod·f_c,90,k / γ_M",          str(f_c_90_d)),
            CALC_ROW("A_ef",        "= b·(l_sup + add)",                str(A_ef)),
            CALC_ROW("σ_c,90,d",    "= F / A_ef",                       str(sigma_c_90_d)),
            CALC_ROW("F_c,90,Rd",   "= k_c,90·f_c,90,d·A_ef",          str(F_c_90_Rd)),
        ])
        blocks.append(cc.check("Bearing: σ_c,90,d / (k_c,90·f_c,90,d)", sigma_c_90_d, k_c_90 * f_c_90_d))
        blocks.append(cc.check("Bearing: F_c,90,Ed / F_c,90,Rd", bearing_force, F_c_90_Rd))

    # ── Fire design ───────────────────────────────────────────────────────────
    if fire_design:
        blocks.append(S("Brand — EN 1995-1-2"))

        t_fire         = fire_design["t_fire"]
        beta_n         = fire_design.get("beta_n", 0.7 * mm)
        d0             = fire_design.get("d0", 7 * mm)
        k0             = fire_design.get("k0", 1.0)
        gamma_M_fi     = fire_design.get("gamma_M_fi", 1.0)
        kmod_fi        = fire_design.get("kmod_fi", 1.0)
        exposed_sides  = int(fire_design.get("exposed_sides", 2))
        exposed_bottom = bool(fire_design.get("exposed_bottom", True))
        exposed_top    = bool(fire_design.get("exposed_top", False))

        M_Ed_fi = fire_design.get("M_Ed")
        V_Ed_fi = fire_design.get("V_Ed")
        eta_fi  = fire_design.get("eta_fi")

        if eta_fi is not None:
            if M_Ed_fi is None:
                M_Ed_fi = eta_fi * M_Ed
            if V_Ed_fi is None:
                V_Ed_fi = eta_fi * V_Ed

        if M_Ed_fi is None or V_Ed_fi is None:
            raise ValueError("fire_design requires M_Ed and V_Ed, or eta_fi to derive them.")

        blocks.append(T(
            f"Reduced cross-section method. Fire duration = {t_fire}. "
            f"Exposed sides = {exposed_sides}, bottom = {exposed_bottom}, top = {exposed_top}."
        ))
        blocks.extend([
            CALC_ROW("t_fi",      "fire duration",          str(t_fire)),
            CALC_ROW("β_n",       "notional charring rate", str(beta_n)),
            CALC_ROW("d_0",       "zero-strength layer",    str(d0)),
            CALC_ROW("M_Ed,fi",   "fire design moment",     str(M_Ed_fi)),
            CALC_ROW("V_Ed,fi",   "fire design shear",      str(V_Ed_fi)),
            CALC_ROW("k_mod,fi",  "k_mod in fire",          f"{kmod_fi:.2f}"),
            CALC_ROW("γ_M,fi",    "partial factor in fire", f"{gamma_M_fi:.2f}"),
        ])

        d_char_n = beta_n * t_fire + k0 * d0
        b_fi     = b - exposed_sides * d_char_n
        h_fi     = h - int(exposed_bottom) * d_char_n - int(exposed_top) * d_char_n
        A_fi     = b_fi * h_fi
        W_y_fi   = (b_fi * h_fi**2) / 6
        f_md_fi  = kmod_fi * f_mk / gamma_M_fi
        f_vd_fi  = kmod_fi * f_vk / gamma_M_fi
        sigma_m_d_fi = M_Ed_fi / W_y_fi
        tau_d_fi     = (1.5 * V_Ed_fi) / A_fi

        blocks.extend([
            CALC_ROW("d_char,n",   "= β_n·t_fi + k_0·d_0",         str(d_char_n)),
            CALC_ROW("b_fi",       "= b − sides·d_char,n",           str(b_fi)),
            CALC_ROW("h_fi",       "= h − (bot+top)·d_char,n",       str(h_fi)),
            CALC_ROW("A_fi",       "= b_fi·h_fi",                    str(A_fi)),
            CALC_ROW("W_y,fi",     "= b_fi·h_fi²/6",                 str(W_y_fi)),
            CALC_ROW("f_m,d,fi",   "= k_mod,fi·f_m,k / γ_M,fi",     str(f_md_fi)),
            CALC_ROW("f_v,d,fi",   "= k_mod,fi·f_v,k / γ_M,fi",     str(f_vd_fi)),
            CALC_ROW("σ_m,d,fi",   "= M_Ed,fi / W_y,fi",             str(sigma_m_d_fi)),
            CALC_ROW("τ_d,fi",     "= 1.5·V_Ed,fi / A_fi",           str(tau_d_fi)),
        ])

        blocks.append(N(
            "Reduced cross-section method (EN 1995-1-2 cl. 4.2.2). "
            "Fire actions from the fire load combination. "
            "If eta_fi is supplied, ambient actions are scaled to derive M_Ed,fi and V_Ed,fi."
        ))
        blocks.append(cc.check("Brand bøjning: σ_m,d,fi / f_m,d,fi", sigma_m_d_fi, f_md_fi))
        blocks.append(cc.check("Brand forskydning: τ_d,fi / f_v,d,fi", tau_d_fi, f_vd_fi))

    return blocks
