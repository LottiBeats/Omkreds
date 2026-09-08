"""
test_kombinationer_fra_laster.py — EN 1990-kombinationer af laster paasat
modellen.

Den gamle vej gik gennem navngivne lasttilfaelde i en blok for sig. Den blok
viser ikke modellen, saa elementnumrene tastes i blinde -- og den kendte ikke
til, at vind fra venstre og vind fra hoejre er alternativer. Resultatet var, at
en portalramme blev eftervist for 70 % af sidelasten: vinden fra den forkerte
side stod med psi_0 = 0,3 i den samme kombination og trak fra.

Her baerer lasten selv sin virkning og sin variant, og varianten er det, der
udelukker. De fleste tests nedenfor handler om netop dét -- resten er
bogholderi, som DK NA allerede fastlaegger.
"""
import pytest

from frame_load_cases import kombinationer_fra_laster


def _udl(elem, retning, v, virkning=None, variant=None):
    d = {'load_type': 'udl', 'elem_id': elem,
         'direction': retning, 'value_kNm': v}
    if virkning:
        d['virkning'] = virkning
    if variant:
        d['variant'] = variant
    return d


def _vindramme(varianter):
    """Egenlast, sne, og vind i saa mange varianter som oenskes."""
    laster = [_udl(2, 'vertical', 3.0, 'permanent'),
              _udl(2, 'projected', 4.0, 'snow')]
    for navn, v in varianter.items():
        laster.append(_udl(1, 'horizontal', v, 'wind', navn))
    return laster


# ── Den vigtige ─────────────────────────────────────────────────────────────

def test_to_vindretninger_optraeder_aldrig_sammen():
    """
    Kernen. Vinden blaeser ikke fra to sider paa én gang.

    Uden det staar vind fra den forkerte side med psi_0 = 0,3 i den ledende
    vinds kombination og traekker fra sidelasten. Paa en symmetrisk ramme med
    spejlvendte vindtilfaelde bliver rammen eftervist for 70 % af den rigtige
    last -- og tabellen ser fuldstaendig rigtig ud.
    """
    combos = kombinationer_fra_laster(
        _vindramme({'venstre': 2.0, 'hoejre': -2.0}))

    for c in combos:
        vind = [a for a in c['aktive'] if a.startswith('W·')]
        assert len(vind) <= 1, \
            'to vindtilfaelde i samme kombination: %s (%s)' % (vind, c['name'])


def test_fire_vindvarianter_giver_ni_kombinationer():
    """
    Niels' tilfaelde: to retninger gange to indvendige tryk.

    6.10a                                  1
    6.10b, pr. vindvalg (4) x leder (S, W) 8
    """
    combos = kombinationer_fra_laster(_vindramme({
        'v+': 2.0, 'v-': 2.6, 'h+': -2.0, 'h-': -2.6}))
    assert len(combos) == 9

    for c in combos:
        assert len([a for a in c['aktive'] if a.startswith('W·')]) <= 1


def test_hver_vindvariant_kommer_med_som_ledende():
    """
    Ingen variant maa falde ud. Er der fire, skal alle fire have vaeret den
    ledende én gang -- ellers er der en lastretning, rammen aldrig blev
    eftervist for.
    """
    varianter = {'v+': 2.0, 'v-': 2.6, 'h+': -2.0, 'h-': -2.6}
    combos = kombinationer_fra_laster(_vindramme(varianter))

    ledende = {c['name'].split('(')[1].split(' leder')[0]
               for c in combos if 'leder' in c['name']}
    for v in varianter:
        assert 'W·' + v in ledende, 'variant %s blev aldrig ledende' % v


# ── Uden virkning sker der ingenting ────────────────────────────────────────

