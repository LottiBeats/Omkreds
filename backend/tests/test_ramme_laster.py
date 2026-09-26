"""
Sne og vind på en portalramme med saddeltag: zonegrænser langs spærene,
fortegn ind mod fladen, lastbredde og strimmelvægtning.
"""
import math
import pytest
from ramme_laster import laster_paa_ramme, mu1, strimmel

H, L, ALPHA = 5.0, 12.0, 15.0
KIP = H + (L / 2) * math.tan(math.radians(ALPHA))
# Venstre spær tegnet fra tagfod mod kip, højre fra kip mod tagfod -- så begge
# retninger bliver prøvet.
LED = [
    {'member_id': 1, 'rolle': 'vaeg_v', 'x0': 0, 'y0': 0, 'x1': 0, 'y1': H},
    {'member_id': 2, 'rolle': 'tag_v', 'x0': 0, 'y0': H, 'x1': L / 2, 'y1': KIP},
    {'member_id': 3, 'rolle': 'tag_h', 'x0': L / 2, 'y0': KIP, 'x1': L, 'y1': H},
    {'member_id': 4, 'rolle': 'vaeg_h', 'x0': L, 'y0': H, 'x1': L, 'y1': 0},
]
CPE0 = {'D': 0.8, 'E': -0.5, 'F': -0.9, 'G': -0.8, 'H': -0.3, 'I': -0.4, 'J': -1.0}
CPE90 = {'A': -1.2, 'B': -0.8, 'C': -0.5, 'F': -1.3, 'G': -1.3, 'H': -0.6, 'I': -0.5}
VIND = {'q_p': 0.8, 'h': KIP, 'b': 30.0, 'd': L, 'cpe0': [{'navn': '', 'c_pe': CPE0}], 'cpe90': CPE90}


def _lc(res, tekst):
    return next(t['nr'] for t in res['load_cases'] if t['navn'].startswith(tekst))


def _laster(res, lc, mid=None):
    return [l for l in res['loads'] if l['lc'] == lc and (mid is None or l['member_id'] == mid)]


def test_mu1_table():
    assert mu1(15) == 0.8 and mu1(45) == pytest.approx(0.4) and mu1(60) == 0


def test_strip_at_gable_is_half():
    assert strimmel(0, 5, 30) == (0, 2.5)
    assert strimmel(10, 5, 30) == (7.5, 12.5)


def test_snow_cases_and_value():
    r = laster_paa_ramme(LED, s_m=5, x_m=10, laengde_m=30, sne={'s_k': 1.0, 'C_e': 1.0, 'C_t': 1.0})
    navne = [t['navn'] for t in r['load_cases']]
    assert navne == ['Sne, jævnt fordelt', 'Sne, asymmetrisk — venstre halveret',
                     'Sne, asymmetrisk — højre halveret']
    lc = _lc(r, 'Sne, asymmetrisk — venstre')
    v = _laster(r, lc, 2)[0]; h = _laster(r, lc, 3)[0]
    assert v['direction'] == 'projected'
    assert v['value_kNm'] == pytest.approx(0.5 * 0.8 * 5)
    assert h['value_kNm'] == pytest.approx(0.8 * 5)
    assert all(t['gruppe'] == 'sne' for t in r['load_cases'])


def test_wind_from_left_zones_and_signs():
    r = laster_paa_ramme(LED, s_m=5, x_m=10, laengde_m=30, vind=VIND)
    lc = _lc(r, 'Vind fra venstre, c_pi +0,2')
    # Væg luv: tryk ind mod bygningen. Venstre væg er tegnet opad, så
    # lokal −y peger mod +x (indad): positiv værdi.
    D = _laster(r, lc, 1)[0]
    assert D['zone'] == 'D' and D['value_kNm'] == pytest.approx((0.8 - 0.2) * 0.8 * 5)
    # Læ-væg er tegnet nedad: lokal −y peger mod −x (indad) -> sug er negativ
    E = _laster(r, lc, 4)[0]
    assert E['value_kNm'] == pytest.approx((-0.5 - 0.2) * 0.8 * 5)
    # Luv-tag: G i e/10 vandret fra tagfoden, målt langs spæret
    e = min(30.0, 2 * KIP)
    G, Hz = sorted(_laster(r, lc, 2), key=lambda l: l.get('x1', 0))
    assert G['zone'] == 'G' and 'x1' not in G
    assert G['x2'] == pytest.approx((e / 10) / math.cos(math.radians(ALPHA)), abs=1e-3)
    assert Hz['zone'] == 'H'
    # sug på taget: løft = væk fra bygningen. Venstre spær tegnet opad mod
    # højre, lokal −y peger ned (ind) -> negativ værdi for sug
    assert G['value_kNm'] < 0
    # Læ-tag, højre spær tegnet fra kippen: J ved kippen er leddets start
    J = next(l for l in _laster(r, lc, 3) if l['zone'] == 'J')
    assert 'x1' not in J and J['x2'] == pytest.approx(G['x2'], abs=1e-3)


