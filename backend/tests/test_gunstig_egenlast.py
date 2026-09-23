"""
test_gunstig_egenlast.py — γ_G,inf i rammeberegningen

Løfter vinden i taget, modvirker egenlasten løftet. Så er det den LILLE
egenlast, der er farlig, og 1,0·G kan skjule et løft, som 0,9·G viser.

EN 1990 er skrevet sådan: gunstig og ugunstig er to eftervisninger, ikke et
valg mellem to. Derfor regnes begge, og indhyldningen tager den værste.

Faktoren er DK NA tabel A1.2(B+C), γ_G,inf = 0,90 i 6.10b, uden K_FI. Den er
ikke fundet på her — load_combo.py har regnet sådan hele tiden, og
tests/test_load_combo.py::test_favourable_ignores_k_fi holder den fast. De to
veje ind i huset skal ikke have hver sin udgave af den samme tabel.
"""
import pytest

from frame_load_cases import kombinationer_fra_laster


# Et let tag med vindsug: egenlasten peger ned, suget op. Suget er større end
# egenlasten, så knuden vil løftes — det er hele pointen med tallene.
LASTER_SUG = [
    {'type': 'udl', 'elem_id': 1, 'direction': 'vertical', 'value_kNm': 1.0,
     'virkning': 'permanent'},
    {'type': 'udl', 'elem_id': 1, 'direction': 'vertical', 'value_kNm': -3.0,
     'virkning': 'wind', 'variant': 'sug'},
]


def _navne(combos):
    return [c['name'] for c in combos]


def _gunstige(combos):
    return [c for c in combos if 'gunstig G' in c['name']]


# ── Kombinationerne dannes ────────────────────────────────────────────────────

def test_hver_610b_faar_en_gunstig_tvilling():
    combos = kombinationer_fra_laster(LASTER_SUG)
    ugunstige = [c for c in combos
                 if c['name'].startswith('6.10b (')]
    assert len(_gunstige(combos)) == len(ugunstige) >= 1


def test_den_gunstige_bruger_0_90_paa_egenlasten():
    g = _gunstige(kombinationer_fra_laster(LASTER_SUG))[0]
    assert g['factor_table']['G'] == pytest.approx(0.90)


def test_den_gunstige_er_bar_for_k_fi():
    """1,2·K_FI i den ugunstige række, et bart 0,90 i den gunstige."""
    for kk in ('CC1', 'CC2', 'CC3'):
        g = _gunstige(kombinationer_fra_laster(LASTER_SUG,
                                               consequence_class=kk))[0]
        assert g['factor_table']['G'] == pytest.approx(0.90), kk


def test_de_variable_er_uaendrede_i_tvillingen():
    """Kun egenlasten skifter faktor. Alt andet er den samme kombination."""
    combos = kombinationer_fra_laster(LASTER_SUG)
    ugunstig = next(c for c in combos if c['name'].startswith('6.10b ('))
    gunstig  = _gunstige(combos)[0]
    for handling, f in ugunstig['factor_table'].items():
        if handling == 'G':
            continue
        assert gunstig['factor_table'][handling] == pytest.approx(f)


def test_610a_faar_ingen_tvilling():
    """Den kan ikke blive dimensionsgivende, og en kombination, der ikke kan
    afgøre noget, hører ikke hjemme i en rapport.

    De permanente alene: svaret er lineært i faktoren, og 1,2·K_FI er 1,08 /
    1,20 / 1,32 — altid større end 1,0.
    """
    combos = kombinationer_fra_laster(LASTER_SUG)
    assert not any(n.startswith('6.10a') and 'gunstig' in n
                   for n in _navne(combos))


def test_uden_permanente_laster_er_der_ingen_tvilling():
    """Uden G at sætte en anden faktor på ville tvillingen være en kopi."""
    kun_vind = [l for l in LASTER_SUG if l['virkning'] != 'permanent']
    assert _gunstige(kombinationer_fra_laster(kun_vind)) == []


def test_fravalgt_giver_de_gamle_kombinationer():
    uden = kombinationer_fra_laster(LASTER_SUG, gunstig_egenlast=False)
    assert _gunstige(uden) == []
    med = kombinationer_fra_laster(LASTER_SUG, gunstig_egenlast=True)
    # De ugunstige er de samme — tilvalget lægger til, det ændrer ikke.
    assert _navne(uden) == [n for n in _navne(med) if 'gunstig G' not in n]


# ── Og at det faktisk flytter et tal ─────────────────────────────────────────
#
# Alt ovenfor kunne være opfyldt af en kombination, der aldrig bliver brugt
# til noget. Det her er prøven på, at den ændrer en eftervisning.

MODEL_LET_TAG = {
    'nodes': [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 6, 'y': 0}],
    'elements': [{'id': 1, 'ni': 1, 'nj': 2, 'E_GPa': 11.0,
                  'A_cm2': 200.0, 'Iz_cm4': 66666.0}],
    'supports': [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
                 {'node_id': 2, 'ux': False, 'uy': True, 'rz': False}],
}


def _reaktioner(client, **extra):
    krop = dict(MODEL_LET_TAG, title='Let tag', loads=LASTER_SUG, **extra)
    r = client.post('/calc/general-frame-fem', json=krop)
    assert r.status_code == 200, r.text
    return r.json()


def test_loeftet_bliver_stoerre_med_den_gunstige_egenlast(client):
    """Den samlede opadrettede last er 1,5·3,0 − γ_G·1,0.

    Med 1,0·G er det 3,5 kN/m opad. Med 0,90·G er det 3,6 — altsaa 2,9 % mere
    loeft, og det er praecis den forskel, en forankring skal kunne tage.
    """
    med  = _reaktioner(client, gunstig_egenlast=True)
    uden = _reaktioner(client, gunstig_egenlast=False)

    def vaerste_opad(svar):
        # Reaktionerne er negative, naar understoetningen holder igen paa et
        # loeft. Den mest negative er den, en forankring dimensioneres for.
        return min(float(r['Fy_kN'])
                   for r in svar['_summary']['reactions'].values())

    assert vaerste_opad(med) < vaerste_opad(uden) - 1e-6


def test_tabellen_viser_ogsaa_tvillingerne(client):
    """Forhaandsvisningen og koerslen skal blive ved med at vaere enige."""
    forhaand = client.post('/calc/general-frame-fem/kombinationer',
                           json={'loads': LASTER_SUG})
    assert forhaand.status_code == 200, forhaand.text
    navne_forhaand = [k['name'] for k in forhaand.json()['kombinationer']]

    koert = _reaktioner(client)
    assert navne_forhaand == koert['_summary']['combinations']
    assert any('gunstig G' in n for n in navne_forhaand)


def test_fravalget_staar_i_dokumentet(client):
    svar = _reaktioner(client, gunstig_egenlast=False)
    tekst = ' '.join(str(b.get('content', '')) for b in svar['_result'])
    assert 'gunstig' in tekst and 'slået fra' in tekst


def test_uden_fravalg_staar_der_ingen_advarsel(client):
    svar = _reaktioner(client, gunstig_egenlast=True)
    tekst = ' '.join(str(b.get('content', '')) for b in svar['_result'])
    assert 'γ_G,inf = 0,90) er slået fra' not in tekst
