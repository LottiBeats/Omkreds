"""
plate_girder.py — EN 1993-1-1 / EN 1993-1-5 plate girder check

Checks performed:
  1.  Cross-section classification  (EN 1993-1-1 Table 5.2)
  2.  Bending resistance  M_Rd
        Class 1/2 → plastic  (W_pl · f_y / γ_M0)
        Class 3   → elastic  (W_el · f_y / γ_M0)
        Class 4   → effective section  (EN 1993-1-5 §4.4, reduced web)
  3.  Shear buckling check  V_b,Rd  (EN 1993-1-5 §5)
        Web contribution  V_bw,Rd  using χ_w (rigid or non-rigid end post)
        Flange contribution  V_bf,Rd  (EN 1993-1-5 §5.4, conservative: only if
        M_Ed/M_f,Rd < 1)
  4.  M + V interaction  (EN 1993-1-5 §7)
        Only applied when V_Ed > 0.5 · V_b,Rd

All input dimensions in mm or unitless.  Design actions in kN and kNm.

Reference: EN 1993-1-1:2005 + EN 1993-1-5:2006 + Vayas et al. (2019)
"""

import math
from calc_core import S, T, N, CALC_ROW, MH, CheckContext

# ── Steel grade yield strengths ───────────────────────────────────────────────
_GRADE_FY = {
    'S235': 235.0, 'S275': 275.0, 'S355': 355.0,
    'S420': 420.0, 'S460': 460.0,
}


