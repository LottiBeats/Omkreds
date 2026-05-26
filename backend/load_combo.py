"""
load_combo.py — EN 1990 load combination calculator (Danish NA)

Computes ULS and SLS design action effects for a set of
characteristic loads and variable actions.

Reference: EN 1990:2002 Section 6 + DK NA
"""
import math
from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext

# ── ψ values per load category (EN 1990 Table A1.1 + DK NA) ──────────────────
# (ψ₀, ψ₁, ψ₂)
PSI = {
    'A': (0.7, 0.5, 0.3),   # Domestic / residential
    'B': (0.7, 0.5, 0.3),   # Office areas
    'C': (0.7, 0.7, 0.6),   # Congregation areas (restaurants, theatres…)
    'D': (0.7, 0.7, 0.6),   # Shopping areas
    'E': (1.0, 0.9, 0.8),   # Storage areas
    'F': (0.7, 0.7, 0.6),   # Traffic areas ≤ 30 kN
    'G': (0.7, 0.5, 0.3),   # Traffic areas 30–160 kN
    'H': (0.0, 0.0, 0.0),   # Roofs (not accessible)
    'S': (0.5, 0.2, 0.0),   # Snow (DK, altitude ≤ 1 000 m)
    'W': (0.6, 0.2, 0.0),   # Wind
}

# Partial factors
GF_UNF = 1.35   # γ_G unfavourable (EN 1990 Table A1.2(B))
GF_FAV = 1.00   # γ_G favourable
GQF    = 1.50   # γ_Q
XI     = 0.89   # ξ reduction factor (DK NA — Eq. 6.10b)


# EN 1995-1-1 Table 2.1 — load duration class per EN 1990 action category
# Used to determine k_mod when load combination feeds into a timber check.
_DURATION_MAP = {
    'A': 'medium',  # Domestic / residential (imposed)
    'B': 'medium',  # Office areas
    'C': 'medium',  # Congregation areas
    'D': 'medium',  # Shopping areas
    'E': 'long',    # Storage (> 6 months)
    'F': 'short',   # Traffic ≤ 30 kN
    'G': 'short',   # Traffic 30–160 kN
    'H': 'short',   # Roofs (not accessible)
    'S': 'short',   # Snow (DK, altitude ≤ 1 000 m) — short-term
    'W': 'instant', # Wind — instantaneous
}


