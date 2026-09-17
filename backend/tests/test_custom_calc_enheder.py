"""
test_custom_calc_enheder.py — enhederne i den frie beregningsblok

Alle proever her handler om den samme slags fejl: tallet og maerkatet ved
siden af det er ikke enige, og der staar ingenting om det. Den slags er
vaerre end en fejlmeddelelse -- raekken ser rigtig ud, og den ryger med i
dokumentet.

Tre steder gik det galt:

1. En stoerrelse vist i en enhed af en anden slags blev bare doebt om.
   15,625 kN·m vist i kN gav "15.625 kN". forallpeople deler villigt: M/kN er
   15,625 m, og float() smed metrene vaek.

2. En betinget gren pakkede resultatet om: float(24 MPa) er 24, og 24 × kPa er
   24 kPa. En faktor 1000 forkert, uden en fejl at se.

3. En enhed, der ikke kunne laeses, blev til et tal uden enhed. Raekken viste
   "500 mm²", mens vaerdien i regnestykket var et bart 500.
"""
import pytest


def _koer(client, items, title='Enhedsproeve'):
    r = client.post('/calc/custom-calc', json={'title': title, 'items': items})
    assert r.status_code == 200, r.text
    return r.json()


def _raekke(blokke, navn):
    for b in blokke:
        if b.get('type') == 'calc_row' and b.get('name') == navn:
            return b
    return None


def _noter(blokke):
    return [b.get('content', '') for b in blokke if b.get('type') == 'note']


GRUND = [
    {'type': 'var', 'name': 'q',   'value': 5,  'unit': 'kN/m'},
    {'type': 'var', 'name': 'L',   'value': 5,  'unit': 'm'},
    {'type': 'var', 'name': 'sig', 'value': 24, 'unit': 'MPa'},
]


# ── 1. En enhed af en anden slags er ikke en enhed at vise i ──────────────────

def test_et_moment_vises_ikke_som_en_kraft(client):
    b = _koer(client, GRUND + [
        {'type': 'formula', 'expr': 'M = q*L**2/8', 'unit': 'kN'},
    ])
    r = _raekke(b, 'M')['result']
    assert 'kan ikke vises' in r, r
    # Vaerdien skal stadig staa der -- i sin egen enhed.
    assert '15.625' in r and 'kN·m' in r


def test_en_spaending_vises_ikke_som_en_kraft(client):
    """0,024 kN for 24 MPa. Tallet saa ud, som om nogen havde regnet det."""
    b = _koer(client, GRUND + [
        {'type': 'formula', 'expr': 's = sig*1', 'unit': 'kN'},
    ])
    assert 'kan ikke vises' in _raekke(b, 's')['result']


def test_den_rigtige_omregning_sker_stadig(client):
    """Vaernet maa ikke spaerre for det, der er hele pointen med enheder."""
    b = _koer(client, GRUND + [
        {'type': 'formula', 'expr': 's = sig*1',      'unit': 'kPa'},
        {'type': 'formula', 'expr': 'M = q*L**2/8',   'unit': 'kN*m'},
        {'type': 'formula', 'expr': 'M2 = q*L**2/8',  'unit': 'N*m'},
    ])
    assert _raekke(b, 's')['result'].startswith('24000 kPa')
    assert _raekke(b, 'M')['result'].startswith('15.625 kN·m')
    assert _raekke(b, 'M2')['result'].startswith('15625 N·m')


def test_et_bart_tal_maa_godt_faa_en_enhed_paa(client):
    """Et tal uden dimension har ingenting at modsige med.

    Saa er enheden brugerens paastand om, hvad tallet er, og den staar ved
    magt. Ellers kunne man ikke skrive et tal ind og kalde det kN.
    """
    b = _koer(client, [{'type': 'formula', 'expr': 'n = 4', 'unit': 'kN'}])
    assert _raekke(b, 'n')['result'] == '4 kN'


def test_udnyttelsen_er_stadig_et_rent_tal(client):
    b = _koer(client, GRUND + [
        {'type': 'formula', 'expr': 'M = q*L**2/8', 'unit': 'kN*m'},
        {'type': 'formula', 'expr': 'eta = M/(20*kN*m)', 'unit': '-'},
    ])
    assert _raekke(b, 'eta')['result'] == '0.78125'


# ── 2. En betinget gren pakker ikke resultatet om ─────────────────────────────

def test_betinget_gren_beholder_sin_egen_enhed(client):
    """24 MPa vist i kPa er 24000 kPa. Det var 24 -- en faktor 1000."""
    b = _koer(client, GRUND + [
        {'type': 'conditional', 'name': 'sd', 'condition': 'L > 3',
         'true_expr': 'sig', 'false_expr': '0', 'unit': 'kPa'},
    ])
    assert _raekke(b, 'sd')['result'].startswith('24000 kPa')


