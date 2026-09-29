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


def _klient():
    from fastapi.testclient import TestClient
    import desktop_app
    return TestClient(desktop_app.lav_app())


_BJ = dict(nodes=[dict(id=1, x=0, y=0), dict(id=2, x=6, y=0)],
           supports=[dict(node_id=1, ux=True, uy=True, rz=False),
                     dict(node_id=2, ux=False, uy=True, rz=False)],
           load_cases=[dict(nr=1, navn='G', kategori='permanent'),
                       dict(nr=2, navn='Q', kategori='imposed', nyttelastkategori='A')],
           loads=[dict(type='udl', elem_id=1, direction='vertical', value_kNm=2, lc=1),
                  dict(type='udl', elem_id=1, direction='vertical', value_kNm=2, lc=2)],
           service_class=1)


def test_staal_kryber_ikke_i_anvendelsesafsnittet():
    c = _klient()
    st = c.post('/api/calc/general-frame-fem', json={**_BJ, 'elements': [dict(
        id=1, ni=1, nj=2, member_id=1, material='steel', section='IPE300', grade='S355')]}).json()
    assert st['_summary']['sls']['k_def'] == 0.0
    assert st['_summary']['sls']['w_fin_mm'] == st['_summary']['sls']['w_inst_mm']
    tr = c.post('/api/calc/general-frame-fem', json={**_BJ, 'elements': [dict(
        id=1, ni=1, nj=2, member_id=1, material='timber', section='90x270', grade='GL24h')]}).json()
    s = tr['_summary']['sls']
    assert s['k_def'] == 0.6
    assert abs(s['w_fin_mm'] - (s['w_inst_G_mm'] * 1.6 + s['w_inst_Q_mm'] * 1.12)) < 0.01


def test_tom_model_og_forkert_dellast_afvises_paent():
    c = _klient()
    r = c.post('/api/calc/general-frame-fem', json=dict(nodes=[], elements=[], supports=[], loads=[]))
    assert r.status_code == 422 and 'ingen knuder' in r.json()['detail']
    el = [dict(id=1, ni=1, nj=2)]
    for x1, x2, tekst in ((4, 2, '"Fra" skal være mindre'), (1, 8, 'm langt')):
        r = c.post('/api/calc/general-frame-fem', json={**_BJ, 'elements': el, 'loads': [
            dict(type='udl', elem_id=1, direction='vertical', value_kNm=5, x1=x1, x2=x2, lc=1)]})
        assert r.status_code == 422 and tekst in r.json()['detail']


def test_dellast_og_trapezlast_med_lasttilfaelde():
    """
    Med lasttilfaelde gik lasterne gennem _project_load, der kun kender én
    fuld, konstant intensitet: 3 → 6 kN/m fra x = 1 til 4 blev til 3 kN/m
    over hele stangen. Summen af reaktionerne skal vaere 1,5 · 13,5 kN.
    """
    c = _klient()
    m = dict(nodes=[dict(id=1, x=0, y=0), dict(id=2, x=6, y=0)],
             elements=[dict(id=1, ni=1, nj=2, E_GPa=210, A_cm2=53.8, Iz_cm4=8356)],
             supports=[dict(node_id=1, ux=True, uy=True, rz=False),
                       dict(node_id=2, ux=False, uy=True, rz=False)],
             load_cases=[dict(nr=1, navn='Q', kategori='imposed', nyttelastkategori='A')])
    for el, ld in (
        (dict(ni=1, nj=2), dict(direction='perpendicular', value_kNm=3, value_end_kNm=6, x1=1, x2=4)),
        # Samme last paa en stang tegnet den anden vej (sådan "Vend" laver den).
        (dict(ni=2, nj=1), dict(direction='perpendicular', value_kNm=-6, value_end_kNm=-3, x1=2, x2=5)),
        (dict(ni=1, nj=2), dict(direction='vertical', value_kNm=3, value_end_kNm=6, x1=1, x2=4)),
    ):
        r = c.post('/api/calc/general-frame-fem', json={
            **m, 'elements': [{**m['elements'][0], **el}],
            'loads': [dict(type='udl', elem_id=1, lc=1, **ld)]}).json()
        R = r['_summary']['reactions']
        assert abs(sum(v['Fy_kN'] for v in R.values()) - 1.5 * 13.5) < 1e-6
        # Tyngdepunkt 1 + 3·(3 + 2·6)/(3·(3 + 6)) = 2,667 m fra venstre.
        assert abs(R['1']['Fy_kN'] - 20.25 * (6 - 8 / 3) / 6) < 1e-6


