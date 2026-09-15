"""
test_indhyldning_pr_situation.py — én kurv pr. dimensioneringssituation.

Indhyldningen laa foer i én bunke, og det gik godt, saa laenge der kun var
brudgraense i den. Kommer anvendelse og ulykke med, er sammenblandingen forkert
paa den tavse maade: det stoerste moment kommer fra 6.10b, den stoerste
nedboejning fra den karakteristiske, og de to ville staa i den samme raekke som
ét resultat, der ikke svarer til nogen kombination, nogen har regnet.
"""
import pytest

import general_frame_fem as gf


def _bjaelke():
    nodes = [{'id': 1, 'x': 0.0, 'y': 0.0}, {'id': 2, 'x': 4.0, 'y': 0.0}]
    elements = [{'id': 1, 'ni': 1, 'nj': 2, 'type': 'beam', 'release': 'none',
                 'E_GPa': 11.0, 'A_cm2': 504.0, 'Iz_cm4': 54432.0}]
    supports = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
                {'node_id': 2, 'ux': False, 'uy': True, 'rz': False}]
    return nodes, elements, supports


def _last(w):
    return [{'type': 'udl', 'elem_id': 1, 'direction': 'vertical',
             'value_kNm': w}]


# Brudgraense stoerst, anvendelse mindre, ulykke mindst -- som i et rigtigt
# dokument, og forskellige nok til at en sammenblanding ikke kan skjule sig.
_KOMBINATIONER = [
    {'name': '6.10b', 'situation': 'uls', 'governing_duration': 'medium',
     'loads': _last(10.0)},
    {'name': 'Karakteristisk', 'situation': 'sls_karakteristisk',
     'governing_duration': None, 'loads': _last(6.0)},
    {'name': 'Brand', 'situation': 'als_brand',
     'governing_duration': 'instant', 'loads': _last(3.0)},
]


def _koer(kombinationer):
    nodes, elements, supports = _bjaelke()
    return gf.solve_combinations(nodes, elements, supports, kombinationer)


def test_hver_situation_faar_sin_egen_indhyldning():
    _, _, _, ind = _koer(_KOMBINATIONER)

    assert set(ind) == {'uls', 'sls_karakteristisk', 'als_brand'}

    # wL²/8 for hver sin last: 20,0 / 12,0 / 6,0 kNm
    assert ind['uls']['envelope'][1]['M_max_kNm'] == pytest.approx(20.0, rel=1e-3)
    assert ind['sls_karakteristisk']['envelope'][1]['M_max_kNm'] \
        == pytest.approx(12.0, rel=1e-3)
    assert ind['als_brand']['envelope'][1]['M_max_kNm'] \
        == pytest.approx(6.0, rel=1e-3)


def test_de_to_foerste_returvaerdier_er_brudgraensen():
    """
    Alt, der eftervises for styrke, laeser dem. De maa ikke begynde at baere en
    anvendelseskombination, fordi nogen tilfoejede en situation til listen.
    """
    env, timber, _, _ = _koer(_KOMBINATIONER)

    assert env[1]['M_max_kNm'] == pytest.approx(20.0, rel=1e-3)
    assert env[1]['M_combo'] == '6.10b'
    assert timber[1][1]['combo'] == '6.10b'


def test_braendens_varighed_forurener_ikke_brudgraensens_kmod():
    """
    Ulykke har oejeblikkelig varighed, og k_mod = 1,10 er den hoejeste der
    findes. Laa brandkombinationen i samme kurv som brudgraensen, ville den
    vinde max(M/k_mod) for et hvilket som helst moment over 20/1,10·0,80, og
    traeeftervisningen ville faa baade et forkert moment og en forkert k_mod.
    """
    _, timber, _, ind = _koer(_KOMBINATIONER)

    assert timber[1][1]['duration'] == 'medium'      # fra 6.10b, ikke branden
    assert ind['als_brand']['timber_envelope'][1][1]['duration'] == 'instant'


def test_uden_situation_er_adfaerden_som_foer():
    """
    Gamle dokumenter sender kombinationer uden situation. De skal stadig give
    én indhyldning over dem alle -- ikke ingen.
    """
    uden = [{k: v for k, v in c.items() if k != 'situation'}
            for c in _KOMBINATIONER]
    env, _, _, ind = _koer(uden)

    assert set(ind) == {None}
    assert env[1]['M_max_kNm'] == pytest.approx(20.0, rel=1e-3)


def test_situationen_foelger_med_ud_paa_hvert_resultat():
    """Uden den kan en figur eller en tabel ikke sige hvad den viser."""
    _, _, alle, _ = _koer(_KOMBINATIONER)
    assert [r['situation'] for r in alle] == [
        'uls', 'sls_karakteristisk', 'als_brand']
