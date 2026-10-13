"""
Reaktioner for hvert lasttilfælde og hver lastkombination.

Før kom kun den dimensionerende reaktion med, og den stod ved udnyttelsen. En
fundamentsberegning skal bruge reaktionerne for hvert tilfælde for sig
(karakteristisk) og for hver kombination.
"""
import math

from test_lasttilfaelde import MODEL, LASTER, TILFAELDE


def _koer(client):
    r = client.post('/calc/general-frame-fem', json=dict(
        MODEL, title='Ramme', loads=LASTER, load_cases=TILFAELDE))
    assert r.status_code == 200, r.text
    return r.json()['_summary']


def _laengde(eid):
    el = next(e for e in MODEL['elements'] if e['id'] == eid)
    n = {k['id']: k for k in MODEL['nodes']}
    a, b = n[el['ni']], n[el['nj']]
    return math.hypot(b['x'] - a['x'], b['y'] - a['y'])


def test_hvert_tilfaelde_har_reaktioner_i_ligevaegt(client):
    s = _koer(client)
    pr = {t['nr']: t for t in s['reaktioner_tilfaelde']}
    assert set(pr) == {1, 2, 3, 4}
    assert pr[3]['navn'] == 'LC3 Vind fra venstre'
    for t in pr.values():
        assert set(t['reactions']) == {'1', '4'}

    # LC1: 3,0 kN/m lodret på bjælken -> lodrette reaktioner i alt 3,0·L, ingen vandret.
    R = pr[1]['reactions'].values()
    assert abs(abs(sum(r[1] for r in R)) - 3.0 * _laengde(1)) < 1e-6
    assert abs(sum(r[0] for r in R)) < 1e-6
    # LC3: 0,8 kN/m vandret på venstre søjle -> vandrette reaktioner i alt 0,8·h.
    R = pr[3]['reactions'].values()
    assert abs(abs(sum(r[0] for r in R)) - 0.8 * _laengde(2)) < 1e-6


def test_hver_kombination_har_sine_reaktioner(client):
    s = _koer(client)
    states = [c['state'] for c in s['combo_figs']]
    assert states and all(set(st['reactions']) == {'1', '4'} for st in states)
    # Kombinationerne er forskellige, og det skal reaktionerne også være.
    lodret = {round(sum(r[1] for r in st['reactions'].values()), 6) for st in states}
    assert len(lodret) > 1
