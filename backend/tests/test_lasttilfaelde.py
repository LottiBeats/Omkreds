"""
test_lasttilfaelde.py — load cases, som ethvert rammeprogram har dem

Arbejdsgangen er RFEM's og FEM-Designs: man opretter navngivne lasttilfælde,
lægger laster i dem, og kombinationerne dannes af tilfældene.

Det er ikke en anden mekanik end før — den gamle vej, hvor hver last bar sin
egen virkning og variant, oversættes til tilfælde og regnes af den samme
motor. Prøverne her holder begge veje op mod hinanden, for to veje ind i det
samme hus må ikke give to forskellige svar.
"""
import pytest

from frame_load_cases import (kombinationer_af_tilfaelde,
                              kombinationer_fra_laster)


# LC1 egenlast, LC2 sne, LC3+LC4 vind fra hver sin side.
TILFAELDE = [
    {'nr': 1, 'navn': 'Egenlast',          'kategori': 'permanent'},
    {'nr': 2, 'navn': 'Snelast',           'kategori': 'snow'},
    {'nr': 3, 'navn': 'Vind fra venstre',  'kategori': 'wind'},
    {'nr': 4, 'navn': 'Vind fra højre',    'kategori': 'wind'},
]

LASTER = [
    {'type': 'udl', 'elem_id': 1, 'direction': 'vertical',   'value_kNm': 3.0, 'lc': 1},
    {'type': 'udl', 'elem_id': 1, 'direction': 'vertical',   'value_kNm': 1.5, 'lc': 2},
    {'type': 'udl', 'elem_id': 2, 'direction': 'horizontal', 'value_kNm': 0.8, 'lc': 3},
    {'type': 'udl', 'elem_id': 3, 'direction': 'horizontal', 'value_kNm': -0.8, 'lc': 4},
]


def _navne(combos):
    return [c['name'] for c in combos]


# ── Tilfældene er identiteten ────────────────────────────────────────────────

def test_tilfaeldets_navn_staar_i_kombinationen():
    """Ikke "W·venstre" — det navn, brugeren selv gav tilfældet.

    Det er forskellen på en tabel, en anden ingeniør kan læse, og en, der skal
    afkodes.
    """
    combos = kombinationer_af_tilfaelde(TILFAELDE, LASTER)
    tekst = ' '.join(_navne(combos))
    assert 'Vind fra venstre' in tekst
    assert 'Snelast' in tekst
    for c in combos:
        assert set(c['factor_table']) <= {t['navn'] for t in TILFAELDE}


def test_to_vindtilfaelde_udelukker_hinanden_af_sig_selv():
    """Uden en gruppe hører tilfældet til sin kategori.

    To vindretninger er næsten altid alternativer, og lagt sammen giver de
    70 % for meget sidelast. Det skal være det, der sker, når man ikke siger
    noget.
    """
    for c in kombinationer_af_tilfaelde(TILFAELDE, LASTER):
        aktive = set(c['aktive'])
        assert not ({'Vind fra venstre', 'Vind fra højre'} <= aktive), c['name']


def test_en_gruppe_kan_sige_at_to_tilfaelde_er_alternativer():
    """Sne og snefygning er to tilfælde, men én handling."""
    tilfaelde = [
        {'nr': 1, 'navn': 'Egenlast', 'kategori': 'permanent'},
        {'nr': 2, 'navn': 'Sne jævnt', 'kategori': 'snow', 'gruppe': 'sne'},
        {'nr': 3, 'navn': 'Sne fygning', 'kategori': 'snow', 'gruppe': 'sne'},
    ]
    laster = [{'type': 'udl', 'elem_id': 1, 'value_kNm': 1.0, 'lc': n}
              for n in (1, 2, 3)]
    for c in kombinationer_af_tilfaelde(tilfaelde, laster):
        assert not ({'Sne jævnt', 'Sne fygning'} <= set(c['aktive'])), c['name']


def test_forskellige_grupper_virker_samtidig():
    """Sne og vind er to handlinger og skal kunne optræde sammen."""
    combos = kombinationer_af_tilfaelde(TILFAELDE, LASTER)
    assert any({'Snelast', 'Vind fra venstre'} <= set(c['aktive'])
               for c in combos)


def test_det_permanente_tilfaelde_er_med_i_hver_kombination():
    for c in kombinationer_af_tilfaelde(TILFAELDE, LASTER):
        assert c['factor_table'].get('Egenlast', 0) >= 0.9 - 1e-12, c['name']


def test_laster_fordeles_efter_deres_tilfaelde():
    """Lasten skal skaleres med sit eget tilfældes faktor og ikke en andens."""
    combos = kombinationer_af_tilfaelde(TILFAELDE, LASTER)
    a = next(c for c in combos if c['name'].startswith('6.10a'))
    # 6.10a er de permanente alene: kun LC1's last, ganget med 1,20.
    assert len(a['loads']) == 1
    assert a['loads'][0]['value_kNm'] == pytest.approx(3.0 * 1.2)


