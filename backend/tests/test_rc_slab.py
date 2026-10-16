"""
test_rc_slab.py — enkeltspændt betondæk, DS/EN 1992-1-1 DK NA

h = 200, c = 25, Ø10/150, C30, B500, L = 5 m, g_k = 3,5, q_k = 2,5 kN/m²

    d      = 200 − 25 − 5                        = 170 mm
    A_s    = π·10²/4·1000/150                    = 524 mm²/m
    x      = 524·416,7/(0,8·1000·20,69)          = 13,2 mm
    M_Rd   = 0,8·1000·20,69·13,2·(170 − 5,3)     = 35,9 kNm/m
    w_Ed   = max(1,2·3,5; 3,5 + 1,5·2,5)         = 7,25 kN/m²
    M_Ed   = 7,25·25/8 = 22,7 kNm/m ; V_Ed = 18,1 kN/m
    k      = 1 + √(200/170) = 2,08 → 2,0
    v_min  = 0,035·2^1,5·√30 = 0,542 MPa > 0,18/1,45·2·(100·0,00308·30)^(1/3) = 0,521
    V_Rd,c = 0,542·170 = 92,2 kN/m
"""
import pytest

from conftest import find_calc_row, find_check, passes

BASE = {"label": "D1", "span_m": 5.0, "h_mm": 200, "c_mm": 25, "o_mm": 10, "s_mm": 150,
        "fck_MPa": 30, "fyk_MPa": 500, "last": "linje", "g_k_kNm2": 3.5, "q_k_kNm2": 2.5}


def regn(client, **kw):
    r = client.post("/calc/rc-slab", json={**BASE, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def tal(blocks, navn):
    row = find_calc_row(blocks, navn)
    assert row is not None, navn
    return float(row["result"].split()[0].replace(",", "."))


def test_haandregning(client):
    b = regn(client)
    assert tal(b, "d") == 170
    assert tal(b, "A_s") == pytest.approx(524, abs=1)
    assert tal(b, "x") == pytest.approx(13.2, abs=0.05)
    assert tal(b, "M_Rd") == pytest.approx(35.9, abs=0.1)
    assert tal(b, "w_Ed") == pytest.approx(7.25)
    assert tal(b, "M_Ed") == pytest.approx(22.7, abs=0.05)
    assert passes(find_check(b, "Bøjning"))


def test_forskydning_v_min_styrer(client):
    b = regn(client)
    assert tal(b, "k") == pytest.approx(2.0)
    assert tal(b, "V_Rd,c") == pytest.approx(92.2, abs=0.2)
    assert passes(find_check(b, "Forskydning"))


def test_forskydning_kan_fejle(client):
    b = regn(client, last="direkte", M_Ed_kNmm=20, V_Ed_kNm=120)
    assert not passes(find_check(b, "Forskydning"))


def test_stangafstand(client):
    b = regn(client, s_mm=450)
    assert not passes(find_check(b, "Stangafstand"))


def test_nedboejning_7_17_bruger_500(client):
    """(7.17): 310/σ_s = 500/(f_yk·A_s,req/A_s,prov) — ikke 310/(…)."""
    b = regn(client)
    As_req = tal(b, "A_s,req")
    As_min = tal(b, "A_s,min")
    assert tal(b, "310/σ_s") == pytest.approx(min(500 / 500 * 524 / max(As_req, As_min), 1.5), abs=0.01)


def test_tyndt_langt_daek_fejler_nedboejning(client):
    b = regn(client, span_m=7, h_mm=150)
    assert not passes(find_check(b, "Nedbøjning"))


def test_kombi(client):
    b = regn(client, last="kombi", w_Ed_kNm2=7.25, kombi_label="LC1")
    assert tal(b, "M_Ed") == pytest.approx(22.7, abs=0.05)
