"""
load_combo.py — EN 1990 load combination calculator (Danish NA)

Computes ULS, ALS and SLS design action effects.

Reference: DS/EN 1990 DK NA:2019 rev. 2019-09-09
  • Table A1.1 DK NA  — ψ-factors for buildings
  • Table A1.2(B+C) DK NA  — partial factors STR/GEO (set B+C)
  • Table A1.3 DK NA  — accidental / fire combinations

Key Danish NA rules
────────────────────
Partial factors (Table A1.2(B+C), Combinations 1 + 2):
  6.10a  →  E_d = 1.2·K_FI·G_k             (permanent loads ONLY)
  6.10b  →  E_d = 1.0·K_FI·G_k
                + 1.5·K_FI·Q₁
                + Σ 1.5·K_FI·ψ₀·Qᵢ

  K_FI  :  CC1 = 0.9  |  CC2 = 1.0  |  CC3 = 1.1

ψ₀ for Snow (S) is context-dependent on the leading action:
  0.6 if lead is Cat. E or Temperature
  0.0 if lead is Wind
  0.3 otherwise
Wind (W) ψ₀:
  0.6 if lead is Cat. E
  0.3 otherwise

Accidental combinations (Table A1.3 DK NA, Eq. 6.11a/b):
  Fire     :  G_k + A_d + ψ₁,₁·Q_k,₁ + Σ ψ₂,ᵢ·Q_k,ᵢ
  Other    :  G_k + A_d + ψ₂,₁·Q_k,₁ + Σ ψ₂,ᵢ·Q_k,ᵢ
  (γ = 1.0 for all loads in ALS)
"""
from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext


# ── ψ-factors per load category (Table A1.1 DK NA) ───────────────────────────
# (ψ₀, ψ₁, ψ₂)  — ψ₀ for S and W may be overridden per combination
PSI_DK = {
    'A': (0.5, 0.3, 0.2),
    'B': (0.6, 0.4, 0.2),
    'C': (0.6, 0.6, 0.5),
    'D': (0.6, 0.6, 0.5),
    'E': (0.8, 0.8, 0.7),
    'F': (0.6, 0.6, 0.5),
    'G': (0.6, 0.4, 0.2),
    'H': (0.0, 0.0, 0.0),
    'S': (0.3, 0.2, 0.0),   # default ψ₀ — may increase/decrease per combination
    'W': (0.3, 0.2, 0.0),   # default ψ₀ — may increase per combination
    'T': (0.6, 0.5, 0.0),
}

K_FI_MAP = {'CC1': 0.9, 'CC2': 1.0, 'CC3': 1.1}

_DURATION_MAP = {
    'A': 'medium', 'B': 'medium', 'C': 'medium', 'D': 'medium',
    'E': 'long',   'F': 'short',  'G': 'short',  'H': 'short',
    'S': 'short',  'W': 'instant','T': 'short',
}

_DEFAULT_PSI = (0.6, 0.4, 0.2)


def _psi0(category: str, lead_category: str) -> float:
    """Context-dependent ψ₀ for a non-leading action (DK NA Table A1.1)."""
    c, lead = category.upper(), lead_category.upper()
    if c == 'S':
        return 0.6 if lead in ('E', 'T') else (0.0 if lead == 'W' else 0.3)
    if c == 'W':
        return 0.6 if lead == 'E' else 0.3
    return PSI_DK.get(c, _DEFAULT_PSI)[0]


