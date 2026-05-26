"""
rc_slab.py — EN 1992-1-1 one-way reinforced concrete slab check

Checks a 1 m wide strip of simply supported one-way slab:
  bending flexure  (§6.1)
  minimum / maximum reinforcement
  simplified deflection check (L/d limit, §7.4.2)

All inputs plain SI multiples (mm, kN/m², MPa).
"""
import math
from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext


def rc_slab_oneway(
    label: str          = "D1",
    span_m: float       = 5.0,      # [m]
    h_mm: float         = 200.0,    # slab thickness [mm]
    d_mm: float         = 165.0,    # effective depth [mm]
    g_k_kNm2: float     = 3.5,      # characteristic permanent load [kN/m²]
    q_k_kNm2: float     = 2.5,      # characteristic variable load [kN/m²]
    fck_MPa: float      = 30.0,
    fyk_MPa: float      = 500.0,
    As_prov_mm2m: float = None,     # provided reinforcement [mm²/m]  (None = use req.)
    gamma_C: float      = 1.5,
    gamma_S: float      = 1.15,
    cover_mm: float     = 35.0,     # nominal cover [mm]
):
    chk = CheckContext()
    blocks = []

    b = 1000.0   # 1 m design strip [mm]
    L = span_m * 1000.0  # mm

    # Material strengths
    fcd  = fck_MPa / gamma_C
    fyd  = fyk_MPa / gamma_S
    fctm = 0.30 * fck_MPa ** (2/3)    # EC2 Table 3.1 (fck ≤ C50/60)

    # Design loads on 1 m strip [kN/m]
    g_Ed = 1.35 * g_k_kNm2  # kN/m
    q_Ed = 1.50 * q_k_kNm2  # kN/m
    w_Ed = g_Ed + q_Ed       # kN/m

    # Design moment [kNm/m]  (simply supported)
    M_Ed = w_Ed * span_m**2 / 8.0

    # Bending — rectangular stress block (EC2 §6.1)
    # m = M_Ed / (b·d²·fcd) → compression depth x, then As,req
    m = M_Ed * 1e6 / (b * d_mm**2 * fcd)   # dimensionless
    if m >= 0.5:
        blocks.append(N(f"⚠ Section is over-reinforced (m = {m:.3f} ≥ 0.5). Increase depth or concrete class."))
        m = min(m, 0.499)

    x_d  = 1 - math.sqrt(1 - 2 * m)        # x/d
    z    = d_mm * (1 - 0.4 * x_d)           # lever arm [mm]
    As_req = M_Ed * 1e6 / (z * fyd)         # mm²/m

    # Minimum reinforcement (EC2 §9.3.1.1)
    As_min = max(0.26 * fctm / fyk_MPa, 0.0013) * b * d_mm  # mm²/m

    # Maximum reinforcement (EC2 §9.3.1.1) — 4% Ac
    As_max = 0.04 * b * h_mm

    As_design = max(As_req, As_min)

    if As_prov_mm2m is None:
        As_prov = As_design
    else:
        As_prov = As_prov_mm2m

    # Deflection check — simplified L/d (EC2 §7.4.2 Table 7.4N)
    # ρ = As_req / (b·d)
    rho_req = As_req / (b * d_mm)
    rho_0   = math.sqrt(fck_MPa) * 1e-3   # = √fck / 1000

    # Basic span-to-depth ratio (simply supported, lightly stressed)
    if rho_req <= rho_0:
        ld_basic = 11 + 1.5 * math.sqrt(fck_MPa) * rho_0 / rho_req + \
                   (3.2 * math.sqrt(fck_MPa) * (rho_0 / rho_req - 1)**1.5)
    else:
        ld_basic = 11 + 1.5 * math.sqrt(fck_MPa) * rho_0 / (rho_req - rho_0) + \
                   math.sqrt(fck_MPa) / 12.0 * math.sqrt(As_prov / As_req)

    # Modification for steel stress
    fyk_ref = 500.0
    mod_steel = 310.0 / (fyk_MPa * As_req / As_prov) if As_prov > 0 else 1.0
    ld_lim = ld_basic * mod_steel

    ld_actual = span_m * 1000.0 / d_mm

    # ── output blocks ──────────────────────────────────────────────────────────
    blocks.append(MH(f"{label} — One-way RC Slab  EC2 §6.1", f"L = {span_m:.2f} m  ·  h = {h_mm:.0f} mm  ·  C{fck_MPa:.0f}/{fyk_MPa:.0f}", "concrete"))

    blocks.append(S("Design parameters"))
    blocks.append(T(
        f"One-way simply supported RC slab, {h_mm:.0f} mm thick, effective depth d = {d_mm:.0f} mm.  "
        f"Concrete C{fck_MPa:.0f}, reinforcement f_yk = {fyk_MPa:.0f} MPa.  "
        f"Span = {span_m:.2f} m, nominal cover = {cover_mm:.0f} mm.  "
        f"Design on 1 m wide strip."
    ))
    blocks.extend([
        CALC_ROW("L",    "span",                             f"{span_m:.2f} m"),
        CALC_ROW("h",    "slab thickness",                   f"{h_mm:.0f} mm"),
        CALC_ROW("d",    "effective depth",                  f"{d_mm:.0f} mm"),
        CALC_ROW("c",    "nominal cover",                    f"{cover_mm:.0f} mm"),
        CALC_ROW("g_k",  "characteristic permanent load",    f"{g_k_kNm2:.2f} kN/m²"),
        CALC_ROW("q_k",  "characteristic variable load",     f"{q_k_kNm2:.2f} kN/m²"),
        CALC_ROW("f_ck", "char. concrete strength",          f"{fck_MPa:.0f} MPa"),
        CALC_ROW("f_yk", "char. steel yield strength",       f"{fyk_MPa:.0f} MPa"),
        CALC_ROW("γ_C",  "partial factor — concrete",        f"{gamma_C:.2f}"),
        CALC_ROW("γ_S",  "partial factor — steel",           f"{gamma_S:.2f}"),
    ])

    blocks.append(S("Loading  (1 m design strip)"))
    blocks += [
        CALC_ROW("g_Ed", "= 1.35 · g_k",        f"{g_Ed:.2f} kN/m"),
        CALC_ROW("q_Ed", "= 1.50 · q_k",         f"{q_Ed:.2f} kN/m"),
        CALC_ROW("w_Ed", "= g_Ed + q_Ed",         f"{w_Ed:.2f} kN/m"),
        CALC_ROW("M_Ed", "= w_Ed · L² / 8",       f"{M_Ed:.2f} kNm/m"),
    ]

    blocks.append(S("Material strengths"))
    blocks += [
        CALC_ROW("f_ck",  "",                f"{fck_MPa:.0f} MPa"),
        CALC_ROW("f_cd",  "= f_ck / γ_C",   f"{fcd:.2f} MPa"),
        CALC_ROW("f_yd",  "= f_yk / γ_S",   f"{fyd:.2f} MPa"),
        CALC_ROW("f_ctm", "= 0.30·f_ck^(2/3)", f"{fctm:.2f} MPa"),
    ]

    blocks.append(S("Bending reinforcement  (EC2 §6.1)"))
    blocks += [
        CALC_ROW("d",      "Effective depth",        f"{d_mm:.0f} mm"),
        CALC_ROW("m",      "M_Ed / (b·d²·f_cd)",    f"{m:.4f}"),
        CALC_ROW("z",      "= d·(1 − 0.4·x/d)",     f"{z:.1f} mm"),
        CALC_ROW("As,req", "= M_Ed / (z·f_yd)",      f"{As_req:.0f} mm²/m"),
        CALC_ROW("As,min", "EC2 §9.3.1.1",           f"{As_min:.0f} mm²/m"),
        CALC_ROW("As,max", "= 0.04·Ac",              f"{As_max:.0f} mm²/m"),
        CALC_ROW("As,prov","",                        f"{As_prov:.0f} mm²/m"),
    ]
    blocks.append(chk.check("Bending: As,prov ≥ As,req  (EC2 §6.1)", As_req, As_prov))
    blocks.append(chk.check("Min. reinforcement: As,prov ≥ As,min  (EC2 §9.3.1.1)", As_min, As_prov))

    blocks.append(S("Deflection check  (EC2 §7.4.2)"))
    blocks += [
        CALC_ROW("ρ_req",  "= As,req / (b·d)",  f"{rho_req*1000:.2f} ‰"),
        CALC_ROW("ρ₀",     "= √f_ck / 1000",    f"{rho_0*1000:.2f} ‰"),
        CALC_ROW("(L/d)_lim", "Basic + steel mod.", f"{ld_lim:.1f}"),
        CALC_ROW("(L/d)_act", "= L / d",            f"{ld_actual:.1f}"),
    ]
    blocks.append(chk.check("Deflection: (L/d)_act ≤ (L/d)_lim  (EC2 §7.4.2)", ld_actual, ld_lim))

    return blocks
