"""
steel_column.py — EN 1993-1-1 steel column / beam-column check

Checks:
  §5.5.2 / Table 5.2   Cross-section classification (Class 1–4)
  §6.2.4               Cross-section compression resistance
  §6.2.1(7)            Conservative combined cross-section resistance (N + M_y + M_z)
  §6.3.1               Flexural buckling (y-y and z-z)
  §6.3.2.2             Lateral-torsional buckling (when ltb_restrained=False)
  §6.3.3               Combined bending + compression, Annex B Method 2
                         — Table B.1 (restrained) or Table B.2 (unrestrained)

All inputs are plain Python scalars (mm, kN, MPa, kNm).
"""
import math

from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext
from steel_ec3 import BUCKLING_ALPHA, buckling_curve_hot_rolled, chi_flexural, chi_ltb, ltb_curve_hot_rolled

_ALPHA = BUCKLING_ALPHA


def _buckling_curve_hot_rolled(h_mm, b_mm, tf_mm):
    return buckling_curve_hot_rolled(h_mm, b_mm, tf_mm)


def _chi(lam_bar: float, curve: str) -> float:
    return chi_flexural(lam_bar, curve)


# ── Section classification — EC3 §5.5.2 / Table 5.2 ─────────────────────────

def _classify(h_mm, b_mm, tf_mm, tw_mm, r_mm, fy, N_Ed_kN):
    """
    Classify hot-rolled I/H cross-section under combined bending and compression.

    Returns
    -------
    (overall_class, fl_class, web_class, alpha, cf_t, cw_t, eps)
        overall_class : governing section class (1–4)
        fl_class      : flange class
        web_class     : web class
        alpha         : compression zone proportion α (EC3 Table 5.2)
        cf_t, cw_t    : actual flange and web slenderness ratios
        eps           : ε = √(235 / f_y)
    """
    eps = math.sqrt(235.0 / fy)

    # ── Outstand compression flange (Table 5.2 sheet 2 of 3) ─────────────────
    c_f = (b_mm - tw_mm - 2.0 * r_mm) / 2.0
    cf_t = c_f / tf_mm
    if   cf_t <= 9  * eps: fl_cls = 1
    elif cf_t <= 10 * eps: fl_cls = 2
    elif cf_t <= 14 * eps: fl_cls = 3
    else:                  fl_cls = 4

    # ── Web under combined bending + compression (Table 5.2 sheet 1 of 3) ────
    c_w = h_mm - 2.0 * tf_mm - 2.0 * r_mm
    # α = proportion of c_w in compression (EC3 Table 5.2 footnote)
    # Accounts for both moment and axial force contributions.
    N_Ed_N = N_Ed_kN * 1_000.0
    alpha_raw = (h_mm / 2.0 - (tf_mm + r_mm) + 0.5 * N_Ed_N / (tw_mm * fy)) / c_w
    alpha = max(0.01, alpha_raw)

    cw_t = c_w / tw_mm

    # Cap α at 1.0 for the Class 1/2 formulas (valid for 0.5 ≤ α ≤ 1;
    # α > 1 → entire web compressed → formulas converge to pure-compression limits)
    alpha_c = min(alpha, 1.0)

    if alpha >= 0.5:
        lim_w1 = 396 * eps / (13 * alpha_c - 1)
        lim_w2 = 456 * eps / (13 * alpha_c - 1)
        # ψ = stress ratio (bottom / top of web); for 0.5 ≤ α ≤ 1: ψ ∈ [-1, 0]
        # For α > 1 (fully compressed web): ψ = 1 − 1/α → approaches 1 (pure compression)
        psi = 1.0 - 1.0 / alpha_c
        denom = 0.67 + 0.33 * psi
        lim_w3 = (42 * eps / denom) if denom > 1e-6 else 99999.0
    else:
        # Tension-dominant (unusual for columns)
        lim_w1 = 36   * eps / alpha
        lim_w2 = 41.5 * eps / alpha
        lim_w3 = 62   * eps  # conservative (≈ value at α = 0.5, pure bending)

    if   cw_t <= lim_w1: web_cls = 1
    elif cw_t <= lim_w2: web_cls = 2
    elif cw_t <= lim_w3: web_cls = 3
    else:                web_cls = 4

    return max(fl_cls, web_cls), fl_cls, web_cls, alpha_raw, cf_t, cw_t, eps


