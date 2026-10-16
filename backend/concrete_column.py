"""
concrete_column.py — armeret betonsøjle, rektangulært tværsnit (DS/EN 1992-1-1 DK NA)

Armering i to sider (tryk og træk), bøjning om én akse. Eftervises:

  §3.1.7/§6.1  N–M-kurve med rektangulær spændingsblok
  §5.2         geometrisk imperfektion, e_i = l₀/400
  §6.1(4)      mindste excentricitet e₀ = max(h/30; 20 mm)
  §5.8.3.1     slankhedsgrænse λ_lim
  §5.8.7       2. ordens effekter ved nominel stivhed (5.8.7.2) og
               momentforøgelse (5.8.7.3) med β = 1
  §9.5.2       minimums- og maksimumsarmering, mindste stangdiameter
  Anneks B     krybetal

Søjlen antages at indgå i et afstivet system. Enheder mm, kN og MPa.
"""

from math import pi, sqrt
import numpy as np
import hashlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from pathlib import Path
import tempfile

import forallpeople as si
si.environment('structural', top_level=True)

from calc_core import S, T, N, TBL, MH, CheckContext, FIG, CALC_ROW


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS  (plain floats: mm / kN / MPa throughout)
# ─────────────────────────────────────────────────────────────────────────────

def _ecm_mpa(fck):
    """Mean modulus of elasticity [MPa]. EN 1992-1-1 cl. 3.1.3."""
    fcm = fck + 8.0
    return 22_000.0 * (fcm / 10.0) ** 0.3


def _creep_phi0(fck, RH, t0_days, h_mm, b_mm):
    """
    Basic creep coefficient φ₀ per EN 1992-1-1 Annex B.
    fck [MPa], RH [0–1], t0_days [days], section h × b [mm].
    """
    fcm = fck + 8.0
    Ac  = h_mm * b_mm
    u   = 2.0 * (h_mm + b_mm)
    h0  = 2.0 * Ac / u                    # notional thickness [mm]

    if fcm <= 35.0:
        phi_RH = 1.0 + (1.0 - RH) / (0.1 * h0 ** (1.0 / 3.0))
    else:
        a1 = (35.0 / fcm) ** 0.7
        a2 = (35.0 / fcm) ** 0.2
        phi_RH = (1.0 + (1.0 - RH) / (0.1 * h0 ** (1.0 / 3.0)) * a1) * a2

    beta_fcm = 16.8 / sqrt(fcm)
    beta_t0  = 1.0 / (0.1 + t0_days ** 0.2)
    return phi_RH * beta_fcm * beta_t0


def _nm_curve(fcd, fyd, b, h, a, As_c, As_t):
    """
    N–M-kurven for et rektangulært tværsnit, EN 1992-1-1 §3.1.7 og §6.1.

    Tøjningsfordelingen drejer om ε_cu3 i trykranden, så længe x ≤ h, og om
    punktet C i dybden h·(1 − ε_c3/ε_cu3) med ε_c3, når hele tværsnittet er
    trykket (figur 6.1). Rent tryk giver dermed ε_c3 = 1,75 ‰ i hele
    tværsnittet og σ_s = E_s·ε_c3, ikke f_yd.

    Enheder mm og MPa ind, kN og kNm ud. Tryk er positivt; M er positiv
    med tryk på den side, hvor A_s,c sidder.
    """
    Es      = 200_000.0
    eps_cu3 = 0.0035
    eps_c3  = 0.00175
    y_C     = h * (1 - eps_c3 / eps_cu3)
    d_c, d_t = a, h - a

    x_vals = np.unique(np.concatenate([
        np.linspace(0.01 * d_t, h, 120),
        h * np.logspace(0.0, 4.0, 80),
    ]))

    N_list = [-(fyd * (As_c + As_t)) * 1e-3]
    M_list = [(-fyd * As_c * (0.5 * h - d_c) - fyd * As_t * (0.5 * h - d_t)) * 1e-3]
    for x in x_vals:
        if x <= h:
            eps = lambda y: eps_cu3 * (x - y) / x
        else:
            eps = lambda y: eps_c3 * (x - y) / (x - y_C)
        s = min(0.8 * x, h)
        Fc = fcd * b * s * 1e-3
        z_Fc = 0.5 * h - 0.5 * s
        sig_sc = max(-fyd, min(fyd, Es * eps(d_c)))
        sig_st = max(-fyd, min(fyd, Es * eps(d_t)))
        Fsc = sig_sc * As_c * 1e-3
        Fst = sig_st * As_t * 1e-3
        N_list.append(Fc + Fsc + Fst)
        M_list.append((Fc * z_Fc + Fsc * (0.5 * h - d_c) + Fst * (0.5 * h - d_t)) * 1e-3)
    return np.array(N_list), np.array(M_list)