def test_en_last_uden_kendt_tilfaelde_falder_ud():
    """Den hører ikke til nogen handling.

    At lade den falde ned i et tilfældigt tilfælde ville være et gæt, og
    gættet ville blive ganget med en partialkoefficient og se rigtigt ud.
    """
    laster = LASTER + [{'type': 'udl', 'elem_id': 9, 'value_kNm': 99.0,
                        'lc': 77}]
    for c in kombinationer_af_tilfaelde(TILFAELDE, laster):
        assert all(l.get('value_kNm') != pytest.approx(99.0 * 1.2)
                   for l in c['loads'])


def test_uden_tilfaelde_er_der_ingenting_at_kombinere():
    assert kombinationer_af_tilfaelde([], LASTER) == []


def test_et_tilfaelde_uden_navn_faar_et():
    """En tom celle i rapporten er værre end LC3."""
    t = [{'nr': 3, 'navn': '', 'kategori': 'snow'}]
    combos = kombinationer_af_tilfaelde(t, [{'value_kNm': 1.0, 'lc': 3}])
    assert any('LC3' in n for n in _navne(combos))


# ── De to veje ind skal give det samme ───────────────────────────────────────

def test_tilfaelde_og_virkning_giver_den_samme_mekanik():
    """Den gamle vej oversættes til tilfælde og regnes af den samme motor.

    Navnene er forskellige — "W·venstre" mod "Vind fra venstre" — men
    antallet af kombinationer, faktorerne og lastvarighederne skal være ens.
    Er de ikke det, er der to Eurocode-implementeringer i huset igen.
    """
    gammel_laster = [
        {'type': 'udl', 'elem_id': 1, 'direction': 'vertical', 'value_kNm': 3.0,
         'virkning': 'permanent'},
        {'type': 'udl', 'elem_id': 1, 'direction': 'vertical', 'value_kNm': 1.5,
         'virkning': 'snow'},
        {'type': 'udl', 'elem_id': 2, 'direction': 'horizontal', 'value_kNm': 0.8,
         'virkning': 'wind', 'variant': 'venstre'},
        {'type': 'udl', 'elem_id': 3, 'direction': 'horizontal', 'value_kNm': -0.8,
         'virkning': 'wind', 'variant': 'hoejre'},
    ]
    gammel = kombinationer_fra_laster(gammel_laster)
    ny = kombinationer_af_tilfaelde(TILFAELDE, LASTER)

    assert len(gammel) == len(ny)
    for a, b in zip(gammel, ny):
        assert sorted(a['factor_table'].values()) \
            == sorted(b['factor_table'].values()), (a['name'], b['name'])
        assert a['governing_duration'] == b['governing_duration']
        assert len(a['loads']) == len(b['loads'])


# ── Hele vejen gennem endepunkterne ──────────────────────────────────────────

MODEL = {
    'nodes': [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 0, 'y': 3},
              {'id': 3, 'x': 5, 'y': 3}, {'id': 4, 'x': 5, 'y': 0}],
    'elements': [
        {'id': 1, 'ni': 2, 'nj': 3, 'E_GPa': 11.0, 'A_cm2': 200.0, 'Iz_cm4': 66666.0},
        {'id': 2, 'ni': 1, 'nj': 2, 'E_GPa': 11.0, 'A_cm2': 200.0, 'Iz_cm4': 66666.0},
        {'id': 3, 'ni': 4, 'nj': 3, 'E_GPa': 11.0, 'A_cm2': 200.0, 'Iz_cm4': 66666.0},
    ],
    'supports': [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True},
                 {'node_id': 4, 'ux': True, 'uy': True, 'rz': True}],
}


def test_endepunktet_kombinerer_over_tilfaeldene(client):
    r = client.post('/calc/general-frame-fem', json=dict(
        MODEL, title='Ramme', loads=LASTER, load_cases=TILFAELDE))
    assert r.status_code == 200, r.text
    navne = r.json()['_summary']['combinations']
    assert any('Vind fra venstre' in n for n in navne)
    assert r.json()['_summary'].get('envelope')


def test_forhaandsvisningen_bruger_ogsaa_tilfaeldene(client):
    """Tabellen før kørslen og kørslen selv skal blive ved med at være enige."""
    forhaand = client.post('/calc/general-frame-fem/kombinationer',
                           json={'loads': LASTER, 'load_cases': TILFAELDE})
    assert forhaand.status_code == 200, forhaand.text

    koert = client.post('/calc/general-frame-fem', json=dict(
        MODEL, title='Ramme', loads=LASTER, load_cases=TILFAELDE))
    assert [k['name'] for k in forhaand.json()['kombinationer']] \
        == koert.json()['_summary']['combinations']


def test_uden_tilfaelde_koerer_den_gamle_vej_uaendret(client):
    """Et dokument fra før tilfældene fandtes skal regne præcis som før."""
    gamle = [
        {'type': 'udl', 'elem_id': 1, 'direction': 'vertical', 'value_kNm': 3.0,
         'virkning': 'permanent'},
        {'type': 'udl', 'elem_id': 1, 'direction': 'vertical', 'value_kNm': 1.5,
         'virkning': 'snow'},
    ]
    r = client.post('/calc/general-frame-fem', json=dict(
        MODEL, title='Ramme', loads=gamle))
    assert r.status_code == 200, r.text
    navne = r.json()['_summary']['combinations']
    assert navne and all('LC' not in n for n in navne)
