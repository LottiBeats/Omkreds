"""
foundation_ec7.py — EN 1997-1 Annex D  spread footing bearing capacity

Computes the vertical bearing resistance R_d for a rectangular spread
footing resting on a Mohr-Coulomb soil (drained c', φ' parameters).

References:
  DS/EN 1997-1:2004 Annex D (informative — adopted by DK NA)
  Bearing factors, shape factors, inclination factors per Annex D.

All inputs plain SI multiples (m, kN, kN/m², kN/m³, degrees).
"""
import math
from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext


def foundation_bearing(
    label:          str   = "F1",
    # Footing geometry
    B_m:            float = 1.5,      # footing width  [m]
    L_m:            float = 2.0,      # footing length [m]  (L ≥ B)
    D_m:            float = 0.8,      # embedment depth [m]
    # Soil parameters (drained, Mohr-Coulomb)
    c_kPa:          float = 5.0,      # effective cohesion  c' [kPa]
    phi_deg:        float = 30.0,     # friction angle  φ'  [°]
    gamma_kNm3:     float = 18.0,     # soil unit weight γ  [kN/m³]
    gamma_b_kNm3:   float = 10.0,     # buoyant unit weight (if water table at base)
    water_table:    bool  = False,     # True = water table at footing base
    # Design loads (at foundation level, ULS)
    V_Ed_kN:        float = 300.0,    # design vertical load  [kN]
    H_Ed_kN:        float = 0.0,      # design horizontal load [kN]  (in B direction)
    M_Ed_kNm:       float = 0.0,      # design moment [kNm]  (about L axis → eccentricity in B)
    # Partial factors (EC7 DA3 / DK NA defaults)
    gamma_phi:      float = 1.0,      # partial factor on tan φ'
    gamma_c:        float = 1.0,      # partial factor on c'
    gamma_Rv:       float = 1.4,      # resistance factor (bearing) — GEO
):
    """
    Returns a list of calc_core blocks.
    """
    chk    = CheckContext()
    blocks = []

    phi = math.radians(phi_deg)

    # ── Factored soil strengths ───────────────────────────────────────────────
    tan_phi_d = math.tan(phi) / gamma_phi
    phi_d     = math.atan(tan_phi_d)
    c_d       = c_kPa / gamma_c         # kPa

    # ── Effective footing dimensions (eccentricity) ───────────────────────────
    # Eccentricity in the B-direction from moment M_Ed
    e_B = abs(M_Ed_kNm) / V_Ed_kN if V_Ed_kN > 0 else 0.0
    e_B = min(e_B, B_m / 3.0)          # limit eccentricity to B/6 for stability

    B_eff = B_m - 2.0 * e_B            # effective width  [m]
    L_eff = L_m                         # effective length [m]  (no moment in L-direction)
    A_eff = B_eff * L_eff               # effective area   [m²]

    # ── Overburden pressure at footing base ───────────────────────────────────
    gamma_used = gamma_b_kNm3 if water_table else gamma_kNm3
    q = gamma_used * D_m                # [kPa]

    # ── Bearing capacity factors  (EC7 Annex D.2) ────────────────────────────
    Nq  = math.exp(math.pi * math.tan(phi_d)) * (math.tan(math.radians(45.0) + phi_d / 2.0)) ** 2
    Nc  = (Nq - 1.0) / math.tan(phi_d) if phi_d > 1e-6 else (math.pi + 2.0)
    Ngamma = 2.0 * (Nq - 1.0) * math.tan(phi_d)

    # ── Shape factors  (EC7 Annex D.3) ───────────────────────────────────────
    sq = 1.0 + (B_eff / L_eff) * math.sin(phi_d)
    sc = 1.0 + (B_eff / L_eff) * (Nq / Nc) if phi_d > 1e-6 else 1.0 + (B_eff / L_eff) * 0.2
    sg = 1.0 - 0.3 * (B_eff / L_eff)

    # ── Inclination factors  (EC7 Annex D.4) — simplified, no moment ─────────
    # Only include H_Ed inclination
    if H_Ed_kN > 0.0 and V_Ed_kN > 0.0:
        m = (2.0 + B_eff / L_eff) / (1.0 + B_eff / L_eff)  # EC7 D.8
        iq  = (1.0 - H_Ed_kN / (V_Ed_kN + A_eff * c_d / math.tan(phi_d) + 1e-9)) ** m
        ig  = (1.0 - H_Ed_kN / (V_Ed_kN + A_eff * c_d / math.tan(phi_d) + 1e-9)) ** (m + 1.0)
        ic  = iq - (1.0 - iq) / (Nc * math.tan(phi_d) + 1e-9)
        iq  = max(iq, 0.0)
        ig  = max(ig, 0.0)
        ic  = max(ic, 0.0)
    else:
        iq = ig = ic = 1.0

    # ── Ultimate bearing resistance per unit area  (EC7 Annex D.1, Eq. D.2) ──
    # R/A' = c'·Nc·sc·ic + q·Nq·sq·iq + 0.5·γ'·B'·Nγ·sγ·iγ
    r_c  = c_d     * Nc  * sc * ic
    r_q  = q       * Nq  * sq * iq
    r_g  = 0.5 * gamma_used * B_eff * Ngamma * sg * ig
    r_per_m2 = r_c + r_q + r_g     # kPa

    R_ult = r_per_m2 * A_eff        # kN  — characteristic bearing resistance

    # ── Design bearing resistance ─────────────────────────────────────────────
    R_d = R_ult / gamma_Rv          # kN

    # ── Contact pressure ──────────────────────────────────────────────────────
    q_Ed = V_Ed_kN / A_eff          # kPa (design contact pressure)

    # ── output blocks ─────────────────────────────────────────────────────────
    blocks.append(MH(
        f"{label} — Spread Footing  EN 1997-1 Annex D",
        f"B = {B_m:.2f} m  ·  L = {L_m:.2f} m  ·  D = {D_m:.2f} m  |  "
        f"φ' = {phi_deg:.1f}°  ·  c' = {c_kPa:.1f} kPa",
        "general",
    ))

    blocks.append(S("Design parameters"))
    blocks.append(T(
        f"Spread footing bearing capacity to EN 1997-1 Annex D.  "
        f"Rectangular footing {B_m:.2f}×{L_m:.2f} m, embedment D = {D_m:.2f} m.  "
        f"Soil: φ' = {phi_deg:.1f}°, c' = {c_kPa:.1f} kPa, γ = {gamma_kNm3:.1f} kN/m³.  "
        f"Design vertical load V_Ed = {V_Ed_kN:.1f} kN.  "
        f"Resistance factor γ_R,v = {gamma_Rv:.2f}."
    ))
    blocks.extend([
        CALC_ROW("B",     "footing width",               f"{B_m:.2f} m"),
        CALC_ROW("L",     "footing length",              f"{L_m:.2f} m"),
        CALC_ROW("D",     "embedment depth",             f"{D_m:.2f} m"),
        CALC_ROW("V_Ed",  "design vertical load",        f"{V_Ed_kN:.1f} kN"),
        CALC_ROW("H_Ed",  "design horizontal load",      f"{H_Ed_kN:.1f} kN"),
        CALC_ROW("M_Ed",  "design moment",               f"{M_Ed_kNm:.1f} kNm"),
        CALC_ROW("c'",    "effective cohesion",          f"{c_kPa:.1f} kPa"),
        CALC_ROW("φ'",    "friction angle",              f"{phi_deg:.1f}°"),
        CALC_ROW("γ",     "soil unit weight",            f"{gamma_kNm3:.1f} kN/m³"),
        CALC_ROW("γ_R,v", "resistance factor (GEO)",     f"{gamma_Rv:.2f}"),
    ])

    blocks.append(S("Footing geometry — effective dimensions"))
    blocks += [
        CALC_ROW("e_B",   "= M_Ed / V_Ed  (eccentricity)", f"{e_B:.3f} m"),
        CALC_ROW("B'",    "= B − 2·e_B  (effective width)", f"{B_eff:.3f} m"),
        CALC_ROW("L'",    "= L          (effective length)", f"{L_eff:.3f} m"),
        CALC_ROW("A'",    "= B' · L'   (effective area)",   f"{A_eff:.3f} m²"),
    ]

    blocks.append(S("Soil properties"))
    blocks += [
        CALC_ROW("γ",     f"Unit weight {'(buoyant)' if water_table else ''}",
                 f"{gamma_used:.1f} kN/m³"),
        CALC_ROW("c'",    "Effective cohesion",         f"{c_kPa:.1f} kPa"),
        CALC_ROW("φ'",    "Effective friction angle",   f"{phi_deg:.1f}°"),
        CALC_ROW("c_d",   "= c' / γ_c",                f"{c_d:.2f} kPa"),
        CALC_ROW("φ_d",   "= arctan(tan φ' / γ_φ)",    f"{math.degrees(phi_d):.2f}°"),
        CALC_ROW("q",     "= γ · D  (overburden)",      f"{q:.2f} kPa"),
    ]

    blocks.append(S("Bearing capacity factors  (EC7 Annex D.2)"))
    blocks += [
        CALC_ROW("Nq",    "= e^(π·tan φ_d)·tan²(45+φ_d/2)", f"{Nq:.3f}"),
        CALC_ROW("Nc",    "= (Nq − 1)·cot φ_d",             f"{Nc:.3f}"),
        CALC_ROW("Nγ",    "= 2·(Nq − 1)·tan φ_d",           f"{Ngamma:.3f}"),
    ]

    blocks.append(S("Shape factors  (EC7 Annex D.3)"))
    blocks += [
        CALC_ROW("sq",    "",  f"{sq:.4f}"),
        CALC_ROW("sc",    "",  f"{sc:.4f}"),
        CALC_ROW("sγ",    "",  f"{sg:.4f}"),
    ]

    if H_Ed_kN > 0:
        blocks.append(S("Inclination factors  (EC7 Annex D.4)"))
        blocks += [
            CALC_ROW("H_Ed", "",  f"{H_Ed_kN:.1f} kN"),
            CALC_ROW("iq",   "",  f"{iq:.4f}"),
            CALC_ROW("ic",   "",  f"{ic:.4f}"),
            CALC_ROW("iγ",   "",  f"{ig:.4f}"),
        ]

    blocks.append(S("Bearing resistance  (EC7 Annex D.1)"))
    blocks += [
        CALC_ROW("c'·Nc·sc·ic",          "cohesion term",    f"{r_c:.2f} kPa"),
        CALC_ROW("q·Nq·sq·iq",           "surcharge term",   f"{r_q:.2f} kPa"),
        CALC_ROW("0.5·γ'·B'·Nγ·sγ·iγ", "width term",       f"{r_g:.2f} kPa"),
        CALC_ROW("R/A'",  "= sum of terms",                  f"{r_per_m2:.2f} kPa"),
        CALC_ROW("R_ult", "= (R/A') · A'",                   f"{R_ult:.1f} kN"),
        CALC_ROW("R_d",   "= R_ult / γ_R,v",                 f"{R_d:.1f} kN"),
    ]

    blocks.append(S("Verification  — EC7 §6.5.2"))
    eta_bear = V_Ed_kN / R_d
    blocks += [
        CALC_ROW("q_Ed",    "= V_Ed / A'  (contact pressure)", f"{q_Ed:.2f} kPa"),
        CALC_ROW("η_bear",  "= V_Ed / R_d",                    f"{eta_bear:.3f}"),
        chk.check("Bearing resistance  EC7 §6.5.2", eta_bear, 1.0),
    ]

    return blocks
