"""
test_rc_beam.py — armeret betonbjælke, DS/EN 1992-1-1 DK NA

Håndregning, standardbjælken
────────────────────────────
300×500, C30, B500, dæklag 30 til bøjle Ø8, 3 Ø16, L = 5 m, g_k = 10, q_k = 6 kN/m

    d     = 500 − 30 − 8 − 8                    = 454 mm
    A_s   = 3·π·16²/4                           = 603 mm²
    f_cd  = 1,0·30/1,45                         = 20,69 MPa   (α_cc = 1,0, DK NA)
    f_yd  = 500/1,20                            = 416,7 MPa
    x     = 603·416,7/(0,8·300·20,69)           = 50,6 mm
    M_Rd  = 0,8·300·20,69·50,6·(454 − 0,4·50,6) = 109,0 kNm

    6.10a = 1,2·10 = 12,0 ;  6.10b = 10 + 1,5·6 = 19,0 kN/m
    M_Ed  = 19·5²/8 = 59,4 kNm ;  V_Ed = 19·5/2 = 47,5 kN

    k     = 1 + √(200/454)                      = 1,664
    ρ_l   = 603/(300·454)                       = 0,00443
    V_Rd,c = 0,18/1,45·1,664·(100·0,00443·30)^(1/3)·300·454 = 66,6 kN

    z = 408,6 mm, ν₁ = 0,528, cot θ = 2,5
    V_Rd,max = 300·408,6·0,528·20,69/2,9 = 461,8 kN
    V_Rd,s   = 100,5/200·408,6·416,7·2,5 = 213,9 kN
"""
import pytest

from conftest import find_calc_row, find_check, passes, eta

BASE = {
    "label": "B1", "span_m": 5.0, "b_mm": 300, "h_mm": 500,
    "c_mm": 30, "o_bojle_mm": 8, "n_traek": 3, "o_traek_mm": 16,
    "f_ck_MPa": 30, "f_yk_MPa": 500,
    "last": "linje", "g_k_kNm": 10, "q_k_kNm": 6,
    "bojle_s_mm": 200, "bojle_snit": 2,
}


def regn(client, **kw):
    r = client.post("/calc/rc-beam", json={**BASE, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def tal(blocks, navn):
    row = find_calc_row(blocks, navn)
    assert row is not None, navn
    return float(row["result"].split()[0].replace(",", "."))


def test_effektiv_hoejde_og_armering(client):
    b = regn(client)
    assert tal(b, "d") == 454
    assert tal(b, "A_s") == pytest.approx(603, abs=1)


def test_dk_na_materialer(client):
    """α_cc = 1,0 og γ_c = 1,45 — ikke 0,85/1,5."""
    b = regn(client)
    assert tal(b, "f_cd") == pytest.approx(20.69, abs=0.01)
    assert tal(b, "f_yd") == pytest.approx(416.7, abs=0.1)


def test_momentbaereevne(client):
    b = regn(client)
    assert tal(b, "x") == pytest.approx(50.6, abs=0.1)
    assert tal(b, "M_Rd") == pytest.approx(109.0, abs=0.1)


def test_6_10ab(client):
    b = regn(client)
    assert tal(b, "w_Ed") == pytest.approx(19.0)
    assert tal(b, "M_Ed") == pytest.approx(59.4, abs=0.05)
    chk = find_check(b, "Bøjning")
    assert passes(chk)
    assert eta(chk) == pytest.approx(59.375 / 109.014, abs=2e-3)


def test_forskydning(client):
    b = regn(client)
    assert tal(b, "V_Rd,c") == pytest.approx(66.6, abs=0.1)
    assert tal(b, "cot θ") == pytest.approx(2.5)
    assert tal(b, "V_Rd,max") == pytest.approx(461.8, abs=0.2)
    assert tal(b, "V_Rd,s") == pytest.approx(213.9, abs=0.2)


def test_bøjler_kun_eftervist_når_de_skal_bære(client):
    """V_Ed < V_Rd,c: kun minimumsbøjler, ingen V_Rd,s-kontrol."""
    b = regn(client)
    assert find_check(b, "V_Ed ≤ V_Rd,s") is None
    b = regn(client, last="direkte", M_Ed_kNm=50, V_Ed_kN=150)
    assert passes(find_check(b, "V_Ed ≤ V_Rd,s"))


def test_cot_theta_reduceres_ved_stor_forskydning(client):
    b = regn(client, last="direkte", M_Ed_kNm=50, V_Ed_kN=480)
    cot = tal(b, "cot θ")
    assert 1.0 <= cot < 2.5
    assert tal(b, "V_Rd,max") == pytest.approx(480, abs=0.5)


def test_overbelastet_bjaelke_fejler(client):
    b = regn(client, span_m=10, g_k_kNm=50, q_k_kNm=40)
    assert not passes(find_check(b, "Bøjning"))


def test_overarmeret_tvaersnit_fanges(client):
    """8 Ø32 i 300×500: armeringen flyder ikke."""
    b = regn(client, n_traek=8, o_traek_mm=32)
    assert not passes(find_check(b, "flyder"))


def test_kombi_last(client):
    b = regn(client, last="kombi", w_Ed_kNm=19.0, kombi_label="LC1")
    assert tal(b, "M_Ed") == pytest.approx(59.4, abs=0.05)


def test_k_fi_cc3(client):
    b = regn(client, consequence_class="CC3")
    assert tal(b, "w_Ed") == pytest.approx(19.0 * 1.1)


def test_minimumsarmering(client):
    b = regn(client, n_traek=2, o_traek_mm=8)
    assert not passes(find_check(b, "A_s ≥ A_s,min"))


def test_nedboejning_lang_slank_bjaelke_fejler(client):
    b = regn(client, span_m=12, h_mm=300, g_k_kNm=1, q_k_kNm=1)
    assert not passes(find_check(b, "Nedbøjning"))


def test_c55_afvises(client):
    r = client.post("/calc/rc-beam", json={**BASE, "f_ck_MPa": 55})
    assert r.status_code == 422
