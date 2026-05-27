"""
load_combo.py — EN 1990 load combination calculator (Danish NA)

Computes ULS and SLS design action effects.

Reference: DS/EN 1990 DK NA:2019 rev. 2019-09-09
  • Table A1.1 DK NA  — ψ-factors for buildings
  • Table A1.2(B+C) DK NA  — partial factors STR/GEO (set B+C)

Key Danish NA rules implemented
─────────────────────────────────
1.  ψ-factors from Table A1.1 DK NA (differ from EN 1990 base values).
    Snow (S) and Wind (W) ψ₀ are context-dependent on the leading action
    per the note at the bottom of Table A1.1 DK NA:
      Snow ψ₀ = 0.6  when leading action is Cat. E or Temperature
      Snow ψ₀ = 0.0  when leading action is Wind
      Snow ψ₀ = 0.3  otherwise
      Wind ψ₀ = 0.6  when leading action is Cat. E
      Wind ψ₀ = 0.3  otherwise

2.  Partial factors (Table A1.2(B+C) DK NA, Combinations 1+2):
      6.10a:  E_d = 1.2·K_FI·G_k           (permanent loads ONLY — no variable)
      6.10b:  E_d = 1.0·K_FI·G_k  +  1.5·K_FI·Q₁  +  Σ 1.5·K_FI·ψ₀·Qᵢ

3.  K_FI (consequence class factor, Table A1.2(B+C) DK NA NOTE 4):
      CC3 → K_FI = 1.1
      CC2 → K_FI = 1.0  (default for buildings)
      CC1 → K_FI = 0.9

4.  Conservative single-equation method (Eq. 6.10 for quick checks):
      E_d = 1.35·K_FI·G_k  +  1.5·K_FI·Q₁  +  Σ 1.5·K_FI·ψ₀·Qᵢ
"""
from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext


# ── ψ-factors per load category (Table A1.1 DK NA) ───────────────────────────
# (ψ₀, ψ₁, ψ₂)
# Snow (S) and Wind (W) ψ₀ are overridden per-combination — see _psi0_combo()
PSI_DK = {
    'A': (0.5, 0.3, 0.2),   # Domestic/residential   (DK NA ≠ EN base 0.7)
    'B': (0.6, 0.4, 0.2),   # Office areas            (DK NA ≠ EN base 0.7)
    'C': (0.6, 0.6, 0.5),   # Congregation areas      (DK NA ≠ EN base 0.7)
    'D': (0.6, 0.6, 0.5),   # Shopping areas          (DK NA ≠ EN base 0.7)
    'E': (0.8, 0.8, 0.7),   # Storage/industrial      (DK NA ≠ EN base 1.0)
    'F': (0.6, 0.6, 0.5),   # Traffic ≤ 30 kN         (DK NA ≠ EN base 0.7)
    'G': (0.6, 0.4, 0.2),   # Traffic 30–160 kN       (DK NA ≠ EN base 0.7)
    'H': (0.0, 0.0, 0.0),   # Roofs (not accessible)
    'S': (0.3, 0.2, 0.0),   # Snow — default ψ₀ ("otherwise" case, DK NA)
    'W': (0.3, 0.2, 0.0),   # Wind — default ψ₀ ("otherwise" case, DK NA)
    'T': (0.6, 0.5, 0.0),   # Temperature (DK NA Table A1.1)
}

# K_FI — consequence class multiplier (Table A1.2(B+C) DK NA NOTE 4)
K_FI_MAP = {
    'CC1': 0.9,
    'CC2': 1.0,
    'CC3': 1.1,
}

# EN 1995-1-1 Table 2.1 — load duration class per action category
# Used when combo result feeds into a timber element check (k_mod selection).
_DURATION_MAP = {
    'A': 'medium',   # Domestic / residential (imposed)
    'B': 'medium',   # Office areas
    'C': 'medium',   # Congregation areas
    'D': 'medium',   # Shopping areas
    'E': 'long',     # Storage (> 6 months)
    'F': 'short',    # Traffic ≤ 30 kN
    'G': 'short',    # Traffic 30–160 kN
    'H': 'short',    # Roofs (not accessible)
    'S': 'short',    # Snow (DK, altitude ≤ 1 000 m)
    'W': 'instant',  # Wind
    'T': 'short',    # Temperature
}


