"""
Rettelser fra gennemgangen af FEM-programmet:

- Lasttabellen i rapporten viste 0,00 for alle linjelaster fra tegningen,
  fordi den kun laeste de gamle wy/wx-felter.
- ψ for nyttelast fulgte ikke nyttelastkategorien i brudgraensen og i
  krybningens ψ₂ (fast 0,7 og 0,2), mens anvendelsesgraensen gjorde.
"""
from frame_load_cases import kombinationer_af_tilfaelde, sls_saet
from general_frame_fem import lasttabel


def _udl(eid, v, lc, **kw):
    return dict(type='udl', elem_id=eid, direction='vertical', value_kNm=v, lc=lc, **kw)


def test_lasttabellen_viser_retning_og_vaerdi():
    els = [dict(id=1, ni=1, nj=2, member_id=7), dict(id=2, ni=2, nj=3, member_id=7)]
    rows = lasttabel([_udl(1, 10, 1), _udl(2, 10, 1),
                      _udl(2, 2, 2, value_end_kNm=4, x1=0.5, x2=2.0),
                      dict(type='nodal', node_id=2, Fy_kN=-5, lc=2)],
                     els, [dict(nr=1, navn='Egenlast'), dict(nr=2, navn='Nyttelast')])
    assert rows[0] == {'type': 'Linjelast', 'target': 'Stang 7', 'lasttilfaelde': 'Egenlast',
                       'retning': 'lodret', 'vaerdi': '10,00 kN/m'}
    assert rows[1]['vaerdi'] == '2,00 → 4,00 kN/m, x = 0,50–2,00 m'
    assert rows[1]['target'] == 'Element 2 (stang 7)'
    assert rows[2]['vaerdi'] == 'F_y = -5,00 kN'
    assert len(rows) == 3


def _faktor(combo, lc):
    return next(l['value_kNm'] for l in combo['loads'] if l['lc'] == lc)


def test_brudgraensen_bruger_nyttelastkategoriens_psi0():
    lc = [dict(nr=1, navn='G', kategori='permanent'),
          dict(nr=2, navn='Q', kategori='imposed', nyttelastkategori='A'),
          dict(nr=3, navn='S', kategori='snow')]
    L = [_udl(1, 1.0, i) for i in (1, 2, 3)]
    combos = kombinationer_af_tilfaelde(lc, L, '6.10ab', 'CC2')
    sne_leder = next(c for c in combos if 'S leder' in c['name'] and 'gunstig' not in c['name'])
    assert abs(_faktor(sne_leder, 2) - 0.5 * 1.5) < 1e-9     # A: ψ₀ = 0,5

    lc[1]['nyttelastkategori'] = 'E'
    combos = kombinationer_af_tilfaelde(lc, L, '6.10ab', 'CC2')
    sne_leder = next(c for c in combos if 'S leder' in c['name'] and 'gunstig' not in c['name'])
    assert abs(_faktor(sne_leder, 2) - 0.8 * 1.5) < 1e-9     # E: ψ₀ = 0,8


def test_krybningens_psi2_foelger_kategorien():
    lc = [dict(nr=1, navn='G', kategori='permanent'),
          dict(nr=2, navn='Q', kategori='imposed', nyttelastkategori='E')]
    _, saet = sls_saet(lc, [_udl(1, 1.0, 1), _udl(1, 1.0, 2)])
    assert saet[0]['psi_2'] == 0.7


def test_for_svag_bjaelke_regnes_med_advarsel():
    """45x95 C24 over 6 m med 25 kN/m: η ≫ 1 og en advarsel, ikke 'mekanisme'."""
    from fastapi.testclient import TestClient
    import desktop_app
    c = TestClient(desktop_app.lav_app())
    m = dict(nodes=[dict(id=1, x=0, y=0), dict(id=2, x=6, y=0)],
             elements=[dict(id=1, ni=1, nj=2, member_id=1, material='timber',
                            section='45x95', grade='C24')],
             supports=[dict(node_id=1, ux=True, uy=True, rz=False),
                       dict(node_id=2, ux=False, uy=True, rz=False)],
             loads=[dict(type='udl', elem_id=1, direction='vertical', value_kNm=25)])
    r = c.post('/api/calc/general-frame-fem', json=m)
    assert r.status_code == 200, r.text
    s = r.json()['_summary']
    assert 'Meget stor flytning' in s['advarsler'][0]
    assert s['loads_table'][0]['vaerdi'] == '25,00 kN/m'
