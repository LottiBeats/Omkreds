"""
test_kombinationstabel.py — tabellen i brugerfladen og fravalget

To ting, der begge kan gaa galt i stilhed:

1. Tabellen, brugeren ser FOER han trykker paa "Kør FEM", skal vise de samme
   kombinationer, som koerslen faktisk danner. Et forhaandsvisning, der regnes
   af noget andet end det, der regner, er vaerre end ingen: den ser rigtig ud.

2. Et fravalg skal fjerne praecis den kombination, der blev valgt fra, og det
   skal staa i dokumentet. En eftervisning, hvor en kombination mangler uden
   at det staar der, kan ingen kontrollere.
"""
import pytest

from frame_load_cases import kombinationer_fra_laster


# En ramme med egenvaegt, sne og vind fra to sider. Vindvarianterne udelukker
# hinanden, saa der er to udvalg, og i hvert af dem er der to ledende --
# altsaa 6.10a plus fire gange 6.10b.
LASTER = [
    {'type': 'udl', 'elem_id': 1, 'direction': 'vertical', 'value_kNm': 3.0,
     'virkning': 'permanent'},
    {'type': 'udl', 'elem_id': 1, 'direction': 'vertical', 'value_kNm': 1.5,
     'virkning': 'snow'},
    {'type': 'udl', 'elem_id': 2, 'direction': 'horizontal', 'value_kNm': 0.8,
     'virkning': 'wind', 'variant': 'venstre'},
    {'type': 'udl', 'elem_id': 3, 'direction': 'horizontal', 'value_kNm': -0.8,
     'virkning': 'wind', 'variant': 'hoejre'},
]

MODEL = {
    'nodes': [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 0, 'y': 3},
              {'id': 3, 'x': 5, 'y': 3}, {'id': 4, 'x': 5, 'y': 0}],
    'elements': [
        {'id': 1, 'ni': 2, 'nj': 3, 'E_GPa': 11.0,
         'A_cm2': 200.0, 'Iz_cm4': 66666.0},
        {'id': 2, 'ni': 1, 'nj': 2, 'E_GPa': 11.0,
         'A_cm2': 200.0, 'Iz_cm4': 66666.0},
        {'id': 3, 'ni': 4, 'nj': 3, 'E_GPa': 11.0,
         'A_cm2': 200.0, 'Iz_cm4': 66666.0},
    ],
    'supports': [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True},
                 {'node_id': 4, 'ux': True, 'uy': True, 'rz': True}],
}


def _kald(client, **extra):
    krop = dict(MODEL, title='Ramme', loads=LASTER, **extra)
    return client.post('/calc/general-frame-fem', json=krop)


# ── 1. Forhaandsvisningen er den samme som koerslen ───────────────────────────

def test_tabellen_er_den_samme_funktion_som_koerslen(client):
    """Endpointet maa ikke have sin egen udgave af EN 1990."""
    r = client.post('/calc/general-frame-fem/kombinationer',
                    json={'loads': LASTER, 'consequence_class': 'CC2'})
    assert r.status_code == 200, r.text
    fra_api = r.json()['kombinationer']

    direkte = kombinationer_fra_laster(LASTER, '6.10ab', 'CC2')

    assert [k['name'] for k in fra_api] == [c['name'] for c in direkte]
    for a, b in zip(fra_api, direkte):
        assert a['factor_table'] == b['factor_table']
        assert a['governing_duration'] == b['governing_duration']


def test_vindvarianterne_udelukker_hinanden_i_tabellen(client):
    """Vind fra venstre og fra hoejre staar aldrig i den samme raekke.

    Det er hele grunden til, at Frame Load Cases blev taget ud af paletten:
    den lagde dem sammen, og en ramme fik 70 % af sin sidelast.
    """
    r = client.post('/calc/general-frame-fem/kombinationer',
                    json={'loads': LASTER, 'consequence_class': 'CC2'})
    for k in r.json()['kombinationer']:
        aktive = set(k['aktive'])
        assert not ({'W — Vindlast·venstre', 'W — Vindlast·hoejre'} <= aktive), \
            f"begge vindretninger i {k['name']!r}"


def test_lasterne_kommer_ikke_med_retur(client):
    """Tabellen skal vise faktorer, ikke sende hver lastfigur retur i kopi."""
    r = client.post('/calc/general-frame-fem/kombinationer',
                    json={'loads': LASTER})
    for k in r.json()['kombinationer']:
        assert 'loads' not in k


