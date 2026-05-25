"""
concrete_column.py — RC column  (EN 1992-1-1)

Rectangular cross-section with reinforcement on two sides (compression + tension).
Second-order effects: simplified stiffness method (cl. 5.8.7.3).
N–M interaction curve: rectangular stress block (cl. 3.1.7).
Creep coefficient: EN 1992-1-1 Annex B.

All inputs use plain SI multiples (mm, kN, MPa).
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


def _nm_curve(fcd, fyd, b, h, a, As_c, As_t, n_pts=150):
    """
    N–M interaction envelope for a rectangular section.
    Units: mm, MPa  →  output in kN, kNm.
    """
    Es      = 200_000.0
    eps_cu3 = 0.0035
    lam     = 0.8
    eta     = 1.0

    d_c = a
    d_t = h - a

    x_vals = np.unique(np.concatenate([
        np.linspace(0.01 * d_t, 0.99 * d_t, 70),
        np.linspace(d_t,        5.0 * h,    80),
    ]))

    N_list, M_list = [], []
    for x in x_vals:
        s    = min(lam * x, h)
        Fc   = eta * fcd * b * s * 1e-3
        z_Fc = 0.5 * h - 0.5 * s

        eps_sc = eps_cu3 * (x - d_c) / x
        eps_st = eps_cu3 * (x - d_t) / x

        sig_sc = max(-fyd, min(fyd, Es * eps_sc))
        sig_st = max(-fyd, min(fyd, Es * eps_st))

        Fsc = sig_sc * As_c * 1e-3
        Fst = sig_st * As_t * 1e-3

        z_sc = 0.5 * h - d_c
        z_st = 0.5 * h - d_t

        N_list.append(Fc + Fsc + Fst)
        M_list.append((Fc * z_Fc + Fsc * z_sc + Fst * z_st) * 1e-3)

    N_list.insert(0, -(fyd * (As_c + As_t)) * 1e-3)
    M_list.insert(0, 0.0)

    N_list.append((eta * fcd * b * h + fyd * (As_c + As_t)) * 1e-3)
    M_list.append(0.0)

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

    ax.plot(np.abs(Mc_s), Nc_s, color='#595F61', lw=1.8, label='N–M envelope')
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
                   label=f'{lbl}  ({abs(MEd):.1f} kNm, {NEd:.0f} kN)')

    ax.set_xlabel('M  [kNm]', fontsize=10)
    ax.set_ylabel('N  [kN]',  fontsize=10)
    ax.set_title(f'N–M interaction  (h = {h_mm:.0f} mm)', fontsize=11)
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
    fig_h  = max(4.5, 4.0 * aspect) + 1.2
    fig, ax = plt.subplots(figsize=(4.2, fig_h))

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
    ax.text(c_mm / 2, h_mm * 0.5 + my * 0.12, f'c={c_mm:.0f}',
            ha='center', va='bottom', fontsize=7, color='#888888')

    # Bar labels
    ax.text(b_mm/2, h_mm + my*0.12,
            f'{n_c}Ø{da_c_mm:.0f}  (compression)',
            ha='center', va='bottom', fontsize=8, color='#333333')
    ax.text(b_mm/2, -my*0.08,
            f'{n_t}Ø{da_t_mm:.0f}  (tension)',
            ha='center', va='top', fontsize=8, color='#333333')

    ax.set_title('Cross-section', fontsize=10, pad=6)
    plt.tight_layout()
    out_path = Path(tmp_dir) / 'section_col.png'
    fig.savefig(str(out_path), dpi=130, bbox_inches='tight')
    plt.close(fig)
    return str(out_path)


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC FUNCTION
# ─────────────────────────────────────────────────────────────────────────────

def concrete_column_rect(
    label,
    h_mm=300.0,
    b_mm=360.0,
    c_mm=53.0,
    da_c_mm=16.0,
    n_c=2,
    da_t_mm=16.0,
    n_t=3,
    fck_mpa=35.0,
    fyk_mpa=550.0,
    gamma_c=1.4,
    gamma_s=1.2,
    alpha_cc=1.0,
    gamma_cE=1.2,
    Ls_mm=4000.0,
    beta_eff=1.0,
    RH=0.55,
    t0_days=28.0,
    M0Eqp_over_M0Ed=0.9,
    load_cases=None,
    figure_path=None,
    figure_caption="",
):
    if load_cases is None:
        load_cases = []

    cc     = CheckContext()
    blocks = []

    # ── Header ───────────────────────────────────────────────────────────────
    blocks.append(MH(
        f"RC column — {h_mm:.0f}×{b_mm:.0f} mm",
        f"{label}  |  EN 1992-1-1",
        material="concrete",
    ))

    # ── Input table ──────────────────────────────────────────────────────────
    blocks.append(S("Design parameters"))
    blocks.append(T(
        f"Rectangular reinforced concrete column, {h_mm:.0f}×{b_mm:.0f} mm.  "
        f"Concrete C{fck_mpa:.0f}, reinforcement fyk = {fyk_mpa:.0f} MPa.  "
        f"Column length Ls = {Ls_mm:.0f} mm, effective-length factor β = {beta_eff}.  "
        f"Bending about the axis parallel to b = {b_mm:.0f} mm."
    ))
    blocks.append(TBL(
        ["Parameter", "Symbol", "Value"],
        [
            ["Section height (bending dir.)", "h",        f"{h_mm:.0f} mm"],
            ["Section width",                 "b",        f"{b_mm:.0f} mm"],
            ["Cover to rebar centroid",       "c",        f"{c_mm:.0f} mm"],
            ["Compression rebars",            "n_c × Ø",  f"{n_c} × Ø{da_c_mm:.0f} mm"],
            ["Tension rebars",                "n_t × Ø",  f"{n_t} × Ø{da_t_mm:.0f} mm"],
            ["Char. cylinder strength",       "f_ck",     f"{fck_mpa:.0f} MPa"],
            ["Char. yield strength",          "f_yk",     f"{fyk_mpa:.0f} MPa"],
            ["Partial factor concrete",       "γ_c",      str(gamma_c)],
            ["Partial factor steel",          "γ_s",      str(gamma_s)],
            ["Long-term factor",              "α_cc",     str(alpha_cc)],
            ["Column length",                 "L_s",      f"{Ls_mm:.0f} mm"],
            ["Effective-length factor",       "β",        str(beta_eff)],
            ["Relative humidity",             "RH",       f"{RH*100:.0f} %"],
            ["Age at loading",                "t₀",       f"{t0_days:.0f} days"],
            ["M₀_Eqp / M₀_Ed",               "—",        str(M0Eqp_over_M0Ed)],
        ],
    ))

    # ── Cross-section diagram ─────────────────────────────────────────────────
    with tempfile.TemporaryDirectory() as _sec_tmp:
        _sec_img = _section_plot_column(h_mm, b_mm, c_mm, da_c_mm, n_c, da_t_mm, n_t, _sec_tmp)
        with open(_sec_img, 'rb') as _f:
            _sec_bytes = _f.read()
    _sec_hash = hashlib.md5(_sec_bytes).hexdigest()[:12]
    _sec_out   = Path(tempfile.gettempdir()) / f'section_col_{_sec_hash}.png'
    if not _sec_out.exists():
        _sec_out.write_bytes(_sec_bytes)
    blocks.append(FIG(str(_sec_out), 'Reinforced concrete column cross-section.'))

    # ── Material properties ───────────────────────────────────────────────────
    blocks.append(S("Material properties  — EN 1992-1-1 cl. 3.1"))

    fcd = alpha_cc * fck_mpa / gamma_c    # MPa
    fyd = fyk_mpa  / gamma_s              # MPa
    fcm = fck_mpa  + 8.0                  # MPa
    Ecm = _ecm_mpa(fck_mpa)              # MPa
    Ecd = Ecm / gamma_cE                  # MPa
    Es  = 200_000.0                       # MPa (steel)

    blocks.extend([
        CALC_ROW("f_cd",  "= α_cc·f_ck / γ_c",     f"{fcd:.2f} MPa"),
        CALC_ROW("f_yd",  "= f_yk / γ_s",           f"{fyd:.2f} MPa"),
        CALC_ROW("f_cm",  "= f_ck + 8",             f"{fcm:.1f} MPa"),
        CALC_ROW("E_cm",  "= 22000·(f_cm/10)^0.3",  f"{Ecm:.0f} MPa"),
        CALC_ROW("E_cd",  "= E_cm / γ_cE",          f"{Ecd:.0f} MPa"),
    ])

    # ── Cross-section ──────────────────────────────────────────────────────
    blocks.append(S("Cross-section properties"))

    h    = h_mm
    b    = b_mm
    a    = c_mm
    d    = h - a
    Ac   = h * b
    As_c = n_c * pi / 4.0 * da_c_mm ** 2
    As_t = n_t * pi / 4.0 * da_t_mm ** 2
    As   = As_c + As_t

    blocks.extend([
        CALC_ROW("A_c",   "= h·b",              f"{Ac:.0f} mm²"),
        CALC_ROW("A_s,c", "= n_c·π/4·da_c²",   f"{As_c:.1f} mm²"),
        CALC_ROW("A_s,t", "= n_t·π/4·da_t²",   f"{As_t:.1f} mm²"),
        CALC_ROW("A_s",   "= A_s,c + A_s,t",    f"{As:.1f} mm²"),
        CALC_ROW("d",     "= h − c",            f"{d:.1f} mm"),
    ])

    blocks.append(TBL(
        ["Property", "Symbol", "Value"],
        [
            ["Gross area",              "A_c",   f"{Ac:.0f} mm²"],
            ["Compression reinf. area", "A_s,c", f"{As_c:.1f} mm²"],
            ["Tension reinf. area",     "A_s,t", f"{As_t:.1f} mm²"],
            ["Total reinf. area",       "A_s",   f"{As:.1f} mm²"],
            ["Effective depth",         "d",     f"{d:.1f} mm"],
            ["Reinf. ratio",            "ρ",     f"{As/Ac*100:.2f} %"],
        ],
    ))

    # ── Creep coefficient ──────────────────────────────────────────────────
    blocks.append(S("Creep coefficient  — EN 1992-1-1 Annex B"))

    phi0   = _creep_phi0(fck_mpa, RH, t0_days, h, b)
    phi_ef = phi0 * M0Eqp_over_M0Ed
    h0     = 2.0 * Ac / (2.0 * (h + b))

    blocks.append(TBL(
        ["Parameter", "Symbol", "Value"],
        [
            ["Notional section thickness", "h₀",   f"{h0:.1f} mm"],
            ["Relative humidity",          "RH",   f"{RH*100:.0f} %"],
            ["Age at loading",             "t₀",   f"{t0_days:.0f} days"],
            ["Basic creep coeff.",         "φ₀",   f"{phi0:.3f}"],
            ["Quasi-perm. ratio",          "M₀Eqp/M₀Ed", str(M0Eqp_over_M0Ed)],
            ["Effective creep coeff.",     "φ_ef = φ₀ × ratio", f"{phi_ef:.3f}"],
        ],
    ))
    blocks.append(N(
        f"φ₀ = {phi0:.3f} — computed via EN 1992-1-1 Annex B (simplified).  "
        f"φ_ef = φ₀ × M₀Eqp/M₀Ed = {phi0:.3f} × {M0Eqp_over_M0Ed} = {phi_ef:.3f}."
    ))

    # ── Slenderness ────────────────────────────────────────────────────────
    blocks.append(S("Slenderness  — EN 1992-1-1 cl. 5.8.3"))

    blocks.append(N(
        f"Effective-length factor β = {beta_eff:.2f} — input by engineer. "
        "For a braced column pinned at both ends β = 1.0; fixed–fixed β ≈ 0.5. "
        "For sway frames the effective length exceeds the physical length — verify "
        "β independently from frame analysis. This module assumes a braced (non-sway) frame."
    ))

    Ic    = b * h ** 3 / 12.0
    Is    = (As_c + As_t) * (h/2 - a) ** 2
    i_rad = sqrt(Ic / Ac)
    l0    = beta_eff * Ls_mm
    lam   = l0 / i_rad

    blocks.extend([
        CALC_ROW("I_c",  "= b·h³/12",     f"{Ic:.3e} mm⁴"),
        CALC_ROW("i",    "= √(I_c/A_c)",  f"{i_rad:.1f} mm"),
        CALC_ROW("l₀",   "= β·L_s",       f"{l0:.0f} mm"),
        CALC_ROW("λ",    "= l₀ / i",      f"{lam:.2f}"),
    ])

    # ── Effective stiffness and Ncr ──────────────────────────────────────
    blocks.append(S("Effective stiffness and elastic critical force  — cl. 5.8.7.3"))

    Kc     = 0.3 / (1.0 + 0.5 * phi_ef)
    EI_eff = (Kc * Ecd * Ic + 1.0 * Es * Is) * 1e-9   # kNm²
    Ncr    = pi ** 2 * EI_eff / (l0 * 1e-3) ** 2       # kN

    blocks.append(TBL(
        ["Parameter", "Symbol", "Value"],
        [
            ["Second moment of area",         "I_c",  f"{Ic:.2e} mm⁴"],
            ["Steel second moment",            "I_s",  f"{Is:.2e} mm⁴"],
            ["Stiffness reduction factor",     "K_c",  f"{Kc:.4f}"],
            ["Effective bending stiffness",    "EI_eff", f"{EI_eff:.1f} kNm²"],
            ["Effective length",               "l₀",   f"{l0:.0f} mm"],
            ["Elastic critical force",         "N_cr", f"{Ncr:.1f} kN"],
        ],
    ))

    # ── N–M interaction curve ─────────────────────────────────────────────
    blocks.append(S("N–M interaction curve  — EN 1992-1-1 cl. 3.1.7 / 6.1"))
    blocks.append(T(
        "Computed from the simplified rectangular stress block (λ = 0.8, η = 1.0 for "
        f"f_ck ≤ 50 MPa). Compression reinforcement A_s,c = {As_c:.0f} mm² at "
        f"cover c = {a:.0f} mm; tension reinforcement A_s,t = {As_t:.0f} mm² at "
        f"d = {d:.0f} mm.  Limiting concrete strain ε_cu3 = 0.0035."
    ))

    N_curve, M_curve = _nm_curve(fcd, fyd, b, h, a, As_c, As_t)

    N_pt = -(fyd * (As_c + As_t)) * 1e-3
    N_pc = (fcd * b * h + fyd * (As_c + As_t)) * 1e-3
    M_max = float(np.max(M_curve))
    N_at_Mmax = float(N_curve[np.argmax(M_curve)])

    blocks.append(TBL(
        ["Point", "N  [kN]", "M  [kNm]"],
        [
            ["Pure tension",        f"{N_pt:.1f}",   "0"],
            ["Max moment",          f"{N_at_Mmax:.1f}", f"{M_max:.1f}"],
            ["Pure compression",    f"{N_pc:.1f}",   "0"],
        ],
    ))

    # ── Load case checks ──────────────────────────────────────────────────
    blocks.append(S("Load case checks  — second-order effects  cl. 5.8"))

    omega = As * fyd / (Ac * fcd)
    e0_min = max(h / 30.0, 20.0)
    ei    = l0 / 400.0

    blocks.append(TBL(
        ["Parameter", "Symbol", "Value"],
        [
            ["Min. eccentricity", "e₀_min = max(h/30, 20 mm)", f"{e0_min:.1f} mm"],
            ["Imperfection eccentricity", "eᵢ = l₀/400",       f"{ei:.1f} mm"],
            ["Mechanical reinf. ratio",   "ω = A_s f_yd/(A_c f_cd)", f"{omega:.3f}"],
        ],
    ))

    plot_pts  = []
    chk_rows  = []

    for lc in load_cases:
        lc_label  = lc.get("label", "LC")
        NEd_kN    = float(lc["NEd_kN"])
        M0Ed_kNm  = float(lc["M0Ed_kNm"])

        n_rel = NEd_kN / (Ac * fcd * 1e-3)
        n_rel = max(n_rel, 0.01)
        A_cr  = 1.0 / (1.0 + 0.2 * phi_ef)
        B_cr  = sqrt(1.0 + 2.0 * omega)
        C_cr  = 0.7
        lam_lim = 20.0 * A_cr * B_cr * C_cr / sqrt(n_rel)

        slender = lam > lam_lim

        M0Ed_imp = M0Ed_kNm + NEd_kN * ei * 1e-3
        M0Ed_eff = max(M0Ed_imp, NEd_kN * e0_min * 1e-3)

        if slender and NEd_kN < Ncr:
            MEd = M0Ed_eff / (1.0 - NEd_kN / Ncr)
        else:
            MEd = M0Ed_eff

        MRd = _mrd_at_ned(N_curve, M_curve, NEd_kN)

        if MRd is None or MRd <= 0:
            ratio = 999.0
            passes = False
            MRd_str = "—"
        else:
            ratio   = MEd / MRd
            passes  = ratio <= 1.0
            MRd_str = f"{MRd:.1f}"

        slend_flag = f"λ={lam:.1f}  >  λ_lim={lam_lim:.1f}  → 2nd order" if slender \
                     else f"λ={lam:.1f}  ≤  λ_lim={lam_lim:.1f}  → 1st order only"

        chk_rows.append([
            lc_label,
            f"{NEd_kN:.0f}",
            f"{M0Ed_kNm:.1f}",
            slend_flag,
            f"{M0Ed_eff:.1f}",
            f"{MEd:.1f}",
            MRd_str,
            f"{ratio*100:.1f} %",
            "✓ OK" if passes else "✗ FAIL",
        ])

        plot_pts.append({
            "label":   lc_label,
            "NEd_kN":  NEd_kN,
            "MEd_kNm": MEd,
            "ok":      passes,
        })

        blocks.append(cc.check(f"Load case {lc_label}: M_Ed / M_Rd", MEd, MRd if MRd else 1e9))

    if chk_rows:
        blocks.append(TBL(
            ["LC", "N_Ed [kN]", "M₀_Ed [kNm]", "Slenderness",
             "M₀_Ed,eff [kNm]", "M_Ed [kNm]", "M_Rd [kNm]", "Util.", "Result"],
            chk_rows,
        ))

    # ── N–M interaction diagram ────────────────────────────────────────────
    blocks.append(S("N–M interaction diagram"))

    with tempfile.TemporaryDirectory() as tmp_dir:
        nm_img = _nm_plot(N_curve, M_curve, plot_pts, h, tmp_dir)
        with open(nm_img, 'rb') as f:
            nm_bytes = f.read()

    nm_hash = hashlib.md5(nm_bytes).hexdigest()[:12]
    nm_out  = Path(tempfile.gettempdir()) / f"nm_diagram_{nm_hash}.png"
    if not nm_out.exists():
        nm_out.write_bytes(nm_bytes)

    blocks.append(FIG(str(nm_out), "N–M interaction envelope with design load cases."))

    # ── Optional user figure ──────────────────────────────────────────────
    if figure_path and Path(figure_path).exists():
        blocks.append(S("Column sketch / plan"))
        blocks.append(FIG(figure_path, figure_caption or "Column sketch."))

    return blocks