def load_combos(
    label:  str,
    unit:   str,
    G_k:    float,
    loads:  list,          # [{'label', 'Q_k', 'category'}, …]
    method: str = '6.10ab',
    G_fav:  bool = False,  # True when G is favourable (uplift etc.)
) -> tuple:
    """
    Parameters
    ----------
    label   : identification string, e.g. "LC1"
    unit    : value unit shown in output, e.g. "kN/m"
    G_k     : characteristic permanent action
    loads   : list of variable load dicts:
              {'label': str, 'Q_k': float, 'category': str}
    method  : '6.10' or '6.10ab' (6.10a / 6.10b — DK practice)
    G_fav   : True if permanent action is favourable (use γ_G = 1.0)

    Returns
    -------
    (blocks, exports)  — calc_core block list  +  dict of named output values
    """
    blocks = []
    n = len(loads)

    gamma_G = GF_FAV if G_fav else GF_UNF

    # ψ arrays
    psi0 = [PSI.get(l['category'].upper(), (0.7, 0.5, 0.3))[0] for l in loads]
    psi1 = [PSI.get(l['category'].upper(), (0.7, 0.5, 0.3))[1] for l in loads]
    psi2 = [PSI.get(l['category'].upper(), (0.7, 0.5, 0.3))[2] for l in loads]
    Q    = [l['Q_k'] for l in loads]

    blocks.append(MH(f"{label} — EN 1990 Load Combinations", "", "general"))

    # ── Input table ───────────────────────────────────────────────────────────
    blocks.append(S("Characteristic actions"))
    data_rows = [['Permanent G_k', '—', f'{G_k:.3g}', '—', '—', '—']]
    for i, l in enumerate(loads):
        data_rows.append([l['label'], l['category'].upper(),
                          f"{Q[i]:.3g}", f"{psi0[i]:.2f}",
                          f"{psi1[i]:.2f}", f"{psi2[i]:.2f}"])
    blocks.append(TBL(
        ['Load', 'Cat.', f'Q_k ({unit})', 'ψ₀', 'ψ₁', 'ψ₂'],
        data_rows,
    ))

    # ── ULS ───────────────────────────────────────────────────────────────────
    blocks.append(S("ULS — Ultimate Limit State (STR/GEO)"))

    method_note = (
        "Method: Eq. 6.10a / 6.10b (DK NA)  —  most unfavourable combination governs."
        if method == '6.10ab' else
        "Method: Eq. 6.10  —  most unfavourable leading variable action governs."
    )
    blocks.append(T(method_note))

    uls_vals: list[tuple] = []   # (description, value, lead_idx)  lead_idx=-1 → permanent only

    if n == 0:
        Ed = gamma_G * G_k
        uls_vals.append((f"γ_G · G_k = {gamma_G:.2f} · {G_k:.3g}", Ed, -1))
    elif method == '6.10':
        for lead in range(n):
            others = [i for i in range(n) if i != lead]
            Ed = (gamma_G * G_k
                  + GQF * Q[lead]
                  + sum(GQF * psi0[i] * Q[i] for i in others))
            uls_vals.append((f"6.10 lead {loads[lead]['label']}", Ed, lead))
    else:  # 6.10a / 6.10b
        for lead in range(n):
            others = [i for i in range(n) if i != lead]
            Ed_a = (gamma_G * G_k
                    + GQF * psi0[lead] * Q[lead]
                    + sum(GQF * psi0[i] * Q[i] for i in others))
            Ed_b = (XI * gamma_G * G_k
                    + GQF * Q[lead]
                    + sum(GQF * psi0[i] * Q[i] for i in others))
            uls_vals.append((f"6.10a lead {loads[lead]['label']}", Ed_a, lead))
            uls_vals.append((f"6.10b lead {loads[lead]['label']}", Ed_b, lead))

    for desc, val, _lead in uls_vals:
        blocks.append(CALC_ROW(desc, "", f"{val:.3f} {unit}"))

    gov_entry  = max(uls_vals, key=lambda x: x[1])
    E_d_uls    = gov_entry[1]
    gov_lead   = gov_entry[2]   # index into loads[], or -1 (permanent only)

    # EN 1995-1-1 load duration class of the governing leading variable action
    if gov_lead < 0 or not loads:
        governing_duration = 'permanent'
    else:
        cat = loads[gov_lead]['category'].upper()
        governing_duration = _DURATION_MAP.get(cat, 'medium')

    blocks.append(CALC_ROW("▶ E_d,ULS  (governing)", "= max above",
                            f"{E_d_uls:.3f} {unit}"))
    if loads:
        gov_label = loads[gov_lead]['label'] if gov_lead >= 0 else 'G_k'
        blocks.append(N(
            f"Governing leading action: {gov_label} "
            f"(category {loads[gov_lead]['category'].upper() if gov_lead >= 0 else '—'}) "
            f"→ load duration class: {governing_duration}."
        ))

    # ── SLS ───────────────────────────────────────────────────────────────────
    blocks.append(S("SLS — Serviceability Limit State"))

    # Characteristic combination
    if n == 0:
        E_d_sls_char = G_k
    else:
        char_vals = []
        for lead in range(n):
            others = [i for i in range(n) if i != lead]
            char_vals.append(G_k + Q[lead] + sum(psi0[i] * Q[i] for i in others))
        E_d_sls_char = max(char_vals)
    blocks.append(CALC_ROW("SLS characteristic",
                            "= G_k + Q_k,1 + Σ ψ₀·Q_k,i",
                            f"{E_d_sls_char:.3f} {unit}"))

    # Frequent combination
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
                            "= G_k + ψ₁·Q_k,1 + Σ ψ₂·Q_k,i",
                            f"{E_d_sls_freq:.3f} {unit}"))

    # Quasi-permanent combination
    E_d_sls_qp = G_k + sum(psi2[i] * Q[i] for i in range(n))
    blocks.append(CALC_ROW("SLS quasi-permanent",
                            "= G_k + Σ ψ₂·Q_k,i",
                            f"{E_d_sls_qp:.3f} {unit}"))

    # ── Summary table ─────────────────────────────────────────────────────────
    blocks.append(S("Summary"))
    blocks.append(TBL(
        ['Combination', f'E_d ({unit})'],
        [
            ['ULS  (governing)',       f'{E_d_uls:.3f}'],
            ['SLS characteristic',     f'{E_d_sls_char:.3f}'],
            ['SLS frequent',           f'{E_d_sls_freq:.3f}'],
            ['SLS quasi-permanent',    f'{E_d_sls_qp:.3f}'],
        ],
    ))

    exports = {
        'E_d_uls':            round(E_d_uls,      4),
        'E_d_sls_char':       round(E_d_sls_char, 4),
        'E_d_sls_freq':       round(E_d_sls_freq, 4),
        'E_d_sls_qp':         round(E_d_sls_qp,  4),
        'governing_duration': governing_duration,   # for timber k_mod
        'unit':               unit,
    }
    return blocks, exports
