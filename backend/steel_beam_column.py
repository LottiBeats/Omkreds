"""
steel_beam_column.py — EN 1993-1-1 §6.3.3 beam-column interaction check

Method 2 (Annex B) — suitable for Class 1 and 2 hot-rolled I/H sections.

Interaction equations (EC3 §6.3.3, Eq. 6.61 / 6.62):
  (1) N_Ed/(χ_y·N_Rk/γ_M1) + k_yy·M_y,Ed/(χ_LT·M_y,Rk/γ_M1) + k_yz·M_z,Ed/(M_z,Rk/γ_M1) ≤ 1
  (2) N_Ed/(χ_z·N_Rk/γ_M1) + k_zy·M_y,Ed/(χ_LT·M_y,Rk/γ_M1) + k_zz·M_z,Ed/(M_z,Rk/γ_M1) ≤ 1

Interaction factors from Annex B, Table B.1 (not susceptible to torsional
deformations, e.g. laterally restrained) and Table B.2 (susceptible, e.g.
unrestrained I/H sections), Class 1 and 2 cross-sections.

Reference: "Design of Steel Structures to Eurocodes", Vayas, Ermopoulos,
Ioannidis — Springer 2019, Table 4.10 (not susceptible) and Table 4.11
(susceptible to torsional deformations).
"""

import math
from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext
from steel_ec3 import BUCKLING_ALPHA, buckling_curve_hot_rolled, chi_flexural, chi_ltb, ltb_curve_hot_rolled

import forallpeople as si
si.environment("structural", top_level=True)

# forallpeople's structural environment does not expose 'cm', so define it:
_cm = 10 * mm   # 1 cm = 10 mm  (forallpeople quantity)

# ── Shared buckling helpers ────────────────────────────────────────────────────

_ALPHA = BUCKLING_ALPHA


def _buckling_curve(h_mm, b_mm, tf_mm):
    """EC3 Table 6.2 buckling curves for hot-rolled I/H sections."""
    return buckling_curve_hot_rolled(h_mm, b_mm, tf_mm)


def _chi(lam_bar: float, curve: str) -> float:
    """Flexural buckling reduction factor chi (EC3 6.3.1.2 Eq. 6.49)."""
    return chi_flexural(lam_bar, curve)


def _chi_LT(lam_LT: float, h_mm: float, b_mm: float) -> float:
    """EC3 6.3.2.2 LTB reduction factor using the rolled-section curve."""
    return chi_ltb(lam_LT, ltb_curve_hot_rolled(h_mm, b_mm))


# ── Section property helpers ───────────────────────────────────────────────────

def _section_props(h_mm, b_mm, tw_mm, tf_mm, Iy_cm4):
    """Derive additional cross-section properties from geometry."""
    hw_mm = max(h_mm - 2.0 * tf_mm, 0.0)

    # Area [cm²]
    A_cm2 = (2.0 * b_mm * tf_mm + hw_mm * tw_mm) / 100.0

    # I_z [cm⁴]  (two flanges + web)
    Iz_cm4 = (2.0 * (tf_mm * b_mm**3 / 12.0) + hw_mm * tw_mm**3 / 12.0) / 10_000.0

    # W_pl,z [cm³]  (plastic section modulus about z-z)
    #   = b²·t_f/4 + t_w²·h_w/4  (two half-flanges + web contribution)
    Wplz_cm3 = (b_mm**2 * tf_mm / 4.0 * 2 + tw_mm**2 * hw_mm / 4.0) / 1_000.0

    # I_t [cm⁴]  (St-Venant torsion, approximate — ignores root fillets)
    It_cm4 = (2.0 * b_mm * tf_mm**3 + hw_mm * tw_mm**3) / (3.0 * 10_000.0)

    # I_w [cm⁶]  (warping constant for doubly-symmetric I-section)
    #   I_w = (I_z / 4) · (h - t_f)²   [using I_z in mm⁴ and distances in mm]
    Iw_cm6 = Iz_cm4 * (h_mm - tf_mm)**2 / 400.0   # (cm⁴ × mm²) / (20²) = cm⁶

    return A_cm2, Iz_cm4, Wplz_cm3, It_cm4, Iw_cm6


# ── Interaction factor calculation ────────────────────────────────────────────