def test_uden_virkning_er_der_ingenting_at_kombinere():
    """
    Baerer ingen last en virkning, returneres en tom liste.

    Det er dét, der holder den simple vej simpel: en bjaelke med én linjelast
    skal ikke pludselig have en kombinationstabel. FEM-blokken koerer som den
    altid har gjort -- én beregning med lasterne som de staar.
    """
    laster = [_udl(1, 'vertical', 5.0), _udl(2, 'vertical', 5.0)]
    assert kombinationer_fra_laster(laster) == []


def test_én_last_med_virkning_er_nok_til_at_taende_det():
    laster = [_udl(1, 'vertical', 5.0),
              _udl(2, 'projected', 4.0, 'snow')]
    combos = kombinationer_fra_laster(laster)
    assert len(combos) == 2, '6.10a og 6.10b med sne som ledende'


# ── DK NA-bogholderiet ──────────────────────────────────────────────────────

def test_sne_falder_ud_naar_vinden_leder():
    """
    DS/EN 1990 DK NA:2024 tabel A1.1: psi_0 for sne er 0, naar vind er den
    ledende variable last. Ikke 0,3 -- nul.
    """
    combos = kombinationer_fra_laster(_vindramme({'venstre': 2.0}))
    vindledet = [c for c in combos if 'W·venstre leder' in c['name']]
    assert vindledet, 'ingen vindledet kombination'
    for c in vindledet:
        assert c['factor_table'].get('S', 0.0) == pytest.approx(0.0), \
            'sne skal have psi_0 = 0, naar vinden leder'


def test_de_permanente_er_med_i_hver_eneste_kombination():
    combos = kombinationer_fra_laster(
        _vindramme({'venstre': 2.0, 'hoejre': -2.0}))
    for c in combos:
        assert c['factor_table'].get('G', 0.0) > 0.9, \
            'egenlasten mangler i %s' % c['name']


def test_6_10a_har_kun_de_permanente():
    combos = kombinationer_fra_laster(_vindramme({'venstre': 2.0}))
    a = next(c for c in combos if c['name'].startswith('6.10a'))
    assert a['factor_table']['G'] == pytest.approx(1.2)
    assert a['aktive'] == [], '6.10a er permanente laster alene'


def test_lastvarigheden_foelger_den_korteste_aktive():
    """
    EN 1995-1-1 tabel 3.1: k_mod bestemmes af den korteste lastvarighed i
    kombinationen. Vind er oejeblikkelig, sne er kort -- staar de sammen, er
    det vinden, der afgoer.
    """
    combos = kombinationer_fra_laster(_vindramme({'venstre': 2.0}))
    ved_navn = {c['name']: c for c in combos}

    kun_permanent = next(c for c in combos if c['name'].startswith('6.10a'))
    assert kun_permanent['governing_duration'] == 'permanent'

    med_vind = [c for c in combos if any(a.startswith('W·') for a in c['aktive'])]
    assert med_vind
    for c in med_vind:
        assert c['governing_duration'] == 'instant'


def test_en_variant_paa_en_permanent_last_ignoreres():
    """
    Egenlasten er der i hver kombination. Gav en variant paa den mening, ville
    den betyde "huset har enten det ene eller det andet tag" -- og det er ikke
    det, nogen skriver den for. Den ignoreres, saa to permanente laster med
    hver sin variant ikke bliver til to udelukkende tilfaelde.
    """
    laster = [_udl(1, 'vertical', 3.0, 'permanent', 'tag'),
              _udl(2, 'vertical', 2.0, 'permanent', 'vaegge'),
              _udl(2, 'projected', 4.0, 'snow')]
    combos = kombinationer_fra_laster(laster)

    a = next(c for c in combos if c['name'].startswith('6.10a'))
    vaerdier = sorted(l['value_kNm'] for l in a['loads'])
    assert vaerdier == pytest.approx([2.4, 3.6]), \
        'begge permanente laster skal vaere med, ganget med 1,2'