def load_combos(
    label:             str,
    unit:              str,
    G_k:               float,
    loads:             list,
    method:            str  = '6.10ab',
    G_fav:             bool = False,
    consequence_class: str  = 'CC2',
    A_d:               float = 0.0,
    accidental_type:   str  = 'none',   # 'none' | 'fire' | 'other'
) -> tuple:
    """
    Returns (blocks, exports).

    exports contains:
      E_d_uls, E_d_acc (if A_d > 0), E_d_sls_char, E_d_sls_freq, E_d_sls_qp,
      governing_duration, unit, K_FI, consequence_class
    """
    blocks = []
    n   = len(loads)
    KFI = K_FI_MAP.get(consequence_class.upper(), 1.0)

    psi1 = [PSI_DK.get(l['category'].upper(), _DEFAULT_PSI)[1] for l in loads]
    psi2 = [PSI_DK.get(l['category'].upper(), _DEFAULT_PSI)[2] for l in loads]
    Q    = [l['Q_k'] for l in loads]

    # Subtitle: method + consequence class
    method_str  = "6.10a / 6.10b" if method == '6.10ab' else "Eq. 6.10"
    blocks.append(MH(
        f"{label} — Load Combinations",
        f"EN 1990 DK NA:2019  ·  {method_str}  ·  {consequence_class}  (K_FI = {KFI:.1f})",
        "general",
    ))

    # ── Characteristic actions table ───────────────────────────────────────────
    blocks.append(S("Characteristic actions"))
    psi0_base = [PSI_DK.get(l['category'].upper(), _DEFAULT_PSI)[0] for l in loads]
    has_ctx   = any(l['category'].upper() in ('S', 'W') for l in loads)

    rows = [['G_k  (permanent)', '—', f'{G_k:.3g}', '—', '—', '—']]
    for i, l in enumerate(loads):
        c = l['category'].upper()
        p0_str = f'{psi0_base[i]:.2f}*' if c in ('S', 'W') else f'{psi0_base[i]:.2f}'
        rows.append([l['label'], c, f"{Q[i]:.3g}", p0_str,
                     f"{psi1[i]:.2f}", f"{psi2[i]:.2f}"])
    if A_d > 0:
        rows.append([f'A_d  ({accidental_type})', '—', f'{A_d:.3g}', '—', '—', '—'])

    blocks.append(TBL(['Load', 'Cat.', f'Q_k  ({unit})', 'ψ₀', 'ψ₁', 'ψ₂'], rows))

    if has_ctx:
        blocks.append(N(
            "* Snow (S) ψ₀: 0.6 when lead is Cat. E/T, 0.0 when lead is Wind, 0.3 otherwise.  "
            "Wind (W) ψ₀: 0.6 when lead is Cat. E, 0.3 otherwise.  (Table A1.1 DK NA)"
        ))

    # ── ULS ───────────────────────────────────────────────────────────────────
    blocks.append(S("ULS — STR/GEO  (Table A1.2(B+C) DK NA)"))

    uls_vals: list[tuple] = []   # (name, formula, value, lead_idx)

    if n == 0:
        if method == '6.10ab':
            Ed = 1.2 * KFI * G_k
            uls_vals.append(("6.10a", f"1.2 · {KFI:.1f} · G_k", Ed, -1))
        else:
            Ed = 1.35 * KFI * G_k
            uls_vals.append(("6.10", f"1.35 · {KFI:.1f} · G_k", Ed, -1))

    elif method == '6.10':
        gamma_G = 1.35 * KFI
        gamma_Q = 1.50 * KFI
        for lead in range(n):
            others  = [i for i in range(n) if i != lead]
            lcat    = loads[lead]['category'].upper()
            p0_oth  = [_psi0(loads[i]['category'], lcat) for i in others]
            Ed = (gamma_G * G_k
                  + gamma_Q * Q[lead]
                  + sum(gamma_Q * p0_oth[j] * Q[others[j]] for j in range(len(others))))
            uls_vals.append((f"6.10 — {loads[lead]['label']}",
                             f"1.35·K_FI·G + 1.5·K_FI·Q₁ + Σ…", Ed, lead))

    else:  # 6.10a / 6.10b
        # 6.10a — permanent only (one row, regardless of number of variable loads)
        Ed_a = 1.2 * KFI * G_k
        uls_vals.append(("6.10a", f"1.2 · {KFI:.1f} · G_k", Ed_a, -1))

        # 6.10b — one row per possible leading action
        gamma_G = 1.0 * KFI
        gamma_Q = 1.5 * KFI
        for lead in range(n):
            others  = [i for i in range(n) if i != lead]
            lcat    = loads[lead]['category'].upper()
            p0_oth  = [_psi0(loads[i]['category'], lcat) for i in others]
            Ed_b = (gamma_G * G_k
                    + gamma_Q * Q[lead]
                    + sum(gamma_Q * p0_oth[j] * Q[others[j]] for j in range(len(others))))
            uls_vals.append((f"6.10b — {loads[lead]['label']}",
                             f"1.0·K + G + 1.5·K·Q₁ + Σψ₀·…", Ed_b, lead))

    for name, formula, val, _ in uls_vals:
        blocks.append(CALC_ROW(name, formula, f"{val:.3f}  {unit}"))

    gov_entry = max(uls_vals, key=lambda x: x[2])
    E_d_uls   = gov_entry[2]
    gov_lead  = gov_entry[3]

    governing_duration = (
        'permanent' if (gov_lead < 0 or not loads)
        else _DURATION_MAP.get(loads[gov_lead]['category'].upper(), 'medium')
    )

    blocks.append(CALC_ROW("E_d,ULS", "= max above", f"{E_d_uls:.3f}  {unit}"))

    if loads and gov_lead >= 0:
        gov_lbl = loads[gov_lead]['label']
        gov_cat = loads[gov_lead]['category'].upper()
        blocks.append(N(
            f"Governing: {gov_entry[0]}  —  lead = {gov_lbl} (Cat. {gov_cat})  "
            f"→ load duration class: {governing_duration}"
        ))
    else:
        blocks.append(N("Governing: 6.10a (permanent loads only)  →  load duration class: permanent"))

    # ── ALS — Accidental ──────────────────────────────────────────────────────
    E_d_acc = None
    if A_d > 0 and accidental_type in ('fire', 'other'):
        blocks.append(S(
            f"ALS — Accidental  (Table A1.3 DK NA)  |  "
            f"{'Fire (6.11a/b)' if accidental_type == 'fire' else 'Other accident (6.11a/b)'}"
        ))
        # γ = 1.0 for all loads in ALS
        # Fire:  leading uses ψ₁,  others use ψ₂
        # Other: all variable uses ψ₂

        als_vals: list[tuple] = []

        if n == 0:
            Ed_als = G_k + A_d
            als_vals.append(("ALS", "G_k + A_d", Ed_als, -1))
        elif accidental_type == 'fire':
            for lead in range(n):
                others = [i for i in range(n) if i != lead]
                Ed_als = (G_k + A_d
                          + psi1[lead] * Q[lead]
                          + sum(psi2[i] * Q[i] for i in others))
                als_vals.append((f"ALS fire — {loads[lead]['label']}",
                                 f"G + A_d + ψ₁·Q₁ + Σψ₂·…", Ed_als, lead))
        else:  # other accident
            Ed_als = G_k + A_d + sum(psi2[i] * Q[i] for i in range(n))
            als_vals.append(("ALS other",
                             "G + A_d + Σ ψ₂·Q_i", Ed_als, -1))

        for name, formula, val, _ in als_vals:
            blocks.append(CALC_ROW(name, formula, f"{val:.3f}  {unit}"))

        gov_als  = max(als_vals, key=lambda x: x[2])
        E_d_acc  = gov_als[2]
        blocks.append(CALC_ROW("E_d,ALS", "= max above", f"{E_d_acc:.3f}  {unit}"))
        blocks.append(N(
            f"ALS partial factors: γ_G = γ_Q = 1.0.  "
            f"{'Fire: ψ₁ for leading Q, ψ₂ for others.' if accidental_type == 'fire' else 'Other accident: ψ₂ for all variable actions.'}"
            f"  (DS/EN 1990 DK NA Table A1.3)"
        ))

    # ── SLS ───────────────────────────────────────────────────────────────────
    blocks.append(S("SLS — Serviceability"))

    if n == 0:
        E_d_sls_char = E_d_sls_freq = G_k
    else:
        char_vals, freq_vals = [], []
        for lead in range(n):
            others  = [i for i in range(n) if i != lead]
            lcat    = loads[lead]['category'].upper()
            p0_oth  = [_psi0(loads[i]['category'], lcat) for i in others]
            char_vals.append(G_k + Q[lead]
                             + sum(p0_oth[j] * Q[others[j]] for j in range(len(others))))
            freq_vals.append(G_k + psi1[lead] * Q[lead]
                             + sum(psi2[i] * Q[i] for i in others))
        E_d_sls_char = max(char_vals)
        E_d_sls_freq = max(freq_vals)

    E_d_sls_qp = G_k + sum(psi2[i] * Q[i] for i in range(n))

    blocks.append(CALC_ROW("Characteristic",    "G_k + Q₁ + Σ ψ₀·Qᵢ",        f"{E_d_sls_char:.3f}  {unit}"))
    blocks.append(CALC_ROW("Frequent",          "G_k + ψ₁·Q₁ + Σ ψ₂·Qᵢ",     f"{E_d_sls_freq:.3f}  {unit}"))
    blocks.append(CALC_ROW("Quasi-permanent",   "G_k + Σ ψ₂·Qᵢ",             f"{E_d_sls_qp:.3f}   {unit}"))

    # ── Summary ───────────────────────────────────────────────────────────────
    blocks.append(S("Summary"))
    summary_rows = [
        ['ULS (governing)',      f'{E_d_uls:.3f}',      unit],
    ]
    if E_d_acc is not None:
        summary_rows.append([
            f'ALS ({accidental_type})',
            f'{E_d_acc:.3f}', unit,
        ])
    summary_rows += [
        ['SLS characteristic',  f'{E_d_sls_char:.3f}', unit],
        ['SLS frequent',        f'{E_d_sls_freq:.3f}', unit],
        ['SLS quasi-permanent', f'{E_d_sls_qp:.3f}',  unit],
    ]
    blocks.append(TBL(['Combination', f'E_d', 'Unit'], summary_rows))

    exports = {
        'E_d_uls':            round(E_d_uls,       4),
        'E_d_sls_char':       round(E_d_sls_char,  4),
        'E_d_sls_freq':       round(E_d_sls_freq,  4),
        'E_d_sls_qp':         round(E_d_sls_qp,   4),
        'governing_duration': governing_duration,
        'unit':               unit,
        'K_FI':               KFI,
        'consequence_class':  consequence_class.upper(),
    }
    if E_d_acc is not None:
        exports['E_d_acc'] = round(E_d_acc, 4)

    return blocks, exports
