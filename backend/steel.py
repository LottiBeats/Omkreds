"""
steel.py - Steel beam module (EN 1993-1-1)
Unit-aware with forallpeople. No manual conversions.

Closed-form and FEM/imported-action workflow:
- default: calculate M_Ed and V_Ed from wL^2/8 and wL/2
- optional: pass beam_results with imported M_Ed / V_Ed / delta values
"""

from math import pi

import forallpeople as si
si.environment('structural', top_level=True)

from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext, FIG


def steel_beam_ipe(
    label,
    section,
    span,
    g_k,
    q_k,
    W_ply,
    h,
    t_w,
    f_y=None,
    gamma_M0=1.0,
    beam_results=None,
    figure_path=None,
    figure_caption="",
    b=None,
    t_f=None,
    Iy=None,
    l_cr_ltb=None,
    C1=1.0,
    gamma_M1=1.0,
    ltb_restrained=False,
    buck_y_restrained=False,
    buck_x_restrained=False,
    deflection_limit=200,
):
    if f_y is None:
        f_y = 355 * MPa

    cc = CheckContext()
    blocks = []

    blocks.append(MH(f"Steel beam - {section}",
                     f"{label}  |  EN 1993-1-1", material="steel"))

    blocks.append(S("Design parameters"))
    blocks.append(T(
        f"Simply supported {section}, span {span}. "
        f"Steel grade S{float(f_y / MPa):.0f}. Loads per EN 1990/EN 1991-1-1."
    ))
    blocks.extend([
        CALC_ROW("Section",  "",                   section),
        CALC_ROW("L",        "span",               str(span)),
        CALC_ROW("g_k",      "permanent load",     str(g_k)),
        CALC_ROW("q_k",      "variable load",      str(q_k)),
        CALC_ROW("W_pl,y",   "plastic modulus",    str(W_ply)),
        CALC_ROW("h",        "section height",     str(h)),
    ])
    if b is not None:
        blocks.append(CALC_ROW("b",    "flange width",     str(b)))
    if t_f is not None:
        blocks.append(CALC_ROW("t_f",  "flange thickness", str(t_f)))
    blocks.extend([
        CALC_ROW("t_w",      "web thickness",      str(t_w)),
        CALC_ROW("f_y",      "yield strength",     str(f_y)),
        CALC_ROW("γ_M0",     "",                   str(gamma_M0)),
        CALC_ROW("γ_M1",     "",                   str(gamma_M1)),
    ])
    if l_cr_ltb is not None and not ltb_restrained:
        blocks.append(CALC_ROW("L_cr",  "eff. LTB length",   str(l_cr_ltb)))
        blocks.append(CALC_ROW("C₁",    "moment factor",     str(C1)))

    # ── Cross-section classification — EN 1993-1-1 Table 5.2 ─────────────────
    section_class = 1
    W_eff = W_ply

    if b is not None and t_f is not None:
        blocks.append(S("Cross-section classification — EN 1993-1-1 Table 5.2"))

        f_y_mpa   = float(f_y / MPa)
        eps       = (235.0 / f_y_mpa) ** 0.5

        c_w_val   = float((h - 2 * t_f) / t_w)
        c_f_val   = float((b - t_w) / (2 * t_f))

        def _classify_web(c_t, e):
            if c_t <= 72  * e: return 1
            if c_t <= 83  * e: return 2
            if c_t <= 124 * e: return 3
            return 4

        def _classify_flange(c_t, e):
            if c_t <=  9 * e: return 1
            if c_t <= 10 * e: return 2
            if c_t <= 14 * e: return 3
            return 4

        web_class    = _classify_web(c_w_val, eps)
        flange_class = _classify_flange(c_f_val, eps)
        section_class = max(web_class, flange_class)

        _class_txt = {
            1: "Class 1 — plastic (full plastic rotation capacity)",
            2: "Class 2 — compact  (plastic moment, limited rotation)",
            3: "Class 3 — semi-compact  (elastic moment, no local buckling)",
            4: "Class 4 — slender  (local buckling before yield — NOT COVERED)",
        }

        blocks += [
            CALC_ROW("ε",         "= √(235 / f_y)",              f"{eps:.3f}"),
            CALC_ROW("c_w / t_w", "web clear height / t_w",       f"{c_w_val:.1f}"),
            CALC_ROW("",          "limits: 72ε / 83ε / 124ε",
                     f"{72*eps:.1f} / {83*eps:.1f} / {124*eps:.1f}"),
            CALC_ROW("c_f / t_f", "flange outstand / t_f",        f"{c_f_val:.1f}"),
            CALC_ROW("",          "limits: 9ε / 10ε / 14ε",
                     f"{9*eps:.1f} / {10*eps:.1f} / {14*eps:.1f}"),
            CALC_ROW("Class",
                     f"web Cl.{web_class}  ·  flange Cl.{flange_class}",
                     _class_txt[section_class]),
        ]

        if section_class <= 2:
            blocks.append(N(
                f"Section is Class {section_class} — full plastic bending resistance applies "
                f"(M_Rd = W_pl,y × f_y / γ_M0). "
                "Note: root fillet radius r is not stored in the catalog; "
                "c values are slightly conservative (actual class may be lower)."
            ))
            W_eff = W_ply

        elif section_class == 3:
            if Iy is not None:
                W_el  = Iy / (h / 2)
                W_eff = W_el
                blocks.append(N(
                    "Section is Class 3 — elastic bending resistance governs: "
                    "M_Rd = W_el,y × f_y / γ_M0. "
                    f"W_el,y = I_y / (h/2) = {str(W_el)}. "
                    "Root fillet radius not in catalog — actual class may be Class 2 with fillets included."
                ))
            else:
                W_eff = W_ply * 0.9
                blocks.append(N(
                    "Section is Class 3 — elastic resistance governs. "
                    "I_y not available; W_el estimated as 0.9 × W_pl,y (typical for I-sections). "
                    "Provide I_y for an exact result."
                ))

        else:
            blocks.append(N(
                "SECTION IS CLASS 4 (SLENDER) — local buckling occurs before yield. "
                "Effective section properties per EN 1993-1-5 §4 are required. "
                "This module does not cover Class 4; use the Plate Girder module for "
                "welded sections, or choose a stockier section."
            ))
            W_eff = W_ply
    else:
        blocks.append(N(
            "Cross-section classification not performed: flange dimensions not available. "
            "Class 1 assumed."
        ))

    if beam_results is None:
        blocks.append(S("ULS loading and design actions"))
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
        V_Ed = beam_results["V_Ed"]
        blocks.extend([
            CALC_ROW("M_Ed", "imported design moment", str(M_Ed)),
            CALC_ROW("V_Ed", "imported design shear",  str(V_Ed)),
        ])

        delta_max = beam_results.get("delta_max")
        if delta_max is not None:
            blocks.append(CALC_ROW("δ_max", "imported max deflection", str(delta_max)))

    if figure_path:
        blocks.append(S("Beam analysis diagram"))
        blocks.append(FIG(figure_path,
                          figure_caption or "Moment, shear and deflection overlays from beam analysis."))

    # ── Bending resistance ────────────────────────────────────────────────────
    _W_label = "Elastic" if section_class == 3 else "Plastic"
    blocks.append(S(f"Bending resistance ({_W_label}) — EN 1993-1-1 cl. 6.2.5"))

    _modulus_note = "W_el,y" if section_class == 3 else "W_pl,y"
    M_Rk = W_eff * f_y
    M_Rd = M_Rk / gamma_M0
    blocks.extend([
        CALC_ROW("M_Rk", f"= {_modulus_note}·f_y", str(M_Rk)),
        CALC_ROW("M_Rd", "= M_Rk / γ_M0",          str(M_Rd)),
    ])
    blocks.append(cc.check("Bending check: M_Ed / M_Rd", M_Ed, M_Rd))

    # ── Shear resistance ──────────────────────────────────────────────────────
    blocks.append(S("Shear resistance — EN 1993-1-1 cl. 6.2.6"))

    # EN 1993-1-1 §6.2.6(3): A_v = A − 2b·t_f + (t_w + 2r)·t_f ≥ η·h_w·t_w
    # Fillet radius r not stored in catalog → conservative: A_v ≈ (h − t_f)·t_w
    # (equivalent to A − 2b·t_f + t_w·t_f with A = 2b·t_f + h_w·t_w)
    if b is not None and t_f is not None:
        A_v  = (h - t_f) * t_w
        h_w  = h - 2 * t_f
        A_v_min = h_w * t_w              # η·h_w·t_w, η = 1.0
        if float(A_v) < float(A_v_min):
            A_v = A_v_min
        av_note = "= (h − t_f)·t_w  [EN 1993-1-1 §6.2.6(3), fillet neglected]"
    else:
        A_v  = h * t_w
        av_note = "= h·t_w  [simplified — section dims not available]"

    V_Rk = A_v * f_y / 3**0.5
    V_Rd = V_Rk / gamma_M0
    blocks.extend([
        CALC_ROW("A_v",  av_note,          str(A_v)),
        CALC_ROW("V_Rk", "= A_v·f_y/√3",  str(V_Rk)),
        CALC_ROW("V_Rd", "= V_Rk / γ_M0", str(V_Rd)),
    ])
    blocks.append(cc.check("Shear check: V_Ed / V_Rd", V_Ed, V_Rd))
    blocks.append(N(
        "Shear area A_v per EN 1993-1-1 §6.2.6(3). Fillet radius r not stored in the "
        "section catalog — r is conservatively set to zero, giving A_v = (h − t_f)·t_w. "
        "With actual fillets, A_v (and hence V_Rd) is slightly larger."
    ))

    # ── Shear buckling susceptibility — EN 1993-1-1 cl. 6.2.6(6) ─────────────
    blocks.append(S("Shear buckling susceptibility — EN 1993-1-1 cl. 6.2.6(6)"))

    if b is not None and t_f is not None:
        f_y_mpa_sb = float(f_y / MPa)
        eps_sb     = (235.0 / f_y_mpa_sb) ** 0.5
        eta_sb     = 1.0                        # η per EN 1993-1-5 §5, conservatively 1.0
        h_w_sb     = h - 2 * t_f
        slend_sb   = float(h_w_sb / t_w)        # h_w / t_w (dimensionless)
        limit_sb   = 72 * eps_sb / eta_sb
        blocks.extend([
            CALC_ROW("h_w",       "= h − 2·t_f",                        str(h_w_sb)),
            CALC_ROW("h_w / t_w", "web slenderness",                    f"{slend_sb:.1f}"),
            CALC_ROW("72ε / η",   f"= 72 × {eps_sb:.3f} / {eta_sb:.1f}", f"{limit_sb:.1f}"),
        ])
        if slend_sb < limit_sb:
            blocks.append(N(
                f"h_w/t_w = {slend_sb:.1f} < 72ε/η = {limit_sb:.1f}: "
                "Shear buckling need not be considered (cl. 6.2.6(6)). "
                "Full plastic shear resistance V_pl,Rd governs."
            ))
        else:
            blocks.append(N(
                f"⚠  h_w/t_w = {slend_sb:.1f} ≥ 72ε/η = {limit_sb:.1f}: "
                "Shear buckling may reduce V_Rd (EN 1993-1-5 §5). "
                "This module reports V_pl,Rd only — a plate-girder check is required. "
                "Intermediate stiffeners can raise the limit."
            ))
    else:
        blocks.append(N("Shear buckling check skipped — flange dimensions not available."))

    # ── Combined bending and shear — EN 1993-1-1 cl. 6.2.8 ───────────────────
    blocks.append(S("Combined bending and shear — EN 1993-1-1 cl. 6.2.8"))

    half_V_Rd = 0.5 * V_Rd
    blocks.extend([
        CALC_ROW("V_Ed",     "design shear force",  str(V_Ed)),
        CALC_ROW("0.5·V_Rd", "= 0.5 × V_pl,Rd",    str(half_V_Rd)),
    ])
    if float(V_Ed) <= float(half_V_Rd):
        blocks.append(N(
            "V_Ed ≤ 0.5·V_pl,Rd — no reduction to bending resistance is required "
            "(cl. 6.2.8(2)). Cross-section bending resistance M_Rd governs."
        ))
    else:
        if b is not None and t_f is not None:
            rho_mv  = (2.0 * float(V_Ed / V_Rd) - 1.0) ** 2
            h_w_mv  = h - 2 * t_f
            A_w_mv  = h_w_mv * t_w
            W_red   = W_eff - rho_mv * A_w_mv**2 / (4 * t_w)
            M_yV_Rd = W_red * f_y / gamma_M0
            blocks.extend([
                CALC_ROW("ρ",        "= (2·V_Ed/V_pl,Rd − 1)²",  f"{rho_mv:.3f}"),
                CALC_ROW("A_w",      "= h_w · t_w",               str(A_w_mv)),
                CALC_ROW("W_red",    "= W_eff − ρ·A_w²/(4t_w)",  str(W_red)),
                CALC_ROW("M_y,V,Rd", "= W_red · f_y / γ_M0",      str(M_yV_Rd)),
            ])
            blocks.append(cc.check("M+V check: M_Ed / M_y,V,Rd", M_Ed, M_yV_Rd))
        else:
            blocks.append(N(
                "⚠  V_Ed > 0.5·V_pl,Rd — bending resistance must be reduced per cl. 6.2.8. "
                "Flange dimensions are required to compute ρ and M_y,V,Rd."
            ))

    # ── Lateral-torsional buckling — EN 1993-1-1 cl. 6.3.2 ───────────────────
    blocks.append(S("Lateral-torsional buckling — EN 1993-1-1 cl. 6.3.2"))

    if ltb_restrained:
        blocks.append(N(
            "The compression flange (bottom) is assumed continuously restrained against "
            "lateral displacement — e.g. by a floor slab, decking, or closely-spaced "
            "purlins. Lateral-torsional buckling is not governing. "
            "χ_LT = 1.0 — no reduction to bending resistance is required."
        ))

    elif b is not None and t_f is not None and l_cr_ltb is not None:
        E_s = 210_000 * MPa
        G_s =  80_770 * MPa

        blocks.append(T(
            "General case per EN 1993-1-1 cl. 6.3.2.2. "
            f"Effective LTB length L_cr = {l_cr_ltb}. "
            f"Equivalent uniform moment factor C₁ = {C1} "
            "(1.0 = uniform moment, conservative; "
            "≈ 1.13 UDL / parabolic; ≈ 1.35 central point load; ≈ 1.75 triangular). "
            "Section constants I_z, I_w, I_t derived from nominal I-section geometry "
            "(fillets neglected — conservative)."
        ))

        I_z = t_f * b**3 / 6 + (h - 2*t_f) * t_w**3 / 12
        I_w = b**3 * t_f * (h - t_f)**2 / 24
        I_t = (2*b*t_f**3 + (h - 2*t_f)*t_w**3) / 3
        blocks.extend([
            CALC_ROW("I_z", "= t_f·b³/6 + (h−2t_f)·t_w³/12",  str(I_z)),
            CALC_ROW("I_w", "= b³·t_f·(h−t_f)²/24",            str(I_w)),
            CALC_ROW("I_t", "= (2b·t_f³ + (h−2t_f)·t_w³)/3",  str(I_t)),
        ])

        N_Ez = pi**2 * E_s * I_z / l_cr_ltb**2
        W_LT = (I_w/I_z + l_cr_ltb**2 * G_s * I_t / (pi**2 * E_s * I_z))**0.5
        M_cr = C1 * N_Ez * W_LT
        blocks.extend([
            CALC_ROW("N_Ez",  "= π²·E·I_z / L_cr²",                  str(N_Ez)),
            CALC_ROW("W_LT",  "= √(I_w/I_z + L_cr²·G·I_t/(π²·E·I_z))", str(W_LT)),
            CALC_ROW("M_cr",  "= C₁·N_Ez·W_LT",                       str(M_cr)),
        ])

        lambda_bar_LT = float((W_ply * f_y / M_cr)**0.5)
        blocks.append(CALC_ROW("λ̄_LT", "= √(W_pl,y·f_y / M_cr)", f"{lambda_bar_LT:.3f}"))

        h_over_b = float(h) / float(b)
        if h_over_b <= 2.0:
            alpha_LT  = 0.34
            curve_ltb = "b"
        else:
            alpha_LT  = 0.49
            curve_ltb = "c"

        lbar = lambda_bar_LT

        if lbar <= 0.2:
            chi_LT = 1.0
            blocks.append(N(
                f"Non-dimensional slenderness λ̄_LT = {lbar:.3f} ≤ 0.2: "
                "LTB is not critical. χ_LT = 1.0."
            ))
        else:
            phi_LT     = 0.5 * (1.0 + alpha_LT * (lbar - 0.2) + lbar**2)
            chi_LT_raw = 1.0 / (phi_LT + (phi_LT**2 - lbar**2)**0.5)
            chi_LT     = min(chi_LT_raw, 1.0)
            blocks.extend([
                CALC_ROW("φ_LT",  "= 0.5·(1 + α_LT·(λ̄−0.2) + λ̄²)",        f"{phi_LT:.3f}"),
                CALC_ROW("χ_LT",  f"= 1/(φ+√(φ²−λ̄²))  [curve {curve_ltb}]", f"{chi_LT:.3f}"),
            ])

        M_b_Rd = chi_LT * W_ply * f_y / gamma_M1
        blocks.append(CALC_ROW("M_b,Rd", "= χ_LT·W_pl,y·f_y / γ_M1", str(M_b_Rd)))
        blocks.append(cc.check("LTB check: M_Ed / M_b,Rd", M_Ed, M_b_Rd))

    else:
        blocks.append(N(
            "LTB has NOT been verified. Enter the effective LTB length (span between "
            "lateral restraints to the compression flange) in the block settings to "
            "enable the full cl. 6.3.2.2 check. Alternatively tick 'Restrained — LTB' "
            "if continuous restraint is provided."
        ))

    # ── Serviceability — Deflection — EN 1990 Annex A1.4 ─────────────────────
    blocks.append(S("Serviceability — Deflection — EN 1990 Annex A1.4"))

    if Iy is not None:
        E_sls = 210_000 * MPa
        if beam_results is None:
            w_sls     = g_k + q_k
            delta_mid = 5 * w_sls * span**4 / (384 * E_sls * Iy)
            delta_lim = span / deflection_limit
            blocks.extend([
                CALC_ROW("w_sls",  "= g_k + q_k  [characteristic combo]",  str(w_sls)),
                CALC_ROW("I_y",    "second moment of area",                  str(Iy)),
                CALC_ROW("δ",      "= 5·w_sls·L⁴ / (384·E·I_y)  [UDL]",    str(delta_mid)),
                CALC_ROW("δ_lim",  f"= L / {deflection_limit}",              str(delta_lim)),
            ])
            blocks.append(cc.check(
                f"Deflection: δ / δ_lim  (limit L/{deflection_limit})",
                delta_mid, delta_lim
            ))
            blocks.append(N(
                "Characteristic combination (g_k + q_k) used for deflection per "
                "EN 1990 Annex A1.4. "
                f"Limit L/{deflection_limit} — adjust to L/250 or L/500 as required."
            ))
        else:
            delta_max_imp = beam_results.get("delta_max")
            if delta_max_imp is not None:
                delta_lim = span / deflection_limit
                blocks.extend([
                    CALC_ROW("δ",      "imported maximum deflection", str(delta_max_imp)),
                    CALC_ROW("δ_lim",  f"= L / {deflection_limit}",    str(delta_lim)),
                ])
                blocks.append(cc.check(
                    f"Deflection: δ / δ_lim  (limit L/{deflection_limit})",
                    delta_max_imp, delta_lim
                ))
            else:
                blocks.append(N(
                    "Imported beam results do not include delta_max — "
                    "deflection check skipped."
                ))
    else:
        blocks.append(N(
            f"Deflection check skipped — I_y not available in the section catalog. "
            f"Limit: L / {deflection_limit} per EN 1990 Annex A1.4."
        ))

    # ── Out-of-plane stability — y-axis ──────────────────────────────────────
    blocks.append(S("Out-of-plane stability — y-axis"))
    if buck_y_restrained:
        blocks.append(N(
            "The beam is assumed restrained against lateral (out-of-plane) displacement "
            "about the y-axis — e.g. by secondary beams, bracing, or a rigid floor "
            "diaphragm framing into the web. Buckling about the y-axis is not governing."
        ))
    else:
        blocks.append(N(
            "y-axis stability has NOT been verified. If the beam is unbraced laterally, "
            "confirm that adequate restraint against out-of-plane movement is provided, "
            "or carry out a separate buckling check. Tick 'Restrained — y-axis' in the "
            "block settings to document that restraint is present."
        ))

    # ── In-plane stability — x-axis ───────────────────────────────────────────
    blocks.append(S("In-plane stability — x-axis"))
    if buck_x_restrained:
        blocks.append(N(
            "The beam is assumed restrained against displacement in the plane of bending "
            "(x-axis). Supports and loading configuration prevent buckling in the vertical "
            "plane. Buckling about the x-axis is not governing."
        ))
    else:
        blocks.append(N(
            "x-axis stability has NOT been verified. Confirm that the support conditions "
            "prevent in-plane instability (e.g. snap-through or arch action under reversed "
            "curvature). Tick 'Restrained — x-axis' in the block settings to document "
            "that restraint is present."
        ))

    return blocks