def test_faktortabellen_udelader_den_variant_der_ikke_indgaar():
    """
    Tabellen er det, brugeren laeser. En variant, der ikke er med i raekken,
    skal vaere fravaerende og ikke staa med 0,000 -- "—" i en celle siger
    "dette tilfaelde indgaar ikke", og et nul ser ud som en last, der blev
    regnet til ingenting.
    """
    combos = kombinationer_fra_laster(
        _vindramme({'venstre': 2.0, 'hoejre': -2.0}))
    med_venstre = next(c for c in combos if 'W·venstre leder' in c['name'])
    assert 'W·venstre' in med_venstre['factor_table']
    assert 'W·hoejre' not in med_venstre['factor_table']


def test_lasterne_er_skaleret_og_ikke_bare_talt_op():
    """Faktoren skal staa paa selve lasten, ikke kun i tabellen."""
    combos = kombinationer_fra_laster([
        _udl(1, 'vertical', 10.0, 'permanent'),
        _udl(2, 'projected', 4.0, 'snow')])
    b = next(c for c in combos if c['name'].startswith('6.10b'))
    permanent = [l for l in b['loads'] if l['elem_id'] == 1][0]
    sne = [l for l in b['loads'] if l['elem_id'] == 2][0]
    assert permanent['value_kNm'] == pytest.approx(10.0)   # 1,0 · G
    assert sne['value_kNm'] == pytest.approx(6.0)          # 1,5 · S


# ── Hele vejen gennem endepunktet ───────────────────────────────────────────

def _ramme():
    b, h = 8.0, 4.0
    STAV = {'E_GPa': 210.0, 'A_cm2': 53.8, 'Iz_cm4': 8356.0}
    nodes = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 0, 'y': h},
             {'id': 3, 'x': b, 'y': h}, {'id': 4, 'x': b, 'y': 0}]
    elements = [dict(id=1, ni=1, nj=2, type='beam', release='none', **STAV),
                dict(id=2, ni=2, nj=3, type='beam', release='none', **STAV),
                dict(id=3, ni=3, nj=4, type='beam', release='none', **STAV)]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': True},
                {'node_id': 4, 'ux': True, 'uy': True, 'rz': True}]
    return nodes, elements, supports


def test_endepunktet_kombinerer_paasatte_laster(client):
    """
    Laster med virkning og variant sendes til FEM-blokkens eget endepunkt, og
    der kommer en indhyldning tilbage — uden at der er sendt en eneste
    faerdigkombineret last med.
    """
    nodes, elements, supports = _ramme()
    r = client.post('/calc/general-frame-fem', json={
        'title': 'Ramme', 'nodes': nodes, 'elements': elements,
        'supports': supports,
        'loads': [
            {'type': 'udl', 'elem_id': 2, 'direction': 'vertical',
             'value_kNm': 3.0, 'virkning': 'permanent'},
            {'type': 'udl', 'elem_id': 2, 'direction': 'projected',
             'value_kNm': 4.0, 'virkning': 'snow'},
            {'type': 'udl', 'elem_id': 1, 'direction': 'horizontal',
             'value_kNm': 2.0, 'virkning': 'wind', 'variant': 'venstre'},
            {'type': 'udl', 'elem_id': 3, 'direction': 'horizontal',
             'value_kNm': -2.0, 'virkning': 'wind', 'variant': 'hoejre'},
        ],
    })
    assert r.status_code == 200, r.text
    summary = r.json()['_summary']
    navne = summary.get('combinations', [])
    assert len(navne) == 5, navne
    assert summary.get('envelope'), 'ingen indhyldning'

    for navn in navne:
        assert not ('venstre' in navn and 'hoejre' in navn), \
            'vind fra to sider i %s' % navn


