"""
Anvendelseskombinationer af modellens lasttilfaelde (DS/EN 1990 6.14b / 6.16b).

Brudkombinationerne maa ikke aendre sig af, at anvendelsen kommer med, og
anvendelsen skal baere sin egen situation, saa indhyldningerne holdes adskilt.
"""
from frame_load_cases import kombinationer_af_tilfaelde

LC = [{'nr': 1, 'navn': 'Egenlast', 'kategori': 'permanent'},
      {'nr': 2, 'navn': 'Nyttelast', 'kategori': 'imposed', 'nyttelastkategori': 'A'},
      {'nr': 3, 'navn': 'Sne', 'kategori': 'snow'}]
LOADS = [{'type': 'udl', 'elem_id': 1, 'value_kNm': 1.0, 'direction': 'vertical', 'lc': n} for n in (1, 2, 3)]


def _by_name(combos):
    return {c['name']: c for c in combos}


def test_uls_unchanged_by_sls():
    uden = kombinationer_af_tilfaelde(LC, LOADS)
    med = kombinationer_af_tilfaelde(LC, LOADS, anvendelse=True)
    uls = [c for c in med if 'situation' not in c]
    assert [c['name'] for c in uls] == [c['name'] for c in uden]


def test_characteristic_uses_psi0_for_companions():
    c = _by_name(kombinationer_af_tilfaelde(LC, LOADS, anvendelse=True))
    k = next(v for n, v in c.items() if n.startswith('SLS kar. (Sne leder)'))
    assert k['situation'] == 'sls_karakteristisk'
    assert k['factor_table'] == {'Egenlast': 1.0, 'Nyttelast': 0.5, 'Sne': 1.0}


def test_quasi_permanent_uses_psi2():
    c = _by_name(kombinationer_af_tilfaelde(LC, LOADS, anvendelse=True))
    q = next(v for n, v in c.items() if n.startswith('SLS kvasi'))
    assert q['situation'] == 'sls_kvasi'
    # Kategori A: ψ2 = 0,2 · sne: ψ2 = 0
    assert q['factor_table'] == {'Egenlast': 1.0, 'Nyttelast': 0.2, 'Sne': 0.0}


def test_imposed_without_category_is_on_the_safe_side():
    lc = [dict(t) for t in LC]
    lc[1].pop('nyttelastkategori')
    q = next(v for v in kombinationer_af_tilfaelde(lc, LOADS, anvendelse=True)
             if v['name'].startswith('SLS kvasi'))
    assert q['factor_table']['Nyttelast'] == 0.7