def test_wind_cases_count_and_group():
    r = laster_paa_ramme(LED, s_m=5, x_m=10, laengde_m=30, vind=VIND)
    vind = [t for t in r['load_cases'] if t['kategori'] == 'wind']
    assert len(vind) == 4 + 2
    assert {t['gruppe'] for t in vind} == {'vind'}


def test_end_frame_half_width_and_corner_weighting():
    r = laster_paa_ramme(LED, s_m=5, x_m=0, laengde_m=30, vind=VIND)
    assert r['lastbredde_m'] == pytest.approx(2.5)
    lc = _lc(r, 'Vind fra venstre, c_pi +0,2')
    G = next(l for l in _laster(r, lc, 2) if l['zone'] == 'F/G')
    e = min(30.0, 2 * KIP)
    fF = min(1.0, (e / 4) / 2.5)
    cG = fF * -0.9 + (1 - fF) * -0.8
    assert G['value_kNm'] == pytest.approx((cG - 0.2) * 0.8 * 2.5, abs=1e-4)


def test_wind_along_ridge_interior_frame_uses_C_and_I():
    r = laster_paa_ramme(LED, s_m=5, x_m=15, laengde_m=30, vind=VIND)
    lc = _lc(r, 'Vind på langs, c_pi −0,3')
    vaeg = _laster(r, lc, 1)[0]
    assert vaeg['value_kNm'] == pytest.approx((-0.5 + 0.3) * 0.8 * 5)
    tag = _laster(r, lc, 2)
    assert all(l['value_kNm'] == pytest.approx(-(-0.5 + 0.3) * 0.8 * 5 * -1) for l in tag)


def test_roof_dead_load():
    r = laster_paa_ramme(LED, s_m=5, x_m=10, laengde_m=30, g_tag_kNm2=0.5)
    assert r['load_cases'][0]['kategori'] == 'permanent'
    assert all(l['value_kNm'] == pytest.approx(2.5) and l['direction'] == 'vertical' for l in r['loads'])


def test_endpoint_and_wind_export_roundtrip():
    from fastapi.testclient import TestClient
    import main
    c = TestClient(main.app)
    hdr = getattr(main, 'TEST_HEADERS', None) or {}
    w = c.post('/calc/wind-load', json={'h_m': KIP, 'b_m': 30, 'd_m': L,
               'tagzoner': {k: CPE0[k] for k in 'GHIJ'}, 'alpha_deg': ALPHA,
               'langs': CPE90}, headers=hdr)
    if w.status_code in (401, 403):
        pytest.skip('endpoint kræver login i testmiljøet')
    assert w.status_code == 200, w.text
    eks = w.json()[0]['exports']
    assert eks['cpe0'][0]['c_pe']['D'] == 0.8 and eks['cpe90']['A'] == -1.2
    vind = {'q_p': eks['q_p_kNm2'], 'h': eks['h_m'], 'b': eks['b_m'], 'd': eks['d_m'],
            'cpe0': eks['cpe0'], 'cpe90': eks['cpe90']}
    r = c.post('/calc/frame-loads', json={'led': LED, 's_m': 5, 'x_m': 10, 'laengde_m': 30,
               'vind': vind, 'sne': {'s_k': 1.0}}, headers=hdr)
    assert r.status_code == 200, r.text
    ex = r.json()[0]['exports']
    assert len(ex['load_cases']) == 3 + 4 + 2


def test_steel_column_ltb_without_catalogue_torsion_constants():
    from fastapi.testclient import TestClient
    import main
    c = TestClient(main.app)
    r = c.post('/calc/steel-column', json={'section': 'HEA200', 'length_m': 5, 'N_Ed_kN': 50,
               'M_y_Ed_kNm': 30, 'ltb_restrained': False, 'L_LTB_m': 5})
    assert r.status_code == 200, r.text
    assert 'I_T' in r.text
