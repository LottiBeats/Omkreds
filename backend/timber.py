"""
timber.py - Timber beam module (EN 1995-1-1)
Unit-aware with forallpeople. No manual conversions.

Closed-form and FEM/imported-action workflow:
- default: calculate M_Ed and V_Ed from wL^2/8 and wL/2
- optional: pass beam_results with imported M_Ed / V_Ed / delta values
"""

import forallpeople as si
si.environment('structural', top_level=True)
_cm = 10 * mm   # cm not in structural env — needed for cm³/cm⁴ display

JA, NEJ = "ja", "nej"

VARIGHED_DK = {
    "permanent": "permanent", "long": "lang", "medium": "middel",
    "short": "kort", "instant": "øjeblikkelig",
}


def _u(qty, unit=None, label="", dec=2):
    """
    Format a quantity in the unit the document should show it in.

    forallpeople chooses the unit itself, and not the same one from row to row:
    a 0.9 kN/m line load prints as "900.000 N/m" two rows above an f_m,d in
    MPa. In a statisk dokumentation the unit is part of the sentence, so it is
    chosen here rather than left to whatever the magnitude happens to be.
    """
    if unit is None:
        return str(qty)
    try:
        return f"{float(qty / unit):.{dec}f} {label}"
    except Exception:
        return str(qty)

from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext, FIG
from timber_grades import get_timber_grade

KMOD = {
    (1, "permanent"): 0.60, (1, "long"): 0.70, (1, "medium"): 0.80,
    (1, "short"): 0.90,     (1, "instant"): 1.10,
    (2, "permanent"): 0.60, (2, "long"): 0.70, (2, "medium"): 0.80,
    (2, "short"): 0.90,     (2, "instant"): 1.10,
    (3, "permanent"): 0.50, (3, "long"): 0.55, (3, "medium"): 0.65,
    (3, "short"): 0.70,     (3, "instant"): 0.90,
}