def _mrd_at_ned(N_curve, M_curve, NEd_kN):
    M = np.asarray(M_curve)
    N = np.asarray(N_curve)
    mask = M >= 0.0
    Np, Mp = N[mask], M[mask]
    idx    = np.argsort(Np)
    Np, Mp = Np[idx], Mp[idx]
    if NEd_kN < Np[0] or NEd_kN > Np[-1]:
        return None
    return float(np.interp(NEd_kN, Np, Mp))


def _nm_plot(N_curve, M_curve, load_pts, h_mm, tmp_dir):
    fig, ax = plt.subplots(figsize=(6, 6))

    Nc = np.asarray(N_curve)
    Mc = np.asarray(M_curve)
    idx  = np.argsort(Nc)
    Nc_s = Nc[idx]
    Mc_s = Mc[idx]

    ax.plot(np.abs(Mc_s), Nc_s, color='#595F61', lw=1.8, label='N–M-kurve')
    ax.axhline(0, color='#aaa', lw=0.5, ls='--')
    ax.axvline(0, color='#aaa', lw=0.5, ls='--')

    colours = ['#E74825', '#12788E', '#032E38', '#AE3419', '#595F61',
               '#F78369', '#4CACC2', '#5A8C70', '#D4721E', '#888']

    for i, pt in enumerate(load_pts):
        lbl  = pt.get('label', f'LC{i+1}')
        NEd  = pt['NEd_kN']
        MEd  = pt['MEd_kNm']
        ok   = pt.get('ok', True)
        col  = colours[i % len(colours)]
        mk   = 'o' if ok else 'x'
        ms   = 8 if ok else 10
        ax.scatter([abs(MEd)], [NEd], color=col, marker=mk, s=ms**2, zorder=5,
                   label=f'{lbl}  ({abs(MEd):.1f} kNm, {NEd:.0f} kN)'.replace('.', ','))

    ax.set_xlabel('M  [kNm]', fontsize=10)
    ax.set_ylabel('N  [kN]',  fontsize=10)
    ax.set_title(f'N–M-interaktion  (h = {h_mm:.0f} mm)', fontsize=11)
    ax.legend(fontsize=8, loc='upper right')
    ax.grid(True, alpha=0.3)
    plt.tight_layout()

    out_path = Path(tmp_dir) / 'nm_diagram.png'
    fig.savefig(str(out_path), dpi=130, bbox_inches='tight')
    plt.close(fig)
    return str(out_path)


