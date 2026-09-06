"""
timber_column.py - Timber column module (EN 1995-1-1)
Unit-aware with forallpeople. No manual conversions.

Checks a rectangular timber beam-column under axial compression and
one-axis bending. All three failure modes are covered:

  EN 1995-1-1 cl. 6.1.4 / 6.2.4  Section check (eqs. 6.19 and 6.20)
  EN 1995-1-1 cl. 6.3.2           Flexural buckling – both axes
                                   (eqs. 6.23 and 6.24)
  EN 1995-1-1 cl. 6.3.3           Lateral-torsional buckling
                                   (eqs. 6.33 and 6.35)
                                   — only when l_ef_ltb is provided

Axis convention (matches EN 1995-1-1 and the B.43 reference):
  Axis 1 (strong / major):  bending about y-y, W_1 = b h² / 6,  i_1 = h / √12
  Axis 2 (weak  / minor):   buckling about z-z,                  i_2 = b / √12
  where b = width (smaller dim) and h = depth (larger dim in bending plane).

G_0,05 is read from timber_grades.py (≈ E_0,05 / 16 per EN 338).
"""

from math import pi

import forallpeople as si
si.environment("structural", top_level=True)

from calc_core import CheckContext, MH, N, S, T, TBL, CALC_ROW
from timber_grades import get_timber_grade


KMOD = {
    (1, "permanent"): 0.60, (1, "long"): 0.70, (1, "medium"): 0.80,
    (1, "short"): 0.90,     (1, "instant"): 1.10,
    (2, "permanent"): 0.60, (2, "long"): 0.70, (2, "medium"): 0.80,
    (2, "short"): 0.90,     (2, "instant"): 1.10,
    (3, "permanent"): 0.50, (3, "long"): 0.55, (3, "medium"): 0.65,
    (3, "short"): 0.70,     (3, "instant"): 0.90,
}

_BETA_C = {"solid_timber": 0.20, "glulam": 0.10}

_cm = 10 * mm

VARIGHED_DK = {
    "permanent": "permanent", "long": "lang", "medium": "middel",
    "short": "kort", "instant": "øjeblikkelig",
}


def _u(qty, unit=None, label="", dec=2):
    """
    Skriv en størrelse i den enhed, dokumentet skal vise den i.

    Uden dette valgte forallpeople selv, og et 115 mm tværsnit stod som
    "115.000 mm", et inertimoment som "14575052.083 mm⁴" og et moment paa nul
    som "0.000 Pa". Se det samme i timber.py.
    """
    if unit is None:
        return str(qty)
    try:
        return f"{float(qty / unit):.{dec}f} {label}"
    except Exception:
        return str(qty)


