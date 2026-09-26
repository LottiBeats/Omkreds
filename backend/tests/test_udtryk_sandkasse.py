"""
Regneudtryk i egen beregning må kun være regning.

__builtins__ = {} var den eneste spærring, og den kunne omgås ved at gå fra
en tom tuple gennem __class__ til alle klasser i processen.
"""
import pytest
import main


@pytest.mark.parametrize('udtryk', [
    '().__class__.__base__.__subclasses__()',
    '(1).__class__',
    '__import__("os")',
    '[x for x in (1, 2)]',
    'lambda: 1',
    '"tekst"',
    '9**9**9',
    '2**1000000',
])
def test_rejected(udtryk):
    with pytest.raises(main.UdtryksFejl):
        main._safe_eval(udtryk, dict(main._UNIT_NS))


@pytest.mark.parametrize('udtryk, forventet', [
    ('2 + 3 * 4', 14),
    ('sqrt(16) + max(1, 2)', 6),
    ('1 if 2 > 1 else 0', 1),
    ('-2**2', -4),
])
def test_arithmetic_still_works(udtryk, forventet):
    assert main._safe_eval(udtryk, dict(main._UNIT_NS)) == pytest.approx(forventet)


def test_units_still_work():
    v = main._safe_eval('(5 * kN) * (2 * m)', dict(main._UNIT_NS))
    assert main._fmt_qty(v, 'kN*m').startswith('10 ')


def test_custom_calc_endpoint_reports_instead_of_running():
    from fastapi.testclient import TestClient
    c = TestClient(main.app)
    r = c.post('/calc/custom-calc', json={'title': 't', 'items': [
        {'type': 'formula', 'expr': 'x = ().__class__.__base__.__subclasses__()'}]})
    assert r.status_code == 200
    assert 'ikke tilladt' in r.text or 'kan kaldes' in r.text
    assert 'subclasses__()' not in r.text.split('kan kaldes')[-1]
