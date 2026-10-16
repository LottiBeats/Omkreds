"""
test_section_catalog_wpl.py — W_pl,y i stålkataloget skal være den plastiske

18 profiler (IPE80–140, HEB120–360, HEA1000) stod med W_el,y i kolonnen
Wply_cm3 — HEB200 med 515 cm³ i stedet for 642,5. Bøjningsbæreevnen blev
dermed 20 % for lav. Testen regner W_pl,y og I_y af målene med udrundinger og
kræver, at kataloget ligger inden for 1,5 %.

    W_pl,y = t_w·h_w²/4 + b·t_f·(h − t_f) + 4·(1 − π/4)·r²·(h_w/2 − e_r)
    e_r    = r·(10 − 3π)/(12 − 3π)       (udrundingens tyngdepunkt)
"""
import math

import pytest

from section_catalog import load_steel_profiles

PROFILER = [p for p in load_steel_profiles().values()
            if p["family"] in ("IPE", "HEA", "HEB", "HEM")]


def _geometri(p):
    h, b, tw, tf, r = p["h_mm"], p["b_mm"], p["tw_mm"], p["tf_mm"], p.get("r_mm") or 0
    hw = h - 2 * tf
    Af = (1 - math.pi / 4) * r * r
    ef = r * (10 - 3 * math.pi) / (12 - 3 * math.pi)
    W = (tw * hw ** 2 / 4 + b * tf * (h - tf) + 4 * Af * (hw / 2 - ef)) / 1000
    I = ((b * h ** 3 - (b - tw) * hw ** 3) / 12 + 4 * Af * (hw / 2 - ef) ** 2) / 1e4
    return W, I


@pytest.mark.parametrize("p", PROFILER, ids=[p["designation"] for p in PROFILER])
def test_wpl_og_iy_passer_med_maalene(p):
    W, I = _geometri(p)
    assert p["Wply_cm3"] == pytest.approx(W, rel=0.015), "W_pl,y ligner W_el,y"
    assert p["Iy_cm4"] == pytest.approx(I, rel=0.015)


def test_heb200_kendt_vaerdi():
    assert load_steel_profiles()["HEB200"]["Wply_cm3"] == pytest.approx(642.5, abs=0.1)
