"""
bolt_connection.py — EC3 §6.5 / §6.6 bolted and welded connection checks

Covers:
  • Shear bolt group    — bolt shear + bearing per bolt, group resistance
  • Fillet weld         — throat stress check per EC3 §6.2.3(3)
"""
import math
from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext

# ── Bolt data ───────────��──────────────────────────────────���──────────────────

# Ultimate tensile strength f_ub [MPa] per bolt class
F_UB = {
    '4.6':  400.0,
    '5.6':  500.0,
    '6.8':  600.0,
    '8.8':  800.0,
    '10.9': 1000.0,
}

# Gross (shank) area A [mm²] for standard metric bolts
# A = π·d²/4  — computed below from diameter
# Tensile stress area A_s [mm²] — standard values
AS = {
    10:  58.0,
    12:  84.3,
    14: 115.0,
    16: 157.0,
    20: 245.0,
    22: 303.0,
    24: 353.0,
    27: 459.0,
    30: 561.0,
    36: 817.0,
}

# Correlation factor β_w for fillet welds (EN 1993-1-8 Table 4.1)
BETA_W = {
    'S235': 0.80,
    'S275': 0.85,
    'S355': 0.90,
    'S420': 1.00,
    'S460': 1.00,
}


# ── Bolt shear + bearing ─────────────────────────────���─────────────────────���───

def bolt_group_shear(
    label: str,
    n_bolts:      int,
    bolt_class:   str,
    d_mm:         float,
    shear_plane:  str,    # 'thread' or 'shank'
    n_shear_planes: int,  # number of shear planes per bolt (usually 1 or 2)
    # Plate geometry (for bearing)
    t_plate_mm:   float,
    f_u_plate_MPa: float,
    e1_mm:        float,  # end distance in load direction
    e2_mm:        float,  # edge distance perpendicular to load
    p1_mm:        float,  # bolt spacing in load direction (0 if single row)
    # Design action (total on group)
    V_Ed_kN:      float,
    # Partial factors
    gamma_M2: float = 1.25,
) -> list:
    """
    Returns a list of calc_core blocks.
    Design shear force V_Ed is taken as the total on the bolt group.
    """
    chk    = CheckContext()
    blocks = []

    f_ub = F_UB.get(bolt_class.strip(), 800.0)
    A_s  = AS.get(int(d_mm), math.pi * d_mm**2 / 4.0)    # tensile stress area
    A_sh = math.pi * d_mm**2 / 4.0                        # gross shank area

    # α_v: shear reduction factor (EC3-1-8 Table 3.4)
    alpha_v = 0.5 if shear_plane == 'thread' else 0.6
    A_use   = A_s  if shear_plane == 'thread' else A_sh

    # Single-bolt shear resistance [kN]
    F_v_Rd = n_shear_planes * alpha_v * f_ub * A_use / gamma_M2 / 1_000.0

    # Bearing resistance per bolt (governing bolt — smallest e₁, e₂)
    # α_b = min(e₁/(3d), f_ub/f_u,plate, 1.0)
    alpha_b = min(e1_mm / (3.0 * d_mm), f_ub / f_u_plate_MPa, 1.0)
    # k₁ = min(2.8·e₂/d₀ - 1.7, 2.5)  where d₀ = d + 1–2 mm
    d0 = d_mm + (2.0 if d_mm >= 22 else 1.0)
    k1 = min(2.8 * e2_mm / d0 - 1.7, 2.5)
    k1 = max(k1, 0.0)
    F_b_Rd = k1 * alpha_b * f_u_plate_MPa * d_mm * t_plate_mm / gamma_M2 / 1_000.0

    # Governing single-bolt resistance
    F_Rd_single = min(F_v_Rd, F_b_Rd)

    # Group resistance
    F_Rd_group = n_bolts * F_Rd_single

    # Utilization
    V_Ed_per_bolt = V_Ed_kN / n_bolts

    # ── Output ─────────────────��────────────────────────────��─────────────────
    blocks.append(MH(
        f"{label} — Bolt Group Shear  EC3 §6.5",
        f"{n_bolts}×M{int(d_mm)} {bolt_class}  ·  V_Ed = {V_Ed_kN:.1f} kN",
        "steel",
    ))

    blocks.append(S("Bolt data"))
    blocks += [
        CALC_ROW("Bolt class",    "",                f"{bolt_class}"),
        CALC_ROW("Diameter d",    "",                f"{d_mm:.0f} mm"),
        CALC_ROW("f_ub",          "",                f"{f_ub:.0f} MPa"),
        CALC_ROW("A_s",           "(stress area)",   f"{A_s:.1f} mm²"),
        CALC_ROW("A_sh",          "(shank area)",    f"{A_sh:.1f} mm²"),
        CALC_ROW("Area used",     f"({shear_plane} plane)", f"{A_use:.1f} mm²"),
        CALC_ROW("α_v",           "",                f"{alpha_v:.1f}"),
        CALC_ROW("n shear planes","",                f"{n_shear_planes}"),
    ]

    blocks.append(S("Single-bolt resistances  (EC3-1-8 Table 3.4)"))
    blocks += [
        CALC_ROW("F_v,Rd",  "= n·α_v·f_ub·A / γ_M2",
                             f"{F_v_Rd:.2f} kN"),
        CALC_ROW("α_b",     "= min(e₁/3d, f_ub/f_u,p, 1)",
                             f"{alpha_b:.3f}"),
        CALC_ROW("k₁",      "= min(2.8·e₂/d₀ − 1.7, 2.5)",
                             f"{k1:.3f}"),
        CALC_ROW("F_b,Rd",  "= k₁·α_b·f_u,p·d·t / γ_M2",
                             f"{F_b_Rd:.2f} kN"),
        CALC_ROW("F_Rd",    "= min(F_v,Rd, F_b,Rd)",
                             f"{F_Rd_single:.2f} kN  ← governs"),
    ]

    blocks.append(S("Group verification"))
    blocks += [
        CALC_ROW("n bolts",     "",               f"{n_bolts}"),
        CALC_ROW("F_Rd,group",  "= n · F_Rd",    f"{F_Rd_group:.2f} kN"),
        CALC_ROW("V_Ed",        "",               f"{V_Ed_kN:.2f} kN"),
        CALC_ROW("V_Ed/bolt",   "",               f"{V_Ed_per_bolt:.2f} kN"),
    ]
    blocks.append(chk.check(
        "Bolt group shear  V_Ed ≤ F_Rd,group  (EC3-1-8 §3.6)",
        V_Ed_kN, F_Rd_group,
    ))

    return blocks


