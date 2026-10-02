"""Test af gh_dagslys.py."""
import json

import gh_dagslys as gd


def test_dagslys():
    d = gd.beregn([78.0, 41.5, "x"], ["Stue/køkken", "Bad"])
    assert [r["ok"] for r in d["rum"]] == [True, False] and d["ok"] is False
    assert json.loads(gd.til_json(d))["rum"][0]["rum"] == "Stue/køkken"
    assert "IKKE OPFYLDT" in gd.tabeltekst(d)
    assert gd.beregn([], None)["ok"] is None


def test_sda_fra_da_traee():
    class Tree:
        def __init__(s, b): s.b = b; s.BranchCount = len(b)
        def Branch(s, i): return s.b[i]
    sda = gd.sda_fra_da(Tree([[80, 60, 40, 20], [55, 50, 49.9]]))
    assert sda == [50.0, 2 / 3 * 100]
    assert gd.sda_fra_da([[100, 0]]) == [50.0]