def timber_beam(
    label,
    span,
    g_k,
    q_k,
    b,
    h,
    timber_grade=None,
    f_mk=None,
    f_vk=None,
    E_0_05=None,
    G_0_05=None,
    service_class=1,
    load_duration="medium",
    gamma_M=1.3,
    K_FI=1.0,
    beam_results=None,
    fire_design=None,
    l_ef=None,
    compression_edge_restrained=False,
    torsional_restraint_at_supports=True,
    support_length=None,
    bearing_force=None,
    f_c_90_k=None,
    k_c_90=None,
    support_material="solid_timber",
    load_near_support=False,
    end_distance=None,
    figure_path=None,
    figure_caption="",
):
    grade_key = None
    grade_data = None
    if timber_grade is not None:
        grade_key, grade_data = get_timber_grade(timber_grade)

    if f_mk is None and grade_data is not None:
        f_mk = grade_data["f_mk"]
    if f_mk is None:
        f_mk = 24 * MPa
    if f_vk is None and grade_data is not None:
        f_vk = grade_data["f_vk"]
    if f_vk is None:
        f_vk = 4.0 * MPa
    if E_0_05 is None and grade_data is not None:
        E_0_05 = grade_data["E_0_05"]
    if E_0_05 is None:
        E_0_05 = 7_400 * MPa
    if G_0_05 is None and grade_data is not None:
        G_0_05 = grade_data["G_0_05"]
    if G_0_05 is None:
        G_0_05 = E_0_05 / 16     # EN 1995-1-1 default assumption
    if f_c_90_k is None and grade_data is not None:
        f_c_90_k = grade_data["f_c_90_k"]
    if f_c_90_k is None:
        f_c_90_k = 2.5 * MPa
    if support_material == "solid_timber" and grade_data is not None:
        support_material = grade_data["support_material"]

    # k_mod kan ikke vælges her endnu. I den lukkede form afhænger den af
    # hvilken lastkombination der viser sig at være dimensionsgivende, og det
    # afgøres længere nede. Med importerede snitkræfter er varigheden allerede
    # bestemt af den kombination, de kom fra.
    kmod = KMOD.get((service_class, load_duration), 0.80)
    cc = CheckContext()
    blocks = []

    _b_mm = int(round(b / mm))
    _h_mm = int(round(h / mm))
    blocks.append(MH(f"Træbjælke — {_b_mm}×{_h_mm} mm",
                     f"{label}  |  EN 1995-1-1", material="timber"))

    # ── Design parameters ─────────────────────────────────────────────────────
    blocks.append(S("Beregningsforudsætninger"))
    # The grade descriptions are written as headings ("Konstruktionstræ C24");
    # here the phrase sits mid-sentence.
    _materiale = grade_data["description"] if grade_data is not None else "Konstruktionstræ C24"
    _materiale = _materiale[:1].lower() + _materiale[1:]
    _varighed  = VARIGHED_DK.get(load_duration, load_duration)
    if beam_results is None:
        blocks.append(T(
            f"Simpelt understøttet bjælke i {_materiale}, spænd {_u(span, m, 'm')}. "
            f"Anvendelsesklasse {service_class}. Lasterne kombineres efter "
            f"DS/EN 1990 DK NA tabel A1.2(B+C), og den dimensionsgivende "
            f"kombination findes på w/k_mod — se nedenfor. γ_M = {gamma_M:.2f}."
        ))
    else:
        # The statisk system and the loads belong to the analysis the actions
        # came from. Repeating "simply supported, g_k = …" here described a
        # beam that was not the one being checked.
        blocks.append(T(
            f"Bjælke i {_materiale}, {_b_mm}×{_h_mm} mm. Snitkræfterne er hentet "
            f"fra rammeberegningen — statisk system og laster fremgår dér. "
            f"Anvendelsesklasse {service_class}, lastvarighed: {_varighed}. "
            f"k_mod = {kmod:.2f}, γ_M = {gamma_M:.2f}."
        ))

    _params = [CALC_ROW("L", "spænd", _u(span, m, "m"))]
    if beam_results is None:
        # Only the closed-form path uses these; with imported actions they are
        # not what the check is run on.
        _params += [
            CALC_ROW("g_k", "karakteristisk egenlast",   _u(g_k, kN / m, "kN/m")),
            CALC_ROW("q_k", "karakteristisk variabel last", _u(q_k, kN / m, "kN/m")),
        ]
    _params += [
        CALC_ROW("b",        "bredde",                          _u(b, mm, "mm", 0)),
        CALC_ROW("h",        "højde",                           _u(h, mm, "mm", 0)),
        CALC_ROW("Styrkeklasse", "",                            grade_key if grade_key is not None else "manuelt indtastet"),
        CALC_ROW("f_m,k",    "kar. bøjningsstyrke",             _u(f_mk, MPa, "MPa", 1)),
        CALC_ROW("f_v,k",    "kar. forskydningsstyrke",         _u(f_vk, MPa, "MPa", 1)),
        CALC_ROW("E_0,05",   "5 %-fraktil elasticitetsmodul",   _u(E_0_05, MPa, "MPa", 0)),
        CALC_ROW("G_0,05",   "5 %-fraktil forskydningsmodul",   _u(G_0_05, MPa, "MPa", 0)),
        CALC_ROW("f_c,90,k", "kar. trykstyrke vinkelret på fibrene", _u(f_c_90_k, MPa, "MPa", 1)),
        CALC_ROW("γ_M",      "partialkoefficient",              f"{gamma_M:.2f}"),
    ]
    if beam_results is not None:
        # Med importerede snitkraefter er varigheden bestemt af den kombination,
        # de kom fra, saa k_mod er kendt her.
        _params.insert(-1, CALC_ROW("k_mod", "modifikationsfaktor (tab. 3.1)",
                                    f"{kmod:.2f}"))
    blocks.extend(_params)

    # ── Loading ───────────────────────────────────────────────────────────────
    if beam_results is None:
        blocks.append(S("Laster — brudgrænsetilstand"))

        # DS/EN 1990 DK NA:2019 tabel A1.2(B+C):
        #   6.10a  1,2·K_FI·G_k                    (kun permanent last)
        #   6.10b  1,0·K_FI·G_k + 1,5·K_FI·Q_k
        #
        # Og så EN 1995-1-1 §2.2.3: for træ er den dimensionsgivende
        # kombination IKKE den med den største E_d, men den med det største
        # E_d/k_mod. 6.10a har kun permanent last og dermed k_mod = 0,60, hvor
        # 6.10b typisk er kortvarig med k_mod = 0,90. På et tungt tag med let
        # sne vinder 6.10a, selv om lasten er mindre.
        #
        # Modulet regnede før 1,35·g + 1,5·q med den varighed brugeren valgte:
        # en faktor der ikke findes i DK NA, ganget på én kombination der ikke
        # nødvendigvis er den dimensionsgivende. På 2,5 / 0,2 kN/m gav det et
        # snit 18 % under det rigtige — i den forkerte retning.
        _kandidater = [
            ("6.10a", "= 1,2·K_FI·g_k", 1.2 * K_FI * g_k, "permanent"),
            ("6.10b", "= 1,0·K_FI·g_k + 1,5·K_FI·q_k",
             1.0 * K_FI * g_k + 1.5 * K_FI * q_k, load_duration),
        ]

        _vurderet = []
        for navn, formel, w, dur in _kandidater:
            k = KMOD.get((service_class, dur), 0.80)
            _vurderet.append({"navn": navn, "formel": formel, "w": w,
                              "dur": dur, "kmod": k, "styrende": w / k})

        _gov = max(_vurderet, key=lambda c: c["styrende"])
        w_Ed = _gov["w"]
        kmod = _gov["kmod"]
        load_duration = _gov["dur"]

        M_Ed = (w_Ed * span**2) / 8
        V_Ed = (w_Ed * span) / 2

        # k_mod og w/k_mod hører til i formelkolonnen: resultatkolonnen er
        # 36 mm bred, og tre tal i den vælter ned over tre linjer.
        for c in _vurderet:
            blocks.append(CALC_ROW(
                c["navn"],
                f"{c['formel']}   →   k_mod = {c['kmod']:.2f}"
                f"   →   w/k_mod = {float(c['w'] / (kN / m)) / c['kmod']:.3f}",
                _u(c["w"], kN / m, "kN/m")))

        blocks.append(N(
            f"Dimensionsgivende: {_gov['navn']} med lastvarighed "
            f"{VARIGHED_DK.get(_gov['dur'], _gov['dur'])} og k_mod = "
            f"{_gov['kmod']:.2f}. For træ afgøres det af det største w/k_mod "
            "og ikke af den største last (EN 1995-1-1 §2.2.3), fordi k_mod "
            "følger lastens varighed."))

        blocks.extend([
            CALC_ROW("w_Ed", f"= {_gov['navn']}",      _u(w_Ed, kN / m, "kN/m")),
            CALC_ROW("M_Ed", "= w_Ed·L²/8",            _u(M_Ed, kN * m, "kNm")),
            CALC_ROW("V_Ed", "= w_Ed·L/2",             _u(V_Ed, kN, "kN")),
        ])
        blocks.append(N("Snitkræfter beregnet i lukket form: simpelt understøttet "
                        "bjælke med jævnt fordelt last over hele spændet."))

    else:
        blocks.append(S("Snitkræfter fra rammeberegningen"))
        source    = beam_results.get("source", "Beam analysis")
        case_name = beam_results.get("case_name", "")
        if case_name:
            blocks.append(T(f"Moment og forskydning er hentet fra {source}: {case_name}."))
        else:
            blocks.append(T(f"Moment og forskydning er hentet fra {source}."))

        M_Ed = beam_results["M_Ed"]
        V_Ed = beam_results["V_Ed"]

        blocks.extend([
            CALC_ROW("M_Ed", "dimensionsgivende moment (importeret)",     _u(M_Ed, kN * m, "kNm")),
            CALC_ROW("V_Ed", "dimensionsgivende forskydning (importeret)", _u(V_Ed, kN, "kN")),
        ])

        delta_max = beam_results.get("delta_max")
        if delta_max is not None:
            blocks.append(CALC_ROW("δ_max", "største nedbøjning (importeret)", _u(delta_max, mm, "mm", 1)))

        x_M = beam_results.get("x_M_Ed")
        x_V = beam_results.get("x_V_Ed")
        loc_parts = []
        if x_M is not None:
            loc_parts.append(f"|M| er størst ved x = {_u(x_M, m, 'm')}")
        if x_V is not None:
            loc_parts.append(f"|V| er størst ved x = {_u(x_V, m, 'm')}")
        if loc_parts:
            blocks.append(N(" ; ".join(loc_parts)))

    if figure_path:
        blocks.append(S("Snitkraftkurver"))
        blocks.append(FIG(figure_path, figure_caption or "Moment, forskydning og deformation fra rammeberegningen."))

    # ── Bending resistance ────────────────────────────────────────────────────
    blocks.append(S("Bøjning — EN 1995-1-1 pkt. 6.1.6"))

    W_y    = (b * h**2) / 6
    f_md   = kmod * f_mk / gamma_M
    sigma_md = M_Ed / W_y

    blocks.extend([
        CALC_ROW("W_y",    "= b·h²/6",            f"{float(W_y / _cm**3):.1f} cm³"),
        CALC_ROW("f_m,d",  "= k_mod·f_m,k / γ_M", _u(f_md, MPa, "MPa")),
        CALC_ROW("σ_m,d",  "= M_Ed / W_y",         _u(sigma_md, MPa, "MPa")),
    ])
    blocks.append(cc.check("Bøjning: σ_m,d / f_m,d", sigma_md, f_md))

    # ── Lateral buckling (kipning) ────────────────────────────────────────────
    blocks.append(S("Kipning — EN 1995-1-1 pkt. 6.3.3"))

    if compression_edge_restrained and torsional_restraint_at_supports:
        k_crit = 1.0
        blocks.append(N(
            "Trykzonen er fastholdt i hele bjælkens længde, og vridning er "
            "forhindret ved understøtningerne. k_crit = 1,0 — kipning kan ses bort fra."
        ))
    else:
        if l_ef is None:
            l_ef = 0.9 * span + 2 * h
            blocks.append(N(
                "Ingen effektiv kiplængde er angivet. Der regnes med "
                "l_ef = 0,9·L + 2h for en simpelt understøttet bjælke med jævnt "
                "fordelt last (EN 1995-1-1 tabel 6.1)."
            ))
        else:
            blocks.append(N(f"Effektiv kiplængde: l_ef = {_u(l_ef, m, 'm')}."))

        # Section constants for a solid rectangular cross-section
        # I_z  = h·b³/12  (2nd moment of area about weak axis)
        # I_T  = h·b³/3   (Saint-Venant torsion constant, h >> b approximation
        #                   — consistent with the EN 1995-1-1 derivation of the 0.78 formula)
        I_z_ltb = h * b**3 / 12
        I_T_ltb = h * b**3 / 3

        from math import pi as _pi
        M_crit       = _pi * (E_0_05 * I_z_ltb * G_0_05 * I_T_ltb) ** 0.5 / l_ef
        sigma_m_crit = M_crit / W_y          # W_y = b·h²/6 already computed above
        lambda_rel_m = float(f_mk / sigma_m_crit) ** 0.5

        blocks.extend([
            CALC_ROW("l_ef",      "effektiv kiplængde",                       _u(l_ef, m, "m")),
            CALC_ROW("I_z",       "= h·b³/12  [inertimoment om svag akse]",  f"{float(I_z_ltb / _cm**4):.2f} cm⁴"),
            CALC_ROW("I_T",       "= h·b³/3   [vridningskonstant, rektangel]", f"{float(I_T_ltb / _cm**4):.2f} cm⁴"),
            CALC_ROW("M_crit",    "= π·√(E_0,05·I_z·G_0,05·I_T) / l_ef",   _u(M_crit, kN * m, "kNm")),
            CALC_ROW("σ_m,crit",  "= M_crit / W_y",                          _u(sigma_m_crit, MPa, "MPa", 1)),
            CALC_ROW("λ_rel,m",   "= √(f_m,k / σ_m,crit)",                f"{lambda_rel_m:.3f}"),
        ])

        if lambda_rel_m <= 0.75:
            k_crit = 1.0
            blocks.append(CALC_ROW("k_crit", "= 1.0  (λ_rel,m ≤ 0.75)", f"{k_crit:.3f}"))
        elif lambda_rel_m <= 1.4:
            k_crit = 1.56 - 0.75 * lambda_rel_m
            blocks.append(CALC_ROW("k_crit", "= 1.56 − 0.75·λ_rel,m", f"{k_crit:.3f}"))
        else:
            k_crit = 1.0 / lambda_rel_m**2
            blocks.append(CALC_ROW("k_crit", "= 1 / λ_rel,m²", f"{k_crit:.3f}"))

    blocks.append(cc.check("Kipning: σ_m,d / (k_crit·f_m,d)", sigma_md, k_crit * f_md))

    # ── Shear resistance ──────────────────────────────────────────────────────
    blocks.append(S("Forskydning — EN 1995-1-1 pkt. 6.1.7"))

    A     = b * h
    f_vd  = kmod * f_vk / gamma_M
    tau_d = (1.5 * V_Ed) / A

    blocks.extend([
        CALC_ROW("A",     "= b·h",               f"{float(A / _cm**2):.2f} cm²"),
        CALC_ROW("f_v,d", "= k_mod·f_v,k / γ_M", _u(f_vd, MPa, "MPa")),
        CALC_ROW("τ_d",   "= 1.5·V_Ed / A",       _u(tau_d, MPa, "MPa")),
    ])
    blocks.append(cc.check("Forskydning: τ_d / f_v,d", tau_d, f_vd))

    # ── Bearing at support ────────────────────────────────────────────────────
    if support_length is not None:
        blocks.append(S("Vederlag — EN 1995-1-1 pkt. 6.1.5"))

        if bearing_force is None:
            bearing_force = V_Ed
            blocks.append(N("Ingen vederlagskraft angivet — der regnes med reaktionen V_Ed."))
        else:
            blocks.append(N(f"Angivet vederlagskraft: F_c,90,Ed = {_u(bearing_force, kN, 'kN')}."))

        if k_c_90 is None:
            if load_near_support:
                k_c_90 = 1.0
                blocks.append(N("Lasten ligger tæt ved understøtningen → k_c,90 = 1,0."))
            else:
                k_c_90 = 1.75 if support_material == "glulam" else 1.5
                _mat_dk = {"glulam": "limtræ", "solid_timber": "konstruktionstræ"}.get(
                    support_material, support_material)
                blocks.append(N(
                    f"Lasten ligger væk fra understøtningen; k_c,90 = {k_c_90} for {_mat_dk}."
                ))
        else:
            blocks.append(N(f"Angivet vederlagsfaktor: k_c,90 = {k_c_90}."))

        if end_distance is None:
            add_length = 30 * mm
            blocks.append(N("Ingen endeafstand angivet — A_ef = b·(l + 30 mm)."))
        elif end_distance >= 30 * mm:
            add_length = 60 * mm
            blocks.append(N("Endeafstand ≥ 30 mm → A_ef = b·(l + 60 mm)."))
        else:
            add_length = 30 * mm
            blocks.append(N("Endeafstand < 30 mm → A_ef = b·(l + 30 mm)."))

        f_c_90_d   = kmod * f_c_90_k / gamma_M
        A_ef       = b * (support_length + add_length)
        sigma_c_90_d = bearing_force / A_ef
        F_c_90_Rd  = k_c_90 * f_c_90_d * A_ef

        blocks.extend([
            CALC_ROW("l_sup",       "vederlagslængde",                 _u(support_length, mm, "mm", 0)),
            CALC_ROW("f_c,90,d",    "= k_mod·f_c,90,k / γ_M",           _u(f_c_90_d, MPa, "MPa")),
            CALC_ROW("A_ef",        "= b·(l_sup + tillæg)",             f"{float(A_ef / _cm**2):.1f} cm²"),
            CALC_ROW("σ_c,90,d",    "= F / A_ef",                       _u(sigma_c_90_d, MPa, "MPa")),
            CALC_ROW("F_c,90,Rd",   "= k_c,90·f_c,90,d·A_ef",           _u(F_c_90_Rd, kN, "kN")),
        ])
        blocks.append(cc.check("Vederlag: σ_c,90,d / (k_c,90·f_c,90,d)", sigma_c_90_d, k_c_90 * f_c_90_d))
        blocks.append(cc.check("Vederlag: F_c,90,Ed / F_c,90,Rd", bearing_force, F_c_90_Rd))

    # ── Fire design ───────────────────────────────────────────────────────────
    if fire_design:
        blocks.append(S("Brand — EN 1995-1-2"))

        t_fire         = fire_design["t_fire"]
        beta_n         = fire_design.get("beta_n", 0.7 * mm)
        d0             = fire_design.get("d0", 7 * mm)
        k0             = fire_design.get("k0", 1.0)
        gamma_M_fi     = fire_design.get("gamma_M_fi", 1.0)
        kmod_fi        = fire_design.get("kmod_fi", 1.0)
        exposed_sides  = int(fire_design.get("exposed_sides", 2))
        exposed_bottom = bool(fire_design.get("exposed_bottom", True))
        exposed_top    = bool(fire_design.get("exposed_top", False))

        M_Ed_fi = fire_design.get("M_Ed")
        V_Ed_fi = fire_design.get("V_Ed")
        eta_fi  = fire_design.get("eta_fi")

        if eta_fi is not None:
            if M_Ed_fi is None:
                M_Ed_fi = eta_fi * M_Ed
            if V_Ed_fi is None:
                V_Ed_fi = eta_fi * V_Ed

        if M_Ed_fi is None or V_Ed_fi is None:
            raise ValueError("fire_design requires M_Ed and V_Ed, or eta_fi to derive them.")

        blocks.append(T(
            f"Reduceret tværsnitsmetode. Brandvarighed = {t_fire}. "
            f"Brandpåvirkede sider = {exposed_sides}, underside = "
            f"{JA if exposed_bottom else NEJ}, overside = "
            f"{JA if exposed_top else NEJ}."
        ))
        blocks.extend([
            CALC_ROW("t_fi",      "brandvarighed",                          str(t_fire)),
            CALC_ROW("β_n",       "nominel indbrændingshastighed",          _u(beta_n, mm, "mm", 2)),
            CALC_ROW("d_0",       "nulstyrkelag",                           _u(d0, mm, "mm", 0)),
            CALC_ROW("M_Ed,fi",   "dimensionsgivende moment ved brand",     _u(M_Ed_fi, kN * m, "kNm")),
            CALC_ROW("V_Ed,fi",   "dimensionsgivende forskydning ved brand", _u(V_Ed_fi, kN, "kN")),
            CALC_ROW("k_mod,fi",  "k_mod ved brand",                        f"{kmod_fi:.2f}"),
            CALC_ROW("γ_M,fi",    "partialkoefficient ved brand",           f"{gamma_M_fi:.2f}"),
        ])

        d_char_n = beta_n * t_fire + k0 * d0
        b_fi     = b - exposed_sides * d_char_n
        h_fi     = h - int(exposed_bottom) * d_char_n - int(exposed_top) * d_char_n
        A_fi     = b_fi * h_fi
        W_y_fi   = (b_fi * h_fi**2) / 6
        f_md_fi  = kmod_fi * f_mk / gamma_M_fi
        f_vd_fi  = kmod_fi * f_vk / gamma_M_fi
        sigma_m_d_fi = M_Ed_fi / W_y_fi
        tau_d_fi     = (1.5 * V_Ed_fi) / A_fi

        blocks.extend([
            CALC_ROW("d_char,n",   "= β_n·t_fi + k_0·d_0",           _u(d_char_n, mm, "mm", 1)),
            CALC_ROW("b_fi",       "= b − sider·d_char,n",           _u(b_fi, mm, "mm", 1)),
            CALC_ROW("h_fi",       "= h − (under+over)·d_char,n",    _u(h_fi, mm, "mm", 1)),
            CALC_ROW("A_fi",       "= b_fi·h_fi",                     f"{float(A_fi / _cm**2):.1f} cm²"),
            CALC_ROW("W_y,fi",     "= b_fi·h_fi²/6",                  f"{float(W_y_fi / _cm**3):.1f} cm³"),
            CALC_ROW("f_m,d,fi",   "= k_mod,fi·f_m,k / γ_M,fi",      _u(f_md_fi, MPa, "MPa")),
            CALC_ROW("f_v,d,fi",   "= k_mod,fi·f_v,k / γ_M,fi",      _u(f_vd_fi, MPa, "MPa")),
            CALC_ROW("σ_m,d,fi",   "= M_Ed,fi / W_y,fi",              _u(sigma_m_d_fi, MPa, "MPa")),
            CALC_ROW("τ_d,fi",     "= 1.5·V_Ed,fi / A_fi",            _u(tau_d_fi, MPa, "MPa")),
        ])

        blocks.append(N(
            "Reduceret tværsnitsmetode (EN 1995-1-2 pkt. 4.2.2). Snitkræfterne "
            "stammer fra brandlastkombinationen. Er η_fi angivet, skaleres "
            "snitkræfterne ved normal temperatur til M_Ed,fi og V_Ed,fi."
        ))
        blocks.append(cc.check("Brand bøjning: σ_m,d,fi / f_m,d,fi", sigma_m_d_fi, f_md_fi))
        blocks.append(cc.check("Brand forskydning: τ_d,fi / f_v,d,fi", tau_d_fi, f_vd_fi))

    return blocks
