"""
Kipcharnier med udløsning i begge spær (RFEM-vanen) skal kunne regnes og give
det samme som med én udløsning.
"""
import pytest
from general_frame_fem import saml_charnierer, validate_model, ModelError
from fem_direkte import solve

NODES = [{'id': 1, 'x': 0, 'y': 0}, {'id': 2, 'x': 4, 'y': 2}, {'id': 3, 'x': 8, 'y': 0}]
SUP = [{'node_id': 1, 'ux': True, 'uy': True, 'rz': False},
       {'node_id': 3, 'ux': True, 'uy': True, 'rz': False}]
SEC = {'E_GPa': 11, 'A_cm2': 88, 'Iz_cm4': 2800, 'type': 'beam'}
LOADS = [{'type': 'udl', 'elem_id': i, 'wy_kNm': -2.0, 'wx_kNm': 0.0} for i in (1, 2)]


def _els(r1, r2):
    return [dict(SEC, id=1, ni=1, nj=2, release=r1), dict(SEC, id=2, ni=2, nj=3, release=r2)]


def test_both_released_is_rejected_without_normalisation():
    with pytest.raises(ModelError):
        validate_model(NODES, _els('end', 'start'), SUP, LOADS)


def test_normalised_equals_single_release():
    els, samlet = saml_charnierer(_els('end', 'start'), SUP, LOADS)
    assert samlet == [2]
    assert [e['release'] for e in els] == ['none', 'start']
    a = solve(NODES, els, SUP, LOADS)
    b = solve(NODES, _els('none', 'start'), SUP, LOADS)
    for eid in (1, 2):
        assert a['ele_forces'][eid] == pytest.approx(b['ele_forces'][eid], abs=1e-9)
    # moment nul i kippen i begge spær
    assert abs(a['ele_forces'][1][5]) < 1e-9 and abs(a['ele_forces'][2][2]) < 1e-9


def test_input_not_mutated_and_other_releases_kept():
    src = _els('both', 'start')
    els, _ = saml_charnierer(src, SUP, LOADS)
    assert src[0]['release'] == 'both'
    assert els[0]['release'] == 'start'      # start-udløsningen ved understøtningen bevares


def test_nodal_moment_at_hinge_is_left_to_the_user():
    loads = LOADS + [{'type': 'nodal', 'node_id': 2, 'Fx_kN': 0, 'Fy_kN': 0, 'Mz_kNm': 1.0}]
    els, samlet = saml_charnierer(_els('end', 'start'), SUP, loads)
    assert samlet == []


def test_rz_supported_node_untouched():
    sup = SUP + [{'node_id': 2, 'ux': False, 'uy': False, 'rz': True}]
    _, samlet = saml_charnierer(_els('end', 'start'), sup, LOADS)
    assert samlet == []