# ── Elastic critical moment for LTB — EC3 §6.3.2 ────────────────────────────

def _M_cr_kNm(E_MPa, G_MPa, L_mm, Iz_mm4, It_mm4, Iw_mm6, C1=1.0):
    """
    M_cr = C₁ · (π/L) · √(E·Iz·G·It + (π/L)²·E²·Iz·Iw)  [kNm]
    Two-term formula (no load-height or monosymmetry terms).
    """
    pi_L = math.pi / L_mm
    under = (E_MPa * Iz_mm4 * G_MPa * It_mm4
             + pi_L**2 * E_MPa**2 * Iz_mm4 * Iw_mm6)
    return C1 * pi_L * math.sqrt(max(under, 0.0)) / 1_000_000.0   # N·mm → kNm


# ── Annex B interaction factors — Table B.1 / B.2 ───────────────────────────

def _k_factors(lam_y, lam_z, n_y, n_z, C_my, C_mz, C_mLT, susceptible):
    """
    Annex B Table B.1 (not susceptible, ltb_restrained=True) or
               Table B.2 (susceptible to torsion,  ltb_restrained=False).
    """
    # k_yy — same for both tables
    k_yy = C_my * (1.0 + (min(lam_y, 1.0) - 0.2) * n_y)
    k_yy = min(k_yy, C_my * (1.0 + 0.8 * n_y))

    # k_zz — same for both tables (EC3 Annex B)
    k_zz = C_mz * (1.0 + (2.0 * min(lam_z, 1.0) - 0.6) * n_z)
    k_zz = min(k_zz, C_mz * (1.0 + 1.4 * n_z))

    k_yz = 0.6 * k_zz   # same for both tables

    if not susceptible:
        # Table B.1 — not susceptible (fully restrained against lateral buckling)
        k_zy = 0.8 * k_yy
    else:
        # Table B.2 — susceptible (unrestrained I/H sections)
        CmLT_s = max(C_mLT, 0.26)    # prevent division by near-zero
        k_zy_full = 1.0 - 0.1 * lam_z / (CmLT_s - 0.25) * n_z
        k_zy_min  = 1.0 - 0.1        / (CmLT_s - 0.25) * n_z
        if lam_z < 0.4:
            k_zy = min(0.6 + lam_z, k_zy_full)
        else:
            k_zy = k_zy_full
        k_zy = max(k_zy, k_zy_min)

    return k_yy, k_yz, k_zy, k_zz


# ── Main check ────────────────────────────────────────────────────────────────