def _k_factors_class12(lam_y, lam_z, n_y, n_z, C_my, C_mz, C_mLT,
                       susceptible_to_twist: bool):
    """
    Annex B Table B.1 / B.2 interaction factors for Class 1 and 2 sections.

    Parameters
    ----------
    lam_y, lam_z    : non-dimensional slenderness about y-y and z-z
    n_y             : N_Ed / (χ_y · N_Rk / γ_M1)
    n_z             : N_Ed / (χ_z · N_Rk / γ_M1)
    C_my, C_mz,
    C_mLT           : equivalent uniform moment factors (Table B.3 / Table 4.12)
    susceptible_to_twist : True for unrestrained I/H sections (Table B.2 / Table 4.11)
                           False for laterally restrained members   (Table B.1 / Table 4.10)

    Returns
    -------
    k_yy, k_yz, k_zy, k_zz
    """
    # ── k_yy  (same for both tables) ─────────────────────────────────────────
    # Annex B Table B.1/B.2 Eq.:
    #   k_yy = C_my · (1 + (λ̄_y − 0.2) · n_y)  ≤  C_my · (1 + 0.8 · n_y)
    k_yy = C_my * (1.0 + (lam_y - 0.2) * n_y)
    k_yy = min(k_yy, C_my * (1.0 + 0.8 * n_y))

    # ── k_zz  (same for both tables) ─────────────────────────────────────────
    #   k_zz = C_mz · (1 + (2λ̄_z − 0.6) · n_z)  ≤  C_mz · (1 + 1.4 · n_z)
    k_zz = C_mz * (1.0 + (2.0 * lam_z - 0.6) * n_z)
    k_zz = min(k_zz, C_mz * (1.0 + 1.4 * n_z))

    if not susceptible_to_twist:
        # ── Table B.1 — NOT susceptible to torsional deformations ─────────────
        # (CHS/RHS or fully laterally restrained I/H sections)
        #   k_yz = 0.6 · k_zz
        #   k_zy = 0.8 · k_yy   (conservative approximation for non-susceptible)
        k_yz = 0.6 * k_zz
        k_zy = 0.8 * k_yy

    else:
        # ── Table B.2 — SUSCEPTIBLE to torsional deformations ────────────────
        # (unrestrained I/H sections — the common case)
        #
        # k_yz = 0.6 · k_zz   (unchanged from Table B.1)
        k_yz = 0.6 * k_zz

        # k_zy (Vayas et al. Table 4.11, EC3 Annex B Table B.2):
        #   For λ̄_z ≥ 0.4:
        #     k_zy = 1 − [0.1 · λ̄_z / (C_mLT − 0.25)] · n_z
        #       but ≥  1 − [0.1        / (C_mLT − 0.25)] · n_z
        #
        #   For λ̄_z < 0.4  (simplified formula — reduces conservatism for
        #                    stocky columns where coupling is small):
        #     k_zy = 0.6 + λ̄_z
        #       but ≤  1 − [0.1 · λ̄_z / (C_mLT − 0.25)] · n_z
        #
        CmLT_safe = max(C_mLT, 0.26)   # C_mLT − 0.25 ≥ 0.01 → no div-by-zero

        k_zy_full = (1.0
                     - (0.1 * lam_z / (CmLT_safe - 0.25)) * n_z)
        k_zy_min  = (1.0
                     - (0.1          / (CmLT_safe - 0.25)) * n_z)

        if lam_z < 0.4:
            k_zy_simplified = 0.6 + lam_z
            # Use simplified, but cap at the full formula (can't be more
            # conservative than the formula would give)
            k_zy = min(k_zy_simplified, k_zy_full)
        else:
            k_zy = k_zy_full

        # Apply the lower bound (k_zy ≥ minimum expression)
        k_zy = max(k_zy, k_zy_min)

    return k_yy, k_yz, k_zy, k_zz


# ── Main check ─────────────────────────────────────────────────────────────────

