"""Test af gh_dagslys.py."""
import json

import gh_dagslys as gd


def test_dagslys():
    d = gd.beregn([78.0, 41.5, "x"], ["Stue/køkken", "Bad"])
    assert [r["ok"] for r in d["rum"]] == [True, False] and d["ok"] is False
    assert json.loads(gd.til_json(d))["rum"][0]["rum"] == "Stue/køkken"
    assert "IKKE OPFYLDT" in gd.tabeltekst(d)
    assert gd.beregn([], None)["ok"] is None
