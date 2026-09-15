"""
test_kombinationer_fra_lastmodul.py — lastmodulets kombinationer paasat en model.

Det, der proeves her, er koblingen: modellens laster baerer et lasttilfaelde,
lastmodulet baerer faktorerne, og de to skal moedes uden at nogen af dem danner
noget selv. Hver gang de samme kombinationer er blevet dannet to steder i det
her program, er de to steder blevet uenige.
"""
import pytest

from load_combo import (kombinationssaet, vaerdi,
                        ULS, ALS_BRAND, SLS_KAR, SLS_KVASI)
from frame_load_cases import kombinationer_fra_lastmodul


_LASTER = [{'label': 'Nyttelast', 'category': 'A', 'Q_k': 1.5}]
_G_K = 1.0

_TILFAELDE = [
    {'nr': -1, 'navn': 'Egenlast',  'permanent': True},
    {'nr': 0,  'navn': 'Nyttelast', 'permanent': False},
]


def _model_laster():
    """Egenlasten paa element 1, nyttelasten paa element 1 — som i A2'en."""
    return [
        {'type': 'udl', 'elem_id': 1, 'direction': 'vertical',
         'value_kNm': _G_K, 'lasttilfaelde': -1},
        {'type': 'udl', 'elem_id': 1, 'direction': 'vertical',
         'value_kNm': 1.5, 'lasttilfaelde': 0},
    ]


def _sum_last(komb):
    return sum(l['value_kNm'] for l in komb['loads'])


def test_den_paasatte_last_er_den_samme_som_lastmodulets_tal():
    """
    Summen af de paasatte laster skal vaere E_d.

    Det er selve paastanden: naar modellens laster er de samme som
    lastmodulets, skal en kombination paa modellen give det tal, der staar i
    lastgrundlaget. Ellers er der to lastgrundlag i dokumentet.
    """
    saet = kombinationssaet(_LASTER)
    ud = kombinationer_fra_lastmodul(_model_laster(), saet, _TILFAELDE)

    for k, komb in zip(saet, ud):
        assert _sum_last(komb) == pytest.approx(
            vaerdi(k, _G_K, [1.5]), rel=1e-9), k['navn']


def test_alle_seks_situationer_kommer_med_og_kan_vaelges_fra():
    saet = kombinationssaet(_LASTER)

    alle = kombinationer_fra_lastmodul(_model_laster(), saet, _TILFAELDE)
    assert {k['situation'] for k in alle} == {
        'uls', 'als_brand', 'als_oevrig',
        'sls_karakteristisk', 'sls_hyppig', 'sls_kvasi'}

    kun_uls = kombinationer_fra_lastmodul(_model_laster(), saet, _TILFAELDE,
                                          situationer=(ULS,))
    assert {k['situation'] for k in kun_uls} == {'uls'}
    assert len(kun_uls) == 2                      # 6.10a og 6.10b


def test_varigheden_foelger_kombinationen_og_ikke_et_felt():
    """
    Den er grunden til at det her overhovedet laves om. I dag gaetter
    eftervisningen paa 'short', naar lasten ikke kommer fra en kombination --
    den gunstigste klasse der findes. Nu staar den paa hver kombination.
    """
    saet = kombinationssaet(_LASTER)
    ud = kombinationer_fra_lastmodul(_model_laster(), saet, _TILFAELDE)

    uls = [k for k in ud if k['situation'] == ULS]
    assert uls[0]['governing_duration'] == 'permanent'   # 6.10a, kun egenlast
    assert uls[1]['governing_duration'] == 'medium'      # 6.10b, kategori A

    brand = next(k for k in ud if k['situation'] == ALS_BRAND)
    assert brand['governing_duration'] == 'instant'

    for k in ud:
        if k['situation'].startswith('sls'):
            assert k['governing_duration'] is None


def test_en_last_uden_lasttilfaelde_afvises():
    """
    Den maa ikke bare faa faktor nul. En kombination, der mangler en last, er
    en for lille eftervisning, og alle tallene i den ser normale ud.
    """
    laster = _model_laster()
    laster.append({'type': 'udl', 'elem_id': 7, 'direction': 'vertical',
                   'value_kNm': 3.0})          # ingen lasttilfaelde

    with pytest.raises(ValueError) as ex:
        kombinationer_fra_lastmodul(laster, kombinationssaet(_LASTER),
                                    _TILFAELDE)
    assert '7' in str(ex.value)


def test_et_lasttilfaelde_der_er_slettet_i_lastmodulet_afvises():
    """Samme grund: nul ville vaere en eftervisning uden den last."""
    laster = _model_laster()
    laster[1]['lasttilfaelde'] = 3              # findes ikke

    with pytest.raises(ValueError):
        kombinationer_fra_lastmodul(laster, kombinationssaet(_LASTER),
                                    _TILFAELDE)


def test_kun_egenlast_i_den_kvasi_permanente_naar_psi2_er_nul():
    """
    Sne har psi_2 = 0 i DK NA. Saa er den kvasi-permanente kombination bare
    egenlasten -- og lasten skal vaere VAEK af modellen, ikke staa med nul.
    En last med nul intensitet tegner stadig en pil i figuren.
    """
    laster = [{'label': 'Sne', 'category': 'S', 'Q_k': 1.0}]
    model = [
        {'type': 'udl', 'elem_id': 1, 'value_kNm': 2.0, 'lasttilfaelde': -1},
        {'type': 'udl', 'elem_id': 1, 'value_kNm': 1.0, 'lasttilfaelde': 0},
    ]
    ud = kombinationer_fra_lastmodul(model, kombinationssaet(laster),
                                     [{'nr': -1, 'navn': 'Egenlast'},
                                      {'nr': 0, 'navn': 'Sne'}])
    kvasi = next(k for k in ud if k['situation'] == SLS_KVASI)
    assert len(kvasi['loads']) == 1
    assert kvasi['loads'][0]['lasttilfaelde'] == -1
    assert kvasi['aktive'] == ['Egenlast']


def test_faktortabellen_navngiver_tilfaeldene():
    """Tabellen er det, brugeren ser. Den skal staa i navne, ikke i numre."""
    ud = kombinationer_fra_lastmodul(_model_laster(),
                                     kombinationssaet(_LASTER), _TILFAELDE)
    kar = next(k for k in ud if k['situation'] == SLS_KAR)
    assert kar['factor_table'] == {'Egenlast': 1.0, 'Nyttelast': 1.0}
