"""
frame_load_cases.py
===================
EN 1990 load case manager for 2D frame analysis.

Named load cases (G, S, W, Q) are combined into ULS design combinations
per EN 1990 eq. 6.10 or 6.10a/b (Danish NA, K_FI per consequence class).

Load directions
---------------
'vertical'   : global Y downward (gravity — self-weight, imposed)
'projected'  : vertical per unit horizontal projection (snow on slopes)
'horizontal' : global X (wind pressure / suction)

The actual local-element force components are computed in the FEM solver
where element geometry is known.

EN 1990 constants (Danish NA)
------------------------------
γ_G  = 1.35 (unfavourable), 1.00 (favourable)
γ_Q  = 1.50
ξ    = 0.89
ψ₀   : snow 0.5 · wind 0.6 · imposed (A/B) 0.7
K_FI : CC1 0.9 · CC2 1.0 · CC3 1.1
"""

_KFI = {'CC1': 0.9, 'CC2': 1.0, 'CC3': 1.1}
_XI  = 0.89

_PSI0 = {
    'permanent': None,
    'snow':      0.5,
    'wind':      0.6,
    'imposed':   0.7,
}

_GAMMA_G = 1.35
_GAMMA_Q = 1.50

# Human-readable labels for each type
TYPE_LABELS = {
    'permanent': 'G — Permanent',
    'snow':      'S — Snow',
    'wind':      'W — Wind',
    'imposed':   'Q — Imposed',
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


def generate_combinations(cases, method='6.10ab', consequence_class='CC2'):
    """
    Generate EN 1990 ULS load combinations.

    Parameters
    ----------
    cases : list of dicts
        {id, type, loads: [{load_type, elem_id|node_id, value_kNm|Fx_kN/Fy_kN, direction}]}
    method : '6.10' | '6.10ab'
    consequence_class : 'CC1' | 'CC2' | 'CC3'

    Returns
    -------
    list of combination dicts:
        { name, factor_table: {case_id: factor}, loads: [scaled load dicts] }
    """
    kfi = _KFI.get(consequence_class, 1.0)
    g_cases  = [c for c in cases if c['type'] == 'permanent']
    var_cases = [c for c in cases if c['type'] != 'permanent']

    psi0 = {c['id']: _PSI0.get(c['type'], 0.7) for c in var_cases}
    combos = []

    def _assemble(name, g_fac, var_factors):
        loads = []
        factor_table = {}
        for c in g_cases:
            factor_table[c['id']] = round(g_fac, 4)
            for ld in c.get('loads', []):
                loads.append(_scale_load(ld, g_fac))
        for c in var_cases:
            f = var_factors.get(c['id'], 0.0)
            factor_table[c['id']] = round(f, 4)
            if abs(f) > 1e-10:
                for ld in c.get('loads', []):
                    loads.append(_scale_load(ld, f))
        combos.append({'name': name, 'factor_table': factor_table, 'loads': loads})

    # Permanent only
    if not var_cases:
        _assemble(f'{_GAMMA_G * kfi:.2f}G', _GAMMA_G * kfi, {})
        return combos

    if method == '6.10':
        for i, lead in enumerate(var_cases):
            vf = {
                c['id']: (_GAMMA_Q * kfi if j == i
                          else _GAMMA_Q * psi0[c['id']] * kfi)
                for j, c in enumerate(var_cases)
            }
            parts = ' + '.join(
                f'1.5{c["id"]}' if j == i
                else f'{psi0[c["id"]]:.1f}×1.5{c["id"]}'
                for j, c in enumerate(var_cases)
            )
            _assemble(f'1.35G + {parts}', _GAMMA_G * kfi, vf)

    else:  # 6.10a/b
        # Eq. 6.10a — all variables with ψ₀ (no leading)
        vf_a = {c['id']: _GAMMA_Q * psi0[c['id']] * kfi for c in var_cases}
        parts_a = ' + '.join(
            f'{psi0[c["id"]]:.1f}×1.5{c["id"]}' for c in var_cases
        )
        _assemble(f'6.10a: 1.35G + {parts_a}', _GAMMA_G * kfi, vf_a)

        # Eq. 6.10b — each variable as leading action in turn
        g_fac_b = round(_XI * _GAMMA_G * kfi, 4)
        for i, lead in enumerate(var_cases):
            vf = {
                c['id']: (_GAMMA_Q * kfi if j == i
                          else _GAMMA_Q * psi0[c['id']] * kfi)
                for j, c in enumerate(var_cases)
            }
            parts_b = ' + '.join(
                f'1.5{c["id"]}' if j == i
                else f'{psi0[c["id"]]:.1f}×1.5{c["id"]}'
                for j, c in enumerate(var_cases)
            )
            _assemble(f'6.10b ({lead["id"]} led): {g_fac_b}G + {parts_b}',
                      g_fac_b, vf)

    return combos


def combinations_to_calc_blocks(cases, combinations, consequence_class, method):
    """Return calc_core blocks for PDF export."""
    try:
        from calc_core import S, T, TBL, N
    except ImportError:
        return []

    blocks = [
        S('Lastkombinationer (EN 1990)'),
        T(f'Konsekvensklasse: {consequence_class}  ·  Metode: {method}'),
    ]

    # Case overview
    for c in cases:
        lbl = TYPE_LABELS.get(c['type'], c['type'])
        load_lines = []
        for ld in c.get('loads', []):
            if ld.get('load_type') == 'udl':
                dir_lbl = {
                    'vertical':   'vertikal',
                    'projected':  'projekteret (sne)',
                    'horizontal': 'horisontal',
                }.get(ld.get('direction', 'vertical'), ld.get('direction'))
                load_lines.append(
                    f"Element {ld.get('elem_id')}: "
                    f"{ld.get('value_kNm', 0):.2f} kN/m  ({dir_lbl})"
                )
            else:
                load_lines.append(
                    f"Knude {ld.get('node_id')}: "
                    f"Fx={ld.get('Fx_kN',0):.2f} kN  "
                    f"Fy={ld.get('Fy_kN',0):.2f} kN"
                )
        blocks.append(T(f"{c['id']} — {lbl}:\n" + '\n'.join(load_lines)))

    # Combination table
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