def test_laster_uden_virkning_koerer_som_hidtil(client):
    """
    Den simple vej maa ikke aendre sig. Uden en virkning paa nogen last er der
    én beregning og ingen kombinationsliste — praecis som foer feltet fandtes.
    """
    nodes, elements, supports = _ramme()
    r = client.post('/calc/general-frame-fem', json={
        'title': 'Ramme', 'nodes': nodes, 'elements': elements,
        'supports': supports,
        'loads': [{'type': 'udl', 'elem_id': 2,
                   'direction': 'vertical', 'value_kNm': 12.0}],
    })
    assert r.status_code == 200, r.text
    summary = r.json()['_summary']
    assert not summary.get('combinations'), \
        'en ukombineret last maa ikke give en kombinationstabel'
    assert summary.get('max_moment_kNm', 0) > 0


def test_lasten_taelles_ikke_med_to_gange(client):
    """
    Naar lasterne er lagt ind i kombinationerne, maa de ikke ogsaa staa som
    ukombinerede laster ved siden af.

    Momentet fra 6.10a alene (1,2 x 3,0 = 3,6 kN/m paa riglen) skal svare til
    en ren koersel med 3,6 kN/m — ikke til 3,6 + 3,0.
    """
    nodes, elements, supports = _ramme()

    kombineret = client.post('/calc/general-frame-fem', json={
        'title': 'K', 'nodes': nodes, 'elements': elements,
        'supports': supports,
        'loads': [{'type': 'udl', 'elem_id': 2, 'direction': 'vertical',
                   'value_kNm': 3.0, 'virkning': 'permanent'}],
    }).json()['_summary']

    direkte = client.post('/calc/general-frame-fem', json={
        'title': 'D', 'nodes': nodes, 'elements': elements,
        'supports': supports,
        'loads': [{'type': 'udl', 'elem_id': 2, 'direction': 'vertical',
                   'value_kNm': 3.6}],
    }).json()['_summary']

    assert kombineret['max_moment_kNm'] == pytest.approx(
        direkte['max_moment_kNm'], rel=0.01)


def test_kombinationstabellen_staar_i_dokumentet(client):
    """
    Kombinationerne skal kunne laeses i dokumentet, ikke kun bruges.

    Uden tabellen staar der hvad der KOM UD, men ikke hvad der blev regnet.
    DS 1140 kraever kombinationerne angivet, og en indhyldning kan ingen
    efterregne uden at vide, hvad der gik ind i den.

    Det er ogsaa svaret paa "det bliver lidt sort boks": reglen om, at vind fra
    to sider udelukker hinanden, kan ses direkte -- de to varianter har hver
    sin soejle, og ingen raekke har tal i dem begge.
    """
    nodes, elements, supports = _ramme()
    r = client.post('/calc/general-frame-fem', json={
        'title': 'Ramme', 'nodes': nodes, 'elements': elements,
        'supports': supports,
        'loads': [
            {'type': 'udl', 'elem_id': 2, 'direction': 'vertical',
             'value_kNm': 3.0, 'virkning': 'permanent'},
            {'type': 'udl', 'elem_id': 1, 'direction': 'horizontal',
             'value_kNm': 2.0, 'virkning': 'wind', 'variant': 'venstre'},
            {'type': 'udl', 'elem_id': 3, 'direction': 'horizontal',
             'value_kNm': -2.0, 'virkning': 'wind', 'variant': 'hoejre'},
        ],
    })
    assert r.status_code == 200, r.text
    blocks = r.json()['_result']

    tabeller = [b for b in blocks if b.get('type') == 'table']
    assert tabeller, 'ingen tabel i dokumentet'

    kombi = next((t for t in tabeller
                  if any('venstre' in str(h) for h in t['headers'])), None)
    assert kombi, 'kombinationstabellen mangler — kun indhyldningen er der'

    # Én søjle pr. variant, og ingen række med tal i dem begge.
    iv = next(i for i, h in enumerate(kombi['headers']) if 'venstre' in str(h))
    ih = next(i for i, h in enumerate(kombi['headers']) if 'hoejre' in str(h))
    for row in kombi['rows']:
        begge = row[iv] != '—' and row[ih] != '—'
        assert not begge, 'vind fra to sider i samme raekke: %s' % row[0]