def test_egne_kombinationer():
    c = _klient()
    lc = [dict(nr=1, navn='G', kategori='permanent'),
          dict(nr=2, navn='Q', kategori='imposed', nyttelastkategori='A')]
    L = [dict(type='udl', elem_id=1, direction='vertical', value_kNm=10, lc=1),
         dict(type='udl', elem_id=1, direction='vertical', value_kNm=10, lc=2)]
    egne = [dict(navn='Montage', situation='uls', faktorer={'1': 1.0, '2': 2.0}),
            dict(navn='Kontrol', situation='sls_karakteristisk', faktorer={'1': 1.0})]
    r = c.post('/api/calc/general-frame-fem/kombinationer',
               json=dict(loads=L, load_cases=lc, egne_kombinationer=egne)).json()
    navne = [k['name'] for k in r['kombinationer']]
    assert 'Egen: Montage' in navne and '6.10a: 1.20G' in navne
    kontrol = next(k for k in r['kombinationer'] if k['name'] == 'Egen: Kontrol')
    assert kontrol['situation'] == 'sls_karakteristisk' and kontrol['governing_duration'] == 'permanent'

    m = dict(nodes=[dict(id=1, x=0, y=0), dict(id=2, x=6, y=0)], elements=[dict(id=1, ni=1, nj=2)],
             supports=[dict(node_id=1, ux=True, uy=True, rz=False),
                       dict(node_id=2, ux=False, uy=True, rz=False)])
    j = c.post('/api/calc/general-frame-fem', json={**m, 'loads': L, 'load_cases': lc,
               'egne_kombinationer': egne[:1], 'kun_egne': True}).json()
    assert j['_summary']['combinations'] == ['Egen: Montage']
    assert abs(j['_summary']['max_moment_kNm'] - (10 + 20) * 36 / 8) < 1e-6

    # Uden lasttilfaelde giver egne kombinationer ingen mening.
    r = c.post('/api/calc/general-frame-fem', json={**m, 'loads': [dict(
        type='udl', elem_id=1, direction='vertical', value_kNm=10)], 'egne_kombinationer': egne[:1]})
    assert r.status_code == 422 and 'kræver lasttilfælde' in r.json()['detail']


def test_traesoejle_med_egen_knaeklaengde_om_svag_akse():
    c = _klient()
    base = dict(length_m=3.0, N_Ed_kN=60, M_Ed_kNm=0, b_mm=90, h_mm=270, timber_grade='GL24h')
    kort = c.post('/api/calc/timber-column', json=base).json()
    lang = c.post('/api/calc/timber-column', json={**base, 'length_z_m': 6.0}).json()
    tekst = lambda r: ' '.join(str(b) for b in r if isinstance(b, dict) and 'l_eff,2' in str(b))
    assert '6' in tekst(lang) and tekst(kort) != tekst(lang)


def test_tvaersnitskonstanter():
    c = _klient()
    s = c.get('/api/sections/properties?material=steel&section=IPE300&grade=S355').json()
    assert s['h_mm'] == 300 and s['Iy_cm4'] == 8356 and abs(s['Iz_cm4'] - 604) < 5
    t = c.get('/api/sections/properties?material=timber&section=45x195&grade=C24').json()
    assert t['Iy_cm4'] == round(45 * 195 ** 3 / 12 / 1e4, 1) and t['vaegt_kg_m'] == round(87.75e-4 * 420, 1)


def test_punktlast_som_smalt_afsnit_og_egenvaegt():
    """P = 10 kN ved a = 2 m på 6 m: M = P·a·b/L = 13,33 kNm; lasttabellen skriver P."""
    c = _klient()
    eps = 6 / 20000
    base = dict(nodes=[dict(id=1, x=0, y=0), dict(id=2, x=6, y=0)],
                elements=[dict(id=1, ni=1, nj=2, member_id=1, material='steel', section='IPE300', grade='S355')],
                supports=[dict(node_id=1, ux=True, uy=True, rz=False),
                          dict(node_id=2, ux=False, uy=True, rz=False)])
    P = dict(type='udl', elem_id=1, direction='vertical', value_kNm=10 / eps,
             x1=2 - eps / 2, x2=2 + eps / 2, punkt_kN=10, punkt_x=2)
    s = c.post('/api/calc/general-frame-fem', json={**base, 'loads': [P]}).json()['_summary']
    assert abs(s['max_moment_kNm'] - 10 * 2 * 4 / 6) < 1e-3
    assert s['loads_table'][0]['vaerdi'] == 'P = 10,00 kN, x = 2,00 m'

    # Egenvaegt: IPE300 = 43,0 kg/m -> 0,4218 kN/m; uden lasttilfaelde og i LC1 (6.10a: 1,2).
    g = 43.0 * 9.81 / 1000
    s = c.post('/api/calc/general-frame-fem', json={**base, 'loads': [], 'egenvaegt': {'lc': None}}).json()['_summary']
    assert abs(s['max_moment_kNm'] - g * 36 / 8) < 1e-3
    s = c.post('/api/calc/general-frame-fem', json={**base, 'loads': [], 'egenvaegt': {'lc': 1},
               'load_cases': [dict(nr=1, navn='G', kategori='permanent')]}).json()['_summary']
    assert abs(s['max_moment_kNm'] - 1.2 * g * 36 / 8) < 1e-3
    r = c.post('/api/calc/general-frame-fem', json={**base, 'loads': [], 'egenvaegt': {'lc': 2},
               'load_cases': [dict(nr=1, navn='G', kategori='permanent')]})
    assert r.status_code == 422 and 'permanent lasttilfælde' in r.json()['detail']