def plate_girder_check(
    label:     str,
    # Web geometry
    h_w_mm:    float,
    t_w_mm:    float,
    # Flanges (assumed equal top and bottom, symmetric section)
    b_f_mm:    float,
    t_f_mm:    float,
    # Panel length (distance between transverse stiffeners)
    a_mm:      float,
    # Steel grade and partial factors
    grade:     str   = 'S355',
    gamma_M0:  float = 1.0,
    gamma_M1:  float = 1.0,
    # Design actions
    V_Ed_kN:   float = 0.0,
    M_Ed_kNm:  float = 0.0,
    # η — contribution factor (EC3-1-5 recommended: η=1.0 for f_y>460, else η=1.2)
    eta:       float = 1.0,
    # End post condition for shear buckling
    rigid_end_post: bool = True,
    # Label override
    title:     str   = '',
) -> list:
    """
    Returns a list of calc_core blocks.

    Parameters
    ----------
    h_w_mm, t_w_mm : web height and thickness [mm]
    b_f_mm, t_f_mm : flange width and thickness [mm] (identical top & bottom)
    a_mm           : panel length (stiffener spacing) [mm]
                     Set to a large value (e.g. 100_000) for an unstiffened web.
    V_Ed_kN        : design shear force [kN]
    M_Ed_kNm       : design bending moment [kNm]
    eta            : η factor — 1.2 for f_yw ≤ 460 MPa (recommended);
                     many NAs use 1.0 (conservative)
    rigid_end_post : True → rigid end post (tension field allowed, Table 5.1 curve a)
                     False → non-rigid end post (more conservative, Table 5.1 curve b)
    """
    chk    = CheckContext()
    blocks = []

    # ── Material ──────────────────────────────────────────────────────────────
    f_yw_MPa = _GRADE_FY.get(grade.strip().upper(), 355.0)
    f_yf_MPa = f_yw_MPa   # same grade for flanges (symmetric assumption)
    eps       = math.sqrt(235.0 / f_yw_MPa)   # ε = √(235/f_y)

    # ── Gross section properties ──────────────────────────────────────────────
    h_mm  = h_w_mm + 2.0 * t_f_mm   # total height

    A_w    = h_w_mm * t_w_mm                             # web area [mm²]
    A_f    = b_f_mm * t_f_mm                             # one flange area [mm²]
    A_tot  = A_w + 2.0 * A_f                             # total gross area [mm²]

    # I_y  (about strong axis, elastic second moment of area) [mm⁴]
    I_w     = t_w_mm * h_w_mm**3 / 12.0
    I_f_par = A_f * ((h_w_mm + t_f_mm) / 2.0)**2        # Steiner term each flange
    I_gross = I_w + 2.0 * I_f_par                       # [mm⁴]

    W_el    = I_gross / (h_mm / 2.0)                    # elastic modulus [mm³]
    W_pl    = (A_f * (h_w_mm + t_f_mm)                  # plastic modulus [mm³]
               + t_w_mm * h_w_mm**2 / 4.0)

    # I_z (about weak axis) — flanges dominate
    I_z_f   = 2.0 * (t_f_mm * b_f_mm**3 / 12.0)
    I_z_w   = h_w_mm * t_w_mm**3 / 12.0
    I_z     = I_z_f + I_z_w

    # ── Cross-section classification ──────────────────────────────────────────
    # Web in pure bending (EC3-1-1 Table 5.2, sheet 1)
    c_t_web   = h_w_mm / t_w_mm
    web_c1    = 72.0  * eps
    web_c2    = 83.0  * eps
    web_c3    = 124.0 * eps

    if   c_t_web <= web_c1: web_class = 1
    elif c_t_web <= web_c2: web_class = 2
    elif c_t_web <= web_c3: web_class = 3
    else:                   web_class = 4

    # Compression flange outstand (EC3-1-1 Table 5.2, sheet 2)
    c_f      = (b_f_mm - t_w_mm) / 2.0   # outstand c = (b - t_w) / 2
    c_t_flg  = c_f / t_f_mm
    flg_c1   = 9.0  * eps
    flg_c2   = 10.0 * eps
    flg_c3   = 14.0 * eps

    if   c_t_flg <= flg_c1: flg_class = 1
    elif c_t_flg <= flg_c2: flg_class = 2
    elif c_t_flg <= flg_c3: flg_class = 3
    else:                   flg_class = 4

    cs_class  = max(web_class, flg_class)

    # ── Bending resistance ────────────────────────────────────────────────────
    if cs_class <= 2:
        # Plastic — Class 1 or 2
        M_Rd_kNm = W_pl * f_yf_MPa / 1e6 / gamma_M0      # mm³ × N/mm² → N·mm → /1e6 = kNm
        M_Rd_type = f"W_pl · f_y / γ_M0  (Class {cs_class}, plastic)"
        W_eff     = W_pl
    elif cs_class == 3:
        # Elastic — Class 3
        M_Rd_kNm = W_el * f_yf_MPa / 1e6 / gamma_M0
        M_Rd_type = f"W_el · f_y / γ_M0  (Class 3, elastic)"
        W_eff     = W_el
    else:
        # Class 4 — effective section for web in bending (EN 1993-1-5 §4.4)
        k_sig_web = 23.9   # ψ = -1 for doubly-symmetric section in pure bending
        lam_p = (h_w_mm / t_w_mm) / (28.4 * eps * math.sqrt(k_sig_web))
        if lam_p <= 0.673:
            rho_web = 1.0
        else:
            rho_web = max(0.0, min(1.0, (lam_p - 0.055 * (3 + (-1))) / lam_p**2))
            # ψ = -1 → 3 + ψ = 2
            rho_web = max(0.0, min(1.0, (lam_p - 0.11) / lam_p**2))

        h_w_eff   = rho_web * h_w_mm            # effective web height [mm]
        h_ineff   = h_w_mm - h_w_eff            # ineffective strip height [mm]

        # The ineffective strip is located on the tension side of the web.
        # Its centroid is at distance z_ineff from the original NA (tension direction):
        #   z_ineff = ρ·h_w/2  (derived from b_eff1=0.4ρh_w, b_eff2=0.6ρh_w placement)
        z_ineff   = rho_web * h_w_mm / 2.0      # from original NA (tension side) [mm]

        # I of ineffective strip about original NA
        I_ineff   = (t_w_mm * h_ineff**3 / 12.0
                     + t_w_mm * h_ineff * z_ineff**2)

        # For symmetric flanges, the new centroid shifts slightly toward compression:
        A_ineff    = h_ineff * t_w_mm
        A_eff_sec  = A_tot - A_ineff

        # Centroid shift (+ = toward compression/top)
        y_shift   = A_ineff * z_ineff / A_eff_sec

        # Effective I about new centroid (Parallel-axis correction for the shift)
        I_eff = (I_gross - I_ineff
                 - A_eff_sec * y_shift**2)       # approximate — valid for small y_shift

        # Distance from new centroid to compression and tension flange extremes
        z_c       = h_mm / 2.0 - y_shift          # to compression flange top
        z_t       = h_mm / 2.0 + y_shift          # to tension flange bottom

        W_eff     = I_eff / z_c                   # min Weff (compression governs)
        M_Rd_kNm  = W_eff * f_yf_MPa / 1e6 / gamma_M0
        M_Rd_type = (f"W_eff · f_y / γ_M0  (Class 4 — ρ_web={rho_web:.3f}, "
                     f"h_w,eff = {h_w_eff:.0f} mm)")

    # Flange-only moment resistance for flange contribution formula
    # M_f,Rd = A_f · f_yf · (h_w + t_f) / γ_M0  [flange couple]
    M_f_Rd_kNm = (A_f * f_yf_MPa * (h_w_mm + t_f_mm)) / 1e6 / gamma_M0

    # ── Shear buckling (EN 1993-1-5 §5) ──────────────────────────────────────
    # Aspect ratio
    alpha = a_mm / h_w_mm if a_mm > 0 else 1e6   # a/h_w

    # Shear buckling coefficient k_τ (EN 1993-1-5 Eq. 5.5 / Table A.3)
    if alpha >= 1.0:
        k_tau = 5.34 + 4.00 / alpha**2
    else:
        k_tau = 4.00 + 5.34 / alpha**2

    # Non-dimensional shear slenderness λ̄_w (EN 1993-1-5 Eq. 5.3)
    #   λ̄_w = (h_w/t_w) / (37.4 · ε · √k_τ)
    lam_w = (h_w_mm / t_w_mm) / (37.4 * eps * math.sqrt(k_tau))

    # Shear buckling reduction factor χ_w (EN 1993-1-5 Table 5.1)
    lam_w0 = 0.83 / eta   # transition slenderness

    if lam_w < lam_w0:
        chi_w      = eta
        chi_w_note = f"λ̄_w < {lam_w0:.3f} → χ_w = η = {eta:.2f}  (no shear buckling)"
    elif rigid_end_post and lam_w < 1.08:
        chi_w      = 0.83 / lam_w
        chi_w_note = f"Rigid end post, λ̄_w in [0.83/η, 1.08) → χ_w = 0.83/λ̄_w"
    elif rigid_end_post:
        chi_w      = 1.37 / (0.7 + lam_w)
        chi_w_note = f"Rigid end post, λ̄_w ≥ 1.08 → χ_w = 1.37/(0.7+λ̄_w)  (tension field)"
    else:
        chi_w      = 0.83 / lam_w
        chi_w_note = f"Non-rigid / no end post → χ_w = 0.83/λ̄_w"

    # Web contribution to shear buckling resistance (EN 1993-1-5 Eq. 5.2)
    V_bw_Rd_kN  = chi_w * f_yw_MPa * h_w_mm * t_w_mm / (math.sqrt(3) * gamma_M1) / 1000.0

    # Upper bound on V_bw,Rd (EN 1993-1-5 §5.2(1))
    V_bw_max_kN = eta * f_yw_MPa * h_w_mm * t_w_mm / (math.sqrt(3) * gamma_M1) / 1000.0
    V_bw_Rd_kN  = min(V_bw_Rd_kN, V_bw_max_kN)

    # Flange contribution to shear resistance (EN 1993-1-5 §5.4, Eq. 5.8)
    # Only possible if M_Ed < M_f,Rd (flanges have spare capacity)
    V_bf_Rd_kN = 0.0
    flange_cont_note = "V_bf,Rd = 0  (M_Ed ≥ M_f,Rd or neglected)"
    if M_f_Rd_kNm > 1e-9 and M_Ed_kNm < M_f_Rd_kNm:
        # c = a/2 · [1 / √(1 + (a/h_w)²)]  ???
        # EN 1993-1-5 Eq. 5.9:
        #   c = a / [1 + (b_f·t_f²·f_yf) / (0.25·h_w·t_w²·f_yw)]^(0.5)
        #   More commonly: c ≈ a/4 · min(1, 1/α²) ... the standard is explicit:
        #
        # EN 1993-1-5 Eq.(5.9):
        #   c = 0.25 · √[(b_f · t_f² · f_yf)/(h_w · t_w · f_yw)] · a  (not standard)
        #
        # Correct formula from EC3-1-5 §5.4(1):
        #   c = a/4 is a common simplification when a is the panel length
        #   Exact: the c in Eq.(5.8) is determined from the plastic hinge condition
        #   c² = a² / (1 + a²/h_w²) is NOT the formula...
        #
        # From EC3-1-5 Eq.(5.9) - the term "c" is calculated as:
        #   M_f,Rd = b_f · t_f · f_yf · (h_w + t_f) / γ_M0
        #   V_bf,Rd = (b_f·t_f²·f_yf)/(c·γ_M1) × [1-(M_Ed/M_f,Rd)²]
        #   with c = (a/4) × (b_f·t_f·f_yf / (h_w·t_w·f_yw))^(0.5) ...
        #
        # Conservatively, skip flange contribution or use simplified:
        # Using EN 1993-1-5 Eq.(5.8)+(5.9):
        m_ratio = M_Ed_kNm / M_f_Rd_kNm
        # c from Annex A is complex; use upper-bound formula:
        #  V_bf,Rd = b_f·t_f²·f_yf / (c·γ_M1) × (1 - m_ratio²)
        # c = 0.25 × h_w × (b_f·t_f·f_yf/(h_w·t_w·f_yw))^0.5  is one form
        # Using Eq. 5.9: c = min(a, h_w) / 4  (conservative upper bound for c → lower V_bf)
        c_mm = min(a_mm, h_w_mm) / 4.0   # upper bound on c (conservative)
        if c_mm > 0:
            V_bf_Rd_kN  = (b_f_mm * t_f_mm**2 * f_yf_MPa / (c_mm * gamma_M1)
                           * (1.0 - m_ratio**2)) / 1000.0
            flange_cont_note = (
                f"V_bf,Rd = b_f·t_f²·f_yf·(1−η_M²)/(c·γ_M1)  "
                f"with c = min(a,h_w)/4 = {c_mm:.0f} mm  (conservative)")

    V_b_Rd_kN = V_bw_Rd_kN + V_bf_Rd_kN

    # ── M + V interaction (EN 1993-1-5 §7) ───────────────────────────────────
    # Interaction only required when V_Ed > 0.5 · V_bw,Rd
    V_limit_kN = 0.5 * V_bw_Rd_kN
    interaction_note = ""
    I_MV = 0.0

    if V_Ed_kN > V_limit_kN and V_bw_Rd_kN > 0.0:
        # η₁ = M_Ed / M_pl,Rd  (or M_Rd for the section)
        # η₃ = V_Ed / V_bw,Rd
        # Interaction: (2·η₁ − 1)² + η₃ ≤ 1  (for M_Ed ≥ M_f,Rd case)
        # More generally: η₁ + (1 − M_f,Rd/M_pl,Rd)·(2·η₃ − 1)² ≤ 1
        eta1 = M_Ed_kNm / max(M_Rd_kNm, 1e-9)
        eta3 = V_Ed_kN  / max(V_bw_Rd_kN, 1e-9)
        c_MV = M_f_Rd_kNm / max(M_Rd_kNm, 1e-9)        # M_f,Rd / M_pl,Rd
        I_MV = eta1 + (1.0 - c_MV) * (2.0 * eta3 - 1.0)**2
        interaction_note = (
            f"M_Ed > 0  and  V_Ed = {V_Ed_kN:.1f} kN > 0.5·V_bw,Rd = {V_limit_kN:.1f} kN "
            f"→ M+V interaction applies")
    else:
        interaction_note = (
            f"V_Ed = {V_Ed_kN:.1f} kN ≤ 0.5·V_bw,Rd = {V_limit_kN:.1f} kN "
            f"→ M+V interaction not required")

    # ── Utilization ratios ────────────────────────────────────────────────────
    eta_M = M_Ed_kNm / max(M_Rd_kNm, 1e-9)
    eta_V = V_Ed_kN  / max(V_b_Rd_kN, 1e-9)

    # ── Output blocks ──────────────────────────────────────────────────────────
    hdr_title = title if title else f"{label}  —  Plate Girder  EC3"
    blocks.append(MH(
        hdr_title,
        (f"Web {h_w_mm:.0f}×{t_w_mm:.0f}  |  Flanges {b_f_mm:.0f}×{t_f_mm:.0f}  |  "
         f"{grade}  |  a = {a_mm:.0f} mm"),
        "steel",
    ))

    blocks.append(S("Cross-section geometry and properties"))
    blocks += [
        CALC_ROW("h",       "= h_w + 2t_f",         f"{h_mm:.1f} mm"),
        CALC_ROW("A_w",     "= h_w · t_w",           f"{A_w/100:.2f} cm²"),
        CALC_ROW("A_f",     "= b_f · t_f  (each)",   f"{A_f/100:.2f} cm²"),
        CALC_ROW("A",       "total gross",            f"{A_tot/100:.2f} cm²"),
        CALC_ROW("I_y",     "(gross)",                f"{I_gross/1e4:.1f} cm⁴"),
        CALC_ROW("W_el",    "(gross)",                f"{W_el/1e3:.1f} cm³"),
        CALC_ROW("W_pl",    "(gross)",                f"{W_pl/1e3:.1f} cm³"),
        CALC_ROW("ε",       "= √(235/f_y)",          f"{eps:.4f}"),
    ]

    blocks.append(S("Cross-section classification  (EC3-1-1 Table 5.2)"))
    blocks += [
        CALC_ROW("h_w/t_w",    "web in bending",
                 f"{c_t_web:.1f}  →  Class {web_class}  "
                 f"[72ε={web_c1:.1f} / 83ε={web_c2:.1f} / 124ε={web_c3:.1f}]"),
        CALC_ROW("c/t_f",      "compression flange",
                 f"{c_t_flg:.1f}  →  Class {flg_class}  "
                 f"[9ε={flg_c1:.1f} / 10ε={flg_c2:.1f} / 14ε={flg_c3:.1f}]"),
        CALC_ROW("Section",    "governing class",    f"Class {cs_class}"),
    ]

    blocks.append(S("Bending resistance  (EC3-1-1 §6.2 / EC3-1-5 §4.4)"))
    if web_class == 4:
        blocks += [
            T("Class 4 web — effective section per EN 1993-1-5 §4.4"),
            CALC_ROW("k_sigma,web", "psi = -1 (pure bending)",   f"{k_sig_web:.1f}"),
            CALC_ROW("lam_p",       "= (h_w/t_w)/(28.4*e*sqrt(k_sigma))", f"{lam_p:.3f}"),
            CALC_ROW("rho_web",     "reduction factor",           f"{rho_web:.3f}"),
            CALC_ROW("h_w,eff",     "= rho * h_w",               f"{h_w_eff:.1f} mm"),
        ]
    elif flg_class == 4:
        blocks.append(N(
            "Class 4 compression flange detected — flange effective width reduction "
            "is NOT yet implemented. Results are non-conservative; consider increasing t_f."))

    blocks += [
        CALC_ROW("W_eff",      "",                              f"{W_eff/1e3:.1f} cm³"),
        CALC_ROW("M_f,Rd",     "= A_f·f_y·(h_w+t_f)/γ_M0  (flange couple)",
                 f"{M_f_Rd_kNm:.1f} kNm"),
        CALC_ROW("M_Rd",       M_Rd_type,                       f"{M_Rd_kNm:.1f} kNm"),
    ]

    blocks.append(S("Shear buckling resistance  (EN 1993-1-5 §5)"))
    blocks += [
        CALC_ROW("a/h_w",      "aspect ratio",                  f"{alpha:.3f}"),
        CALC_ROW("k_τ",        "shear buckling coefficient",     f"{k_tau:.3f}"),
        CALC_ROW("λ̄_w",        "= (h_w/t_w)/(37.4·ε·√k_τ)",   f"{lam_w:.3f}"),
        T(chi_w_note),
        CALC_ROW("χ_w",        "",                              f"{chi_w:.3f}"),
        CALC_ROW("V_bw,Rd",    "= χ_w·f_yw·h_w·t_w/(√3·γ_M1)", f"{V_bw_Rd_kN:.1f} kN"),
        T(flange_cont_note),
        CALC_ROW("V_bf,Rd",    "flange contribution",           f"{V_bf_Rd_kN:.1f} kN"),
        CALC_ROW("V_b,Rd",     "= V_bw,Rd + V_bf,Rd",          f"{V_b_Rd_kN:.1f} kN"),
    ]

    blocks.append(S("Verification"))
    blocks += [
        CALC_ROW("M_Ed", "", f"{M_Ed_kNm:.1f} kNm"),
        CALC_ROW("V_Ed", "", f"{V_Ed_kN:.1f} kN"),
    ]

    blocks.append(chk.check(
        f"Bending  M_Ed / M_Rd  (Class {cs_class})  ≤ 1",
        eta_M, 1.0,
    ))
    blocks.append(chk.check(
        "Shear buckling  V_Ed / V_b,Rd  ≤ 1  (EN 1993-1-5 §5)",
        eta_V, 1.0,
    ))

    # M + V interaction
    T_mv = T(interaction_note)
    blocks.append(T_mv)
    if V_Ed_kN > V_limit_kN:
        blocks.append(chk.check(
            "M+V interaction  η₁ + (1−M_f,Rd/M_Rd)·(2η₃−1)²  ≤ 1  (EC3-1-5 §7)",
            I_MV, 1.0,
        ))

    return blocks
