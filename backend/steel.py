"""
steel.py - Stålbjælke (EN 1993-1-1)
Unit-aware with forallpeople. No manual conversions.

Closed-form and FEM/imported-action workflow:
- default: calculate M_Ed and V_Ed from wL^2/8 and wL/2
- optional: pass beam_results with imported M_Ed / V_Ed / delta values
"""

from math import pi

import forallpeople as si
si.environment('structural', top_level=True)
_cm = 10 * mm   # cm not in structural env — needed for cm⁴/cm⁶ section property display

from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext, FIG
from steel_ec3 import BUCKLING_ALPHA, chi_ltb, ltb_curve_hot_rolled


def steel_beam_ipe(
    label,
    section,
    span,
    g_k,
    q_k,
    W_ply,
    h,
    t_w,
    f_y=None,
    gamma_M0=1.10,          # DS/EN 1993-1-1 DK NA
    beam_results=None,
    figure_path=None,
    figure_caption="",
    b=None,
    t_f=None,
    Iy=None,
    l_cr_ltb=None,
    C1=1.0,
    gamma_M1=1.20,          # DS/EN 1993-1-1 DK NA
    K_FI=1.0,
    r=None,                 # udrundingsradius; None = 0 (på den sikre side)
    load_on_top_flange=True,
    ltb_restrained=False,
    buck_y_restrained=False,
    buck_x_restrained=False,
    deflection_limit=200,
    manual_mode=False,    # True → user supplied properties directly; skip classification
    use_elastic=False,    # True → W_ply argument is actually W_el,y (elastic modulus)
):
    if f_y is None:
        f_y = 355 * MPa

    cc = CheckContext()
    blocks = []

    def _u(qty, unit, label, dec=2):
        try:
            return f"{float(qty / unit):.{dec}f} {label}"
        except Exception:
            return str(qty)

    _fy = float(f_y / MPa)
    blocks.append(MH(f"Stålbjælke — {section}",
                     f"{label}  |  EN 1993-1-1", material="steel"))

    blocks.append(S("Beregningsforudsætninger"))
    if beam_results is None:
        blocks.append(T(
            f"Simpelt understøttet {section} i S{_fy:.0f} med spænd "
            f"{_u(span, m, 'm')}. Partialkoefficienter efter DS/EN 1993-1-1 DK NA."))
    else:
        blocks.append(T(
            f"{section} i S{_fy:.0f}. Snitkræfterne er hentet udefra — statisk "
            f"system og laster fremgår dér. Partialkoefficienter efter "
            f"DS/EN 1993-1-1 DK NA."))

    _W_label = "W_el,y" if use_elastic else "W_pl,y"
    _W_hint  = "elastisk modstandsmoment" if use_elastic else "plastisk modstandsmoment"
    blocks.append(CALC_ROW("Profil", "", section))
    blocks.append(CALC_ROW("L", "spænd", _u(span, m, "m")))
    if beam_results is None:
        blocks += [
            CALC_ROW("g_k", "karakteristisk permanent last", _u(g_k, kN / m, "kN/m")),
            CALC_ROW("q_k", "karakteristisk variabel last",  _u(q_k, kN / m, "kN/m")),
        ]
    blocks.append(CALC_ROW(_W_label, _W_hint, f"{float(W_ply / _cm**3):.1f} cm³"))
    for sym, txt, val in (("h", "profilhøjde", h), ("b", "flangebredde", b),
                          ("t_f", "flangetykkelse", t_f), ("t_w", "kroptykkelse", t_w),
                          ("r", "udrundingsradius", r)):
        if val is not None:
            blocks.append(CALC_ROW(sym, txt, _u(val, mm, "mm", 1)))
    blocks += [
        CALC_ROW("f_y",  "flydespænding (EN 1993-1-1 tabel 3.1)", f"{_fy:.0f} MPa"),
        CALC_ROW("γ_M0", "partialkoefficient, tværsnit",   f"{gamma_M0:.2f}"),
        CALC_ROW("γ_M1", "partialkoefficient, stabilitet", f"{gamma_M1:.2f}"),
    ]

    if manual_mode:
        blocks.append(N(
            ("W_el,y er brugt — elastisk bøjningsbæreevne (klasse 3 eller valgt). "
             if use_elastic else
             "W_pl,y er brugt — plastisk bøjningsbæreevne (klasse 1 eller 2 forudsat). ")
            + "Tværsnitsdata er tastet fra en tabel, og tværsnitsklassen er ikke "
              "bestemt her — den skal eftervises særskilt."))

    # ── Tværsnitsklasse — EN 1993-1-1 tabel 5.2 ──────────────────────────────
    section_class = 1
    W_eff = W_ply

    if b is not None and t_f is not None:
        blocks.append(S("Tværsnitsklasse — EN 1993-1-1 tabel 5.2"))

        eps = (235.0 / _fy) ** 0.5
        _r = r if r is not None else 0 * mm
        c_w_val = float((h - 2 * t_f - 2 * _r) / t_w)
        c_f_val = float((b - t_w - 2 * _r) / (2 * t_f))

        def _klasse(c_t, g1, g2, g3):
            return 1 if c_t <= g1 * eps else 2 if c_t <= g2 * eps else 3 if c_t <= g3 * eps else 4

        web_class = _klasse(c_w_val, 72, 83, 124)
        flange_class = _klasse(c_f_val, 9, 10, 14)
        section_class = max(web_class, flange_class)
        _klasse_txt = {1: "Klasse 1 — plastisk", 2: "Klasse 2 — plastisk, begrænset rotation",
                       3: "Klasse 3 — elastisk", 4: "Klasse 4 — slank (ikke dækket)"}

        blocks += [
            CALC_ROW("ε", "= √(235 / f_y)", f"{eps:.3f}"),
            CALC_ROW("c_w / t_w", f"krop i bøjning; grænser 72ε / 83ε / 124ε = "
                     f"{72*eps:.1f} / {83*eps:.1f} / {124*eps:.1f}", f"{c_w_val:.1f}"),
            CALC_ROW("c_f / t_f", f"flangeudhæng; grænser 9ε / 10ε / 14ε = "
                     f"{9*eps:.1f} / {10*eps:.1f} / {14*eps:.1f}", f"{c_f_val:.1f}"),
            CALC_ROW("Tværsnitsklasse", f"krop {web_class} · flange {flange_class}",
                     _klasse_txt[section_class]),
        ]
        if r is None:
            blocks.append(N("Udrundingsradius r er ikke kendt: c er regnet uden, "
                            "hvilket er på den sikre side."))

        if section_class <= 2:
            W_eff = W_ply
        elif section_class == 3:
            if Iy is not None:
                W_eff = Iy / (h / 2)
                blocks.append(N(
                    f"Klasse 3: bøjningsbæreevnen regnes elastisk med W_el,y = "
                    f"I_y / (h/2) = {float(W_eff / _cm**3):.1f} cm³."))
            else:
                W_eff = W_ply * 0.9
                blocks.append(N(
                    "Klasse 3: bøjningsbæreevnen regnes elastisk. I_y er ikke kendt, "
                    "så W_el,y er skønnet til 0,9·W_pl,y. Angiv I_y for et eksakt resultat."))
        else:
            blocks.append(N(
                "Klasse 4 (slankt tværsnit): lokal foldning indtræder før flydning, og "
                "der kræves effektive tværsnitsdata efter EN 1993-1-5. Det dækker "
                "modulet ikke — vælg et kraftigere profil, eller brug "
                "pladedragermodulet."))
    else:
        blocks.append(N("Tværsnitsklassen er ikke bestemt, fordi flangemålene ikke "
                        "kendes. Klasse 1 er forudsat."))

    # ── Laster ───────────────────────────────────────────────────────────────
    if beam_results is None:
        blocks.append(S("Laster — brudgrænsetilstand, DS/EN 1990 DK NA"))
        # DK NA tabel A1.2(B+C). Stål har ingen k_mod, så den største last er
        # den dimensionsgivende.
        w_a = 1.2 * K_FI * g_k
        w_b = 1.0 * K_FI * g_k + 1.5 * K_FI * q_k
        w_Ed = w_a if float(w_a / (kN / m)) >= float(w_b / (kN / m)) else w_b
        M_Ed = (w_Ed * span**2) / 8
        V_Ed = (w_Ed * span) / 2
        blocks += [
            CALC_ROW("6.10a", f"= 1,2·K_FI·g_k   (K_FI = {K_FI:.1f})", _u(w_a, kN / m, "kN/m")),
            CALC_ROW("6.10b", "= 1,0·K_FI·g_k + 1,5·K_FI·q_k",       _u(w_b, kN / m, "kN/m")),
            CALC_ROW("w_Ed",  "= den største af 6.10a og 6.10b",      _u(w_Ed, kN / m, "kN/m")),
            CALC_ROW("M_Ed",  "= w_Ed·L²/8",                          _u(M_Ed, kN * m, "kNm")),
            CALC_ROW("V_Ed",  "= w_Ed·L/2",                           _u(V_Ed, kN, "kN")),
        ]
        blocks.append(N("Snitkræfter i lukket form: simpelt understøttet bjælke "
                        "med jævnt fordelt last over hele spændet."))
    else:
        blocks.append(S("Snitkræfter"))
        source = beam_results.get("source", "en beregning")
        case_name = beam_results.get("case_name", "")
        blocks.append(T(f"Moment og forskydning er hentet fra {source}"
                        + (f": {case_name}." if case_name else ".")))
        M_Ed = beam_results["M_Ed"]
        V_Ed = beam_results["V_Ed"]
        blocks += [
            CALC_ROW("M_Ed", "dimensionsgivende moment",      _u(M_Ed, kN * m, "kNm")),
            CALC_ROW("V_Ed", "dimensionsgivende forskydning", _u(V_Ed, kN, "kN")),
        ]
        delta_max = beam_results.get("delta_max")
        if delta_max is not None:
            blocks.append(CALC_ROW("δ_max", "største nedbøjning", _u(delta_max, mm, "mm", 1)))

    if figure_path:
        blocks.append(S("Snitkraftkurver"))
        blocks.append(FIG(figure_path, figure_caption or "Moment, forskydning og nedbøjning."))

    # ── Bøjning — §6.2.5 ─────────────────────────────────────────────────────
    _using_elastic = use_elastic if manual_mode else (section_class == 3)
    _modulus_note = "W_el,y" if _using_elastic else "W_pl,y"
    blocks.append(S(f"Bøjning ({'elastisk' if _using_elastic else 'plastisk'}) — EN 1993-1-1 §6.2.5"))
    M_Rk = W_eff * f_y
    M_Rd = M_Rk / gamma_M0
    blocks += [
        CALC_ROW("M_Rk", f"= {_modulus_note}·f_y", _u(M_Rk, kN * m, "kNm")),
        CALC_ROW("M_Rd", "= M_Rk / γ_M0",          _u(M_Rd, kN * m, "kNm")),
    ]
    blocks.append(cc.check("Bøjning: M_Ed / M_Rd", M_Ed, M_Rd))

    # ── Forskydning — §6.2.6 ─────────────────────────────────────────────────
    blocks.append(S("Forskydning — EN 1993-1-1 §6.2.6"))
    V_Rd = None
    if b is not None and t_f is not None and t_w is not None:
        # A_v = A − 2b·t_f + (t_w + 2r)·t_f. Med A = 2b·t_f + (h − 2t_f)·t_w
        # + (4 − π)·r² bliver det (h − t_f)·t_w + 2r·t_f + (4 − π)·r².
        _r = r if r is not None else 0 * mm
        A_v = (h - t_f) * t_w + 2 * _r * t_f + (4 - pi) * _r**2
        A_v_min = (h - 2 * t_f) * t_w          # η·h_w·t_w med η = 1,0
        if float(A_v) < float(A_v_min):
            A_v = A_v_min
        av_note = ("= (h − t_f)·t_w + 2r·t_f + (4 − π)·r²  [§6.2.6(3)]" if r is not None
                   else "= (h − t_f)·t_w  [§6.2.6(3), uden udrunding]")
    elif h is not None and t_w is not None:
        A_v = h * t_w
        av_note = "= h·t_w  [forenklet — flangerne kendes ikke]"
    else:
        A_v = None
    if A_v is not None:
        V_Rd = A_v * f_y / (3**0.5 * gamma_M0)
        blocks += [
            CALC_ROW("A_v",  av_note,                     f"{float(A_v / _cm**2):.1f} cm²"),
            CALC_ROW("V_Rd", "= A_v·f_y / (√3·γ_M0)",     _u(V_Rd, kN, "kN")),
        ]
        blocks.append(cc.check("Forskydning: V_Ed / V_Rd", V_Ed, V_Rd))
    else:
        blocks.append(N("Forskydningen er ikke eftervist: h og t_w kendes ikke."))

    # ── Forskydningsbuling — §6.2.6(6) ───────────────────────────────────────
    if h is not None and t_f is not None and t_w is not None:
        eps_sb = (235.0 / _fy) ** 0.5
        ratio_sb = float((h - 2 * t_f) / t_w)
        limit_sb = 72 * eps_sb
        blocks.append(S("Forskydningsbuling — EN 1993-1-1 §6.2.6(6)"))
        blocks.append(CALC_ROW("h_w / t_w", f"grænse 72ε/η = {limit_sb:.1f}  (η = 1,0)", f"{ratio_sb:.1f}"))
        if ratio_sb < limit_sb:
            blocks.append(N("Kroppen er ikke følsom for forskydningsbuling; "
                            "EN 1993-1-5 skal ikke eftervises."))
        else:
            blocks.append(N("Kroppen er følsom for forskydningsbuling og skal "
                            "eftervises efter EN 1993-1-5 §5. Det dækker modulet "
                            "ikke — brug pladedragermodulet."))

    # ── Bøjning og forskydning — §6.2.8 ──────────────────────────────────────
    if V_Rd is not None:
        blocks.append(S("Bøjning og forskydning — EN 1993-1-1 §6.2.8"))
        if float(V_Ed) <= float(0.5 * V_Rd):
            blocks.append(CALC_ROW("0,5·V_Rd", f"V_Ed = {_u(V_Ed, kN, 'kN')}", _u(0.5 * V_Rd, kN, "kN")))
            blocks.append(N("V_Ed ≤ 0,5·V_pl,Rd: bøjningsbæreevnen skal ikke reduceres (§6.2.8(2))."))
        elif b is not None and t_f is not None:
            rho_mv = (2.0 * float(V_Ed / V_Rd) - 1.0) ** 2
            A_w = (h - 2 * t_f) * t_w
            W_red = W_eff - rho_mv * A_w**2 / (4 * t_w)
            M_yV_Rd = W_red * f_y / gamma_M0
            blocks += [
                CALC_ROW("ρ",        "= (2·V_Ed/V_pl,Rd − 1)²",  f"{rho_mv:.3f}"),
                CALC_ROW("M_y,V,Rd", "= (W − ρ·A_w²/(4t_w))·f_y / γ_M0", _u(M_yV_Rd, kN * m, "kNm")),
            ]
            blocks.append(cc.check("Bøjning og forskydning: M_Ed / M_y,V,Rd", M_Ed, M_yV_Rd))
        else:
            blocks.append(N("V_Ed > 0,5·V_pl,Rd: bøjningsbæreevnen skal reduceres efter "
                            "§6.2.8, men flangemålene kendes ikke."))

    # ── Kipning — §6.3.2 ─────────────────────────────────────────────────────
    blocks.append(S("Kipning — EN 1993-1-1 §6.3.2"))
    if ltb_restrained:
        blocks.append(N("Trykflangen er fastholdt sideværts i hele længden, fx af dæk "
                        "eller tætliggende åse. Kipning er ikke dimensionsgivende; χ_LT = 1,0."))
    elif b is not None and t_f is not None and l_cr_ltb is not None:
        E_s = 210_000 * MPa
        G_s = 80_770 * MPa
        I_z = t_f * b**3 / 6 + (h - 2*t_f) * t_w**3 / 12
        I_w = b**3 * t_f * (h - t_f)**2 / 24
        I_t = (2*b*t_f**3 + (h - 2*t_f)*t_w**3) / 3
        # Lastens angrebspunkt: last på overflangen sænker M_cr (C₂·z_g).
        C2 = 0.630 if C1 >= 1.25 else 0.454
        z_g = (h / 2) if load_on_top_flange else 0 * mm
        N_Ez = pi**2 * E_s * I_z / l_cr_ltb**2
        _led = (I_w/I_z + l_cr_ltb**2 * G_s * I_t / (pi**2 * E_s * I_z) + (C2 * z_g)**2)**0.5
        M_cr = C1 * N_Ez * (_led - C2 * z_g)
        blocks.append(T(
            f"Kiplængde L_cr = {_u(l_cr_ltb, m, 'm')}, momentfaktor C₁ = {C1:.2f}"
            + (f", last på overflangen (C₂ = {C2:.3f}, z_g = h/2)." if load_on_top_flange
               else ", last i forskydningscentret.")
            + " I_z, I_w og I_t er regnet af de nominelle mål uden udrunding (på den sikre side)."))
        blocks += [
            CALC_ROW("I_z", "= t_f·b³/6 + (h − 2t_f)·t_w³/12", f"{float(I_z / _cm**4):.1f} cm⁴"),
            CALC_ROW("I_w", "= b³·t_f·(h − t_f)²/24",          f"{float(I_w / _cm**6):.0f} cm⁶"),
            CALC_ROW("I_t", "= (2b·t_f³ + (h − 2t_f)·t_w³)/3", f"{float(I_t / _cm**4):.2f} cm⁴"),
            CALC_ROW("M_cr", "= C₁·π²·E·I_z/L_cr²·[√(I_w/I_z + L_cr²·G·I_t/(π²·E·I_z) + (C₂·z_g)²) − C₂·z_g]",
                     _u(M_cr, kN * m, "kNm")),
        ]
        lbar = float((W_eff * f_y / M_cr) ** 0.5)
        blocks.append(CALC_ROW("λ̄_LT", f"= √({_modulus_note}·f_y / M_cr)", f"{lbar:.3f}"))
        curve_ltb = ltb_curve_hot_rolled(float(h / mm), float(b / mm))
        alpha_LT = BUCKLING_ALPHA[curve_ltb]
        if lbar <= 0.4:
            chi_LT = 1.0
            blocks.append(N(f"λ̄_LT = {lbar:.3f} ≤ 0,4: kipning er ikke kritisk; χ_LT = 1,0."))
        else:
            phi_LT = 0.5 * (1.0 + alpha_LT * (lbar - 0.4) + 0.75 * lbar**2)
            chi_LT = chi_ltb(lbar, curve_ltb)
            blocks += [
                CALC_ROW("Φ_LT", f"= 0,5·(1 + α_LT·(λ̄_LT − 0,4) + 0,75·λ̄_LT²),  α_LT = {alpha_LT}", f"{phi_LT:.3f}"),
                CALC_ROW("χ_LT", f"modificeret metode §6.3.2.3, kurve {curve_ltb} (tabel 6.5)", f"{chi_LT:.3f}"),
            ]
        M_b_Rd = chi_LT * W_eff * f_y / gamma_M1
        blocks.append(CALC_ROW("M_b,Rd", f"= χ_LT·{_modulus_note}·f_y / γ_M1", _u(M_b_Rd, kN * m, "kNm")))
        blocks.append(cc.check("Kipning: M_Ed / M_b,Rd", M_Ed, M_b_Rd))
    else:
        blocks.append(N("Kipning er IKKE eftervist. Angiv kiplængden (afstanden mellem "
                        "sideværts fastholdelser af trykflangen), eller angiv at "
                        "trykflangen er fastholdt i hele længden."))

    # ── Nedbøjning — DS/EN 1990 anneks A1.4 ──────────────────────────────────
    blocks.append(S("Nedbøjning — DS/EN 1990 anneks A1.4"))
    if Iy is not None:
        E_sls = 210_000 * MPa
        delta_lim = span / deflection_limit
        delta_imp = beam_results.get("delta_max") if beam_results is not None else None
        if delta_imp is not None:
            blocks += [
                CALC_ROW("δ",     "største nedbøjning (hentet)",   _u(delta_imp, mm, "mm", 1)),
                CALC_ROW("δ_lim", f"= L / {deflection_limit}",     _u(delta_lim, mm, "mm", 1)),
            ]
            blocks.append(cc.check(f"Nedbøjning: δ / (L/{deflection_limit})", delta_imp, delta_lim))
        else:
            w_sls = g_k + q_k
            delta_mid = 5 * w_sls * span**4 / (384 * E_sls * Iy)
            blocks += [
                CALC_ROW("w",     "= g_k + q_k  (karakteristisk kombination)", _u(w_sls, kN / m, "kN/m")),
                CALC_ROW("I_y",   "inertimoment",                               f"{float(Iy / _cm**4):.0f} cm⁴"),
                CALC_ROW("δ",     "= 5·w·L⁴ / (384·E·I_y)",                     _u(delta_mid, mm, "mm", 1)),
                CALC_ROW("δ_lim", f"= L / {deflection_limit}",                  _u(delta_lim, mm, "mm", 1)),
            ]
            blocks.append(cc.check(f"Nedbøjning: δ / (L/{deflection_limit})", delta_mid, delta_lim))
            blocks.append(N(f"Grænsen L/{deflection_limit} er et valg og aftales med bygherren; "
                            "L/250 til L/500 er almindeligt afhængigt af det, bjælken bærer."))
    else:
        blocks.append(N("Nedbøjningen er ikke eftervist: I_y kendes ikke."))

    return blocks