def steel_beam_column_check(
    label:    str,
    section:  str,
    grade:    str,
    # Section geometry (from catalog)
    h_mm:    float,
    b_mm:    float,
    tw_mm:   float,
    tf_mm:   float,
    Iy_cm4:  float,
    Wply_cm3: float,
    # Design actions
    N_Ed_kN:   float,
    My_Ed_kNm: float,
    Mz_Ed_kNm: float = 0.0,
    # Member lengths [m]
    L_y_m:   float = 4.0,
    L_z_m:   float = 4.0,
    L_LTB_m: float = 4.0,
    # Effective length factors
    k_y: float = 1.0,
    k_z: float = 1.0,
    # Equivalent uniform moment factors
    # (from Table 4.12 / Annex B Table B.3 — use 1.0 for uniform moment)
    C_my:  float = 1.0,
    C_mz:  float = 1.0,
    C_mLT: float = 1.0,
    # Flags
    ltb_restrained: bool = False,   # True → χ_LT=1 and Table B.1 (not susceptible)
    # Partial factors
    f_y_MPa:  float = 355.0,
    gamma_M0: float = 1.0,
    gamma_M1: float = 1.0,
):
    """
    Returns a list of calc_core blocks for the beam-column check.

    ltb_restrained=False (default): unrestrained I/H section → Table B.2 factors
                                    (susceptible to torsional deformations).
    ltb_restrained=True:            laterally restrained → χ_LT=1, Table B.1 factors
                                    (not susceptible to torsional deformations).
    """
    chk    = CheckContext()
    blocks = []

    # ── Convert all inputs to forallpeople quantities ──────────────────────────
    N_Ed  = N_Ed_kN   * kN
    My_Ed = My_Ed_kNm * kN * m
    Mz_Ed = Mz_Ed_kNm * kN * m
    L_y   = L_y_m     * m
    L_z   = L_z_m     * m
    L_LTB = L_LTB_m   * m
    f_y   = f_y_MPa   * MPa
    h     = h_mm      * mm
    b     = b_mm      * mm
    tw    = tw_mm     * mm
    tf    = tf_mm     * mm
    Iy    = Iy_cm4    * _cm**4    # catalog value — includes fillets
    Wply  = Wply_cm3  * _cm**3   # catalog value
    E     = 210_000   * MPa
    G     =  81_000   * MPa

    # ── Section properties (derived from geometry, forallpeople throughout) ────
    hw   = h - 2*tf
    A    = 2*b*tf + hw*tw                          # gross area
    Iz   = 2*(tf * b**3) / 12 + hw * tw**3 / 12   # 2nd moment — weak axis
    Wplz = b**2 * tf / 2 + tw**2 * hw / 4         # plastic modulus — weak axis
    It   = (2*b*tf**3 + hw*tw**3) / 3             # St-Venant torsion (no fillets)
    Iw   = Iz * (h - tf)**2 / 4                   # warping constant

    # Radii of gyration
    iy = (Iy / A) ** 0.5
    iz = (Iz / A) ** 0.5

    # ── Effective lengths ──────────────────────────────────────────────────────
    L_cr_y   = k_y * L_y
    L_cr_z   = k_z * L_z
    L_cr_LTB = L_LTB

    # Reference slenderness λ₁ = π√(E/f_y)  [dimensionless]
    lambda_1 = math.pi * math.sqrt(float(E / f_y))

    # Non-dimensional slenderness  [dimensionless]
    lam_y = float(L_cr_y / iy) / lambda_1
    lam_z = float(L_cr_z / iz) / lambda_1

    # Buckling curves (EC3 Table 6.2) and reduction factors
    curve_y, curve_z = _buckling_curve(h_mm, b_mm, tf_mm)
    chi_y = _chi(lam_y, curve_y)
    chi_z = _chi(lam_z, curve_z)

    # ── Characteristic cross-section resistances ───────────────────────────────
    N_Rk  = A    * f_y   # [N]   → displays as kN
    My_Rk = Wply * f_y   # [N·m] → displays as kN·m
    Mz_Rk = Wplz * f_y

    # ── Buckling resistances ───────────────────────────────────────────────────
    N_b_y_Rd = chi_y * N_Rk / gamma_M1
    N_b_z_Rd = chi_z * N_Rk / gamma_M1

    # ── LTB  (EC3 §6.3.2.2 General method) ───────────────────────────────────
    susceptible = not ltb_restrained

    if ltb_restrained or My_Ed_kNm <= 0.0:
        chi_LT  = 1.0
        lam_LTb = 0.0
        M_cr    = None
    else:
        # M_cr — two-term formula, all in forallpeople SI units
        # Units: E·Iz·G·It  and  (π/L)²·E²·Iz·Iw  both give N²·m⁴
        E_f  = float(E  / MPa)           # MPa (plain float for sqrt)
        G_f  = float(G  / MPa)           # MPa
        Iz_f = float(Iz / mm**4)         # mm⁴
        It_f = float(It / mm**4)         # mm⁴
        Iw_f = float(Iw / mm**6)         # mm⁶
        L_f  = float(L_cr_LTB / mm)      # mm

        under = (E_f * Iz_f * G_f * It_f
                 + (math.pi / L_f)**2 * E_f**2 * Iz_f * Iw_f)
        M_cr_Nmm  = (math.pi / L_f) * math.sqrt(max(under, 0.0))
        M_cr      = (M_cr_Nmm / 1_000_000.0) * kN * m   # N·mm → kN·m (forallpeople)

        lam_LTb = math.sqrt(float(Wply * f_y / M_cr))
        chi_LT  = _chi_LT(lam_LTb, h_mm, b_mm)

    # ── Interaction factors (Annex B) ─────────────────────────────────────────
    n_y = float(N_Ed / N_b_y_Rd)    # N_Ed / (χ_y·N_Rk/γ_M1)  [dimensionless]
    n_z = float(N_Ed / N_b_z_Rd)    # N_Ed / (χ_z·N_Rk/γ_M1)  [dimensionless]

    k_yy, k_yz, k_zy, k_zz = _k_factors_class12(
        lam_y, lam_z, n_y, n_z,
        C_my, C_mz, C_mLT,
        susceptible_to_twist=susceptible,
    )

    # ── Interaction utilizations ───────────────────────────────────────────────
    N_pl_Rd  = N_Rk  / gamma_M0
    My_pl_Rd = My_Rk / gamma_M0
    Mz_pl_Rd = Mz_Rk / gamma_M0
    My_LT_Rd = chi_LT * My_Rk / gamma_M1
    Mz_Rd    = Mz_Rk  / gamma_M1

    # Cross-section capacity  §6.2
    ICS = (float(N_Ed  / N_pl_Rd)
           + float(My_Ed / My_pl_Rd)
           + float(Mz_Ed / Mz_pl_Rd))

    # Eq. 6.61
    IE1 = (float(N_Ed  / N_b_y_Rd)
           + k_yy * float(My_Ed / My_LT_Rd)
           + k_yz * float(Mz_Ed / Mz_Rd))

    # Eq. 6.62
    IE2 = (float(N_Ed  / N_b_z_Rd)
           + k_zy * float(My_Ed / My_LT_Rd)
           + k_zz * float(Mz_Ed / Mz_Rd))

    # ── Output blocks ──────────────────────────────────────────────────────────
    table_ref = "B.1" if not susceptible else "B.2"
    susceptible_txt = ("Table B.1 — not susceptible to torsional deformations"
                       if not susceptible
                       else "Table B.2 — susceptible to torsional deformations (unrestrained I/H)")

    blocks.append(MH(
        f"{label}  —  Beam-Column  EC3 §6.3.3",
        (f"{section} · {grade}  |  N_Ed = {N_Ed_kN:.1f} kN  |  "
         f"M_y,Ed = {My_Ed_kNm:.1f} kNm  |  M_z,Ed = {Mz_Ed_kNm:.1f} kNm"),
        "steel",
    ))

    blocks.append(S("Design parameters"))
    blocks.append(T(
        f"Steel beam-column interaction check to EN 1993-1-1 §6.3.3 (Annex B Method 2).  "
        f"Section {section}, grade {grade}.  "
        f"Buckling lengths: L_cr,y = {k_y:.2f}×{L_y_m:.2f} m, "
        f"L_cr,z = {k_z:.2f}×{L_z_m:.2f} m, L_LTB = {L_LTB_m:.2f} m.  "
        f"{'LTB restrained — χ_LT = 1.0.' if ltb_restrained else 'LTB unrestrained — χ_LT < 1.0 possible.'}"
    ))
    blocks.extend([
        CALC_ROW("Section",  "profile",                          section),
        CALC_ROW("Grade",    "steel grade",                      grade),
        CALC_ROW("L_y",      "member length — y axis",           str(L_y)),
        CALC_ROW("L_z",      "member length — z axis",           str(L_z)),
        CALC_ROW("L_LTB",    "lateral buckling length",          str(L_LTB)),
        CALC_ROW("k_y",      "eff.-length factor y–y",           f"{k_y:.2f}"),
        CALC_ROW("k_z",      "eff.-length factor z–z",           f"{k_z:.2f}"),
        CALC_ROW("N_Ed",     "design axial compression",         str(N_Ed)),
        CALC_ROW("M_y,Ed",   "design moment — strong axis",      str(My_Ed)),
        CALC_ROW("M_z,Ed",   "design moment — weak axis",        str(Mz_Ed)),
        CALC_ROW("C_my",     "equiv. moment factor y",           f"{C_my:.2f}"),
        CALC_ROW("C_mz",     "equiv. moment factor z",           f"{C_mz:.2f}"),
        CALC_ROW("C_mLT",    "equiv. moment factor LTB",         f"{C_mLT:.2f}"),
        CALC_ROW("γ_M0",     "partial factor — cross-section",   f"{gamma_M0:.2f}"),
        CALC_ROW("γ_M1",     "partial factor — member buckling", f"{gamma_M1:.2f}"),
    ])

    # Section properties — geometry in forallpeople, areas/inertia in cm units (engineering convention)
    blocks.append(S("Section properties"))
    blocks += [
        CALC_ROW("h",         "total depth",         str(h)),
        CALC_ROW("b",         "flange width",        str(b)),
        CALC_ROW("t_w",       "web thickness",       str(tw)),
        CALC_ROW("t_f",       "flange thickness",    str(tf)),
        CALC_ROW("A",         "= 2·b·t_f + h_w·t_w", f"{float(A / _cm**2):.2f} cm²"),
        CALC_ROW("I_y",       "(catalog)",            f"{Iy_cm4:.1f} cm⁴"),
        CALC_ROW("I_z",       "(derived)",            f"{float(Iz / _cm**4):.2f} cm⁴"),
        CALC_ROW("i_y",       "= √(I_y / A)",         str(iy)),
        CALC_ROW("i_z",       "= √(I_z / A)",         str(iz)),
        CALC_ROW("W_pl,y",    "(catalog)",             f"{Wply_cm3:.1f} cm³"),
        CALC_ROW("W_pl,z",    "(derived)",             f"{float(Wplz / _cm**3):.1f} cm³"),
        CALC_ROW("I_t",       "(approx)",              f"{float(It / _cm**4):.2f} cm⁴"),
        CALC_ROW("I_w",       "(approx)",              f"{float(Iw / _cm**6):.0f} cm⁶"),
        CALC_ROW("f_y",       "yield strength",        str(f_y)),
    ]

    blocks.append(S("Characteristic resistances"))
    blocks += [
        CALC_ROW("N_Rk",    "= A · f_y",        str(N_Rk)),
        CALC_ROW("M_y,Rk",  "= W_pl,y · f_y",   str(My_Rk)),
        CALC_ROW("M_z,Rk",  "= W_pl,z · f_y",   str(Mz_Rk)),
    ]

    blocks.append(S("Flexural buckling  (EC3 §6.3.1)"))
    blocks += [
        T(f"Buckling curves: y–y → {curve_y.upper()} (α = {_ALPHA[curve_y]}),  "
          f"z–z → {curve_z.upper()} (α = {_ALPHA[curve_z]})"),
        T(f"L_cr,y = {k_y}·{str(L_y)} = {str(L_cr_y)}   |   "
          f"L_cr,z = {k_z}·{str(L_z)} = {str(L_cr_z)}"),
        CALC_ROW("λ₁",      "= π√(E/f_y)",            f"{lambda_1:.2f}"),
        CALC_ROW("λ̄_y",     "= (L_cr,y / i_y) / λ₁",  f"{lam_y:.3f}"),
        CALC_ROW("λ̄_z",     "= (L_cr,z / i_z) / λ₁",  f"{lam_z:.3f}"),
        CALC_ROW("χ_y",     f"Curve {curve_y.upper()}", f"{chi_y:.3f}"),
        CALC_ROW("χ_z",     f"Curve {curve_z.upper()}", f"{chi_z:.3f}"),
        CALC_ROW("N_b,y,Rd","= χ_y · N_Rk / γ_M1",    str(N_b_y_Rd)),
        CALC_ROW("N_b,z,Rd","= χ_z · N_Rk / γ_M1",    str(N_b_z_Rd)),
    ]

    blocks.append(S("LTB reduction factor  (EC3 §6.3.2.2 — General method)"))
    if ltb_restrained:
        blocks.append(T("Lateral restraint provided → LTB not critical, χ_LT = 1.0"))
        blocks.append(CALC_ROW("χ_LT", "= 1.0 (restrained)", "1.000"))
    else:
        blocks += [
            T(f"L_LTB = {str(L_LTB)}   |   M_cr = {str(M_cr)}  (C₁ = 1.0, conservative)"),
            CALC_ROW("λ̄_LT",  "= √(W_pl,y · f_y / M_cr)",     f"{lam_LTb:.3f}"),
            CALC_ROW("χ_LT",   "General case, EC3 §6.3.2.2",   f"{chi_LT:.3f}"),
        ]

    blocks.append(S(f"Interaction factors  (Annex B {table_ref}, Class 1/2 — {susceptible_txt})"))

    _cm_at_unity = all(abs(c - 1.0) < 0.001 for c in (C_my, C_mz, C_mLT))
    if _cm_at_unity:
        blocks.append(N(
            "C_my = C_mz = C_mLT = 1.0 — conservative, corresponding to uniform moment "
            "along the member length. For non-uniform moment diagrams (triangular, "
            "parabolic, or end-moment ratios ψ < 1), a lower value is justified and will "
            "reduce the interaction factors. Refer to EN 1993-1-1 Annex B Table B.3."
        ))
    else:
        blocks.append(N(
            f"Equivalent uniform moment factors: C_my = {C_my:.2f}, C_mz = {C_mz:.2f}, "
            f"C_mLT = {C_mLT:.2f}. Verify against EN 1993-1-1 Annex B Table B.3 for "
            "the actual moment diagram shape."
        ))

    if not ltb_restrained and My_Ed_kNm > 0.0:
        blocks.append(N(
            "M_cr computed with C₁ = 1.0 (uniform moment — conservative). "
            "For a non-uniform moment diagram (e.g. UDL gives C₁ ≈ 1.13, triangular ≈ 1.29) "
            "a higher C₁ will increase M_cr and reduce λ̄_LT."
        ))

    blocks += [
        T(f"C_my = {C_my:.2f}   C_mz = {C_mz:.2f}   C_mLT = {C_mLT:.2f}"),
        T(f"n_y = N_Ed/(χ_y·N_Rk/γ_M1) = {n_y:.3f}   |   n_z = N_Ed/(χ_z·N_Rk/γ_M1) = {n_z:.3f}"),
        CALC_ROW("k_yy", f"C_my·(1+(λ̄_y−0.2)·n_y) ≤ C_my·(1+0.8·n_y)",    f"{k_yy:.3f}"),
        CALC_ROW("k_yz", "0.6 · k_zz",                                         f"{k_yz:.3f}"),
        CALC_ROW("k_zy", _k_zy_formula_text(lam_z, C_mLT, susceptible),         f"{k_zy:.3f}"),
        CALC_ROW("k_zz", "C_mz·(1+(2λ̄_z−0.6)·n_z) ≤ C_mz·(1+1.4·n_z)",     f"{k_zz:.3f}"),
    ]

    blocks.append(S("Verification  (EC3 §6.3.3)"))
    blocks += [
        CALC_ROW("N_Ed",   "design axial force",           str(N_Ed)),
        CALC_ROW("M_y,Ed", "design moment — strong axis",  str(My_Ed)),
        CALC_ROW("M_z,Ed", "design moment — weak axis",    str(Mz_Ed)),
    ]

    # Cross-section capacity
    blocks.append(CALC_ROW("η_cs",
        "= N_Ed / N_pl,Rd + M_y,Ed / M_pl,y,Rd + M_z,Ed / M_pl,z,Rd",
        f"{ICS:.3f}"))
    blocks.append(chk.check("Cross-section  §6.2", ICS, 1.0))

    # Eq. 6.61
    blocks.append(CALC_ROW("η_6.61",
        "= N_Ed / N_b,y,Rd + k_yy · M_y,Ed / M_y,Rd + k_yz · M_z,Ed / M_z,Rd",
        f"{IE1:.3f}"))
    blocks.append(chk.check("Interaction Eq. 6.61", IE1, 1.0))

    # Eq. 6.62
    blocks.append(CALC_ROW("η_6.62",
        "= N_Ed / N_b,z,Rd + k_zy · M_y,Ed / M_y,Rd + k_zz · M_z,Ed / M_z,Rd",
        f"{IE2:.3f}"))
    blocks.append(chk.check("Interaction Eq. 6.62", IE2, 1.0))

    return blocks


def _k_zy_formula_text(lam_z: float, C_mLT: float, susceptible: bool) -> str:
    """Return a short human-readable description of which k_zy formula was used."""
    if not susceptible:
        return "0.8 · k_yy  (Table B.1 — not susceptible)"
    if lam_z < 0.4:
        return f"0.6 + λ̄_z = {0.6+lam_z:.3f}  (Table B.2, λ̄_z<0.4 simplified)"
    return (f"1 − 0.1·λ̄_z/(C_mLT−0.25)·n_z  (Table B.2, Vayas et al. Table 4.11)")