# ── Fillet weld ───────────────────────────────���────────────────────────────────

def fillet_weld_check(
    label: str,
    a_mm:  float,    # effective throat thickness [mm]
    L_mm:  float,    # total effective weld length [mm]
    F_Ed_kN: float,  # design resultant force on weld [kN]
    steel_grade: str = 'S355',
    # Optional explicit f_u; overrides grade lookup if provided
    f_u_MPa: float | None = None,
    gamma_M2: float = 1.25,
) -> list:
    """
    Directional method per EC3-1-8 §4.5.3.
    Simplified: uniform stress over throat area (conservative).
    """
    chk    = CheckContext()
    blocks = []

    if f_u_MPa is None:
        # Approximate f_u from grade name
        grade_fup = {'S235': 360, 'S275': 430, 'S355': 510,
                     'S420': 520, 'S460': 550}
        f_u = float(grade_fup.get(steel_grade.strip().upper(), 510))
    else:
        f_u = f_u_MPa

    beta_w = BETA_W.get(steel_grade.strip().upper(), 0.9)

    # Effective weld area [mm²]
    A_w = a_mm * L_mm

    # Design resistance per mm² (simplified method)
    # f_vw,d = f_u / (√3 · β_w · γ_M2)
    f_vw_d = f_u / (math.sqrt(3.0) * beta_w * gamma_M2)   # MPa

    # Total weld resistance [kN]
    F_w_Rd = f_vw_d * A_w / 1_000.0

    # Force per unit length [kN/mm]
    F_Ed_per_mm  = F_Ed_kN / L_mm
    F_Rd_per_mm  = f_vw_d * a_mm / 1_000.0

    # ── Output ──────��─────────────────────────────────────────────────────────
    blocks.append(MH(
        f"{label} — Fillet Weld  EC3 §6.2.3",
        f"a = {a_mm:.1f} mm  ·  L = {L_mm:.0f} mm  ·  {steel_grade}",
        "steel",
    ))

    blocks.append(S("Weld properties"))
    blocks += [
        CALC_ROW("Grade",  "",                  f"{steel_grade}"),
        CALC_ROW("f_u",    "",                  f"{f_u:.0f} MPa"),
        CALC_ROW("β_w",    "(EC3-1-8 Table 4.1)", f"{beta_w:.2f}"),
        CALC_ROW("a",      "throat thickness",  f"{a_mm:.1f} mm"),
        CALC_ROW("L",      "effective length",  f"{L_mm:.0f} mm"),
        CALC_ROW("A_w",    "= a · L",           f"{A_w:.0f} mm²"),
    ]

    blocks.append(S("Verification  (EC3-1-8 §4.5.3 simplified)"))
    blocks += [
        CALC_ROW("f_vw,d",      "= f_u / (√3 · β_w · γ_M2)",
                                 f"{f_vw_d:.1f} MPa"),
        CALC_ROW("F_w,Rd",      "= f_vw,d · A_w",
                                 f"{F_w_Rd:.2f} kN"),
        CALC_ROW("F_Ed",        "",
                                 f"{F_Ed_kN:.2f} kN"),
        CALC_ROW("F_Ed/mm",     "",
                                 f"{F_Ed_per_mm:.3f} kN/mm"),
        CALC_ROW("F_Rd/mm",     "= f_vw,d · a",
                                 f"{F_Rd_per_mm:.3f} kN/mm"),
    ]
    blocks.append(chk.check(
        "Weld resistance  F_Ed ≤ F_w,Rd  (EC3-1-8 §4.5.3)",
        F_Ed_kN, F_w_Rd,
    ))

    return blocks
