"""
wind_load.py — EN 1991-1-4 + DK NA wind load calculation

Computes peak velocity pressure q_p(z) and indicative wall pressures
for a rectangular building.

Reference: DS/EN 1991-1-4 + DS/EN 1991-1-4 DK NA (2007)
All inputs plain SI multiples (m, m/s, kN/m²).
"""
import math
from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext


# ── Terrain category parameters (EC1-1-4 Table 4.1) ──────────────────────────
_TERRAIN = {
    'I':   {'z0': 0.01, 'z_min': 1.0,  'label': 'Sea / open water'},
    'II':  {'z0': 0.05, 'z_min': 2.0,  'label': 'Open terrain (fields, grassland)'},
    'III': {'z0': 0.30, 'z_min': 5.0,  'label': 'Suburban / forest'},
    'IV':  {'z0': 1.00, 'z_min': 10.0, 'label': 'Urban / city centres'},
}

# Reference terrain for kr formula: category II, z0,II = 0.05 m
_Z0_II = 0.05


def wind_load(
    label:             str   = "W1",
    terrain_category:  str   = "II",        # I / II / III / IV
    v_b0_ms:           float = 24.0,        # basic wind speed [m/s] (DK zone 1)
    z_ref_m:           float = 8.0,         # reference height for q_p [m]
    h_m:               float = 8.0,         # building height [m]
    b_m:               float = 10.0,        # building breadth (crosswind) [m]
    d_m:               float = 12.0,        # building depth (along-wind) [m]
    c_dir:             float = 1.0,         # directional factor (DK NA: 1.0)
    c_season:          float = 1.0,         # season factor (DK NA: 1.0)
    c_pe_windward:     float = 0.8,         # external pressure coeff windward wall
    c_pe_leeward:      float = -0.5,        # external pressure coeff leeward wall
    c_pi:              float = 0.2,         # internal pressure coeff (positive)
    rho_air:           float = 1.25,        # air density [kg/m³]
):
    """
    Returns a list of calc_core blocks for the wind load check.
    """
    chk = CheckContext()
    blocks = []

    tc = terrain_category.upper()
    if tc not in _TERRAIN:
        tc = 'II'
    ter = _TERRAIN[tc]
    z0    = ter['z0']
    z_min = ter['z_min']

    # ── Fundamental basic wind velocity (EC1-1-4 §4.2)
    v_b = c_dir * c_season * v_b0_ms        # m/s

    # ── Basic velocity pressure
    q_b = 0.5 * rho_air * v_b**2 / 1000.0  # kN/m²

    # ── Roughness factor c_r(z)  (EC1-1-4 §4.3.2)
    z = max(z_ref_m, z_min)
    kr = 0.19 * (z0 / _Z0_II) ** 0.07      # terrain factor
    c_r = kr * math.log(z / z0)            # roughness factor at z

    # ── Turbulence intensity I_v(z)  (EC1-1-4 §4.4)
    c0 = 1.0  # orography factor (flat terrain)
    I_v = 1.0 / (c0 * math.log(z / z0))   # = kI/(c0·ln(z/z0)); kI=1.0

    # ── Mean wind velocity
    v_m = c_r * c0 * v_b                   # m/s

    # ── Peak velocity pressure q_p(z)  (EC1-1-4 §4.5)
    q_p = (1.0 + 7.0 * I_v) * 0.5 * rho_air * v_m**2 / 1000.0  # kN/m²

    # ── Exposure factor c_e (ratio to q_b)
    c_e = q_p / q_b if q_b > 0 else 0.0

    # ── Wall net pressures [kN/m²]
    w_windward = c_pe_windward * q_p - c_pi * q_p   # external - internal
    w_leeward  = c_pe_leeward  * q_p + c_pi * q_p   # external (suction) + internal suction
    w_net_total = (c_pe_windward - c_pe_leeward) * q_p  # simplified total horizontal pressure

    # ── h/d ratio (for reference)
    hd = h_m / d_m if d_m > 0 else 1.0

    # ── output blocks ──────────────────────────────────────────────────────────
    blocks.append(MH(
        f"{label} — Wind Load  EN 1991-1-4 + DK NA",
        f"Terrain {tc}: {ter['label']}  ·  v_b0 = {v_b0_ms:.1f} m/s  ·  z_ref = {z_ref_m:.1f} m",
        "general",
    ))

    blocks.append(S("Site parameters"))
    blocks += [
        CALC_ROW("Terrain cat.",    tc,                           ter['label']),
        CALC_ROW("z₀",             "Roughness length",           f"{z0:.3f} m"),
        CALC_ROW("z_min",          "Min. height EC1 Table 4.1",  f"{z_min:.1f} m"),
        CALC_ROW("v_b,0",          "Basic wind speed (DK NA)",   f"{v_b0_ms:.1f} m/s"),
        CALC_ROW("c_dir",          "Directional factor",         f"{c_dir:.2f}"),
        CALC_ROW("c_season",       "Season factor",              f"{c_season:.2f}"),
        CALC_ROW("v_b",            "= c_dir · c_season · v_b,0", f"{v_b:.2f} m/s"),
        CALC_ROW("q_b",            "= 0.5·ρ·v_b²",              f"{q_b:.3f} kN/m²"),
    ]

    blocks.append(S("Roughness & turbulence  (EC1-1-4 §4.3–4.5)"))
    blocks += [
        CALC_ROW("z",      f"= max(z_ref, z_min) = {z:.1f} m",    f"{z:.1f} m"),
        CALC_ROW("k_r",    "= 0.19·(z₀/z₀,II)^0.07",            f"{kr:.4f}"),
        CALC_ROW("c_r(z)", "= k_r · ln(z/z₀)",                   f"{c_r:.4f}"),
        CALC_ROW("I_v(z)", "= 1/(c₀·ln(z/z₀))",                  f"{I_v:.4f}"),
        CALC_ROW("v_m(z)", "= c_r · c₀ · v_b",                   f"{v_m:.2f} m/s"),
    ]

    blocks.append(S("Peak velocity pressure  (EC1-1-4 §4.5)"))
    blocks += [
        CALC_ROW("q_p(z)", "= (1 + 7·I_v) · 0.5·ρ·v_m²",       f"{q_p:.3f} kN/m²"),
        CALC_ROW("c_e(z)", "= q_p / q_b",                         f"{c_e:.2f}"),
    ]

    blocks.append(S("Building geometry"))
    blocks += [
        CALC_ROW("h",   "Building height",             f"{h_m:.2f} m"),
        CALC_ROW("b",   "Breadth (crosswind)",         f"{b_m:.2f} m"),
        CALC_ROW("d",   "Depth (along wind)",          f"{d_m:.2f} m"),
        CALC_ROW("h/d", "Height / depth ratio",        f"{hd:.2f}"),
    ]

    blocks.append(S("Wall pressures  (EC1-1-4 §7.2)"))
    blocks += [
        CALC_ROW("c_pe,ww",   "Windward wall",          f"{c_pe_windward:+.2f}"),
        CALC_ROW("c_pe,lw",   "Leeward wall",           f"{c_pe_leeward:+.2f}"),
        CALC_ROW("c_pi",      "Internal pressure",      f"{c_pi:+.2f}"),
        T("Net wall pressure: w = c_pe · q_p − c_pi · q_p  (positive = pressure inward)"),
        CALC_ROW("w_windward", "= (c_pe,ww − c_pi) · q_p",
                 f"{w_windward:.3f} kN/m²"),
        CALC_ROW("w_leeward",  "= (c_pe,lw + c_pi) · q_p",
                 f"{w_leeward:.3f} kN/m²"),
        CALC_ROW("w_net,total","= (c_pe,ww − c_pe,lw) · q_p  (total horiz.)",
                 f"{w_net_total:.3f} kN/m²"),
    ]

    return blocks