def timber_column_bending_and_axial(
    label,
    length,
    N_Ed,
    M_Ed,
    b,
    h,
    timber_grade=None,
    f_c0k=None,
    f_mk=None,
    E_0_05=None,
    G_0_05=None,
    service_class=1,
    load_duration="medium",
    gamma_M=1.3,
    k_m=0.70,
    material_type="solid_timber",
    effective_length_factor=1.0,
    l_ef_ltb=None,
    check_buckling_axis_1=True,
    check_buckling_axis_2=True,
    check_ltb=True,
    buckling_axis=None,
    section_properties=None,
    I_t=None,
):
    # ------------------------------------------------------------------
    # Grade data
    # ------------------------------------------------------------------
    grade_key = None
    grade_data = None
    if timber_grade is not None:
        grade_key, grade_data = get_timber_grade(timber_grade)

    if f_c0k   is None: f_c0k   = grade_data["f_c0k"]   if grade_data else 21 * MPa
    if f_mk    is None: f_mk    = grade_data["f_mk"]    if grade_data else 24 * MPa
    if E_0_05  is None: E_0_05  = grade_data["E_0_05"]  if grade_data else 7_400 * MPa
    if G_0_05  is None: G_0_05  = grade_data.get("G_0_05", E_0_05 / 16) if grade_data else E_0_05 / 16
    if material_type == "solid_timber" and grade_data is not None:
        material_type = grade_data["material_type"]

    kmod   = KMOD.get((service_class, load_duration), 0.80)
    beta_c = _BETA_C.get(material_type, _BETA_C["solid_timber"])
    cc     = CheckContext()
    blocks = []
    # b og h er forallpeople-stoerrelser, saa f"{b}x{h}" gav
    # "115.000 mmx115.000 mm" i modulhovedet og i indholdsfortegnelsen.
    _b_mm_lbl = int(round(b / mm))
    _h_mm_lbl = int(round(h / mm))
    section_label = (
        section_properties.get("section_label")
        if section_properties is not None and section_properties.get("section_label")
        else f"{_b_mm_lbl}×{_h_mm_lbl} mm"
    )

    # ------------------------------------------------------------------
    # Module header
    # ------------------------------------------------------------------
    _b_mm = int(round(b / mm))
    _h_mm = int(round(h / mm))
    blocks.append(MH(f"Træsøjle — {section_label}",
                     f"{label}  |  EN 1995-1-1", material="timber"))

    # ------------------------------------------------------------------
    # Design parameters
    # ------------------------------------------------------------------
    blocks.append(S("Beregningsforudsætninger"))
    _mat = grade_data["description"] if grade_data else "manuelt indtastede styrker"
    _mat = _mat[:1].lower() + _mat[1:]
    blocks.append(T(
        f"Rektangulær træsøjle i {_mat}, påvirket af normalkraft og bøjning. "
        f"Anvendelsesklasse {service_class}, lastvarighed: "
        f"{VARIGHED_DK.get(load_duration, load_duration)}. "
        f"k_mod = {kmod:.2f}, γ_M = {gamma_M:.2f}."
    ))
    _b_display = b if section_properties is None else section_properties.get("width_total", b)
    _h_display = h if section_properties is None else section_properties.get("height_total", h)
    blocks.extend([
        CALC_ROW("L",       "søjlelængde",          str(length)),
        CALC_ROW("N_Ed",    "dimensionsgivende normalkraft",     _u(N_Ed, kN, "kN")),
        CALC_ROW("M_y,Ed",  "dimensionsgivende moment",  _u(M_Ed, kN * m, "kNm")),
        CALC_ROW("b",       "bredde",                  str(_b_display)),
        CALC_ROW("h",       "højde",                  str(_h_display)),
        CALC_ROW("Grade",   "",                       grade_key if grade_key else "manual"),
        CALC_ROW("f_c,0,k", "kar. trykstyrke i fiberretning",   _u(f_c0k, MPa, "MPa", 1)),
        CALC_ROW("f_m,k",   "kar. bøjningsstyrke",       _u(f_mk, MPa, "MPa", 1)),
        CALC_ROW("E_0,05",  "5 %-fraktil elasticitetsmodul", _u(E_0_05, MPa, "MPa", 0)),
        CALC_ROW("G_0,05",  "5 %-fraktil forskydningsmodul", _u(G_0_05, MPa, "MPa", 0)),
        CALC_ROW("μ",  "søjlelængdefaktor",     str(effective_length_factor)),
        CALC_ROW("Model",   "",                       material_type),
    ])

    # ------------------------------------------------------------------
    # Section properties
    # ------------------------------------------------------------------
    blocks.append(S("Tværsnitsdata"))

    if section_properties is None:
        A   = b * h
        W_y = (b * h**2) / 6
        I_1 = (b * h**3) / 12
        I_2 = (h * b**3) / 12
        i_1 = (I_1 / A) ** 0.5
        i_2 = (I_2 / A) ** 0.5
        blocks.extend([
            CALC_ROW("A",   "= b·h",      f"{float(A / _cm**2):.1f} cm²"),
            CALC_ROW("W_y", "= b·h²/6",   f"{float(W_y / _cm**3):.1f} cm³"),
            CALC_ROW("I_1", "= b·h³/12",  f"{float(I_1 / _cm**4):.0f} cm⁴"),
            CALC_ROW("I_2", "= h·b³/12",  f"{float(I_2 / _cm**4):.0f} cm⁴"),
            CALC_ROW("i_1", "= √(I_1/A)", _u(i_1, mm, "mm", 1)),
            CALC_ROW("i_2", "= √(I_2/A)", _u(i_2, mm, "mm", 1)),
        ])
        blocks.append(N(
            "Akse 1 er den stærke: bøjning i h-retningen, i_1 = h/√12. "
            "Akse 2 er den svage: udbøjning i b-retningen, i_2 = b/√12."
        ))
    else:
        required_keys = ("A", "W_y", "I_1", "I_2", "i_1", "i_2")
        missing = [key for key in required_keys if key not in section_properties]
        if missing:
            raise ValueError(f"section_properties is missing keys: {', '.join(missing)}")

        A   = section_properties["A"]
        W_y = section_properties["W_y"]
        I_1 = section_properties["I_1"]
        I_2 = section_properties["I_2"]
        i_1 = section_properties["i_1"]
        i_2 = section_properties["i_2"]

        blocks.extend([
            CALC_ROW("A",   "fra profilet", f"{float(A / _cm**2):.1f} cm²"),
            CALC_ROW("W_y", "fra profilet", f"{float(W_y / _cm**3):.1f} cm³"),
            CALC_ROW("I_1", "stærk akse (fra profilet)", f"{float(I_1 / _cm**4):.0f} cm⁴"),
            CALC_ROW("I_2", "svag akse (fra profilet)",   f"{float(I_2 / _cm**4):.0f} cm⁴"),
            CALC_ROW("i_1", "fra profilet",  _u(i_1, mm, "mm", 1)),
            CALC_ROW("i_2", "fra profilet",  _u(i_2, mm, "mm", 1)),
        ])
        blocks.append(N(
            "Section properties are imported from a custom composite section. "
            "Axis 1 is treated as the strong axis and axis 2 as the weak axis."
        ))

    # ------------------------------------------------------------------
    # Design material strengths
    # ------------------------------------------------------------------
    blocks.append(S("Regningsmæssige styrker"))

    f_c0d = kmod * f_c0k / gamma_M
    f_md  = kmod * f_mk  / gamma_M
    blocks.extend([
        CALC_ROW("f_c,0,d", "= k_mod·f_c,0,k / γ_M", _u(f_c0d, MPa, "MPa")),
        CALC_ROW("f_m,d",   "= k_mod·f_m,k / γ_M",   _u(f_md, MPa, "MPa")),
    ])

    # ------------------------------------------------------------------
    # Section stresses
    # ------------------------------------------------------------------
    blocks.append(S("Spændinger i tværsnittet"))

    sigma_c0d = N_Ed / A
    sigma_m1d = M_Ed / W_y
    sigma_m2d = 0 * sigma_m1d
    sigma_md  = sigma_m1d
    blocks.extend([
        CALC_ROW("σ_c,0,d", "= N_Ed / A",   _u(sigma_c0d, MPa, "MPa")),
        CALC_ROW("σ_m,1,d", "= M_Ed / W_y", _u(sigma_m1d, MPa, "MPa")),
        CALC_ROW("σ_m,2,d", "= 0",          _u(sigma_m2d, MPa, "MPa")),
    ])

    # ------------------------------------------------------------------
    # Section check – no buckling reduction (eqs. 6.19 and 6.20)
    # ------------------------------------------------------------------
    blocks.append(S("Tværsnitseftervisning — EN 1995-1-1 lign. 6.19 og 6.20"))

    eta_6_2 = sigma_c0d / f_c0d
    blocks.append(CALC_ROW("η_6.2", "= σ_c,0,d / f_c,0,d", f"{float(eta_6_2):.3f}"))
    blocks.append(cc.check("Tryk, lign. 6.2", float(eta_6_2), 1.0))

    eta_19 = (sigma_c0d / f_c0d)**2 + sigma_m1d / f_md + k_m * sigma_m2d / f_md
    blocks.append(CALC_ROW("η_6.19",
        "= (σ_c,0,d / f_c,0,d)² + σ_m,1,d / f_m,d + k_m·σ_m,2,d / f_m,d",
        f"{float(eta_19):.3f}"))
    blocks.append(cc.check("Tværsnit, lign. 6.19", float(eta_19), 1.0))

    eta_20 = (sigma_c0d / f_c0d)**2 + k_m * sigma_m1d / f_md + sigma_m2d / f_md
    blocks.append(CALC_ROW("η_6.20",
        "= (σ_c,0,d / f_c,0,d)² + k_m·σ_m,1,d / f_m,d + σ_m,2,d / f_m,d",
        f"{float(eta_20):.3f}"))
    blocks.append(cc.check("Tværsnit, lign. 6.20", float(eta_20), 1.0))

    # ------------------------------------------------------------------
    # Flexural buckling – axis 1 (strong) – cl. 6.3.2
    # ------------------------------------------------------------------
    if check_buckling_axis_1:
        blocks.append(S("Søjlevirkning om akse 1 (stærk) — EN 1995-1-1 pkt. 6.3.2"))

        l_eff_1      = effective_length_factor * length
        lambda_1     = l_eff_1 / i_1
        lambda_rel_1 = (float(lambda_1) / pi) * float((f_c0k / E_0_05) ** 0.5)
        blocks.extend([
            CALC_ROW("l_eff,1",   "= μ·L",                   _u(l_eff_1, m, "m")),
            CALC_ROW("λ_1",       "= l_eff,1 / i_1",         f"{float(lambda_1):.2f}"),
            CALC_ROW("λ_rel,1",   "= (λ_1/π)·√(f_c,0,k/E)", f"{lambda_rel_1:.3f}"),
        ])

        if lambda_rel_1 <= 0.3:
            k_c1 = 1.0
            blocks.append(N(
                "λ_rel,1 ≤ 0,3 — ingen reduktion for søjlevirkning om den stærke akse (k_c,1 = 1,0)."
            ))
        else:
            k_1_val = 0.5 * (1.0 + beta_c * (lambda_rel_1 - 0.3) + lambda_rel_1**2)
            k_c1    = min(1.0 / (k_1_val + (k_1_val**2 - lambda_rel_1**2)**0.5), 1.0)
            blocks.extend([
                CALC_ROW("k_1",   "= 0.5·(1 + β_c·(λ_rel,1−0.3) + λ_rel,1²)", f"{k_1_val:.3f}"),
                CALC_ROW("k_c,1", "= 1/(k_1 + √(k_1²−λ_rel,1²))",              f"{k_c1:.3f}"),
            ])
    else:
        k_c1 = 1.0
        blocks.append(N("Søjlen er fastholdt mod udbøjning om akse 1; k_c,1 = 1,0."))

    # ------------------------------------------------------------------
    # Flexural buckling – axis 2 (weak) – cl. 6.3.2
    # ------------------------------------------------------------------
    if check_buckling_axis_2:
        blocks.append(S("Søjlevirkning om akse 2 (svag) — EN 1995-1-1 pkt. 6.3.2"))

        l_eff_2      = effective_length_factor * length
        lambda_2     = l_eff_2 / i_2
        lambda_rel_2 = (float(lambda_2) / pi) * float((f_c0k / E_0_05) ** 0.5)
        blocks.extend([
            CALC_ROW("l_eff,2",   "= μ·L",                   _u(l_eff_2, m, "m")),
            CALC_ROW("λ_2",       "= l_eff,2 / i_2",         f"{float(lambda_2):.2f}"),
            CALC_ROW("λ_rel,2",   "= (λ_2/π)·√(f_c,0,k/E)", f"{lambda_rel_2:.3f}"),
        ])

        if lambda_rel_2 <= 0.3:
            k_c2 = 1.0
            blocks.append(N(
                "λ_rel,2 ≤ 0,3 — ingen reduktion for søjlevirkning om den svage akse (k_c,2 = 1,0)."
            ))
        else:
            k_2_val = 0.5 * (1.0 + beta_c * (lambda_rel_2 - 0.3) + lambda_rel_2**2)
            k_c2    = min(1.0 / (k_2_val + (k_2_val**2 - lambda_rel_2**2)**0.5), 1.0)
            blocks.extend([
                CALC_ROW("k_2",   "= 0.5·(1 + β_c·(λ_rel,2−0.3) + λ_rel,2²)", f"{k_2_val:.3f}"),
                CALC_ROW("k_c,2", "= 1/(k_2 + √(k_2²−λ_rel,2²))",              f"{k_c2:.3f}"),
            ])
    else:
        k_c2 = 1.0
        blocks.append(N("Søjlen er fastholdt mod udbøjning om akse 2; k_c,2 = 1,0."))

    # ------------------------------------------------------------------
    # Interaction – strong-axis buckling governs (eq. 6.23)
    # ------------------------------------------------------------------
    if check_buckling_axis_1:
        blocks.append(S("Samvirke — lign. 6.23 (søjlevirkning om akse 1)"))
        eta_23 = sigma_c0d / (k_c1 * f_c0d) + sigma_m1d / f_md + k_m * sigma_m2d / f_md
        blocks.append(CALC_ROW("η_6.23",
            "= σ_c,0,d / (k_c,1·f_c,0,d) + σ_m,1,d / f_m,d + k_m·σ_m,2,d / f_m,d",
            f"{float(eta_23):.3f}"))
        blocks.append(cc.check("Samvirke, lign. 6.23 (akse 1)", float(eta_23), 1.0))

    # ------------------------------------------------------------------
    # Interaction – weak-axis buckling governs (eq. 6.24)
    # ------------------------------------------------------------------
    if check_buckling_axis_2:
        blocks.append(S("Samvirke — lign. 6.24 (søjlevirkning om akse 2)"))
        eta_24 = sigma_c0d / (k_c2 * f_c0d) + k_m * sigma_m1d / f_md + sigma_m2d / f_md
        blocks.append(CALC_ROW("η_6.24",
            "= σ_c,0,d / (k_c,2·f_c,0,d) + k_m·σ_m,1,d / f_m,d + σ_m,2,d / f_m,d",
            f"{float(eta_24):.3f}"))
        blocks.append(cc.check("Samvirke, lign. 6.24 (akse 2)", float(eta_24), 1.0))

    # ------------------------------------------------------------------
    # Lateral-torsional buckling – cl. 6.3.3
    # ------------------------------------------------------------------
    if check_ltb and l_ef_ltb is not None:
        blocks.append(S("Kipning — EN 1995-1-1 pkt. 6.3.3"))
        blocks.append(T(
            "LTB is relevant when the compression edge is unrestrained over the member length. "
            f"Effective length for LTB: l_ef = {l_ef_ltb}."
        ))

        if I_t is None:
            if section_properties is not None:
                raise ValueError("LTB for a custom section requires I_t to be provided explicitly.")

            if float(b) <= float(h):
                b_thin, b_wide = b, h
            else:
                b_thin, b_wide = h, b

            ratio = float(b_thin / b_wide)
            I_t   = b_thin**3 * b_wide / 3 * (1.0 - 0.63 * ratio + 0.052 * ratio**5)
            blocks.extend([
                CALC_ROW("ratio", "= b_thin / b_wide",                  f"{ratio:.4f}"),
                CALC_ROW("I_t",   "= b³·h/3·(1 − 0.63·r + 0.052·r⁵)", str(I_t)),
            ])
        else:
            blocks.append(CALC_ROW("I_t", "user supplied", str(I_t)))

        # sigma_m,crit
        EI_GI = E_0_05 * I_2 * G_0_05 * I_t
        blocks.append(CALC_ROW("E·I₂·G·I_t", "= E₀,₀₅·I₂·G₀,₀₅·I_t", str(EI_GI)))

        sigma_m_crit = pi * EI_GI**0.5 / (l_ef_ltb * W_y)
        blocks.append(CALC_ROW("σ_m,crit", "= π·√(E·I₂·G·I_t) / (l_ef·W_y)", str(sigma_m_crit)))

        lambda_rel_m = float((f_mk / sigma_m_crit)**0.5)
        blocks.append(CALC_ROW("λ_rel,m", "= √(f_m,k/σ_m,crit)", f"{lambda_rel_m:.3f}"))

        lrm = lambda_rel_m
        if lrm <= 0.75:
            k_crit = 1.0
            blocks.append(N("λ_rel,m ≤ 0,75 — ingen reduktion for kipning (k_crit = 1,0, lign. 6.34)."))
        elif lrm <= 1.4:
            k_crit = 1.56 - 0.75 * lrm
            blocks.append(CALC_ROW("k_crit", "= 1.56 − 0.75·λ_rel,m  (0.75 < λ ≤ 1.4)", f"{k_crit:.3f}"))
        else:
            k_crit = 1.0 / lrm**2
            blocks.append(CALC_ROW("k_crit", "= 1/λ_rel,m²  (λ > 1.4)", f"{k_crit:.3f}"))

        # eq. 6.33 – pure bending LTB
        eta_33 = float(sigma_md / (k_crit * f_md))
        blocks.append(CALC_ROW("η_6.33", "= σ_m,d / (k_crit·f_m,d)", f"{eta_33:.3f}"))
        blocks.append(cc.check("LTB eq. 6.33: σ_m,d / (k_crit f_m,d)", eta_33, 1.0))

        # eq. 6.35 – combined LTB + weak-axis buckling
        ratio_m = float(sigma_md / (k_crit * f_md))
        ratio_c = float(sigma_c0d / (k_c2 * f_c0d))
        eta_35  = ratio_m**2 + ratio_c
        blocks.append(CALC_ROW("η_6.35",
            "= (σ_m,d/(k_crit·f_m,d))² + σ_c,0,d / (k_c,2·f_c,0,d)",
            f"{eta_35:.3f}"))
        blocks.append(cc.check("LTB eq. 6.35: combined", eta_35, 1.0))

    elif l_ef_ltb is not None and not check_ltb:
        blocks.append(N(
            "Beam compression edge is restrained against lateral-torsional buckling; "
            "LTB check not required."
        ))

    return blocks


