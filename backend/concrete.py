"""
concrete.py — armeret betonbjælke, rektangulært tværsnit (DS/EN 1992-1-1 DK NA)

Simpelt understøttet bjælke med ét lag trækarmering og lodrette bøjler.
Eftervises:

  §6.1     bøjning med rektangulær spændingsblok (λ = 0,8, η = 1,0),
           og at trækarmeringen flyder (ellers er tværsnittet overarmeret)
  §9.2.1.1 minimums- og maksimumsarmering
  §6.2.2   forskydning uden forskydningsarmering, V_Rd,c
  §6.2.3   forskydning med lodrette bøjler, V_Rd,s og V_Rd,max, cot θ valgt
           så stor som muligt i intervallet 1,0–2,5
  §9.2.2   minimum bøjlearmering og største bøjleafstand
  §7.4.2   nedbøjning, forenklet ved grænseværdi for l/d

DK NA: α_cc = 1,0, γ_c = 1,45 og γ_s = 1,20. Lasten kombineres efter 6.10a/b
med K_FI, eller hentes som M_Ed og V_Ed. Tal i mm, kN og MPa.
"""
import hashlib
import math
import tempfile
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

from calc_core import S, T, N, MH, CheckContext, FIG, CALC_ROW

E_S = 200_000.0      # MPa
EPS_CU3 = 0.0035
K_FI_MAP = {"CC1": 0.9, "CC2": 1.0, "CC3": 1.1}


def _dk(v, d=2):
    return f"{v:.{d}f}".replace(".", ",")


def _snittegning(b, h, c, o_bojle, n, o, d, tmp_dir):
    fig, ax = plt.subplots(figsize=(2.6, max(3.0, 2.4 * h / b) + 0.6))
    ax.add_patch(mpatches.Rectangle((0, 0), b, h, lw=2, ec='#333333', fc='#ede8e1'))
    # Bøjle
    ib = c + o_bojle / 2
    ax.add_patch(mpatches.Rectangle((ib, ib), b - 2 * ib, h - 2 * ib,
                                    lw=1.2, ec='#555555', fc='none'))
    y = h - d
    x0 = c + o_bojle + o / 2
    x1 = b - x0
    for i in range(n):
        x = x0 + (x1 - x0) * (i / (n - 1) if n > 1 else 0.5)
        ax.add_patch(mpatches.Circle((x, y), o / 2, color='#1a1a1a', zorder=5))
    ax.plot([0, b], [y, y], color='#3a7bbf', lw=1.0, ls='--')
    mx, my = b * 0.45, h * 0.16
    ax.set_xlim(-mx * 0.3, b + mx * 1.6)
    ax.set_ylim(-my, h + my * 0.5)
    ax.set_aspect('equal')
    ax.axis('off')
    arr = dict(arrowprops=dict(arrowstyle='<->', color='#555555', lw=1.0, mutation_scale=9))
    ax.annotate('', xy=(b, -my * 0.4), xytext=(0, -my * 0.4), **arr)
    ax.text(b / 2, -my * 0.7, f'b = {b:.0f}', ha='center', va='top', fontsize=8)
    ax.annotate('', xy=(b + mx * 0.4, h), xytext=(b + mx * 0.4, 0), **arr)
    ax.text(b + mx * 0.55, h / 2, f'h = {h:.0f}', ha='left', va='center', fontsize=8, rotation=90)
    ax.annotate('', xy=(b + mx * 1.0, y), xytext=(b + mx * 1.0, h),
                arrowprops=dict(arrowstyle='<->', color='#3a7bbf', lw=1.0, mutation_scale=9))
    ax.text(b + mx * 1.15, (h + y) / 2, f'd = {d:.0f}', ha='left', va='center',
            fontsize=8, color='#3a7bbf', rotation=90)
    plt.tight_layout()
    p = Path(tmp_dir) / 'snit.png'
    fig.savefig(str(p), dpi=130, bbox_inches='tight')
    plt.close(fig)
    return p