def test_ingen_virkning_giver_ingen_kombinationer(client):
    """Uden virkning paa nogen last er der ingenting at kombinere.

    Blokken skal saa opfoere sig, som foer feltet fandtes -- én koersel med
    lasterne, som de staar -- ikke vise en kombination af én ting.
    """
    uden = [dict(l, virkning=None, variant=None) for l in LASTER]
    r = client.post('/calc/general-frame-fem/kombinationer',
                    json={'loads': uden})
    assert r.json()['kombinationer'] == []


def test_konsekvensklassen_slaar_igennem(client):
    """CC3 er K_FI = 1,1 paa hver eneste faktor."""
    svar = {}
    for kk in ('CC2', 'CC3'):
        r = client.post('/calc/general-frame-fem/kombinationer',
                        json={'loads': LASTER, 'consequence_class': kk})
        svar[kk] = r.json()['kombinationer'][0]['factor_table']
    for handling, f2 in svar['CC2'].items():
        assert svar['CC3'][handling] == pytest.approx(f2 * 1.1, rel=1e-6)


# ── 2. Fravalget ──────────────────────────────────────────────────────────────

def test_fravalg_fjerner_netop_den_kombination(client):
    alle = kombinationer_fra_laster(LASTER, '6.10ab', 'CC2')
    fra = alle[1]['name']

    r = _kald(client, combo_fravalg=[fra])
    assert r.status_code == 200, r.text
    navne = r.json()['_summary']['combinations']

    assert fra not in navne
    assert len(navne) == len(alle) - 1


def test_fravalget_staar_i_dokumentet(client):
    """Ellers ser kombinationstabellen komplet ud, selv om den ikke er det."""
    alle = kombinationer_fra_laster(LASTER, '6.10ab', 'CC2')
    fra = alle[1]['name']

    r = _kald(client, combo_fravalg=[fra])
    tekst = ' '.join(str(b.get('content', ''))
                     for b in r.json()['_result'])
    assert 'slået fra i hånden' in tekst
    assert fra in tekst


def test_uden_fravalg_staar_der_ingenting_om_fravalg(client):
    r = _kald(client)
    tekst = ' '.join(str(b.get('content', '')) for b in r.json()['_result'])
    assert 'slået fra i hånden' not in tekst


def test_alt_fravalgt_er_ikke_en_tom_eftervisning(client):
    """Den skal afvises, ikke koere og se ud, som om der var regnet noget."""
    alle = kombinationer_fra_laster(LASTER, '6.10ab', 'CC2')
    r = _kald(client, combo_fravalg=[c['name'] for c in alle])
    assert r.status_code == 422
    assert 'slaaet fra' in r.text or 'slået fra' in r.text


def test_et_foraeldet_fravalg_falder_bort(client):
    """Aendrer lasterne sig, passer et gammelt navn ikke laengere.

    Saa skal kombinationen koere. Den vej er den rigtige: en glemt
    udelukkelse giver en eftervisning for meget, ikke en for lidt.
    """
    alle = kombinationer_fra_laster(LASTER, '6.10ab', 'CC2')
    r = _kald(client, combo_fravalg=['6.10b (S — Snelast leder): 0.00G'])
    assert r.status_code == 200, r.text
    assert len(r.json()['_summary']['combinations']) == len(alle)


def test_tabellen_viser_det_der_bliver_regnet(client):
    """Ende til ende: raekkerne i tabellen er koerslens kombinationer.

    Brugerfladen sender lasterne, som de staar -- med target='member' -- til
    tabellen, men sender dem udfoldet til elementer, naar der koeres. Grupperes
    der efter noget andet end virkning og variant, giver de to kald forskellige
    raekker, og forhaandsvisningen lyver om det, der bliver eftervist.
    """
    som_tastet = [dict(l, target='member', member_id=1) for l in LASTER]

    forhaand = client.post('/calc/general-frame-fem/kombinationer',
                           json={'loads': som_tastet,
                                 'consequence_class': 'CC2'})
    assert forhaand.status_code == 200, forhaand.text

    koert = _kald(client)   # samme laster, udfoldet til elementer
    assert koert.status_code == 200, koert.text

    assert [k['name'] for k in forhaand.json()['kombinationer']] \
        == koert.json()['_summary']['combinations']