def side_by_side_rectangles_section(b, h, n, gap=0.0, name_prefix="Member"):
    """Return rectangle parts for a built-up side-by-side section."""
    if n < 1:
        raise ValueError("n must be at least 1")

    pitch = b + gap
    x0 = -pitch * (n - 1) / 2
    return [
        {
            "name": f"{name_prefix} {i + 1}",
            "b": b,
            "h": h,
            "x": x0 + i * pitch,
        }
        for i in range(n)
    ]


def composite_section_properties(parts):
    """Calculate gross properties for aligned rectangular section parts."""
    if not parts:
        raise ValueError("parts must contain at least one rectangle")

    areas = [part["b"] * part["h"] for part in parts]
    A = sum(areas)
    x_bar = sum(area * part["x"] for area, part in zip(areas, parts)) / A
    height_total = max(part["h"] for part in parts)
    width_total = (
        max(part["x"] + part["b"] / 2 for part in parts)
        - min(part["x"] - part["b"] / 2 for part in parts)
    )

    I_1 = sum(part["b"] * part["h"]**3 / 12 for part in parts)
    I_2 = sum(
        part["h"] * part["b"]**3 / 12 + area * (part["x"] - x_bar) ** 2
        for area, part in zip(areas, parts)
    )
    W_y = I_1 / (height_total / 2)

    return {
        "A": A,
        "W_y": W_y,
        "I_1": I_1,
        "I_2": I_2,
        "i_1": (I_1 / A) ** 0.5,
        "i_2": (I_2 / A) ** 0.5,
        "width_total": width_total,
        "height_total": height_total,
    }


