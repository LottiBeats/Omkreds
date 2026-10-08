"""
test_egenlast.py — egenlast ud fra lagopbygning

Brugerens eget eksempel regnet i hånden:

    gips 13 mm          7,0 · 0,013               = 0,0910 kN/m²
    45×195 c/c 600 C24  4,2 · 0,045 · 0,195 / 0,6  = 0,0614 kN/m²
    glasuld 195 mm      0,20 · 0,195              = 0,0390 kN/m²
    tegltagsten                                    = 0,5000 kN/m²
                                                     ──────────────
                                                     0,6914 kN/m² tagflade

    α = 30°:  0,6914 / cos 30° = 0,7984 kN/m² vandret
    a = 0,9:  0,7984 · 0,9     = 0,7185 kN/m pr. spær
"""
import math

import pytest

from conftest import find_calc_row

LAG = [
    {"type": "lag",   "beskrivelse": "Gips", "materiale": "gips", "t_mm": 13},
    {"type": "ribbe", "beskrivelse": "Spær", "materiale": "C24",
     "b_mm": 45, "h_mm": 195, "cc_mm": 600},
    {"type": "lag",   "beskrivelse": "Isolering", "materiale": "glasuld", "t_mm": 195},
    {"type": "fast",  "beskrivelse": "Tagsten", "produkt": "tegltagsten", "g_kNm2": 0.50},
]

G_HAAND = 7.0 * 0.013 + 4.2 * 0.045 * 0.195 / 0.6 + 0.20 * 0.195 + 0.50


def regn(client, **kw):
    payload = {"label": "G1", "bygningsdel": "tag", "alpha_deg": 30.0,
               "lag": LAG, "bredde_m": 0.9}
    payload.update(kw)
    r = client.post("/calc/egenlast", json=payload)
    assert r.status_code == 200, r.text
    lst = r.json()
    assert lst[0]["type"] == "_exports"
    return lst[1:], lst[0]["exports"]


def test_brugerens_eksempel_summeres(client):
    _, ex = regn(client)
    assert ex["g_flade_kNm2"] == pytest.approx(G_HAAND, abs=1e-4)
    assert G_HAAND == pytest.approx(0.6914, abs=1e-4)


def test_tag_omregnes_til_vandret_projektion(client):
    """Divider med cos α — ganger man, bliver taget lettere, ikke tungere."""
    _, ex = regn(client)
    assert ex["g_vandret_kNm2"] == pytest.approx(G_HAAND / math.cos(math.radians(30)), abs=1e-4)
    assert ex["g_vandret_kNm2"] > ex["g_flade_kNm2"]


def test_linjelast_pr_spaer(client):
    _, ex = regn(client)
    assert ex["g_linje_kNm"] == pytest.approx(
        G_HAAND / math.cos(math.radians(30)) * 0.9, abs=1e-4)


def test_daek_ignorerer_haeldning(client):
    """Et dæk er vandret; en hældning, der hænger ved fra et tag, må ikke bruges."""
    _, ex = regn(client, bygningsdel="daek", alpha_deg=30.0, bredde_m=4.0)
    assert ex["g_vandret_kNm2"] == pytest.approx(ex["g_flade_kNm2"])
    assert ex["g_linje_kNm"] == pytest.approx(ex["g_flade_kNm2"] * 4.0, abs=1e-4)


def test_vaeg_giver_linjelast_af_hoejden(client):
    lag = [{"type": "lag", "materiale": "teglmur", "t_mm": 108}]
    _, ex = regn(client, bygningsdel="vaeg", lag=lag, bredde_m=2.7)
    assert ex["g_flade_kNm2"] == pytest.approx(18.0 * 0.108, abs=1e-4)
    assert ex["g_linje_kNm"] == pytest.approx(18.0 * 0.108 * 2.7, abs=1e-4)


def test_ingen_bredde_ingen_linjelast(client):
    _, ex = regn(client, bredde_m=0)
    assert ex["g_linje_kNm"] is None


def test_densitet_kan_overskrives(client):
    lag = [{"type": "lag", "materiale": "gips", "t_mm": 13, "gamma_kNm3": 9.0}]
    blocks, ex = regn(client, lag=lag, bygningsdel="daek")
    assert ex["g_flade_kNm2"] == pytest.approx(9.0 * 0.013, abs=1e-5)
    tbl = next(b for b in blocks if b["type"] == "table")
    assert tbl["rows"][0][2] == "angivet"


def test_bilag_a_materiale_bærer_sin_tabel(client):
    lag = [{"type": "lag", "materiale": "beton", "t_mm": 200}]
    blocks, ex = regn(client, lag=lag, bygningsdel="daek")
    assert ex["g_flade_kNm2"] == pytest.approx(4.8)
    tbl = next(b for b in blocks if b["type"] == "table")
    assert "A.1" in tbl["rows"][0][2]


def test_vejledende_vaerdier_faar_en_note(client):
    blocks, _ = regn(client)
    noter = " ".join(b["content"] for b in blocks if b["type"] == "note")
    assert "datablad" in noter


def test_ribbe_tættere_end_bredden_afvises(client):
    lag = [{"type": "ribbe", "b_mm": 45, "h_mm": 195, "cc_mm": 30}]
    r = client.post("/calc/egenlast", json={"bygningsdel": "tag", "lag": lag})
    assert r.status_code == 422


def test_ukendt_materiale_afvises(client):
    lag = [{"type": "lag", "materiale": "findesikke", "t_mm": 10}]
    r = client.post("/calc/egenlast", json={"bygningsdel": "daek", "lag": lag})
    assert r.status_code == 422


def test_rapporten_viser_g_k(client):
    blocks, _ = regn(client)
    row = find_calc_row(blocks, "g_k,vandret")
    assert row is not None and "0,798" in row["result"]


def test_byggevarebiblioteket(client):
    r = client.get("/materials/byggevarer")
    assert r.status_code == 200
    keys = {b["key"] for b in r.json()["byggevarer"]}
    assert {"tegltagsten", "gips", "glasuld"} <= keys