def _section_plot_column(h_mm, b_mm, c_mm, da_c_mm, n_c, da_t_mm, n_t, tmp_dir):
    """Draw column cross-section with bars and dimension annotations."""
    aspect = h_mm / b_mm
    fig_h  = max(3.0, 2.8 * aspect) + 0.8
    fig, ax = plt.subplots(figsize=(2.8, fig_h))

    # Concrete outline
    ax.add_patch(mpatches.Rectangle(
        (0, 0), b_mm, h_mm,
        linewidth=2, edgecolor='#333333', facecolor='#ede8e1',
    ))
    # Cover dashed inner rect
    ax.add_patch(mpatches.Rectangle(
        (c_mm, c_mm), b_mm - 2*c_mm, h_mm - 2*c_mm,
        linewidth=0.8, edgecolor='#aaaaaa', facecolor='none', linestyle='--',
    ))

    def _bar_x(n, width, cover):
        if n == 1:
            return [width / 2.0]
        return [cover + i * (width - 2*cover) / (n - 1) for i in range(n)]

    # Compression bars — centroid at h - c from bottom
    r_c = da_c_mm / 2.0
    for x in _bar_x(n_c, b_mm, c_mm):
        ax.add_patch(mpatches.Circle((x, h_mm - c_mm), r_c, color='#1a1a1a', zorder=5))

    # Tension bars — centroid at c from bottom
    r_t = da_t_mm / 2.0
    for x in _bar_x(n_t, b_mm, c_mm):
        ax.add_patch(mpatches.Circle((x, c_mm), r_t, color='#1a1a1a', zorder=5))

    mx = b_mm * 0.40
    my = h_mm * 0.18
    ax.set_xlim(-mx, b_mm + mx * 2.3)
    ax.set_ylim(-my, h_mm + my * 0.9)
    ax.set_aspect('equal')
    ax.axis('off')

    arr = dict(arrowprops=dict(arrowstyle='<->', color='#555555', lw=1.1,
                               mutation_scale=10))
    # b dimension (below)
    ax.annotate('', xy=(b_mm, -my*0.45), xytext=(0, -my*0.45), **arr)
    ax.text(b_mm/2, -my*0.82, f'b = {b_mm:.0f} mm',
            ha='center', va='top', fontsize=8)
    # h dimension (right)
    x_h = b_mm + mx * 0.55
    ax.annotate('', xy=(x_h, h_mm), xytext=(x_h, 0), **arr)
    ax.text(x_h + mx*0.18, h_mm/2, f'h = {h_mm:.0f} mm',
            ha='left', va='center', fontsize=8, rotation=90)
    # cover annotation (left side, short arrow)
    arr_c = dict(arrowprops=dict(arrowstyle='<->', color='#aaaaaa', lw=0.9,
                                 mutation_scale=8))
    ax.annotate('', xy=(c_mm, h_mm * 0.5), xytext=(0, h_mm * 0.5), **arr_c)
    ax.text(c_mm / 2, h_mm * 0.5 + my * 0.12, f'a={c_mm:.0f}',
            ha='center', va='bottom', fontsize=7, color='#888888')

    # Bar labels
    ax.text(b_mm/2, h_mm + my*0.12,
            f'{n_c}Ø{da_c_mm:.0f}  (tryk)',
            ha='center', va='bottom', fontsize=8, color='#333333')
    ax.text(b_mm/2, -my*0.08,
            f'{n_t}Ø{da_t_mm:.0f}  (træk)',
            ha='center', va='top', fontsize=8, color='#333333')

    ax.set_title('Tværsnit', fontsize=10, pad=6)
    plt.tight_layout()
    out_path = Path(tmp_dir) / 'section_col.png'
    fig.savefig(str(out_path), dpi=130, bbox_inches='tight')
    plt.close(fig)
    return str(out_path)


# ─────────────────────────────────────────────────────────────────────────────
# EFTERVISNING
# ─────────────────────────────────────────────────────────────────────────────

def _dk(v, d=2):
    return f"{v:.{d}f}".replace(".", ",")


def _gem_figur(data: bytes, navn: str) -> str:
    out = Path(tempfile.gettempdir()) / f"{navn}_{hashlib.md5(data).hexdigest()[:12]}.png"
    if not out.exists():
        out.write_bytes(data)
    return str(out)


