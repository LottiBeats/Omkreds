"""
frame_load_cases.py
===================
EN 1990 load case manager for 2D frame analysis.

Named load cases (G, S, W, Q) are combined into ULS design combinations
per DS/EN 1990 DK NA:2024, Table A1.2(B+C) — STR/GEO limit state.

Danish NA formulation (Table A1.2(B+C), combinations 1 & 2, CC2):
  6.10a : 1.2·K_FI·G                             (permanent loads only)
  6.10b : 1.0·K_FI·G + 1.5·K_FI·Q_lead
          + Σ(1.5·ψ₀·K_FI·Q_companion)           (each variable as lead)

ψ₀ factors — DS/EN 1990 DK NA:2024 Table A1.1:
  Snow  (ellers)                   : ψ₀ = 0.3
  Snow  (when wind leads)          : ψ₀ = 0.0   (explicitly zero per DK NA)
  Wind  (ellers)                   : ψ₀ = 0.3
  Imposed Cat A/B (ellers)         : ψ₀ = 0.7

K_FI per consequence class (Annex B):
  CC1 → 0.9  |  CC2 → 1.0  |  CC3 → 1.1
"""

_KFI = {'CC1': 0.9, 'CC2': 1.0, 'CC3': 1.1}

# DS/EN 1990 DK NA:2024 Table A1.1 — ψ₀ "ellers" (default) values
_PSI0 = {
    'permanent': None,
    'snow':      0.3,   # Table A1.1: "ellers" — 0.3
    'wind':      0.3,   # Table A1.1: "ellers" — 0.3
    'imposed':   0.7,   # Category A/B
}

# DS/EN 1990 DK NA:2024 Table A1.2(B+C) — STR partial factors
_GAMMA_G_A  = 1.2   # 6.10a: γ_G,sup (permanent-only combination)
_GAMMA_G_B  = 1.0   # 6.10b: γ_G,sup (variable-dominated combination)
_GAMMA_Q    = 1.5   # variable load factor

# EN 1995-1-1 §2.2.3: governing duration = shortest-duration variable action in combo
_TYPE_DURATION = {
    'permanent': 'permanent',
    'imposed':   'medium',
    'snow':      'short',
    'wind':      'instant',
}
_DURATION_RANK = {
    'permanent': 0, 'long': 1, 'medium': 2, 'short': 3, 'instant': 4,
}

TYPE_LABELS = {
    'permanent': 'G — Permanent',
    'snow':      'S — Snelast',
    'wind':      'W — Vindlast',
    'imposed':   'Q — Nyttelast',
}


def _scale_load(ld, factor):
    """Return a copy of load dict with magnitudes scaled by factor."""
    s = dict(ld)
    if s.get('load_type') == 'udl':
        s['value_kNm'] = round(float(s.get('value_kNm', 0.0)) * factor, 5)
    else:
        s['Fx_kN']  = round(float(s.get('Fx_kN',  0.0)) * factor, 5)
        s['Fy_kN']  = round(float(s.get('Fy_kN',  0.0)) * factor, 5)
        s['Mz_kNm'] = round(float(s.get('Mz_kNm', 0.0)) * factor, 5)
    return s


def _companion_psi0(lead_type, companion_type):
    """
    Return ψ₀ for a companion action given the leading action type.
    Special rule per DK NA Table A1.1: snow ψ₀ = 0 when wind leads.
    """
    if lead_type == 'wind' and companion_type == 'snow':
        return 0.0
    return _PSI0.get(companion_type, 0.7)