def test_betinget_gren_regner_videre_med_den_rigtige_stoerrelse(client):
    """Ikke kun visningen: vaerdien i regnestykket skal ogsaa vaere rigtig."""
    b = _koer(client, GRUND + [
        {'type': 'conditional', 'name': 'sd', 'condition': 'L > 3',
         'true_expr': 'sig', 'false_expr': '0', 'unit': 'kPa'},
        {'type': 'formula', 'expr': 'forhold = sd/sig', 'unit': '-'},
    ])
    assert _raekke(b, 'forhold')['result'] == '1'


def test_betinget_gren_med_bart_tal_faar_sin_enhed(client):
    b = _koer(client, GRUND + [
        {'type': 'conditional', 'name': 'F', 'condition': 'L > 3',
         'true_expr': '12', 'false_expr': '0', 'unit': 'kN'},
    ])
    assert _raekke(b, 'F')['result'].startswith('12 kN')


# ── 3. En enhed, der ikke kan laeses, er en fejl ──────────────────────────────

def test_ulaeselig_enhed_bliver_sagt_hoejt(client):
    b = _koer(client, [
        {'type': 'var', 'name': 'A', 'value': 500, 'unit': 'furlong'},
    ])
    assert any('furlong' in n for n in _noter(b))
    # Og den maa ikke samtidig staa som en almindelig raekke med enhed paa.
    assert _raekke(b, 'A') is None


def test_en_enhed_der_ikke_er_en_enhed(client):
    b = _koer(client, [
        {'type': 'var', 'name': 'A', 'value': 500, 'unit': 'pi'},
    ])
    assert any('ikke en enhed' in n for n in _noter(b))


def test_hat_skrives_som_potens(client):
    """mm^2 og mm**2 er den samme enhed.

    Rullelisten sender **, men en gemt skabelon kan baere ^, og at afvise den
    ville vaere en indvending mod skrivemaaden og ikke mod enheden.
    """
    b = _koer(client, [
        {'type': 'var',     'name': 'A', 'value': 500, 'unit': 'mm^2'},
        {'type': 'formula', 'expr': 'A2 = A*1', 'unit': 'mm**2'},
    ])
    assert _noter(b) == []
    assert _raekke(b, 'A2')['result'].startswith('500 mm²')


# ── Enhederne skal stadig gaa igennem hele vejen ──────────────────────────────

def test_en_hel_lille_eftervisning(client):
    """Tvaersnit i mm, styrke i MPa, moment i kN·m -- og en eftervisning."""
    b = _koer(client, [
        {'type': 'var', 'name': 'b',    'value': 200, 'unit': 'mm'},
        {'type': 'var', 'name': 'h',    'value': 400, 'unit': 'mm'},
        {'type': 'var', 'name': 'f_md', 'value': 24,  'unit': 'MPa'},
        {'type': 'var', 'name': 'q',    'value': 5,   'unit': 'kN/m'},
        {'type': 'var', 'name': 'L',    'value': 5,   'unit': 'm'},
        {'type': 'formula', 'expr': 'W = b*h**2/6',  'unit': 'mm**3'},
        {'type': 'formula', 'expr': 'M_Rd = W*f_md', 'unit': 'kN*m'},
        {'type': 'formula', 'expr': 'M_Ed = q*L**2/8', 'unit': 'kN*m'},
        {'type': 'check', 'label': 'Bøjning', 'demand': 'M_Ed',
         'capacity': 'M_Rd', 'unit': 'kN*m'},
    ])
    assert _raekke(b, 'W')['result'].startswith('5.3333e+06 mm³')
    assert _raekke(b, 'M_Rd')['result'].startswith('128 kN·m')

    kontrol = [x for x in b if x.get('type') == 'check']
    assert len(kontrol) == 1
    assert kontrol[0]['passes'] is True
    assert kontrol[0]['ratio'] == pytest.approx(15.625 / 128, abs=5e-4)


def test_en_eftervisning_paa_tvaers_af_enheder_afvises(client):
    """Det vaernede calc_core allerede -- her bare at vejen dertil er aaben."""
    b = _koer(client, GRUND + [
        {'type': 'check', 'label': 'Forkert', 'demand': 'q*L**2/8',
         'capacity': '100', 'unit': 'kN'},
    ])
    kontrol = [x for x in b if x.get('type') == 'check'][0]
    assert kontrol['passes'] is False
    assert 'kan ikke sammenlignes' in kontrol['value']
