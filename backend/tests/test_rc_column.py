"""
test_rc_column.py — armeret betonsøjle, DS/EN 1992-1-1 DK NA

Tværsnit 300×300, a = 45, 2 Ø16 i hver side, C30, B500, γ_c 1,45, γ_s 1,20.

Rent tryk (ε_c3 = 1,75 ‰ i hele tværsnittet, σ_s = E_s·ε_c3 = 350 MPa):
    N_Rd = 20,69·300·300 + 804·350 = 2144 kN

N = 0: ligevægt 0,8·x·300·20,69 + 402·σ_sc = 402·416,7 giver x = 40,3 mm og
    M_Rd = 41,0 kNm

2. orden, N_Ed = 600 kN, L = 6 m, β = 1:
    λ = 6000/86,6 = 69,3 > λ_lim → nominel stivhed med K_s = 1 og
    K_c = k₁·k₂/(1+φ_ef)  (5.8.7.2(2)) — ikke K_c = 0,3/(1+0,5φ_ef) med K_s = 1,
    som gav en for stiv søjle.
"""
import math

import numpy as np
import pytest

from conftest import find_calc_row, find_check, passes, eta

BASE = {
    "label": "C1", "h_mm": 300, "b_mm": 300, "c_mm": 45,
    "da_c_mm": 16, "n_c": 2, "da_t_mm": 16, "n_t": 2,
    "fck_mpa": 30, "fyk_mpa": 500, "Ls_mm": 3500, "beta_eff": 1.0,
    "load_cases": [{"label": "LC1", "NEd_kN": 600, "M0Ed_kNm": 20}],
}


def regn(client, **kw):
    r = client.post("/calc/rc-column", json={**BASE, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def tal(blocks, navn):
    row = find_calc_row(blocks, navn)
    assert row is not None, navn
    return float(row["result"].split()[0].replace(",", "."))


def test_nm_kurve_rent_tryk_og_ren_boejning():
    from concrete_column import _nm_curve, _mrd_at_ned
    fcd, fyd = 30 / 1.45, 500 / 1.2
    As1 = 2 * math.pi * 64
    N, M = _nm_curve(fcd, fyd, 300, 300, 45, As1, As1)
    assert max(N) == pytest.approx(2143.6, abs=0.5)
    assert _mrd_at_ned(N, M, 0.0) == pytest.approx(41.0, abs=0.2)


def test_foerste_orden_kort_soejle(client):
    b = regn(client, Ls_mm=1500)
    row = find_calc_row(b, "M_Ed")
    assert "2. ordens effekter kan ignoreres" in row["formula"]
    # λ = 1500/86,6 = 17 < λ_lim ≈ 22 ; M₀_Ed,i = 20 + 600·1500/400/1000 = 22,25
    assert tal(b, "M₀_Ed,i") == pytest.approx(22.25, abs=0.06)
    assert passes(find_check(b, "LC1"))


def test_anden_orden_nominel_stivhed(client):
    b = regn(client, Ls_mm=6000)
    Kc = tal(b, "K_c")
    # Uafhængigt: k1 = √1,5, k2 = min(n·λ/170, 0,2)
    n = 600e3 / (300 * 300 * 30 / 1.45)
    lam = 6000 / math.sqrt(300 ** 2 / 12)
    k2 = min(n * lam / 170, 0.2)
    phi_ef = tal(b, "φ_ef")
    assert Kc == pytest.approx(math.sqrt(1.5) * k2 / (1 + phi_ef), abs=1e-4)
    M0i = tal(b, "M₀_Ed,i")
    NB = tal(b, "N_B")
    assert tal(b, "M_Ed") == pytest.approx(M0i / (1 - 600 / NB), rel=2e-3)  # N_B vises afrundet


def test_ustabil_soejle_fejler(client):
    b = regn(client, Ls_mm=12000)
    chk = find_check(b, "LC1")
    assert not passes(chk)


def test_trykbrud_uden_for_kurven(client):
    b = regn(client, load_cases=[{"label": "LC1", "NEd_kN": 2500, "M0Ed_kNm": 0}])
    assert not passes(find_check(b, "LC1"))


def test_minimumsarmering_9_5_2(client):
    b = regn(client, da_c_mm=8, da_t_mm=8, n_c=2, n_t=2,
             load_cases=[{"label": "LC1", "NEd_kN": 1200, "M0Ed_kNm": 5}])
    # 0,10·1200e3/416,7 = 288 mm² > 0,002·90000 = 180 ; A_s = 201 mm²
    assert tal(b, "A_s,min") == pytest.approx(288, abs=1)
    assert not passes(find_check(b, "A_s ≥ A_s,min"))


def test_ingen_lasttilfaelde_afvises(client):
    r = client.post("/calc/rc-column", json={**BASE, "load_cases": []})
    assert r.status_code == 422
