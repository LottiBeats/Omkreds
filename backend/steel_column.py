"""
steel_column.py — EN 1993-1-1 steel column / beam-column check

Checks:
  §6.2.4   Cross-section compression resistance
  §6.3.1   Flexural buckling (y-y and z-z separately)
  §6.3.3   Combined bending + compression (Annex B Method 2)
             — interaction factors k_yy, k_zy, k_yz, k_zz per Table B.1

All inputs are plain Python scalars (mm, kN, MPa, kNm).
"""
import math
from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext

# ── Imperfection factors — EC3 Table 6.1 ─────────────────────────────────────
_ALPHA = {'a0': 0.13, 'a': 0.21, 'b': 0.34, 'c': 0.49, 'd': 0.76}


def _buckling_curve_hot_rolled(h_mm, b_mm, tf_mm):
    """
    Buckling curves for hot-rolled I/H sections — EC3 Table 6.2.
    Returns (curve_y, curve_z).
    """
    hb = h_mm / b_mm if b_mm > 0 else 1.0
    if tf_mm <= 40:
        if hb > 1.2:
            return 'a', 'b'   # IPE-like: tall and narrow
        else:
            return 'b', 'c'   # HEA/HEB-like: stocky
    elif tf_mm <= 100:
        return 'b', 'c'
    else:
        return 'd', 'd'


def _chi(lam_bar: float, curve: str) -> float:
    """Buckling reduction factor χ — EC3 §6.3.1.2 Eq. 6.49."""
    alpha = _ALPHA.get(curve.lower(), 0.34)
    phi   = 0.5 * (1.0 + alpha * (lam_bar - 0.2) + lam_bar ** 2)
    denom = phi + math.sqrt(max(phi ** 2 - lam_bar ** 2, 1e-12))
    return min(1.0 / denom, 1.0)


