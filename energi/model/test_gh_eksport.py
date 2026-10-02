"""
Test af gh_eksport.py (alt undtagen selve billedoptagelsen, som kræver Rhino).

    python -m pytest energi/model/test_gh_eksport.py
"""
import json

import gh_eksport as ek
import gh_overtemperatur as ot


def test_tolk_billeder():
    linjer = ["model_syd = Model syd | Shaded", "solbane = Solbane", "# kommentar", "",
              "Temperatur stue.png = Top"]
    assert ek.tolk_billeder(linjer) == [
        ("model_syd", "Model syd", "Shaded"),
        ("solbane", "Solbane", None),
        ("Temperatur_stue", "Top", None),
    ]
    # Panel med flere linjer som én tekst
    assert len(ek.tolk_billeder("a = A\nb = B | Arctic")) == 2
    assert ek.tolk_billeder(None) == []


def test_filnavn_uden_specialtegn():
    assert ek._filnavn("Stue/køkken vest") == "Stue_koekken_vest"


def test_saml_og_skriv(tmp_path):
    over = ot.til_json(ot.beregn([[28.5] * 30 + [20.0] * 8730], navne=["Stue/køkken"]))
    varme = json.dumps({"projekt_sum_W_K": 86.4, "ramme_sum_W_K": 142.7, "overholdt": True})
    res = ek.saml_resultater([over, varme], ["overtemperatur", "varmetab"], ["solbane.png"])
    sti = tmp_path / "resultater.json"
    ek.skriv_tekst(str(sti), ek.til_json(res))
    tilbage = json.loads(sti.read_text())
    assert tilbage["varmetab"]["overholdt"] is True
    assert tilbage["overtemperatur"]["rum"][0]["rum"] == "Stue/køkken"
    assert tilbage["billeder"] == ["solbane.png"]
    assert all(ord(c) < 128 for c in sti.read_text())


def test_manglende_noegle_faar_standardnavn():
    res = ek.saml_resultater(['{"a": 1}'], [], [])
    assert res["data_1"] == {"a": 1}


def test_tekst_fil_og_flere_paa_samme_noegle(tmp_path):
    f = tmp_path / "summary.json"
    f.write_text('{"sDA": 62.5}')
    res = ek.saml_resultater(['{"a": 1}', str(f), "Stue: 300 lux OK", "Bad: 300 lux OK"],
                             ["opbygninger", "dagslys"], [])
    assert res["opbygninger"] == {"a": 1}
    assert res["dagslys"] == [{"sDA": 62.5}, "Stue: 300 lux OK", "Bad: 300 lux OK"]
    assert json.loads(ek.til_json(res))["dagslys"][1] == "Stue: 300 lux OK"