def timber_column_side_by_side(
    label,
    length,
    N_Ed,
    M_Ed,
    b_single,
    h_single,
    n_members=2,
    gap=0.0,
    figure_path=None,
    figure_caption="",
    show_section_plot=True,
    **kwargs,
):
    """
    Convenience wrapper for a built-up timber section with identical members
    placed side by side.
    """
    parts = side_by_side_rectangles_section(
        b=b_single,
        h=h_single,
        n=n_members,
        gap=gap,
        name_prefix="Member",
    )
    props = composite_section_properties(parts)
    auto_I_t = kwargs.pop("I_t", None)
    if auto_I_t is None:
        if float(b_single) <= float(h_single):
            b_thin, b_wide = b_single, h_single
        else:
            b_thin, b_wide = h_single, b_single
        ratio = float(b_thin / b_wide)
        single_I_t = b_thin**3 * b_wide / 3 * (1.0 - 0.63 * ratio + 0.052 * ratio**5)
        auto_I_t = n_members * single_I_t
    props["section_label"] = f"{n_members} × {b_single}×{h_single} side-by-side"

    blocks = timber_column_bending_and_axial(
        label=label,
        length=length,
        N_Ed=N_Ed,
        M_Ed=M_Ed,
        b=props["width_total"],
        h=props["height_total"],
        section_properties=props,
        I_t=auto_I_t,
        **kwargs,
    )
    blocks.insert(
        1,
        N(
            "For the built-up side-by-side section, I_t is taken as the sum of the "
            "individual rectangular member torsion constants."
        ),
    )

    return blocks
