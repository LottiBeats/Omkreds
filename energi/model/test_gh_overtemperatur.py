"""
Test af gh_overtemperatur.py med rigtige Ladybug-datasamlinger og med rene tal.

    python -m pytest energi/model/test_gh_overtemperatur.py
"""
import json

from ladybug.analysisperiod import AnalysisPeriod
from ladybug.datacollection import HourlyContinuousCollection
from ladybug.datatype.temperature import OperativeTemperature
from ladybug.header import Header

import gh_overtemperatur as ot


def _samling(zone, timer_27, timer_28):
    """8760 timer á 22 °C, heraf timer_27 timer á 27,5 °C og timer_28 timer á 29 °C."""
    v = [22.0] * 8760
    for i in range(timer_27):
        v[i] = 27.5
    for i in range(timer_27, timer_27 + timer_28):
        v[i] = 29.0
    h = Header(OperativeTemperature(), "C", AnalysisPeriod(), metadata={"Zone": zone})
    return HourlyContinuousCollection(h, v)


def test_taelling_og_status():
    d = ot.beregn([_samling("STUE", 80, 20), _samling("SOVEVAERELSE", 120, 5)])
    stue, sove = d["rum"]
    assert stue["rum"] == "STUE" and stue["timer"] == {"over_27": 100, "over_28": 20} and stue["ok"]
    assert sove["timer"] == {"over_27": 125, "over_28": 5} and not sove["ok"]
    assert d["ok"] is False
    assert "OVERSKREDET" in ot.tabeltekst(d)


def test_navne_og_tal_input():
    v = [20.0] * 8760
    v[:30] = [28.5] * 30
    d = ot.beregn([v], navne=["Stue/køkken"])
    assert d["rum"][0]["rum"] == "Stue/køkken"
    assert d["rum"][0]["timer"]["over_28"] == 30 and not d["rum"][0]["ok"]
    assert json.loads(ot.til_json(d))["rum"][0]["rum"] == "Stue/køkken"


def test_egne_graenser():
    d = ot.beregn([_samling("A", 50, 0)], graenser="26=200, 27=40")
    assert d["rum"][0]["timer"]["over_27"] == 50 and not d["rum"][0]["ok"]


def test_tomt():
    d = ot.beregn(None)
    assert d["rum"] == [] and d["ok"] is None
    assert "Ingen temperaturdata" in ot.tabeltekst(d)


def test_objekt_uden_float_giver_ikke_fejl():
    class Mærkelig(object):
        def __float__(self):
            raise AttributeError("ingen __float__")
    assert not ot._er_tal(Mærkelig())
    assert not ot._er_tal(_samling("X", 1, 1))
    assert ot._er_tal(27.5) and ot._er_tal("27,5".replace(",", "."))


def test_serier_med_ude():
    d = ot.beregn([_samling("STUE", 10, 2)], ude=_samling("UDE", 0, 0), med_serier=True)
    assert len(d["serier"]["STUE"]) == 8760 and d["serier"]["STUE"][0] == 27.5
    assert len(d["ude"]) == 8760
    assert "serier" not in ot.beregn([_samling("STUE", 10, 2)])