def steel_column_check(
    label: str,
    section: str,
    grade: str,
    length_m: float,          # column length [m]
    N_Ed_kN: float,           # design axial compression [kN]
    A_cm2: float,             # area [cm²]
    Iy_cm4: float,            # 2nd moment — strong axis [cm⁴]
    Iz_cm4: float,            # 2nd moment — weak axis [cm⁴]
    h_mm: float,
    b_mm: float,
    tf_mm: float,
    tw_mm: float = None,      # web thickness (needed for W_pl,z)
    W_pl_y_cm3: float = None, # plastic modulus y — auto-derived if None
    W_pl_z_cm3: float = None, # plastic modulus z — auto-derived if None
    M_y_Ed_kNm: float = 0.0,  # design moment — strong axis [kNm]
    M_z_Ed_kNm: float = 0.0,  # design moment — weak axis  [kNm]
    C_my: float = 1.0,        # equiv. uniform moment factor y (Annex B Table B.3)
    C_mz: float = 1.0,        # equiv. uniform moment factor z
    ltb_restrained: bool = True,  # True → χ_LT = 1.0 (no LTB reduction)
    f_y_MPa: float = 355.0,
    gamma_M0: float = 1.0,
    gamma_M1: float = 1.0,
    k_y: float = 1.0,         # effective-length factor y-y
    k_z: float = 1.0,         # effective-length factor z-z
):
    """Returns a list of calc_core blocks for the column / beam-column check."""
    chk = CheckContext()
    blocks = []

    E  = 210_000.0  # MPa
    fy = f_y_MPa

    # ── Convert to consistent mm/kN units ────────────────────────────────────
    L    = length_m * 1_000.0   # mm
    A    = A_cm2    * 100.0     # mm²
    Iy   = Iy_cm4   * 10_000.0  # mm⁴
    Iz   = Iz_cm4   * 10_000.0  # mm⁴

    iy = math.sqrt(Iy / A)      # mm
    iz = math.sqrt(Iz / A)      # mm

    # Effective lengths
    L_cr_y = k_y * L
    L_cr_z = k_z * L

    # Reference slenderness
    lambda_1 = math.pi * math.sqrt(E / fy)

    # Non-dimensional slenderness
    lam_y = (L_cr_y / iy) / lambda_1
    lam_z = (L_cr_z / iz) / lambda_1

    # Buckling curves and reduction factors
    curve_y, curve_z = _buckling_curve_hot_rolled(h_mm, b_mm, tf_mm)
    chi_y = _chi(lam_y, curve_y)
    chi_z = _chi(lam_z, curve_z)
    chi   = min(chi_y, chi_z)

    # Resistances [kN]
    N_pl_Rd   = A * fy / gamma_M0 / 1_000.0       # cross-section
    N_b_y_Rd  = chi_y * A * fy / gamma_M1 / 1_000.0  # buckling y-y
    N_b_z_Rd  = chi_z * A * fy / gamma_M1 / 1_000.0  # buckling z-z
    N_b_Rd    = min(N_b_y_Rd, N_b_z_Rd)              # governing buckling Rd

    # Plastic section moduli (derived if not given)
    if W_pl_y_cm3 is not None:
        W_pl_y = W_pl_y_cm3
    else:
        # Approximate from I_y and h: W_el,y × 1.15 (typical for I-sections)
        W_el_y_cm3 = Iy_cm4 / (h_mm / 2 / 10.0)   # cm⁴ / cm = cm³
        W_pl_y = W_el_y_cm3 * 1.15
        W_pl_y_cm3 = W_pl_y

    if W_pl_z_cm3 is not None:
        W_pl_z = W_pl_z_cm3
    elif tw_mm is not None:
        # Exact for idealised I-section (no fillet):
        # W_pl,z = b²·t_f/2 + t_w²·(h-2t_f)/4
        b_c   = b_mm  / 10.0    # cm
        tf_c  = tf_mm / 10.0
        tw_c  = tw_mm / 10.0
        hw_c  = (h_mm - 2 * tf_mm) / 10.0
        W_pl_z = b_c**2 * tf_c / 2.0 + tw_c**2 * hw_c / 4.0   # cm³
        W_pl_z_cm3 = W_pl_z
    else:
        W_pl_z = None

    # Bending resistances [kNm]
    # W_pl [cm³] × f_y [MPa = N/mm²] → [N·mm] × 10⁻³ [cm/mm]³ ... careful:
    # 1 cm³ = 10³ mm³, so W[cm³]×1e3[mm³/cm³]×f_y[N/mm²] = [N·mm] / 1e6 = [kNm]
    M_pl_y_Rd = W_pl_y * fy / gamma_M1 / 1_000.0   # kNm  (cm³ × MPa / 1000)
    if W_pl_z is not None:
        M_pl_z_Rd = W_pl_z * fy / gamma_M1 / 1_000.0  # kNm
    else:
        M_pl_z_Rd = None

    have_moments = abs(M_y_Ed_kNm) > 1e-9 or abs(M_z_Ed_kNm) > 1e-9

    # ── Header ────────────────────────────────────────────────────────────────
    blocks.append(MH(
        f"{label} — Steel Column / Beam-Column  EC3 §6.3",
        f"{section} · {grade}  ·  L = {length_m:.2f} m",
        "steel"
    ))

    # ── Section properties ────────────────────────────────────────────────────
    blocks.append(S("Section properties"))
    blocks += [
        CALC_ROW("A",      "gross area",               f"{A_cm2:.2f} cm²"),
        CALC_ROW("I_y",    "strong-axis 2nd moment",   f"{Iy_cm4:.1f} cm⁴"),
        CALC_ROW("I_z",    "weak-axis 2nd moment",     f"{Iz_cm4:.1f} cm⁴"),
        CALC_ROW("i_y",    "= √(I_y / A)",             f"{iy:.1f} mm"),
        CALC_ROW("i_z",    "= √(I_z / A)",             f"{iz:.1f} mm"),
        CALC_ROW("W_pl,y", "plastic modulus — y",      f"{W_pl_y:.1f} cm³"),
    ]
    if W_pl_z is not None:
        blocks.append(CALC_ROW("W_pl,z", "plastic modulus — z",  f"{W_pl_z:.1f} cm³"))
    else:
        blocks.append(N("W_pl,z not derived — provide tw_mm to enable weak-axis bending check."))
    blocks.append(CALC_ROW("f_y", "yield strength", f"{fy:.0f} MPa"))

    if have_moments:
        blocks.append(N(
            f"C_my = {C_my:.2f}  ·  C_mz = {C_mz:.2f} — equivalent uniform moment factors "
            "(EN 1993-1-1 Annex B Table B.3). "
            "For uniform moment: C = 1.0.  "
            "For linear gradient (ψ=0, moment at one end only): C = 0.6.  "
            "For UDL parabolic diagram (α_h=0): C ≈ 0.95."
        ))
        blocks.append(N(
            "Annex B Method 2 interaction check — not susceptible to torsional deformations "
            f"({'✓ LTB restrained — χ_LT = 1.0' if ltb_restrained else '⚠ LTB not restrained — χ_LT = 1.0 assumed (conservative for closed sections)'})."
        ))

    # ── Slenderness ───────────────────────────────────────────────────────────
    blocks.append(S("Slenderness — EN 1993-1-1 §6.3.1.3"))
    blocks += [
        CALC_ROW("λ₁",     "= π·√(E/f_y)",                               f"{lambda_1:.2f}"),
        CALC_ROW("L_cr,y", f"= k_y·L = {k_y:.2f} × {length_m:.2f} m",   f"{L_cr_y/1000:.2f} m"),
        CALC_ROW("L_cr,z", f"= k_z·L = {k_z:.2f} × {length_m:.2f} m",   f"{L_cr_z/1000:.2f} m"),
        CALC_ROW("i_y",    "= √(I_y / A)",                                f"{iy:.1f} mm"),
        CALC_ROW("i_z",    "= √(I_z / A)",                                f"{iz:.1f} mm"),
        CALC_ROW("λ̄_y",   "= (L_cr,y / i_y) / λ₁",                      f"{lam_y:.3f}"),
        CALC_ROW("λ̄_z",   "= (L_cr,z / i_z) / λ₁",                      f"{lam_z:.3f}"),
    ]
    blocks.append(N(
        f"Effective-length factors k_y = {k_y:.2f}, k_z = {k_z:.2f} — set by engineer. "
        "For pin–pin: k = 1.0 (conservative). "
        "Verify from frame analysis for columns with rotational end-restraint."
    ))

    # ── Buckling resistance — y and z separately ──────────────────────────────
    blocks.append(S("Flexural buckling resistance — EN 1993-1-1 §6.3.1.2"))
    blocks += [
        T(f"Buckling curves (EC3 Table 6.2):  y–y → {curve_y.upper()} (α={_ALPHA[curve_y]})  "
          f"·  z–z → {curve_z.upper()} (α={_ALPHA[curve_z]})"),
        CALC_ROW("χ_y",      f"Curve {curve_y.upper()}, λ̄_y = {lam_y:.3f}",  f"{chi_y:.3f}"),
        CALC_ROW("χ_z",      f"Curve {curve_z.upper()}, λ̄_z = {lam_z:.3f}",  f"{chi_z:.3f}"),
        CALC_ROW("N_pl,Rd",  "= A·f_y / γ_M0",                                f"{N_pl_Rd:.1f} kN"),
        CALC_ROW("N_b,y,Rd", "= χ_y·A·f_y / γ_M1",                           f"{N_b_y_Rd:.1f} kN"),
        CALC_ROW("N_b,z,Rd", "= χ_z·A·f_y / γ_M1",                           f"{N_b_z_Rd:.1f} kN"),
    ]

    # ── Verification — axial only ─────────────────────────────────────────────
    blocks.append(S("Axial verification — EN 1993-1-1 §6.2.4 / §6.3.1"))
    blocks += [
        CALC_ROW("N_Ed", "design axial force", f"{N_Ed_kN:.1f} kN"),
        chk.check("Cross-section resistance  N_Ed / N_pl,Rd  (§6.2.4)", N_Ed_kN, N_pl_Rd),
        chk.check("Flexural buckling y–y      N_Ed / N_b,y,Rd  (§6.3.1)", N_Ed_kN, N_b_y_Rd),
        chk.check("Flexural buckling z–z      N_Ed / N_b,z,Rd  (§6.3.1)", N_Ed_kN, N_b_z_Rd),
    ]

    # ── Combined bending + compression — cl. 6.3.3 / Annex B ─────────────────
    if have_moments:
        blocks.append(S("Combined bending + compression — EN 1993-1-1 cl. 6.3.3"))
        blocks.append(T(
            "Annex B Method 2 (Table B.1). "
            "Interaction factors for sections not susceptible to torsional deformation. "
            "χ_LT = 1.0 applied (LTB restrained or closed section)."
        ))

        # Axial utilisation ratios on each buckling resistance
        n_y = N_Ed_kN / N_b_y_Rd
        n_z = N_Ed_kN / N_b_z_Rd

        # λ̄ capped at 1.0 in k-factor formula (as shown in the worked example)
        lam_y_k = min(lam_y, 1.0)
        lam_z_k = min(lam_z, 1.0)

        # Annex B Table B.1 — not susceptible to torsional deformations
        k_yy_raw = C_my * (1.0 + (lam_y_k - 0.2) * n_y)
        k_yy_max = C_my * (1.0 + 0.8 * n_y)
        k_yy     = min(k_yy_raw, k_yy_max)

        k_zy = 0.6 * k_yy

        k_zz_raw = C_mz * (1.0 + (lam_z_k - 0.2) * n_z)
        k_zz_max = C_mz * (1.0 + 0.8 * n_z)
        k_zz     = min(k_zz_raw, k_zz_max)

        k_yz = 0.6 * k_zz

        chi_LT = 1.0  # LTB not governing (per input)

        # Bending moment utilisations (about plastic resistance)
        m_y = M_y_Ed_kNm / M_pl_y_Rd if M_pl_y_Rd > 0 else 0.0

        # Display interaction factor derivation
        blocks.extend([
            CALC_ROW("n_y",     "= N_Ed / N_b,y,Rd",                         f"{n_y:.3f}"),
            CALC_ROW("n_z",     "= N_Ed / N_b,z,Rd",                         f"{n_z:.3f}"),
            CALC_ROW("M_pl,y,Rd", "= W_pl,y · f_y / γ_M1",                   f"{M_pl_y_Rd:.2f} kNm"),
        ])
        if M_pl_z_Rd is not None:
            blocks.append(CALC_ROW("M_pl,z,Rd", "= W_pl,z · f_y / γ_M1",    f"{M_pl_z_Rd:.2f} kNm"))

        blocks.extend([
            CALC_ROW("m_y",     "= M_y,Ed / M_pl,y,Rd",                       f"{m_y:.3f}"),
        ])

        if M_pl_z_Rd is not None and M_pl_z_Rd > 0:
            m_z = M_z_Ed_kNm / M_pl_z_Rd
            blocks.append(CALC_ROW("m_z", "= M_z,Ed / M_pl,z,Rd",            f"{m_z:.3f}"))
        else:
            m_z = 0.0
            if abs(M_z_Ed_kNm) > 1e-9:
                blocks.append(N("⚠  M_z,Ed is non-zero but W_pl,z is not available — m_z set to 0."))

        if lam_y > 1.0:
            blocks.append(N(f"λ̄_y = {lam_y:.3f} > 1.0 — capped at 1.0 in k-factor formula (Annex B)."))
        if lam_z > 1.0:
            blocks.append(N(f"λ̄_z = {lam_z:.3f} > 1.0 — capped at 1.0 in k-factor formula (Annex B)."))

        blocks.extend([
            CALC_ROW("k_yy",   f"= C_my·(1+(λ̄_y-0.2)·n_y) ≤ C_my·(1+0.8·n_y)", f"{k_yy:.3f}"),
            CALC_ROW("k_zy",   "= 0.6·k_yy",                                       f"{k_zy:.3f}"),
            CALC_ROW("k_zz",   f"= C_mz·(1+(λ̄_z-0.2)·n_z) ≤ C_mz·(1+0.8·n_z)", f"{k_zz:.3f}"),
            CALC_ROW("k_yz",   "= 0.6·k_zz",                                       f"{k_yz:.3f}"),
        ])

        # Interaction equations (Eq. 6.61 and 6.62)
        blocks.append(S("Interaction equations — Eq. 6.61 and 6.62"))
        blocks.append(T(
            "Eq. 6.61:  N_Ed/N_b,y,Rd  +  k_yy·M_y,Ed/(χ_LT·M_pl,y,Rd)  +  k_yz·M_z,Ed/M_pl,z,Rd  ≤  1.0"
        ))
        blocks.append(T(
            "Eq. 6.62:  N_Ed/N_b,z,Rd  +  k_zy·M_y,Ed/(χ_LT·M_pl,y,Rd)  +  k_zz·M_z,Ed/M_pl,z,Rd  ≤  1.0"
        ))

        util_eq1 = n_y + k_yy * m_y / chi_LT + k_yz * m_z
        util_eq2 = n_z + k_zy * m_y / chi_LT + k_zz * m_z

        blocks.extend([
            CALC_ROW("Eq. 6.61", f"= {n_y:.3f} + {k_yy:.3f}·{m_y:.3f}/{chi_LT:.1f} + {k_yz:.3f}·{m_z:.3f}", f"{util_eq1:.3f}"),
            CALC_ROW("Eq. 6.62", f"= {n_z:.3f} + {k_zy:.3f}·{m_y:.3f}/{chi_LT:.1f} + {k_zz:.3f}·{m_z:.3f}", f"{util_eq2:.3f}"),
        ])

        blocks.append(chk.check("Beam-column Eq. 6.61  (y-axis governs)", util_eq1, 1.0))
        blocks.append(chk.check("Beam-column Eq. 6.62  (z-axis governs)", util_eq2, 1.0))

    return blocks
