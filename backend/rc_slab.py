"""
rc_slab.py — enkeltspændt betondæk, 1 m stribe (DS/EN 1992-1-1 DK NA)

Simpelt understøttet dæk uden forskydningsarmering. Eftervises:

  §6.1       bøjning med rektangulær spændingsblok og flydning af armeringen
  §9.3.1.1   minimums- og maksimumsarmering, største stangafstand
  §6.2.2     forskydning uden forskydningsarmering, V_Rd,c
  §7.4.2     nedbøjning ved grænseværdi for l/d

DK NA: α_cc = 1,0, γ_c = 1,45, γ_s = 1,20. Last efter 6.10a/b med K_FI, fra
en lastkombination i kN/m², eller M_Ed og V_Ed pr. m direkte.
"""
import math

from calc_core import S, T, N, CALC_ROW, MH, CheckContext

E_S = 200_000.0
EPS_CU3 = 0.0035
K_FI_MAP = {"CC1": 0.9, "CC2": 1.0, "CC3": 1.1}


def _dk(v, d=2):
    return f"{v:.{d}f}".replace(".", ",")


def rc_slab_oneway(
    label="D1",
    span_m=5.0,
    h_mm=200.0,
    c_mm=25.0,              # dæklag til hovedarmeringen
    o_mm=10.0, s_mm=150.0,  # hovedarmering Ø/s
    d_mm=None,
    fck_MPa=30.0, fyk_MPa=500.0,
    gamma_C=1.45, gamma_S=1.20, alpha_cc=1.0,
    last="linje",
    g_k_kNm2=3.5, q_k_kNm2=2.5, consequence_class="CC2",
    w_Ed_kNm2=None, kombi_label=None,
    M_Ed_kNmm=None, V_Ed_kNm=None,
    **_ignored,
):
    if fck_MPa > 50:
        raise ValueError("Modulet dækker betonklasser til og med C50/60.")
    if s_mm <= 0 or o_mm <= 0:
        raise ValueError("Angiv armeringens diameter og afstand.")
    b = 1000.0
    L = span_m
    d = d_mm if d_mm else h_mm - c_mm - o_mm / 2
    if not 0 < d < h_mm:
        raise ValueError(f"Den effektive højde d = {d:.0f} mm er ikke mulig i h = {h_mm:.0f} mm.")

    cc = CheckContext()
    fcd = alpha_cc * fck_MPa / gamma_C
    fyd = fyk_MPa / gamma_S
    eps_yd = fyd / E_S
    fctm = 0.30 * fck_MPa ** (2 / 3)
    A_s = math.pi * o_mm ** 2 / 4 * 1000 / s_mm

    blocks = [MH(
        f"{label} — Betondæk, enkeltspændt  (EN 1992-1-1)",
        f"h = {h_mm:.0f} mm · C{fck_MPa:.0f} · B{fyk_MPa:.0f} · L = {_dk(L)} m · Ø{o_mm:.0f}/{s_mm:.0f}",
        "concrete",
    )]

    blocks.append(S("Materialer — DK NA"))
    blocks += [
        CALC_ROW("f_cd", f"= α_cc·f_ck/γ_c = {_dk(alpha_cc)}·{fck_MPa:.0f}/{_dk(gamma_C)}", f"{_dk(fcd)} MPa"),
        CALC_ROW("f_yd", f"= f_yk/γ_s = {fyk_MPa:.0f}/{_dk(gamma_S)}", f"{_dk(fyd, 1)} MPa"),
        CALC_ROW("f_ctm", "= 0,30·f_ck^(2/3)", f"{_dk(fctm)} MPa"),
    ]

    blocks.append(S("Tværsnit — 1 m stribe"))
    blocks += [
        CALC_ROW("d", ("angivet" if d_mm else
                       f"= h − c − Ø/2 = {h_mm:.0f} − {c_mm:.0f} − {o_mm / 2:.0f}"), f"{d:.0f} mm"),
        CALC_ROW("A_s", f"= π·{o_mm:.0f}²/4 · 1000/{s_mm:.0f}", f"{A_s:.0f} mm²/m"),
    ]

    blocks.append(S("Snitkræfter i brudgrænsetilstanden"))
    if last == "direkte":
        if M_Ed_kNmm is None or V_Ed_kNm is None:
            raise ValueError("Angiv både M_Ed og V_Ed.")
        M, V = abs(float(M_Ed_kNmm)), abs(float(V_Ed_kNm))
        blocks += [CALC_ROW("M_Ed", "angivet", f"{_dk(M, 1)} kNm/m"),
                   CALC_ROW("V_Ed", "angivet", f"{_dk(V, 1)} kN/m")]
    else:
        if last == "kombi":
            if w_Ed_kNm2 is None:
                raise ValueError("Lastkombinationen er ikke regnet.")
            w = float(w_Ed_kNm2)
            blocks.append(CALC_ROW("w_Ed", f"fra {kombi_label}" if kombi_label else "fra lastkombination",
                                   f"{_dk(w)} kN/m²"))
        else:
            kfi = K_FI_MAP.get(consequence_class.upper(), 1.0)
            w_a = 1.2 * kfi * g_k_kNm2
            w_b = 1.0 * kfi * g_k_kNm2 + 1.5 * kfi * q_k_kNm2
            w = max(w_a, w_b)
            blocks += [
                CALC_ROW("6.10a", f"= 1,2·K_FI·g_k   (K_FI = {_dk(kfi, 1)})", f"{_dk(w_a)} kN/m²"),
                CALC_ROW("6.10b", "= 1,0·K_FI·g_k + 1,5·K_FI·q_k", f"{_dk(w_b)} kN/m²"),
                CALC_ROW("w_Ed", "= den største af 6.10a og 6.10b", f"{_dk(w)} kN/m²"),
            ]
        M = w * L ** 2 / 8
        V = w * L / 2
        blocks += [
            CALC_ROW("M_Ed", f"= w_Ed·L²/8 = {_dk(w)}·{_dk(L)}²/8", f"{_dk(M, 1)} kNm/m"),
            CALC_ROW("V_Ed", "= w_Ed·L/2", f"{_dk(V, 1)} kN/m"),
        ]

    # ── Bøjning ──────────────────────────────────────────────────────────────
    blocks.append(S("Bøjning — §6.1"))
    x = A_s * fyd / (0.8 * b * fcd)
    eps_s = EPS_CU3 * (d - x) / x
    flyder = eps_s >= eps_yd
    if not flyder:
        a_ = 0.8 * b * fcd
        b_ = A_s * E_S * EPS_CU3
        x = (-b_ + math.sqrt(b_ ** 2 + 4 * a_ * b_ * d)) / (2 * a_)
    M_Rd = 0.8 * b * fcd * x * (d - 0.4 * x) / 1e6
    blocks += [
        CALC_ROW("x", "= A_s·f_yd/(0,8·b·f_cd)" if flyder else "ligevægt, armeringen flyder ikke",
                 f"{_dk(x, 1)} mm"),
        CALC_ROW("M_Rd", "= 0,8·b·x·f_cd·(d − 0,4·x)", f"{_dk(M_Rd, 1)} kNm/m"),
        cc.check("Bøjning  M_Ed ≤ M_Rd  (§6.1)", M / M_Rd, 1.0),
        cc.check_bool("Armeringen flyder (ε_s ≥ ε_yd)", flyder, "OK", "overarmeret"),
    ]
    mu = M * 1e6 / (b * d ** 2 * fcd)
    A_s_req = (1 - math.sqrt(1 - 2 * mu)) * b * d * fcd / fyd if mu < 0.5 else float("inf")
    blocks.append(CALC_ROW("A_s,req", "= (1 − √(1 − 2μ))·b·d·f_cd/f_yd, μ = M_Ed/(b·d²·f_cd)",
                           f"{A_s_req:.0f} mm²/m" if math.isfinite(A_s_req) else "—"))

    # ── Armeringsregler ──────────────────────────────────────────────────────
    blocks.append(S("Armeringsregler — §9.3.1.1"))
    A_min = max(0.26 * fctm / fyk_MPa * b * d, 0.0013 * b * d)
    A_max = 0.04 * b * h_mm
    s_max = min(3 * h_mm, 400.0)
    blocks += [
        CALC_ROW("A_s,min", "= max(0,26·f_ctm/f_yk·b·d; 0,0013·b·d)", f"{A_min:.0f} mm²/m"),
        CALC_ROW("A_s,max", "= 0,04·A_c", f"{A_max:.0f} mm²/m"),
        CALC_ROW("s_max", "= min(3·h; 400 mm), hovedarmering", f"{s_max:.0f} mm"),
        cc.check("A_s ≥ A_s,min", A_min / A_s, 1.0),
        cc.check("A_s ≤ A_s,max", A_s / A_max, 1.0),
        cc.check("Stangafstand  s ≤ s_max", s_mm / s_max, 1.0),
    ]
    blocks.append(N(f"Fordelingsarmering på tværs: mindst 20 % af hovedarmeringen, "
                    f"dvs. {0.2 * A_s:.0f} mm²/m (§9.3.1.1(2))."))

    # ── Forskydning ──────────────────────────────────────────────────────────
    blocks.append(S("Forskydning uden forskydningsarmering — §6.2.2"))
    k = min(1 + math.sqrt(200 / d), 2.0)
    rho_l = min(A_s / (b * d), 0.02)
    v_c = 0.18 / gamma_C * k * (100 * rho_l * fck_MPa) ** (1 / 3)
    v_min = 0.035 * k ** 1.5 * math.sqrt(fck_MPa)
    V_Rdc = max(v_c, v_min) * b * d / 1000
    blocks += [
        CALC_ROW("k", "= 1 + √(200/d) ≤ 2,0", _dk(k, 3)),
        CALC_ROW("ρ_l", "= A_s/(b·d) ≤ 0,02", _dk(rho_l, 4)),
        CALC_ROW("v_min", "= 0,035·k^(3/2)·√f_ck", f"{_dk(v_min, 3)} MPa"),
        CALC_ROW("V_Rd,c", "= max(0,18/γ_c·k·(100·ρ_l·f_ck)^(1/3); v_min)·b·d", f"{_dk(V_Rdc, 1)} kN/m"),
        cc.check("Forskydning  V_Ed ≤ V_Rd,c", V / V_Rdc, 1.0),
    ]
    blocks.append(N("Hele armeringen er forudsat ført frem over vederlaget og forankret dér; "
                    "ellers skal ρ_l regnes af den del, der når frem."))

    # ── Nedbøjning ───────────────────────────────────────────────────────────
    blocks.append(S("Nedbøjning — forenklet, §7.4.2"))
    if math.isfinite(A_s_req):
        As_ref = max(A_s_req, A_min)
        rho = As_ref / (b * d)
        rho0 = math.sqrt(fck_MPa) * 1e-3
        if rho <= rho0:
            ld = 11 + 1.5 * math.sqrt(fck_MPa) * rho0 / rho + 3.2 * math.sqrt(fck_MPa) * (rho0 / rho - 1) ** 1.5
            formel = "(7.16a)"
        else:
            ld = 11 + 1.5 * math.sqrt(fck_MPa) * rho0 / rho
            formel = "(7.16b), ρ' = 0"
        faktor = min(500 / fyk_MPa * A_s / As_ref, 1.5)
        ld_tilladt = ld * faktor
        ld_aktuel = L * 1000 / d
        blocks += [
            CALC_ROW("ρ", "= max(A_s,req; A_s,min)/(b·d)", _dk(rho, 4)),
            CALC_ROW("ρ₀", "= √f_ck·10⁻³", _dk(rho0, 4)),
            CALC_ROW("l/d", f"grundværdi {formel}, K = 1,0", _dk(ld, 1)),
            CALC_ROW("310/σ_s", "≈ 500/f_yk · A_s,prov/A_s,req ≤ 1,5  (7.17)", _dk(faktor, 2)),
            CALC_ROW("(l/d)_tilladt", "", _dk(ld_tilladt, 1)),
            CALC_ROW("(l/d)_aktuel", "= L/d", _dk(ld_aktuel, 1)),
            cc.check("Nedbøjning  l/d ≤ (l/d)_tilladt", ld_aktuel / ld_tilladt, 1.0),
        ]
    return blocks