def generate_combinations(cases, method='6.10ab', consequence_class='CC2'):
    """
    Generate ULS load combinations per DS/EN 1990 DK NA:2024.

    Parameters
    ----------
    cases : list of dicts
        {id, type, loads: [...]}
    method : '6.10ab'  DS/EN 1990 DK NA:2024 Table A1.2(B+C) — recommended
             '6.10'    Simplified (1.35G + 1.5Q) — conservative, not DK NA STR
    consequence_class : 'CC1' | 'CC2' | 'CC3'

    Returns
    -------
    list of combination dicts:
        {name, factor_table: {case_id: factor}, loads: [...], governing_duration}
    """
    kfi       = _KFI.get(consequence_class, 1.0)
    g_cases   = [c for c in cases if c['type'] == 'permanent']
    var_cases = [c for c in cases if c['type'] != 'permanent']
    combos    = []

    def _assemble(name, g_fac, var_factors):
        loads = []
        factor_table = {}
        for c in g_cases:
            factor_table[c['id']] = round(g_fac, 4)
            for ld in c.get('loads', []):
                loads.append(_scale_load(ld, g_fac))
        active_durations = []
        for c in var_cases:
            f = var_factors.get(c['id'], 0.0)
            factor_table[c['id']] = round(f, 4)
            if abs(f) > 1e-10:
                for ld in c.get('loads', []):
                    loads.append(_scale_load(ld, f))
                active_durations.append(_TYPE_DURATION.get(c['type'], 'medium'))
        governing = (max(active_durations, key=lambda d: _DURATION_RANK.get(d, 0))
                     if active_durations else 'permanent')
        combos.append({'name': name, 'factor_table': factor_table,
                       'loads': loads, 'governing_duration': governing})

    if method == '6.10ab':
        # ── DS/EN 1990 DK NA:2024 Table A1.2(B+C) ──────────────────────────
        # 6.10a: permanent loads only, γ_G = 1.2·K_FI  (no variable actions)
        g_fac_a = _GAMMA_G_A * kfi
        _assemble(f'6.10a: {g_fac_a:.2f}G', g_fac_a, {})

        if var_cases:
            # 6.10b: γ_G = 1.0·K_FI, each variable case as lead in turn
            g_fac_b = _GAMMA_G_B * kfi
            for i, lead in enumerate(var_cases):
                vf = {}
                parts = []
                for j, c in enumerate(var_cases):
                    if j == i:
                        vf[c['id']] = _GAMMA_Q * kfi
                        parts.append(f'1.5{c["id"]}')
                    else:
                        psi = _companion_psi0(lead['type'], c['type'])
                        vf[c['id']] = round(_GAMMA_Q * psi * kfi, 5)
                        if psi > 0:
                            parts.append(f'{psi:.1f}×1.5{c["id"]}')
                label = f'6.10b ({lead["id"]} led): {g_fac_b:.2f}G + {" + ".join(parts)}'
                _assemble(label, g_fac_b, vf)

    else:  # '6.10' — simplified, conservative (not DK NA STR)
        # Permanent-only case
        _assemble(f'1.35G', 1.35 * kfi, {})
        # Each variable as lead with ψ₀ companions
        for i, lead in enumerate(var_cases):
            vf = {}
            parts = []
            for j, c in enumerate(var_cases):
                if j == i:
                    vf[c['id']] = _GAMMA_Q * kfi
                    parts.append(f'1.5{c["id"]}')
                else:
                    psi = _companion_psi0(lead['type'], c['type'])
                    vf[c['id']] = round(_GAMMA_Q * psi * kfi, 5)
                    if psi > 0:
                        parts.append(f'{psi:.1f}×1.5{c["id"]}')
            _assemble(f'1.35G + {" + ".join(parts)}', 1.35 * kfi, vf)

    return combos


def combinations_to_calc_blocks(cases, combinations, consequence_class, method):
    """Return calc_core blocks for PDF export."""
    try:
        from calc_core import S, T, TBL
    except ImportError:
        return []

    blocks = [
        S('Lastkombinationer (DS/EN 1990 DK NA:2024)'),
        T(f'Konsekvensklasse: {consequence_class}  ·  Metode: {method}'),
    ]

    for c in cases:
        lbl = TYPE_LABELS.get(c['type'], c['type'])
        load_lines = []
        for ld in c.get('loads', []):
            if ld.get('load_type') == 'udl':
                dir_lbl = {
                    'vertical':      'vertikal',
                    'projected':     'projekteret (sne)',
                    'horizontal':    'horisontal',
                    'perpendicular': 'vinkelret på flade',
                }.get(ld.get('direction', 'vertical'), ld.get('direction'))
                if ld.get('member_id') is not None:
                    target = f"Member {ld['member_id']}"
                elif ld.get('elem_ids'):
                    target = f"Elements {', '.join(str(i) for i in ld['elem_ids'])}"
                else:
                    target = f"Element {ld.get('elem_id')}"
                load_lines.append(f"{target}: {ld.get('value_kNm', 0):.2f} kN/m  ({dir_lbl})")
            else:
                load_lines.append(
                    f"Knude {ld.get('node_id')}: "
                    f"Fx={ld.get('Fx_kN',0):.2f} kN  Fy={ld.get('Fy_kN',0):.2f} kN"
                )
        blocks.append(T(f"{c['id']} — {lbl}:\n" + '\n'.join(load_lines)))

    case_ids = [c['id'] for c in cases]
    headers  = ['Kombination'] + [f'γ·{cid}' for cid in case_ids]
    rows = []
    for combo in combinations:
        row = [combo['name']]
        for cid in case_ids:
            f = combo['factor_table'].get(cid, 0.0)
            row.append(f'{f:.3f}' if abs(f) > 1e-10 else '—')
        rows.append(row)
    blocks.append(TBL(headers, rows))

    return blocks