def rc_bjaelke(
    label="B1",
    span_m=5.0,
    b_mm=300.0, h_mm=500.0,
    c_mm=30.0,              # dæklag til bøjlen
    o_bojle_mm=8.0,
    n_traek=3, o_traek_mm=16.0,
    d_mm=None,              # None = regnes af dæklag og stangdiametre
    f_ck=30.0, f_yk=500.0,
    gamma_c=1.45, gamma_s=1.20, alpha_cc=1.0,
    # Last
    last="linje",           # "linje" | "kombi" | "direkte"
    g_k=10.0, q_k=6.0,      # kN/m
    consequence_class="CC2",
    w_Ed=None,              # kN/m, fra en lastkombination
    kombi_label=None,
    M_Ed=None, V_Ed=None,   # kNm, kN
    # Bøjler
    bojle_s_mm=200.0, bojle_snit=2, f_ywk=None,
):
    if f_ck > 50:
        raise ValueError("Modulet dækker betonklasser til og med C50/60 "
                         "(ε_cu3 = 3,5 ‰, λ = 0,8, η = 1,0).")
    if b_mm <= 0 or h_mm <= 0 or span_m <= 0:
        raise ValueError("Bredde, højde og spændvidde skal være positive.")
    if n_traek < 1:
        raise ValueError("Der skal være mindst én trækstang.")
    f_ywk = f_ywk or f_yk

    d = d_mm if d_mm else h_mm - c_mm - o_bojle_mm - o_traek_mm / 2
    if not 0 < d < h_mm:
        raise ValueError(f"Den effektive højde d = {d:.0f} mm er ikke mulig i h = {h_mm:.0f} mm.")
    b = b_mm
    L = span_m

    cc = CheckContext()
    blocks = [MH(
        f"{label} — Betonbjælke {b:.0f}×{h_mm:.0f}  (EN 1992-1-1)",
        f"C{f_ck:.0f} · B{f_yk:.0f} · L = {_dk(L)} m · {n_traek} Ø{o_traek_mm:.0f} · "
        f"bøjler Ø{o_bojle_mm:.0f}/{bojle_s_mm:.0f}",
        material="concrete",
    )]

    # ── Materialer ───────────────────────────────────────────────────────────
    f_cd = alpha_cc * f_ck / gamma_c
    f_yd = f_yk / gamma_s
    f_ywd = f_ywk / gamma_s
    eps_yd = f_yd / E_S
    f_ctm = 0.30 * f_ck ** (2 / 3)
    blocks.append(S("Materialer — DK NA"))
    blocks += [
        CALC_ROW("f_cd", f"= α_cc·f_ck / γ_c = {_dk(alpha_cc)}·{_dk(f_ck, 0)} / {_dk(gamma_c)}",
                 f"{_dk(f_cd)} MPa"),
        CALC_ROW("f_yd", f"= f_yk / γ_s = {_dk(f_yk, 0)} / {_dk(gamma_s)}", f"{_dk(f_yd, 1)} MPa"),
        CALC_ROW("ε_yd", "= f_yd / E_s", f"{_dk(eps_yd * 1000, 2)} ‰"),
        CALC_ROW("f_ctm", "= 0,30·f_ck^(2/3)  tabel 3.1", f"{_dk(f_ctm)} MPa"),
    ]

    # ── Geometri ─────────────────────────────────────────────────────────────
    A_s = n_traek * math.pi * o_traek_mm ** 2 / 4
    blocks.append(S("Tværsnit"))
    rows = [
        CALC_ROW("b × h", "", f"{b:.0f} × {h_mm:.0f} mm"),
        CALC_ROW("d", ("angivet" if d_mm else
                       f"= h − c − Ø_bøjle − Ø/2 = {h_mm:.0f} − {c_mm:.0f} − "
                       f"{o_bojle_mm:.0f} − {o_traek_mm / 2:.0f}"), f"{d:.0f} mm"),
        CALC_ROW("A_s", f"= {n_traek}·π·{o_traek_mm:.0f}²/4", f"{A_s:.0f} mm²"),
    ]
    blocks += rows
    with tempfile.TemporaryDirectory() as tmp:
        data = _snittegning(b, h_mm, c_mm, o_bojle_mm, n_traek, o_traek_mm, d, tmp).read_bytes()
    out = Path(tempfile.gettempdir()) / f"rc_snit_{hashlib.md5(data).hexdigest()[:12]}.png"
    if not out.exists():
        out.write_bytes(data)
    blocks.append(FIG(str(out), "Tværsnit med trækarmering og bøjle.", width_mm=70))

    # ── Snitkræfter ──────────────────────────────────────────────────────────
    blocks.append(S("Snitkræfter i brudgrænsetilstanden"))
    if last == "direkte":
        if M_Ed is None or V_Ed is None:
            raise ValueError("Angiv både M_Ed og V_Ed.")
        M, V = abs(float(M_Ed)), abs(float(V_Ed))
        blocks += [CALC_ROW("M_Ed", "angivet", f"{_dk(M, 1)} kNm"),
                   CALC_ROW("V_Ed", "angivet", f"{_dk(V, 1)} kN")]
    else:
        if last == "kombi":
            if w_Ed is None:
                raise ValueError("Lastkombinationen er ikke regnet.")
            w = float(w_Ed)
            blocks.append(CALC_ROW(
                "w_Ed", f"fra {kombi_label}" if kombi_label else "fra lastkombination",
                f"{_dk(w)} kN/m"))
        else:
            kfi = K_FI_MAP.get(consequence_class.upper(), 1.0)
            w_a = 1.2 * kfi * g_k
            w_b = 1.0 * kfi * g_k + 1.5 * kfi * q_k
            w = max(w_a, w_b)
            blocks += [
                CALC_ROW("6.10a", f"= 1,2·K_FI·g_k   (K_FI = {_dk(kfi, 1)})", f"{_dk(w_a)} kN/m"),
                CALC_ROW("6.10b", "= 1,0·K_FI·g_k + 1,5·K_FI·q_k", f"{_dk(w_b)} kN/m"),
                CALC_ROW("w_Ed", "= den største af 6.10a og 6.10b", f"{_dk(w)} kN/m"),
            ]
        M = w * L ** 2 / 8
        V = w * L / 2
        blocks += [
            CALC_ROW("M_Ed", f"= w_Ed·L²/8 = {_dk(w)}·{_dk(L)}²/8", f"{_dk(M, 1)} kNm"),
            CALC_ROW("V_Ed", f"= w_Ed·L/2", f"{_dk(V, 1)} kN"),
        ]
        blocks.append(N("Simpelt understøttet bjælke med jævnt fordelt last. V_Ed er "
                        "taget ved understøtningen, hvilket er på den sikre side."))

    # ── Bøjning §6.1 ─────────────────────────────────────────────────────────
    blocks.append(S("Bøjning — §6.1 og §3.1.7"))
    x = A_s * f_yd / (0.8 * b * f_cd)
    eps_s = EPS_CU3 * (d - x) / x
    flyder = eps_s >= eps_yd
    if flyder:
        sigma_s = f_yd
        blocks += [
            CALC_ROW("x", "= A_s·f_yd / (0,8·b·f_cd)", f"{_dk(x, 1)} mm"),
            CALC_ROW("ε_s", "= ε_cu3·(d − x)/x", f"{_dk(eps_s * 1000, 2)} ‰ ≥ ε_yd — armeringen flyder"),
        ]
    else:
        # Overarmeret: σ_s = E_s·ε_cu3·(d − x)/x, ligevægt giver en andengradsligning i x.
        a_ = 0.8 * b * f_cd
        b_ = A_s * E_S * EPS_CU3
        x = (-b_ + math.sqrt(b_ ** 2 + 4 * a_ * b_ * d)) / (2 * a_)
        eps_s = EPS_CU3 * (d - x) / x
        sigma_s = E_S * eps_s
        blocks += [
            CALC_ROW("x", "= ligevægt med σ_s = E_s·ε_cu3·(d − x)/x", f"{_dk(x, 1)} mm"),
            CALC_ROW("ε_s", "= ε_cu3·(d − x)/x", f"{_dk(eps_s * 1000, 2)} ‰ < ε_yd"),
        ]
    M_Rd = 0.8 * b * f_cd * x * (d - 0.4 * x) / 1e6
    blocks += [
        CALC_ROW("M_Rd", "= 0,8·b·x·f_cd·(d − 0,4·x)", f"{_dk(M_Rd, 1)} kNm"),
        cc.check("Bøjning  M_Ed ≤ M_Rd  (§6.1)", M / M_Rd, 1.0),
        cc.check_bool("Trækarmeringen flyder (ε_s ≥ ε_yd)", flyder,
                      "OK", "overarmeret — øg tværsnittet eller brug trykarmering"),
    ]

    mu = M * 1e6 / (b * d ** 2 * f_cd)
    xi_bal = EPS_CU3 / (EPS_CU3 + eps_yd)
    mu_bal = 0.8 * xi_bal * (1 - 0.4 * xi_bal)
    if mu < 0.5:
        omega = 1 - math.sqrt(1 - 2 * mu)
        A_s_req = omega * b * d * f_cd / f_yd
    else:
        omega, A_s_req = None, float("inf")
    blocks += [
        CALC_ROW("μ", "= M_Ed / (b·d²·f_cd)", _dk(mu, 3)),
        CALC_ROW("μ_bal", "= 0,8·ξ_bal·(1 − 0,4·ξ_bal), ξ_bal = ε_cu3/(ε_cu3 + ε_yd)", _dk(mu_bal, 3)),
        CALC_ROW("A_s,req", "= (1 − √(1 − 2μ))·b·d·f_cd / f_yd",
                 f"{A_s_req:.0f} mm²" if math.isfinite(A_s_req) else "—"),
    ]
    if mu > mu_bal:
        blocks.append(N("μ > μ_bal: et enkeltarmeret tværsnit kan ikke optage momentet, "
                        "uden at armeringen holder op med at flyde. Øg højden, eller "
                        "regn med trykarmering."))

    # ── Minimum og maksimum §9.2.1.1 ─────────────────────────────────────────
    blocks.append(S("Armeringsmængde — §9.2.1.1"))
    A_min = max(0.26 * f_ctm / f_yk * b * d, 0.0013 * b * d)
    A_max = 0.04 * b * h_mm
    blocks += [
        CALC_ROW("A_s,min", "= max(0,26·f_ctm/f_yk·b·d; 0,0013·b·d)", f"{A_min:.0f} mm²"),
        CALC_ROW("A_s,max", "= 0,04·A_c", f"{A_max:.0f} mm²"),
        cc.check("A_s ≥ A_s,min", A_min / A_s, 1.0),
        cc.check("A_s ≤ A_s,max", A_s / A_max, 1.0),
    ]

    # ── Forskydning §6.2 ─────────────────────────────────────────────────────
    blocks.append(S("Forskydning uden forskydningsarmering — §6.2.2"))
    k = min(1 + math.sqrt(200 / d), 2.0)
    rho_l = min(A_s / (b * d), 0.02)
    C = 0.18 / gamma_c
    v_c = C * k * (100 * rho_l * f_ck) ** (1 / 3)
    v_min = 0.035 * k ** 1.5 * math.sqrt(f_ck)
    V_Rdc = max(v_c, v_min) * b * d / 1000
    blocks += [
        CALC_ROW("k", "= 1 + √(200/d) ≤ 2,0", _dk(k, 3)),
        CALC_ROW("ρ_l", "= A_s/(b·d) ≤ 0,02", _dk(rho_l, 4)),
        CALC_ROW("C_Rd,c", "= 0,18/γ_c", _dk(C, 4)),
        CALC_ROW("v_min", "= 0,035·k^(3/2)·√f_ck", f"{_dk(v_min, 3)} MPa"),
        CALC_ROW("V_Rd,c", "= max(C_Rd,c·k·(100·ρ_l·f_ck)^(1/3); v_min)·b·d",
                 f"{_dk(V_Rdc, 1)} kN"),
    ]
    blocks.append(T("V_Ed ≤ V_Rd,c: der kræves kun minimumsbøjler." if V <= V_Rdc
                    else "V_Ed > V_Rd,c: bøjlerne skal optage hele forskydningskraften."))

    blocks.append(S("Forskydning med lodrette bøjler — §6.2.3"))
    z = 0.9 * d
    nu1 = 0.6 * (1 - f_ck / 250)
    A_sw = bojle_snit * math.pi * o_bojle_mm ** 2 / 4
    r = b * z * nu1 * f_cd / (V * 1000) if V > 0 else float("inf")
    if r >= 2.5 + 1 / 2.5:
        cot = 2.5
    elif r >= 2.0:
        cot = (r + math.sqrt(r * r - 4)) / 2
    else:
        cot = 1.0
    V_Rdmax = b * z * nu1 * f_cd / (cot + 1 / cot) / 1000
    V_Rds = A_sw / bojle_s_mm * z * f_ywd * cot / 1000
    blocks += [
        CALC_ROW("z", "= 0,9·d", f"{_dk(z, 0)} mm"),
        CALC_ROW("ν₁", "= 0,6·(1 − f_ck/250)", _dk(nu1, 3)),
        CALC_ROW("cot θ", "største værdi i 1,0–2,5 med V_Ed ≤ V_Rd,max", _dk(cot, 2)),
        CALC_ROW("A_sw", f"= {bojle_snit}·π·{o_bojle_mm:.0f}²/4", f"{A_sw:.0f} mm²"),
        CALC_ROW("V_Rd,s", "= A_sw/s·z·f_ywd·cot θ  (6.8)", f"{_dk(V_Rds, 1)} kN"),
        CALC_ROW("V_Rd,max", "= b·z·ν₁·f_cd / (cot θ + tan θ)  (6.9)", f"{_dk(V_Rdmax, 1)} kN"),
        cc.check("Trykbrud i betonen  V_Ed ≤ V_Rd,max", V / V_Rdmax, 1.0),
    ]
    if V > V_Rdc:
        blocks.append(cc.check("Bøjler  V_Ed ≤ V_Rd,s", V / V_Rds, 1.0))

    rho_w = A_sw / (bojle_s_mm * b)
    rho_w_min = 0.08 * math.sqrt(f_ck) / f_ywk
    s_max = 0.75 * d
    blocks += [
        CALC_ROW("ρ_w", "= A_sw/(s·b)", _dk(rho_w, 5)),
        CALC_ROW("ρ_w,min", "= 0,08·√f_ck / f_yk  (9.5N)", _dk(rho_w_min, 5)),
        cc.check("Minimum bøjlearmering  §9.2.2(5)", rho_w_min / rho_w, 1.0),
        CALC_ROW("s_l,max", "= 0,75·d  (9.6N)", f"{s_max:.0f} mm"),
        cc.check("Bøjleafstand  s ≤ s_l,max", bojle_s_mm / s_max, 1.0),
    ]

    # ── Nedbøjning §7.4.2 ────────────────────────────────────────────────────
    blocks.append(S("Nedbøjning — forenklet, §7.4.2"))
    if math.isfinite(A_s_req) and A_s_req > 0:
        # ρ regnes af mindst A_s,min; med et meget lille A_s,req vokser (7.16a)
        # uden grænse og siger intet om den faktiske bjælke.
        rho = max(A_s_req, A_min) / (b * d)
        rho0 = math.sqrt(f_ck) * 1e-3
        K = 1.0
        if rho <= rho0:
            ld = K * (11 + 1.5 * math.sqrt(f_ck) * rho0 / rho
                      + 3.2 * math.sqrt(f_ck) * (rho0 / rho - 1) ** 1.5)
            formel = "(7.16a)"
        else:
            ld = K * (11 + 1.5 * math.sqrt(f_ck) * rho0 / rho)
            formel = "(7.16b), ρ' = 0"
        faktor = min((500 / f_yk) * (A_s / max(A_s_req, A_min)), 1.5)
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
        blocks.append(N("Grænseværdien for l/d erstatter en egentlig nedbøjningsberegning "
                        "for en almindelig bjælke. Stiller byggeriet særlige krav til "
                        "nedbøjningen, skal den regnes."))

    return blocks
