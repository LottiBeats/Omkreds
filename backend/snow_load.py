"""
snow_load.py — EN 1991-1-3 + DK NA snow load on roof

Computes characteristic snow load on roof from ground snow load,
roof geometry and exposure / thermal coefficients.

Reference: DS/EN 1991-1-3 + DS/EN 1991-1-3 DK NA
All inputs plain SI multiples (m, kN/m², degrees).
"""
import math
from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext

# ── DK NA ground snow load zones (DK NA Table NA.1) ──────────────────────────
_DK_SNOW_ZONES = {
    '1': {'s_k': 1.0, 'desc': 'Most of Denmark (default)'},
    '2': {'s_k': 0.9, 'desc': 'North Jutland coast (DK NA zone 2)'},
    '3': {'s_k': 1.5, 'desc': 'Elevated / hilly areas (DK NA zone 3)'},
}


def snow_load(
    label:          str   = "SN1",
    roof_type:      str   = "pitched",       # "flat" / "pitched" / "mono-pitch"
    alpha_deg:      float = 20.0,            # roof pitch angle [°]  (0 for flat)
    s_k_kNm2:       float = 1.0,            # ground snow load [kN/m²] (DK NA zone 1)
    dk_zone:        str   = "1",             # DK NA snow zone (1 / 2 / 3) if s_k not specified
    C_e:            float = 1.0,             # exposure coefficient (EC1-1-3 §5.2)
    C_t:            float = 1.0,             # thermal coefficient (EC1-1-3 §5.2)
    roof_span_m:    float = 8.0,             # horizontal span of roof [m]
    eave_height_m:  float = 3.0,            # height at eaves [m]
    gamma_s:        float = 1.5,             # snow partial factor (EC1-1-3 DK NA)
    a_m:            float = 0.0,             # rafter spacing [m] — if > 0, show per-rafter load
):
    """
    Returns a list of calc_core blocks for the snow load calculation.
    """
    blocks = []

    alpha = alpha_deg

    # ── Shape coefficient μ₁  (EC1-1-3 §5.3.1 & Table 5.2)
    if roof_type == "flat" or alpha <= 0.0:
        mu1 = 0.8
        shape_note = "Flat roof / α = 0° → μ₁ = 0.8"
    elif alpha <= 30.0:
        mu1 = 0.8
        shape_note = f"α = {alpha:.1f}° ≤ 30° → μ₁ = 0.8"
    elif alpha <= 60.0:
        mu1 = 0.8 * (60.0 - alpha) / 30.0
        shape_note = f"30° < α = {alpha:.1f}° ≤ 60° → μ₁ = 0.8·(60−α)/30"
    else:
        mu1 = 0.0
        shape_note = f"α = {alpha:.1f}° > 60° → μ₁ = 0 (snow slides off)"

    # μ₁ for mono-pitch / asymmetric is same formula applied to both slopes
    # (simplified — symmetric pitched roof assumed for μ₁)

    # ── Snow load on roof  (EC1-1-3 §5.2, Eq. 5.1)
    s = mu1 * C_e * C_t * s_k_kNm2      # kN/m²

    # ── Design value
    s_d = gamma_s * s                    # kN/m²

    # ── Ridge height (geometry)
    if alpha > 0 and roof_type in ("pitched", "mono-pitch"):
        half_span = roof_span_m / 2.0 if roof_type == "pitched" else roof_span_m
        ridge_h = eave_height_m + half_span * math.tan(math.radians(alpha))
    else:
        ridge_h = eave_height_m

    # ── Slope length (for area load)
    if alpha > 0 and roof_type in ("pitched", "mono-pitch"):
        half_span = roof_span_m / 2.0 if roof_type == "pitched" else roof_span_m
        slope_m = half_span / math.cos(math.radians(alpha))
    else:
        slope_m = roof_span_m / 2.0

    # ── output blocks ──────────────────────────────────────────────────────────
    blocks.append(MH(
        f"{label} — Snow Load  EN 1991-1-3 + DK NA",
        f"Roof type: {roof_type}  ·  α = {alpha:.1f}°  ·  s_k = {s_k_kNm2:.2f} kN/m²",
        "general",
    ))

    blocks.append(S("Ground snow load  (DK NA)"))
    zone_info = _DK_SNOW_ZONES.get(dk_zone, _DK_SNOW_ZONES['1'])
    blocks += [
        CALC_ROW("DK zone",  f"Zone {dk_zone}",          zone_info['desc']),
        CALC_ROW("s_k",      "Ground snow load (char.)", f"{s_k_kNm2:.2f} kN/m²"),
    ]

    blocks.append(S("Roof geometry"))
    blocks += [
        CALC_ROW("Roof type",      "",                      roof_type),
        CALC_ROW("α",              "Pitch angle",           f"{alpha:.1f}°"),
        CALC_ROW("Span",           "",                      f"{roof_span_m:.2f} m"),
        CALC_ROW("Eave height",    "",                      f"{eave_height_m:.2f} m"),
        CALC_ROW("Ridge height",   "(approx.)",             f"{ridge_h:.2f} m"),
        CALC_ROW("Slope length",   "(each side)",           f"{slope_m:.2f} m"),
    ]

    blocks.append(S("Shape coefficient  (EC1-1-3 §5.3, Table 5.2)"))
    blocks += [
        T(shape_note),
        CALC_ROW("μ₁", "Roof shape coefficient", f"{mu1:.3f}"),
    ]

    blocks.append(S("Snow load on roof  (EC1-1-3 §5.2, Eq. 5.1)"))
    blocks += [
        CALC_ROW("C_e",   "Exposure coefficient",        f"{C_e:.2f}"),
        CALC_ROW("C_t",   "Thermal coefficient",         f"{C_t:.2f}"),
        CALC_ROW("s",     "= μ₁ · C_e · C_t · s_k",    f"{s:.3f} kN/m²"),
        CALC_ROW("γ_s",   "Snow partial factor (DK NA)", f"{gamma_s:.2f}"),
        CALC_ROW("s_d",   "= γ_s · s  (design value)",  f"{s_d:.3f} kN/m²"),
    ]

    if mu1 == 0.0:
        blocks.append(N("Pitch > 60° — no snow accumulation assumed (μ₁ = 0). "
                        "Check local drifting provisions if adjacent to taller structure."))

    if a_m > 0:
        s_kNm = s * a_m
        blocks.append(S("Per-rafter load  (horizontal projection)"))
        blocks += [
            CALC_ROW("a",        "Rafter spacing",                     f"{a_m:.2f} m"),
            CALC_ROW("s_rafter", "= s · a  (projected, per rafter)",   f"{s_kNm:.3f} kN/m"),
        ]

    return blocks