def concrete_column_rect(
    label="C1",
    h_mm=300.0, b_mm=300.0,
    c_mm=45.0,              # a: afstand fra kant til armeringens tyngdepunkt
    da_c_mm=16.0, n_c=2,
    da_t_mm=16.0, n_t=2,
    fck_mpa=30.0, fyk_mpa=500.0,
    gamma_c=1.45, gamma_s=1.20, alpha_cc=1.0, gamma_cE=1.2,
    Ls_mm=3500.0, beta_eff=1.0,
    RH=0.50, t0_days=28.0,
    M0Eqp_over_M0Ed=0.7,
    load_cases=None,
    **_ignored,
):
    load_cases = load_cases or []
    if fck_mpa > 50:
        raise ValueError("Modulet dækker betonklasser til og med C50/60.")
    if not load_cases:
        raise ValueError("Angiv mindst ét lasttilfælde med N_Ed og M₀_Ed.")
    if not 0 < 2 * c_mm < h_mm:
        raise ValueError("Armeringens afstand a skal være mindre end h/2.")

    cc = CheckContext()
    h, b, a = h_mm, b_mm, c_mm
    blocks = [MH(
        f"{label} — Betonsøjle {h:.0f}×{b:.0f}  (EN 1992-1-1)",
        f"C{fck_mpa:.0f} · B{fyk_mpa:.0f} · L = {_dk(Ls_mm / 1000)} m · "
        f"{n_c} Ø{da_c_mm:.0f} + {n_t} Ø{da_t_mm:.0f}",
        material="concrete",
    )]

    # ── Materialer ───────────────────────────────────────────────────────────
    fcd = alpha_cc * fck_mpa / gamma_c
    fyd = fyk_mpa / gamma_s
    Ecm = _ecm_mpa(fck_mpa)
    Ecd = Ecm / gamma_cE
    Es = 200_000.0
    blocks.append(S("Materialer — DK NA"))
    blocks += [
        CALC_ROW("f_cd", f"= α_cc·f_ck/γ_c = {_dk(alpha_cc)}·{fck_mpa:.0f}/{_dk(gamma_c)}", f"{_dk(fcd)} MPa"),
        CALC_ROW("f_yd", f"= f_yk/γ_s = {fyk_mpa:.0f}/{_dk(gamma_s)}", f"{_dk(fyd, 1)} MPa"),
        CALC_ROW("E_cm", "= 22000·(f_cm/10)^0,3  tabel 3.1", f"{Ecm:.0f} MPa"),
        CALC_ROW("E_cd", "= E_cm/γ_cE  (5.20)", f"{Ecd:.0f} MPa"),
    ]

    # ── Tværsnit ─────────────────────────────────────────────────────────────
    Ac = h * b
    As_c = n_c * pi / 4 * da_c_mm ** 2
    As_t = n_t * pi / 4 * da_t_mm ** 2
    As = As_c + As_t
    d = h - a
    blocks.append(S("Tværsnit"))
    blocks += [
        CALC_ROW("h × b", "h i bøjningsretningen", f"{h:.0f} × {b:.0f} mm"),
        CALC_ROW("a", "kant til armeringens tyngdepunkt", f"{a:.0f} mm"),
        CALC_ROW("A_s,c", f"= {n_c}·π·{da_c_mm:.0f}²/4", f"{As_c:.0f} mm²"),
        CALC_ROW("A_s,t", f"= {n_t}·π·{da_t_mm:.0f}²/4", f"{As_t:.0f} mm²"),
        CALC_ROW("ρ", "= A_s/A_c", f"{_dk(As / Ac * 100)} %"),
    ]
    with tempfile.TemporaryDirectory() as tmp:
        img = _section_plot_column(h, b, a, da_c_mm, n_c, da_t_mm, n_t, tmp)
        data = Path(img).read_bytes()
    blocks.append(FIG(_gem_figur(data, "rc_soejle_snit"), "Tværsnit af søjlen.", width_mm=75))

    # ── Armering §9.5.2 ──────────────────────────────────────────────────────
    N_max = max(float(lc["NEd_kN"]) for lc in load_cases)
    As_min = max(0.10 * max(N_max, 0) * 1000 / fyd, 0.002 * Ac)
    As_max = 0.04 * Ac
    blocks.append(S("Armeringsmængde — §9.5.2"))
    blocks += [
        CALC_ROW("A_s,min", "= max(0,10·N_Ed/f_yd; 0,002·A_c)", f"{As_min:.0f} mm²"),
        CALC_ROW("A_s,max", "= 0,04·A_c", f"{As_max:.0f} mm²"),
        cc.check("A_s ≥ A_s,min", As_min / As, 1.0),
        cc.check("A_s ≤ A_s,max", As / As_max, 1.0),
        cc.check_bool("Længdestænger Ø ≥ 8 mm", min(da_c_mm, da_t_mm) >= 8,
                      "OK", "for tynde stænger"),
    ]

    # ── Krybning, anneks B ───────────────────────────────────────────────────
    phi0 = _creep_phi0(fck_mpa, RH, t0_days, h, b)
    phi_ef = phi0 * M0Eqp_over_M0Ed
    blocks.append(S("Krybning — anneks B og §5.8.4"))
    blocks += [
        CALC_ROW("h₀", "= 2·A_c/u", f"{_dk(2 * Ac / (2 * (h + b)), 0)} mm"),
        CALC_ROW("φ(∞,t₀)", f"RH = {RH * 100:.0f} %, t₀ = {t0_days:.0f} døgn", _dk(phi0, 2)),
        CALC_ROW("φ_ef", "= φ(∞,t₀)·M₀Eqp/M₀Ed  (5.19)", _dk(phi_ef, 2)),
    ]

    # ── Slankhed ─────────────────────────────────────────────────────────────
    Ic = b * h ** 3 / 12
    Is = As_c * (h / 2 - a) ** 2 + As_t * (h / 2 - a) ** 2
    i_rad = sqrt(Ic / Ac)
    l0 = beta_eff * Ls_mm
    lam = l0 / i_rad
    omega = As * fyd / (Ac * fcd)
    e_i = l0 / 400
    e_0 = max(h / 30, 20.0)
    A_ = 1 / (1 + 0.2 * phi_ef)
    B_ = sqrt(1 + 2 * omega)
    C_ = 0.7
    blocks.append(S("Slankhed og imperfektion — §5.8.3 og §5.2"))
    blocks += [
        CALC_ROW("l₀", f"= β·L = {_dk(beta_eff)}·{Ls_mm:.0f}", f"{l0:.0f} mm"),
        CALC_ROW("i", "= √(I_c/A_c)", f"{_dk(i_rad, 1)} mm"),
        CALC_ROW("λ", "= l₀/i", _dk(lam, 1)),
        CALC_ROW("ω", "= A_s·f_yd/(A_c·f_cd)", _dk(omega, 3)),
        CALC_ROW("A · B · C", "= 1/(1+0,2·φ_ef) · √(1+2ω) · 0,7", f"{_dk(A_, 3)} · {_dk(B_, 3)} · 0,7"),
        CALC_ROW("e_i", "= l₀/400  (5.2(9))", f"{_dk(e_i, 1)} mm"),
        CALC_ROW("e₀", "= max(h/30; 20 mm)  (6.1(4))", f"{_dk(e_0, 1)} mm"),
    ]
    blocks.append(N(
        f"β = {_dk(beta_eff)} er angivet af den projekterende. Søjlen regnes som en del "
        "af et afstivet system; for en udkraget eller ikke-afstivet søjle skal "
        "l₀ bestemmes ud fra rammens stabilitet. C = 0,7 svarer til ukendt "
        "momentforhold r_m (5.8.3.1(1))."))

    # ── N–M-kurve ────────────────────────────────────────────────────────────
    N_curve, M_curve = _nm_curve(fcd, fyd, b, h, a, As_c, As_t)
    k1 = sqrt(fck_mpa / 20)

    blocks.append(S("Lasttilfælde — 1. og 2. orden, §5.8.7"))
    rows, pts = [], []
    for lc in load_cases:
        navn = lc.get("label", "LC")
        NEd = float(lc["NEd_kN"])
        M0 = abs(float(lc["M0Ed_kNm"]))
        n = max(NEd * 1000 / (Ac * fcd), 0.0)
        lam_lim = 20 * A_ * B_ * C_ / sqrt(max(n, 1e-6))
        M0_i = M0 + NEd * e_i / 1000
        M0_eff = max(M0_i, NEd * e_0 / 1000)
        slank = lam > lam_lim and NEd > 0
        blocks.append(T(f"{navn}:  N_Ed = {_dk(NEd, 1)} kN,  M₀_Ed = {_dk(M0, 1)} kNm"))
        blocks += [
            CALC_ROW("n", "= N_Ed/(A_c·f_cd)", _dk(n, 3)),
            CALC_ROW("λ_lim", "= 20·A·B·C/√n  (5.13N)", _dk(lam_lim, 1)),
            CALC_ROW("M₀_Ed,i", "= max(M₀_Ed + N_Ed·e_i; N_Ed·e₀)", f"{_dk(M0_eff, 1)} kNm"),
        ]
        ustabil = False
        if slank:
            k2 = min(n * lam / 170, 0.20)
            Kc = k1 * k2 / (1 + phi_ef)
            EI = (Kc * Ecd * Ic + 1.0 * Es * Is) * 1e-9   # kNm²
            N_B = pi ** 2 * EI / (l0 / 1000) ** 2
            blocks += [
                CALC_ROW("K_c", f"= k₁·k₂/(1+φ_ef), k₁ = {_dk(k1, 3)}, k₂ = n·λ/170 ≤ 0,20 = {_dk(k2, 3)}",
                         _dk(Kc, 4)),
                CALC_ROW("EI", "= K_c·E_cd·I_c + K_s·E_s·I_s, K_s = 1  (5.21)", f"{_dk(EI, 0)} kNm²"),
                CALC_ROW("N_B", "= π²·EI/l₀²", f"{_dk(N_B, 0)} kN"),
            ]
            if NEd >= N_B:
                ustabil = True
                MEd = float("inf")
                blocks.append(CALC_ROW("M_Ed", "N_Ed ≥ N_B — søjlen er ustabil", "—"))
            else:
                MEd = M0_eff / (1 - NEd / N_B)
                blocks.append(CALC_ROW("M_Ed", "= M₀_Ed,i/(1 − N_Ed/N_B)  (5.28, β = 1)",
                                       f"{_dk(MEd, 1)} kNm"))
        else:
            MEd = M0_eff
            blocks.append(CALC_ROW("M_Ed", "λ ≤ λ_lim: 2. ordens effekter kan ignoreres",
                                   f"{_dk(MEd, 1)} kNm"))

        MRd = _mrd_at_ned(N_curve, M_curve, NEd)
        if ustabil or MRd is None or MRd <= 0:
            ratio = 999.0
            blocks.append(CALC_ROW("M_Rd", "N_Ed ligger uden for N–M-kurven" if not ustabil else "", "—"))
        else:
            ratio = MEd / MRd
            blocks.append(CALC_ROW("M_Rd", "af N–M-kurven ved N_Ed", f"{_dk(MRd, 1)} kNm"))
        blocks.append(cc.check(f"Lasttilfælde {navn}  M_Ed ≤ M_Rd", ratio, 1.0))
        rows.append([navn, _dk(NEd, 0), _dk(M0, 1), "2. orden" if slank else "1. orden",
                     "—" if ustabil else _dk(MEd, 1),
                     "—" if MRd is None else _dk(MRd, 1), _dk(ratio, 3) if ratio < 999 else "—"])
        pts.append({"label": navn, "NEd_kN": NEd,
                    "MEd_kNm": 0 if ustabil else MEd, "ok": ratio <= 1.0})

    blocks.append(S("Oversigt"))
    blocks.append(TBL(["Tilfælde", "N_Ed [kN]", "M₀_Ed [kNm]", "Teori",
                       "M_Ed [kNm]", "M_Rd [kNm]", "η"], rows))

    with tempfile.TemporaryDirectory() as tmp:
        img = _nm_plot(N_curve, M_curve, pts, h, tmp)
        data = Path(img).read_bytes()
    blocks.append(FIG(_gem_figur(data, "rc_nm"), "N–M-kurve med lasttilfældene."))
    blocks.append(N("Bøjning om én akse. Virker der moment om begge akser, skal "
                    "søjlen også eftervises for tosidet bøjning (§5.8.9)."))
    return blocks