def _psi0_combo(category: str, lead_category: str) -> float:
    """
    Return ψ₀ for a *non-leading* action of the given category when the
    leading action has category `lead_category`.

    Snow (S) and Wind (W) have context-dependent ψ₀ per DK NA Table A1.1:
      Snow ψ₀ = 0.6  if leading is Cat.E or Temperature
      Snow ψ₀ = 0.0  if leading is Wind
      Snow ψ₀ = 0.3  otherwise
      Wind ψ₀ = 0.6  if leading is Cat.E
      Wind ψ₀ = 0.3  otherwise
    All other categories use the fixed ψ₀ from PSI_DK.
    """
    c    = category.upper()
    lead = lead_category.upper()

    if c == 'S':
        if lead in ('E', 'T'):
            return 0.6
        elif lead == 'W':
            return 0.0
        else:
            return 0.3

    if c == 'W':
        if lead == 'E':
            return 0.6
        else:
            return 0.3

    return PSI_DK.get(c, (0.6, 0.4, 0.2))[0]


def load_combos(
    label:             str,
    unit:              str,
    G_k:               float,
    loads:             list,           # [{'label', 'Q_k', 'category'}, …]
    method:            str  = '6.10ab',
    G_fav:             bool = False,   # True when G is favourable (uplift etc.)
    consequence_class: str  = 'CC2',   # 'CC1', 'CC2' or 'CC3'
) -> tuple:
    """
    Parameters
    ----------
    label              : identification string, e.g. "LC1"
    unit               : value unit shown in output, e.g. "kN/m"
    G_k                : characteristic permanent action
    loads              : list of variable load dicts:
                         {'label': str, 'Q_k': float, 'category': str}
    method             : '6.10ab' (DK NA 6.10a/6.10b) or '6.10' (conservative)
    G_fav              : True if permanent action is favourable (use γ_G,inf)
    consequence_class  : 'CC1', 'CC2' or 'CC3' — controls K_FI factor

    Returns
    -------
    (blocks, exports)  — calc_core block list  +  dict of named output values
    """
    blocks = []
    n   = len(loads)
    KFI = K_FI_MAP.get(consequence_class.upper(), 1.0)

    # ── Per-load ψ₁, ψ₂ (these don't change with lead) ────────────────────────
    psi1 = [PSI_DK.get(l['category'].upper(), (0.6, 0.4, 0.2))[1] for l in loads]
    psi2 = [PSI_DK.get(l['category'].upper(), (0.6, 0.4, 0.2))[2] for l in loads]
    Q    = [l['Q_k'] for l in loads]

    # ── Module header ──────────────────────────────────────────────────────────
    blocks.append(MH(
        f"{label} — EN 1990 Load Combinations",
        f"DS/EN 1990 DK NA:2019  ·  {method}  ·  {consequence_class}  (K_FI = {KFI:.1f})",
        "general",
    ))

    # ── Partial factor reference note ──────────────────────────────────────────
    if method == '6.10ab':
        blocks.append(T(
            "Method: DK NA Table A1.2(B+C) — "
            "6.10a: 1.2·K_FI·G_k  (permanent only)  |  "
            f"6.10b: 1.0·K_FI·G_k + 1.5·K_FI·Q₁ + Σ1.5·K_FI·ψ₀·Qᵢ  "
            f"(K_FI = {KFI:.1f} for {consequence_class})"
        ))
    else:
        blocks.append(T(
            f"Method: Eq. 6.10 (conservative)  —  "
            f"1.35·K_FI·G_k + 1.5·K_FI·Q₁ + Σ1.5·K_FI·ψ₀·Qᵢ  "
            f"(K_FI = {KFI:.1f} for {consequence_class})"
        ))

    # ── Input table ────────────────────────────────────────────────────────────
    blocks.append(S("Characteristic actions"))
    # Show the base ψ₀ for snow/wind with a note that it may vary per combination
    psi0_base = [PSI_DK.get(l['category'].upper(), (0.6, 0.4, 0.2))[0] for l in loads]
    has_ctx_dep = any(l['category'].upper() in ('S', 'W') for l in loads)

    data_rows = [['Permanent G_k', '—', f'{G_k:.3g}', '—', '—', '—']]
    for i, l in enumerate(loads):
        cat = l['category'].upper()
        psi0_note = f'{psi0_base[i]:.2f}*' if cat in ('S', 'W') else f'{psi0_base[i]:.2f}'
        data_rows.append([l['label'], cat,
                          f"{Q[i]:.3g}", psi0_note,
                          f"{psi1[i]:.2f}", f"{psi2[i]:.2f}"])

    blocks.append(TBL(
        ['Load', 'Cat.', f'Q_k ({unit})', 'ψ₀', 'ψ₁', 'ψ₂'],
        data_rows,
    ))
    if has_ctx_dep:
        blocks.append(N(
            "* Snow (S) ψ₀: 0.6 if lead is Cat.E/Temperature, 0.0 if lead is Wind, 0.3 otherwise. "
            "Wind (W) ψ₀: 0.6 if lead is Cat.E, 0.3 otherwise. "
            "(DK NA Table A1.1)"
        ))

    # ── ULS ───────────────────────────────────────────────────────────────────
    blocks.append(S("ULS — Ultimate Limit State (STR, DK NA Table A1.2(B+C))"))

    uls_vals: list[tuple] = []   # (description, value, lead_idx)

    if n == 0:
        # No variable loads — only permanent
        if method == '6.10ab':
            Ed = 1.2 * KFI * G_k
            uls_vals.append((f"6.10a: 1.2·K_FI·G_k = 1.2·{KFI:.1f}·{G_k:.3g}", Ed, -1))
        else:
            Ed = 1.35 * KFI * G_k
            uls_vals.append((f"6.10: 1.35·K_FI·G_k = 1.35·{KFI:.1f}·{G_k:.3g}", Ed, -1))

    elif method == '6.10':
        # Conservative single equation
        gamma_G = 1.35 * KFI
        gamma_Q = 1.50 * KFI
        for lead in range(n):
            others      = [i for i in range(n) if i != lead]
            lead_cat    = loads[lead]['category'].upper()
            psi0_others = [_psi0_combo(loads[i]['category'], lead_cat) for i in others]
            Ed = (gamma_G * G_k
                  + gamma_Q * Q[lead]
                  + sum(gamma_Q * psi0_others[j] * Q[others[j]] for j in range(len(others))))
            uls_vals.append((f"6.10  lead {loads[lead]['label']}", Ed, lead))

    else:  # 6.10a / 6.10b (DK NA default)
        # 6.10a — permanent loads ONLY (Table A1.2(B+C) DK NA: Q=0 in combination 1)
        Ed_a = 1.2 * KFI * G_k
        uls_vals.append(("6.10a (permanent only): 1.2·K_FI·G_k", Ed_a, -1))

        # 6.10b — with variable loads, for each possible leading action
        gamma_G = 1.0 * KFI   # γ_G,sup for 6.10b (Table A1.2(B+C), Combination 2)
        gamma_Q = 1.5 * KFI   # γ_Q for 6.10b
        for lead in range(n):
            others      = [i for i in range(n) if i != lead]
            lead_cat    = loads[lead]['category'].upper()
            psi0_others = [_psi0_combo(loads[i]['category'], lead_cat) for i in others]
            Ed_b = (gamma_G * G_k
                    + gamma_Q * Q[lead]
                    + sum(gamma_Q * psi0_others[j] * Q[others[j]] for j in range(len(others))))
            uls_vals.append((f"6.10b  lead {loads[lead]['label']}", Ed_b, lead))

    for desc, val, _lead in uls_vals:
        blocks.append(CALC_ROW(desc, "", f"{val:.3f} {unit}"))

    gov_entry  = max(uls_vals, key=lambda x: x[1])
    E_d_uls    = gov_entry[1]
    gov_lead   = gov_entry[2]   # index into loads[], or -1 = permanent only

    # EN 1995-1-1 load duration class of the governing leading variable action
    if gov_lead < 0 or not loads:
        governing_duration = 'permanent'
    else:
        cat = loads[gov_lead]['category'].upper()
        governing_duration = _DURATION_MAP.get(cat, 'medium')

    blocks.append(CALC_ROW("▶ E_d,ULS  (governing)", "= max above",
                            f"{E_d_uls:.3f} {unit}"))

    if loads and gov_lead >= 0:
        gov_label = loads[gov_lead]['label']
        gov_cat   = loads[gov_lead]['category'].upper()
        blocks.append(N(
            f"Governing combination: 6.10{'b' if method == '6.10ab' else ''}  "
            f"lead = {gov_label} (Cat. {gov_cat})  "
            f"→ load duration class: {governing_duration}."
        ))
    elif gov_lead < 0:
        blocks.append(N(
            f"Governing combination: permanent loads only (6.10a)  "
            f"→ load duration class: permanent."
        ))

    # ── SLS ───────────────────────────────────────────────────────────────────
    blocks.append(S("SLS — Serviceability Limit State"))

    # Characteristic combination (γ = 1.0 for all; context-dependent ψ₀ for S/W)
    if n == 0:
        E_d_sls_char = G_k
    else:
        char_vals = []
        for lead in range(n):
            others      = [i for i in range(n) if i != lead]
            lead_cat    = loads[lead]['category'].upper()
            psi0_others = [_psi0_combo(loads[i]['category'], lead_cat) for i in others]
            char_vals.append(G_k + Q[lead]
                             + sum(psi0_others[j] * Q[others[j]] for j in range(len(others))))
        E_d_sls_char = max(char_vals)

    blocks.append(CALC_ROW("SLS characteristic",
                            "G_k + Q_k,1 + Σ ψ₀·Q_k,i",
                            f"{E_d_sls_char:.3f} {unit}"))

    # Frequent combination (ψ₁ for leading, ψ₂ for others — not context-dependent)
    if n == 0:
        E_d_sls_freq = G_k
    else:
        freq_vals = []
        for lead in range(n):
            others = [i for i in range(n) if i != lead]
            freq_vals.append(G_k + psi1[lead] * Q[lead]
                             + sum(psi2[i] * Q[i] for i in others))
        E_d_sls_freq = max(freq_vals)

    blocks.append(CALC_ROW("SLS frequent",
                            "G_k + ψ₁·Q_k,1 + Σ ψ₂·Q_k,i",
                            f"{E_d_sls_freq:.3f} {unit}"))

    # Quasi-permanent combination (ψ₂ for all variable)
    E_d_sls_qp = G_k + sum(psi2[i] * Q[i] for i in range(n))
    blocks.append(CALC_ROW("SLS quasi-permanent",
                            "G_k + Σ ψ₂·Q_k,i",
                            f"{E_d_sls_qp:.3f} {unit}"))

    # ── Summary table ──────────────────────────────────────────────────────────
    blocks.append(S("Summary"))
    blocks.append(TBL(
        ['Combination', f'E_d ({unit})'],
        [
            ['ULS governing',         f'{E_d_uls:.3f}'],
            ['SLS characteristic',    f'{E_d_sls_char:.3f}'],
            ['SLS frequent',          f'{E_d_sls_freq:.3f}'],
            ['SLS quasi-permanent',   f'{E_d_sls_qp:.3f}'],
        ],
    ))

    exports = {
        'E_d_uls':            round(E_d_uls,      4),
        'E_d_sls_char':       round(E_d_sls_char, 4),
        'E_d_sls_freq':       round(E_d_sls_freq, 4),
        'E_d_sls_qp':         round(E_d_sls_qp,  4),
        'governing_duration': governing_duration,   # for timber k_mod
        'unit':               unit,
        'K_FI':               KFI,
        'consequence_class':  consequence_class.upper(),
    }
    return blocks, exports
