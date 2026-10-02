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


def test_scenarie_resume_uden_timevaerdier():
    res = {"overtemperatur": {"rum": [], "ok": True, "serier": {"A": [1, 2]}, "ude": [1]},
           "varmetab": {"projekt_sum_W_K": 50.0, "ramme_sum_W_K": 90.0, "overholdt": True, "glasandel": 0.4,
                        "dim_varmetab_pr_rum": []},
           "opbygninger": {"vindue": {"navn": "3-lag", "g": 0.5}}}
    r = ek.scenarie_resume("2 Solafskærmende glas", res)
    assert "serier" not in r["overtemperatur"] and "ude" not in r["overtemperatur"]
    assert r["varmetab"] == {"projekt_sum_W_K": 50.0, "ramme_sum_W_K": 90.0, "overholdt": True, "glasandel": 0.4}
    assert r["vindue"]["g"] == 0.5 and r["scenarie"] == "2 Solafskærmende glas"
    assert ek._filnavn("2 Solafskærmende glas") == "2_Solafskaermende_glas"


def test_tjek_resultater_fanger_tabeltekst():
    res = {"Temp": "Rum  Max", "varmetab": "Opvarmet etageareal: ...", "opbygninger": {"opbygninger": []}}
    adv = " | ".join(ek.tjek_resultater(res))
    assert "varmetab er ikke data" in adv and "overtemperatur mangler" in adv and "Temp" in adv
    assert ek.tjek_resultater({"opbygninger": {"opbygninger": []}, "varmetab": {"projekt_sum_W_K": 1},
                               "overtemperatur": {"rum": []}}) == []


def test_genkendes_uanset_noegler_og_dubletter():
    import gh_dagslys as gd
    over = ot.til_json(ot.beregn([[28.5] * 30 + [20.0] * 8730], navne=["Stue"]))
    dl = gd.til_json(gd.beregn([80.0], ["Stue"]))
    varme = json.dumps({"projekt_sum_W_K": 50.0, "ramme_sum_W_K": 90.0})
    res = ek.saml_resultater([over, varme, dl, dl, dl], ["Temp", "x", "y"], [])
    assert set(res) == {"billeder", "overtemperatur", "varmetab", "dagslys"}
    assert isinstance(res["dagslys"], dict) and ek.tjek_resultater(dict(res, opbygninger={"opbygninger": []})) == []