def steel_column_check(
    label: str,
    section: str,
    grade: str,
    length_m: float,          # column length [m]
    N_Ed_kN: float,           # design axial compression [kN]
    A_cm2: float,             # gross area [cm²]
    Iy_cm4: float,            # 2nd moment — strong axis [cm⁴]
    Iz_cm4: float,            # 2nd moment — weak axis  [cm⁴]
    h_mm: float,
    b_mm: float,
    tf_mm: float,
    tw_mm: float = None,      # web thickness (needed for classification and W_pl,z)
    r_mm: float = 0.0,        # root radius [mm] (for classification; 0 = conservative)
    W_pl_y_cm3: float = None, # plastic modulus y [cm³] — auto-derived if None
    W_pl_z_cm3: float = None, # plastic modulus z [cm³]
    W_el_y_cm3: float = None, # elastic modulus y (required for Class 3; §6.2.1(7))
    W_el_z_cm3: float = None, # elastic modulus z
    M_y_Ed_kNm: float = 0.0,  # design moment — strong axis [kNm]
    M_z_Ed_kNm: float = 0.0,  # design moment — weak axis  [kNm]
    C_my: float = 1.0,        # equiv. uniform moment factor y (Annex B Table B.3)
    C_mz: float = 1.0,        # equiv. uniform moment factor z
    C_mLT: float = 1.0,       # equiv. moment factor for LTB interaction
    ltb_restrained: bool = True,  # True → χ_LT = 1.0 (no LTB reduction)
    I_T_cm4: float = None,    # St. Venant torsion constant (required for LTB)
    I_w_cm6: float = None,    # warping constant            (required for LTB)
    L_LTB_m: float = None,    # unbraced LTB length [m] (default: k_z·L)
    C_1: float = 1.0,         # moment gradient factor for M_cr (Table 6.4)
    f_y_MPa: float = 355.0,
    gamma_M0: float = 1.0,
    gamma_M1: float = 1.0,
    k_y: float = 1.0,         # effective-length factor y-y
    k_z: float = 1.0,         # effective-length factor z-z
):
    """Returns a list of calc_core blocks for the column / beam-column check."""
    chk = CheckContext()
    blocks = []

    E  = 210_000.0   # MPa
    G  =  81_000.0   # MPa
    fy = f_y_MPa

    # ── Convert to consistent mm / kN units ──────────────────────────────────
    L    = length_m * 1_000.0    # mm
    A    = A_cm2    * 100.0      # mm²
    Iy   = Iy_cm4   * 10_000.0   # mm⁴
    Iz   = Iz_cm4   * 10_000.0   # mm⁴

    iy = math.sqrt(Iy / A)       # mm
    iz = math.sqrt(Iz / A)       # mm

    L_cr_y = k_y * L
    L_cr_z = k_z * L
    L_LTB  = (L_LTB_m * 1_000.0) if L_LTB_m is not None else L_cr_z

    lambda_1 = math.pi * math.sqrt(E / fy)

    lam_y = (L_cr_y / iy) / lambda_1
    lam_z = (L_cr_z / iz) / lambda_1

    curve_y, curve_z = _buckling_curve_hot_rolled(h_mm, b_mm, tf_mm)
    chi_y = _chi(lam_y, curve_y)
    chi_z = _chi(lam_z, curve_z)

    N_pl_Rd  = A * fy / gamma_M0 / 1_000.0      # kN
    N_b_y_Rd = chi_y * A * fy / gamma_M1 / 1_000.0
    N_b_z_Rd = chi_z * A * fy / gamma_M1 / 1_000.0

    # ── Section classification ────────────────────────────────────────────────
    section_class = None
    fl_class = web_class = None
    alpha_cls = cf_t = cw_t = eps = None
    if tw_mm is not None:
        (section_class, fl_class, web_class,
         alpha_cls, cf_t, cw_t, eps) = _classify(
            h_mm, b_mm, tf_mm, tw_mm, r_mm, fy, N_Ed_kN)

    # ── Plastic / elastic section moduli ─────────────────────────────────────
    if W_pl_y_cm3 is not None:
        W_pl_y = W_pl_y_cm3
    else:
        W_el_y_approx = Iy_cm4 / (h_mm / 2.0 / 10.0)
        W_pl_y = W_el_y_approx * 1.15
        W_pl_y_cm3 = W_pl_y

    if W_pl_z_cm3 is not None:
        W_pl_z = W_pl_z_cm3
    elif tw_mm is not None:
        b_c  = b_mm / 10.0; tf_c = tf_mm / 10.0
        tw_c = tw_mm / 10.0; hw_c = (h_mm - 2 * tf_mm) / 10.0
        W_pl_z = b_c**2 * tf_c / 2.0 + tw_c**2 * hw_c / 4.0
        W_pl_z_cm3 = W_pl_z
    else:
        W_pl_z = None

    # Use elastic modulus for Class 3; warn about Class 4
    use_elastic_y = (section_class == 3 and W_el_y_cm3 is not None)
    use_elastic_z = (section_class == 3 and W_el_z_cm3 is not None)
    W_bnd_y = W_el_y_cm3 if use_elastic_y else W_pl_y
    W_bnd_z = W_el_z_cm3 if use_elastic_z else W_pl_z

    # Bending resistances [kNm]   cm³ × MPa / 1000 = kNm
    M_pl_y_Rd = W_bnd_y * fy / gamma_M1 / 1_000.0
    M_pl_z_Rd = (W_bnd_z * fy / gamma_M1 / 1_000.0) if W_bnd_z is not None else None

    have_moments = abs(M_y_Ed_kNm) > 1e-9 or abs(M_z_Ed_kNm) > 1e-9

    # ── LTB ──────────────────────────────────────────────────────────────────
    chi_LT  = 1.0
    lam_LT  = 0.0
    M_cr_kNm = None

    if not ltb_restrained and abs(M_y_Ed_kNm) > 1e-9:
        if I_T_cm4 is None or I_w_cm6 is None:
            raise ValueError(
                "I_T_cm4 and I_w_cm6 must be provided when ltb_restrained=False."
            )
        It_mm4 = I_T_cm4 * 10_000.0
        Iw_mm6 = I_w_cm6 * 1_000_000.0
        M_cr_kNm = _M_cr_kNm(E, G, L_LTB, Iz, It_mm4, Iw_mm6, C_1)
        W_y_ltb  = W_bnd_y * 1_000.0   # cm³ → mm³
        f_y_Nmm  = fy                    # MPa = N/mm²
        # Characteristic moment resistance for λ̄_LT: W_y · f_y [N·mm] / 10⁶ = kNm
        My_Rk_kNm = W_y_ltb * f_y_Nmm / 1_000_000.0
        lam_LT   = math.sqrt(My_Rk_kNm / M_cr_kNm) if M_cr_kNm > 0 else 99.9
        ltb_curve = ltb_curve_hot_rolled(h_mm, b_mm)
        chi_LT   = chi_ltb(lam_LT, ltb_curve)

    # ── Interaction factors ───────────────────────────────────────────────────
    susceptible = not ltb_restrained
    n_y = N_Ed_kN / N_b_y_Rd
    n_z = N_Ed_kN / N_b_z_Rd
    k_yy, k_yz, k_zy, k_zz = _k_factors(
        lam_y, lam_z, n_y, n_z, C_my, C_mz, C_mLT, susceptible)

    # ── Header ───────────────────────────────────────────────────────────────
    blocks.append(MH(
        f"Steel column — {section}",
        f"{label}  |  EN 1993-1-1",
        "steel",
    ))

    # ── Design parameters ────────────────────────────────────────────────────
    blocks.append(S("Beregningsforudsætninger"))
    blocks.append(T(
        f"Hot-rolled steel column / beam-column check to EN 1993-1-1 §6.3.  "
        f"Section {section}, grade {grade}.  "
        f"Column length L = {length_m:.2f} m, "
        f"effective-length factors k_y = {k_y:.2f}, k_z = {k_z:.2f}.  "
        f"{'LTB restrained — χ_LT = 1.0.' if ltb_restrained else 'LTB unrestrained — M_cr and χ_LT computed.'}"
    ))
    blocks.extend([
        CALC_ROW("Section",  "profil",                    section),
        CALC_ROW("Grade",    "stålkvalitet",                grade),
        CALC_ROW("L",        "søjlelængde",              f"{length_m:.2f} m"),
        CALC_ROW("k_y",      "søjlelængdefaktor y–y",    f"{k_y:.2f}"),
        CALC_ROW("k_z",      "søjlelængdefaktor z–z",    f"{k_z:.2f}"),
        CALC_ROW("N_Ed",     "dimensionsgivende normalkraft, tryk",  f"{N_Ed_kN:.1f} kN"),
    ])
    if have_moments:
        blocks.extend([
            CALC_ROW("M_y,Ed", "dimensionsgivende moment, stærk akse",  f"{M_y_Ed_kNm:.2f} kNm"),
            CALC_ROW("M_z,Ed", "dimensionsgivende moment, svag akse",    f"{M_z_Ed_kNm:.2f} kNm"),
            CALC_ROW("C_my",   "ækvivalent momentfaktor y",      f"{C_my:.2f}"),
            CALC_ROW("C_mz",   "ækvivalent momentfaktor z",      f"{C_mz:.2f}"),
        ])
        if not ltb_restrained:
            blocks.append(CALC_ROW("C_mLT", "ækvivalent momentfaktor, kipning", f"{C_mLT:.2f}"))
    blocks.extend([
        CALC_ROW("γ_M0",  "partialkoefficient, tværsnit",   str(gamma_M0)),
        CALC_ROW("γ_M1",  "partialkoefficient, instabilitet", str(gamma_M1)),
    ])

    # ── Section properties ───────────────────────────────────────────────────
    blocks.append(S("Tværsnitsdata — EN 1993-1-1 §6.1"))
    blocks.extend([
        CALC_ROW("A",      "bruttoareal",                f"{A_cm2:.2f} cm²"),
        CALC_ROW("I_y",    "inertimoment, stærk akse",  f"{Iy_cm4:.1f} cm⁴"),
        CALC_ROW("I_z",    "inertimoment, svag akse",    f"{Iz_cm4:.1f} cm⁴"),
        CALC_ROW("i_y",    "= √(I_y / A)",              f"{iy:.1f} mm"),
        CALC_ROW("i_z",    "= √(I_z / A)",              f"{iz:.1f} mm"),
        CALC_ROW("W_pl,y", f"{'(elastic W_el,y used for Class 3)' if use_elastic_y else 'plastic modulus — y'}",
                           f"{W_bnd_y:.1f} cm³"),
        CALC_ROW("W_pl,z", f"{'(elastic W_el,z used for Class 3)' if use_elastic_z else 'plastic modulus — z'}",
                           f"{W_bnd_z:.1f} cm³" if W_bnd_z is not None else "—"),
        CALC_ROW("f_y",    "flydespænding",             f"{fy:.0f} MPa"),
    ])
    if I_T_cm4 is not None:
        blocks.append(CALC_ROW("I_T", "vridningskonstant (St. Venant)", f"{I_T_cm4:.2f} cm⁴"))
    if I_w_cm6 is not None:
        blocks.append(CALC_ROW("I_w", "hvælvningskonstant", f"{I_w_cm6:.0f} cm⁶"))

    # ── Cross-section classification ─────────────────────────────────────────
    blocks.append(S("Tværsnitsklasse — EN 1993-1-1 §5.5.2 / tabel 5.2"))
    if section_class is not None:
        blocks.append(T(
            f"ε = √(235 / f_y) = {eps:.3f}  |  "
            f"Flange: c_f/t_f = {cf_t:.2f}  →  Class {fl_class}  |  "
            f"Web: c_w/t_w = {cw_t:.2f}  →  Class {web_class}  |  "
            f"α = {alpha_cls:.3f}"
        ))
        cls_label = f"Class {section_class}"
        blocks.append(CALC_ROW("Section class", "dimensionsgivende (største af flange og krop)", cls_label))

        if section_class == 3:
            if W_el_y_cm3 is None:
                blocks.append(N(
                    "Tværsnitsklasse 3 — angiv W_el_y_cm3 (og W_el_z_cm3) for at bruge "
                    "elastic modulus in bending checks. W_pl is used as a conservative "
                    "approximation until W_el is supplied."
                ))
            else:
                blocks.append(N(
                    f"Tværsnitsklasse 3 — elastisk modstandsmoment W_el,y = {W_el_y_cm3:.1f} cm³ "
                    "used for bending resistance."
                ))
        if section_class == 4:
            blocks.append(N(
                "Tværsnitsklasse 4 — der kræves effektive tværsnitsdata efter "
                "EN 1993-1-5. This check is not performed here; results are unconservative."
            ))
    else:
        blocks.append(N(
            "tw_mm not provided — cross-section classification skipped. "
            "Class 1 or 2 assumed (W_pl used)."
        ))

    # ── Slenderness ──────────────────────────────────────────────────────────
    blocks.append(S("Slankhed — EN 1993-1-1 §6.3.1.3"))
    blocks += [
        CALC_ROW("λ₁",     "= π·√(E/f_y)",                               f"{lambda_1:.2f}"),
        CALC_ROW("L_cr,y", f"= k_y·L = {k_y:.2f} × {length_m:.2f} m",   f"{L_cr_y/1000:.3f} m"),
        CALC_ROW("L_cr,z", f"= k_z·L = {k_z:.2f} × {length_m:.2f} m",   f"{L_cr_z/1000:.3f} m"),
        CALC_ROW("λ̄_y",   "= (L_cr,y / i_y) / λ₁",                      f"{lam_y:.3f}"),
        CALC_ROW("λ̄_z",   "= (L_cr,z / i_z) / λ₁",                      f"{lam_z:.3f}"),
    ]

    # ── Flexural buckling resistance ─────────────────────────────────────────
    blocks.append(S("Bæreevne for søjlevirkning — EN 1993-1-1 §6.3.1.2"))
    blocks.append(T(
        f"Buckningskurver efter EN 1993-1-1 tabel 6.2 (varmvalset I-/H-profil, "
        f"h/b = {h_mm/b_mm:.2f}, t_f = {tf_mm:.1f} mm):  "
        f"y–y → kurve {curve_y.upper()} (α = {_ALPHA[curve_y]}),  "
        f"z–z → kurve {curve_z.upper()} (α = {_ALPHA[curve_z]})."
    ))
    blocks += [
        CALC_ROW("χ_y",      f"= kurve {curve_y.upper()}, λ̄_y = {lam_y:.3f}",  f"{chi_y:.3f}"),
        CALC_ROW("χ_z",      f"= kurve {curve_z.upper()}, λ̄_z = {lam_z:.3f}",  f"{chi_z:.3f}"),
        CALC_ROW("N_pl,Rd",  "= A·f_y / γ_M0",                                   f"{N_pl_Rd:.1f} kN"),
        CALC_ROW("N_b,y,Rd", "= χ_y·A·f_y / γ_M1",                              f"{N_b_y_Rd:.1f} kN"),
        CALC_ROW("N_b,z,Rd", "= χ_z·A·f_y / γ_M1",                              f"{N_b_z_Rd:.1f} kN"),
    ]

    # ── Axial-only verification ───────────────────────────────────────────────
    blocks.append(S("Eftervisning for normalkraft — EN 1993-1-1 §6.2.4 / §6.3.1"))
    eta_cs  = N_Ed_kN / N_pl_Rd
    eta_b_y = N_Ed_kN / N_b_y_Rd
    eta_b_z = N_Ed_kN / N_b_z_Rd
    blocks += [
        CALC_ROW("η_cs",  "= N_Ed / N_pl,Rd",   f"{eta_cs:.3f}"),
        chk.check("Tværsnit §6.2.4",        eta_cs,  1.0),
        CALC_ROW("η_b,y", "= N_Ed / N_b,y,Rd",  f"{eta_b_y:.3f}"),
        chk.check("Søjlevirkning y–y §6.3.1", eta_b_y, 1.0),
        CALC_ROW("η_b,z", "= N_Ed / N_b,z,Rd",  f"{eta_b_z:.3f}"),
        chk.check("Søjlevirkning z–z §6.3.1", eta_b_z, 1.0),
    ]

    # ── Combined bending + compression ───────────────────────────────────────
    if have_moments:

        # ── LTB ──────────────────────────────────────────────────────────────
        blocks.append(S("Kipning — EN 1993-1-1 §6.3.2.2"))
        if ltb_restrained:
            blocks.append(T("Lateral restraint provided throughout — LTB not critical."))
            blocks.append(CALC_ROW("χ_LT", "= 1,0  (fastholdt)", "1.000"))
        else:
            ltb_curve_name = ltb_curve_hot_rolled(h_mm, b_mm)
            blocks += [
                CALC_ROW("L_LTB",    "ikke-fastholdt længde ved kipning",
                         f"{(L_LTB_m if L_LTB_m else k_z * length_m):.3f} m"),
                CALC_ROW("C₁",       "momentfordelingsfaktor",          f"{C_1:.2f}"),
                CALC_ROW("M_cr",     "elastisk kritisk moment",         f"{M_cr_kNm:.2f} kNm"),
                CALC_ROW("λ̄_LT",    "= √(W_y · f_y / M_cr)",           f"{lam_LT:.3f}"),
                CALC_ROW("χ_LT",     f"LTB curve {ltb_curve_name.upper()} — general method",
                         f"{chi_LT:.3f}"),
            ]
            blocks.append(N(
                "M_cr er regnet med to-ledsformlen uden korrektion for lastens angrebshøjde.  "
                "C₁ = 1.0 (uniform moment) is conservative; for non-uniform diagrams "
                "use Table 6.4 (e.g. UDL ≈ 1.13, triangular ≈ 1.29)."
            ))

        # ── §6.2.1(7) conservative cross-section check ───────────────────────
        M_cs_y_Rd = W_bnd_y * fy / gamma_M0 / 1_000.0   # kNm (use γ_M0 for §6.2)
        M_cs_z_Rd = ((W_bnd_z * fy / gamma_M0 / 1_000.0)
                     if W_bnd_z is not None else None)

        blocks.append(S("Samlet tværsnitsbæreevne — EN 1993-1-1 §6.2.1(7)"))
        blocks.append(T(
            "Conservative linear interaction:  "
            "N_Ed/N_Rd + M_y,Ed/M_y,Rd + M_z,Ed/M_z,Rd ≤ 1.0"
        ))
        m_y_cs = M_y_Ed_kNm / M_cs_y_Rd
        m_z_cs = (M_z_Ed_kNm / M_cs_z_Rd) if M_cs_z_Rd else 0.0
        eta_ICS = eta_cs + m_y_cs + m_z_cs

        blocks += [
            CALC_ROW("N_Rd",     "= A·f_y / γ_M0",               f"{N_pl_Rd:.1f} kN"),
            CALC_ROW("M_y,Rd",   f"= {'W_el' if use_elastic_y else 'W_pl'},y·f_y / γ_M0",
                     f"{M_cs_y_Rd:.2f} kNm"),
        ]
        if M_cs_z_Rd is not None:
            blocks.append(CALC_ROW("M_z,Rd", f"= {'W_el' if use_elastic_z else 'W_pl'},z·f_y / γ_M0",
                                   f"{M_cs_z_Rd:.2f} kNm"))
        blocks += [
            CALC_ROW("η_ICS",
                     f"= {eta_cs:.3f} + {m_y_cs:.3f} + {m_z_cs:.3f}",
                     f"{eta_ICS:.3f}"),
            chk.check("Cross-section N+M  §6.2.1(7)", eta_ICS, 1.0),
        ]

        # ── Annex B interaction — §6.3.3 ─────────────────────────────────────
        table_ref = "B.1" if not susceptible else "B.2"
        susceptible_txt = ("not susceptible (restrained)" if not susceptible
                           else "susceptible (unrestrained I/H)")

        blocks.append(S(f"Interaction factors  — Annex B Table {table_ref} ({susceptible_txt})"))
        blocks.append(N(
            "Bilag B, metode 2 — tværsnitsklasse 1 og 2.  "
            "C_my = C_mz = 1.0 is conservative (uniform moment diagram); "
            "refer to Table B.3 for non-uniform diagrams."
        ))
        if lam_y > 1.0:
            blocks.append(N(f"λ̄_y = {lam_y:.3f} > 1,0 — sat til 1,0 i udtrykket for k-faktorerne."))
        if lam_z > 1.0:
            blocks.append(N(f"λ̄_z = {lam_z:.3f} > 1,0 — sat til 1,0 i udtrykket for k-faktorerne."))

        blocks.append(TBL(
            ["Factor", "Formula", "Value"],
            [
                ["k_yy",
                 "C_my·(1+(min(λ̄_y,1)−0.2)·n_y) ≤ C_my·(1+0.8·n_y)",
                 f"{k_yy:.3f}"],
                ["k_yz", "= 0.6·k_zz",  f"{k_yz:.3f}"],
                ["k_zy",
                 ("0.8·k_yy" if not susceptible
                  else "1−0.1·λ̄_z/(C_mLT−0.25)·n_z  (Table B.2)"),
                 f"{k_zy:.3f}"],
                ["k_zz",
                 "C_mz·(1+(2·min(λ̄_z,1)−0.6)·n_z) ≤ C_mz·(1+1.4·n_z)",
                 f"{k_zz:.3f}"],
            ],
        ))

        # Interaction equations (§6.3.3 Eq. 6.61 and 6.62)
        m_y = M_y_Ed_kNm / M_pl_y_Rd if M_pl_y_Rd > 0 else 0.0
        m_z = ((M_z_Ed_kNm / M_pl_z_Rd) if M_pl_z_Rd and M_pl_z_Rd > 0 else 0.0)
        if M_pl_z_Rd is None and abs(M_z_Ed_kNm) > 1e-9:
            blocks.append(N("W_pl,z unavailable — M_z,Ed contribution to Eq. 6.62 ignored."))

        util_eq1 = n_y + k_yy * m_y / chi_LT + k_yz * m_z
        util_eq2 = n_z + k_zy * m_y / chi_LT + k_zz * m_z

        blocks.append(S("Samvirke — EN 1993-1-1 §6.3.3, lign. 6.61 og 6.62"))
        blocks += [
            CALC_ROW("M_pl,y,Rd", f"= {'W_el' if use_elastic_y else 'W_pl'},y·f_y / γ_M1",
                     f"{M_pl_y_Rd:.2f} kNm"),
        ]
        if M_pl_z_Rd is not None:
            blocks.append(CALC_ROW(
                "M_pl,z,Rd",
                f"= {'W_el' if use_elastic_z else 'W_pl'},z·f_y / γ_M1",
                f"{M_pl_z_Rd:.2f} kNm",
            ))
        blocks += [
            CALC_ROW("χ_LT",  "LTB reduction factor",  f"{chi_LT:.3f}"),
            CALC_ROW("n_y",   "= N_Ed / N_b,y,Rd",     f"{n_y:.3f}"),
            CALC_ROW("n_z",   "= N_Ed / N_b,z,Rd",     f"{n_z:.3f}"),
        ]
        blocks += [
            CALC_ROW("Eq. 6.61",
                     f"{n_y:.3f} + {k_yy:.3f}·{m_y:.3f}/{chi_LT:.3f} + {k_yz:.3f}·{m_z:.3f}",
                     f"{util_eq1:.3f}"),
            chk.check("Interaction Eq. 6.61  §6.3.3", util_eq1, 1.0),
            CALC_ROW("Eq. 6.62",
                     f"{n_z:.3f} + {k_zy:.3f}·{m_y:.3f}/{chi_LT:.3f} + {k_zz:.3f}·{m_z:.3f}",
                     f"{util_eq2:.3f}"),
            chk.check("Interaction Eq. 6.62  §6.3.3", util_eq2, 1.0),
        ]

    return blocks
