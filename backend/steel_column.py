"""
steel_column.py — EN 1993-1-1 §6.3.1 steel column compression + buckling check

All inputs plain SI multiples (mm, kN, MPa).
"""
import math
from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext

# Imperfection factors per EC3 Table 6.1
_ALPHA = {'a0': 0.13, 'a': 0.21, 'b': 0.34, 'c': 0.49, 'd': 0.76}

def _buckling_curve_hot_rolled(h_mm, b_mm, tf_mm):
    """
    Select buckling curves for hot-rolled I/H sections (EC3 Table 6.2).
    Returns (curve_y, curve_z) as strings: 'a0', 'a', 'b', 'c', 'd'
    """
    hb = h_mm / b_mm if b_mm > 0 else 1.0
    if tf_mm <= 40:
        if hb > 1.2:
            return 'a', 'b'   # IPE-like
        else:
            return 'b', 'c'   # HEA/HEB-like (squat section)
    elif tf_mm <= 100:
        if hb > 1.2:
            return 'b', 'c'
        else:
            return 'b', 'c'
    else:
        return 'd', 'd'


def _chi(lam_bar: float, curve: str) -> float:
    """Buckling reduction factor χ per EC3 §6.3.1.2, Eq. 6.49."""
    alpha = _ALPHA.get(curve.lower(), 0.34)
    phi   = 0.5 * (1.0 + alpha * (lam_bar - 0.2) + lam_bar ** 2)
    denom = phi + math.sqrt(max(phi ** 2 - lam_bar ** 2, 1e-12))
    return min(1.0 / denom, 1.0)


def steel_column_check(
    label: str,
    section: str,
    grade: str,
    length_m: float,      # buckling length [m]
    N_Ed_kN: float,       # design axial compression [kN]
    A_cm2: float,         # cross-section area [cm²]
    Iy_cm4: float,        # 2nd moment strong axis [cm⁴]
    Iz_cm4: float,        # 2nd moment weak axis [cm⁴]
    h_mm: float,
    b_mm: float,
    tf_mm: float,
    f_y_MPa: float = 355.0,
    gamma_M0: float = 1.0,
    gamma_M1: float = 1.0,
    k_y: float = 1.0,    # effective-length factor, y-y
    k_z: float = 1.0,    # effective-length factor, z-z
):
    """
    Returns a list of calc_core blocks for the column check.
    """
    chk = CheckContext()
    blocks = []

    E = 210_000.0   # MPa (steel)
    fy = f_y_MPa

    # Convert to mm units
    L    = length_m * 1_000.0   # mm
    A    = A_cm2    * 100.0     # mm²     (1 cm² = 100 mm²)
    Iy   = Iy_cm4   * 10_000.0  # mm⁴    (1 cm⁴ = 10⁴ mm⁴)
    Iz   = Iz_cm4   * 10_000.0  # mm⁴

    iy = math.sqrt(Iy / A)  # mm
    iz = math.sqrt(Iz / A)  # mm

    # Effective lengths
    L_cr_y = k_y * L  # mm
    L_cr_z = k_z * L  # mm

    # Reference slenderness λ₁
    lambda_1 = math.pi * math.sqrt(E / fy)

    # Non-dimensional slenderness
    lam_y = (L_cr_y / iy) / lambda_1
    lam_z = (L_cr_z / iz) / lambda_1

    # Buckling curves
    curve_y, curve_z = _buckling_curve_hot_rolled(h_mm, b_mm, tf_mm)
    chi_y = _chi(lam_y, curve_y)
    chi_z = _chi(lam_z, curve_z)
    chi   = min(chi_y, chi_z)

    # Resistances [kN]
    N_pl_Rd = A * fy / gamma_M0 / 1_000.0
    N_b_Rd  = chi * A * fy / gamma_M1 / 1_000.0

    # ── build output blocks ────────────────────────────────────────────────────
    blocks.append(MH(f"{label} — Steel Column  EC3 §6.3", f"{section} · {grade}  ·  L = {length_m:.2f} m", "steel"))

    blocks.append(S("Section properties"))
    blocks += [
        CALC_ROW("A",   "",  f"{A_cm2:.2f} cm²"),
        CALC_ROW("I_y", "",  f"{Iy_cm4:.1f} cm⁴"),
        CALC_ROW("I_z", "",  f"{Iz_cm4:.1f} cm⁴"),
        CALC_ROW("i_y", "= √(I_y / A)",  f"{iy:.1f} mm"),
        CALC_ROW("i_z", "= √(I_z / A)",  f"{iz:.1f} mm"),
        CALC_ROW("f_y", "",  f"{fy:.0f} MPa"),
    ]

    blocks.append(S("Slenderness  (EC3 §6.3.1.3)"))
    blocks += [
        CALC_ROW("λ₁",    "= π·√(E/f_y)",                             f"{lambda_1:.2f}"),
        CALC_ROW("L_cr,y", f"= k_y · L = {k_y:.2f} × {length_m:.2f} m",  f"{L_cr_y/1000:.2f} m"),
        CALC_ROW("L_cr,z", f"= k_z · L = {k_z:.2f} × {length_m:.2f} m",  f"{L_cr_z/1000:.2f} m"),
        CALC_ROW("λ̄_y",   "= (L_cr,y / i_y) / λ₁",                    f"{lam_y:.3f}"),
        CALC_ROW("λ̄_z",   "= (L_cr,z / i_z) / λ₁",                    f"{lam_z:.3f}"),
    ]
    blocks.append(N(
        f"Effective length factors: k_y = {k_y:.2f}, k_z = {k_z:.2f} — input by engineer. "
        "For pin-pin conditions k = 1.0 (conservative). "
        "Verify k from frame analysis for columns with rotational restraint at the ends."
    ))

    blocks.append(S("Buckling resistance  (EC3 §6.3.1.2)"))
    blocks += [
        T(f"Buckling curves (EC3 Table 6.2):  y–y → {curve_y.upper()}  (α={_ALPHA[curve_y]})  ·  z–z → {curve_z.upper()}  (α={_ALPHA[curve_z]})"),
        CALC_ROW("χ_y",     f"Curve {curve_y.upper()}, λ̄_y = {lam_y:.3f}", f"{chi_y:.3f}"),
        CALC_ROW("χ_z",     f"Curve {curve_z.upper()}, λ̄_z = {lam_z:.3f}", f"{chi_z:.3f}"),
        CALC_ROW("χ",       "= min(χ_y, χ_z)",                              f"{chi:.3f}"),
        CALC_ROW("N_pl,Rd", "= A · f_y / γ_M0",                             f"{N_pl_Rd:.1f} kN"),
        CALC_ROW("N_b,Rd",  "= χ · A · f_y / γ_M1",                        f"{N_b_Rd:.1f} kN"),
    ]

    blocks.append(S("Verification"))
    blocks += [
        CALC_ROW("N_Ed", "", f"{N_Ed_kN:.1f} kN"),
        chk.check("Cross-section resistance  N_Ed / N_pl,Rd  (EC3 §6.2.4)", N_Ed_kN, N_pl_Rd),
        chk.check("Flexural buckling         N_Ed / N_b,Rd   (EC3 §6.3.1)", N_Ed_kN, N_b_Rd),
    ]

    return blocks
