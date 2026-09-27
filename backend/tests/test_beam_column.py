"""
test_beam_column.py — bjælke-søjle, EN 1993-1-1 §6.3.3 og anneks B

Blokken regnes nu af stålsøjlens eftervisning. Referencetilfældet regnes
uafhængigt her:

HEB200, S355, N_Ed = 200 kN, M_y,Ed = 50 kNm, L = 4 m, C_m = 1,0,
ikke fastholdt mod kipning (tabel B.2), γ_M0 = 1,10, γ_M1 = 1,20 (DK NA).

    A      = 61,3/7850 = 78,09 cm²          (af vægten)
    I_z    = 2·15·200³/12 + 170·9³/12 = 2001 cm⁴  (uden udrundinger)
    W_pl,y = 642,5 cm³                       (katalog — stod før fejlagtigt som 515)
    λ̄_y    = 4000/85,4/76,41 = 0,613 → kurve b: χ_y = 0,831
    λ̄_z    = 4000/50,6/76,41 = 1,034 → kurve c: χ_z = 0,520
    n_y    = 200/(0,831·2772/1,2) = 0,104
    n_z    = 200/(0,520·2772/1,2) = 0,166
    k_yy   = 1 + (0,613 − 0,2)·0,104 = 1,043
    k_zz   = min(1 + (2·1,0 − 0,6)·0,166; 1 + 1,4·0,166) = 1,233
    k_zy   = max(1 − 0,1·1,034/0,75·0,166; 1 − 0,1/0,75·0,166) = 0,978
    M_y,Rk/γ_M1 = 642,5·355/1,2 = 190,1 kNm
    6.61 = n_y + k_yy·50/(χ_LT·190,1)
    6.62 = n_z + k_zy·50/(χ_LT·190,1)
"""
import math

import pytest

from conftest import find_calc_row, find_check, passes, eta

PAYLOAD = {
    "label": "BC1", "section": "HEB200", "grade": "S355",
    "N_Ed_kN": 200.0, "My_Ed_kNm": 50.0, "Mz_Ed_kNm": 0.0,
    "L_y_m": 4.0, "L_z_m": 4.0, "L_LTB_m": 4.0,
    "k_y": 1.0, "k_z": 1.0, "C_my": 1.0, "C_mz": 1.0, "C_mLT": 1.0,
    "ltb_restrained": False,
}


def _chi(lam, alpha):
    phi = 0.5 * (1 + alpha * (lam - 0.2) + lam ** 2)
    return min(1.0, 1 / (phi + math.sqrt(phi ** 2 - lam ** 2)))


def regn(client, **kw):
    r = client.post("/calc/beam-column", json={**PAYLOAD, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def tal(blocks, navn):
    row = find_calc_row(blocks, navn)
    assert row is not None, navn
    return float(row["result"].split()[0].replace(",", "."))


def haand(chi_LT):
    A = 61.3 / 7850 * 1e4 * 100            # mm²
    Iy = 5696e4
    Iz = 2 * 15 * 200 ** 3 / 12 + 170 * 9 ** 3 / 12
    lam1 = math.pi * math.sqrt(210000 / 355)
    lam_y = 4000 / math.sqrt(Iy / A) / lam1
    lam_z = 4000 / math.sqrt(Iz / A) / lam1
    chi_y, chi_z = _chi(lam_y, 0.34), _chi(lam_z, 0.49)
    NRk = A * 355 / 1000
    n_y = 200 / (chi_y * NRk / 1.2)
    n_z = 200 / (chi_z * NRk / 1.2)
    k_yy = min(1 + (lam_y - 0.2) * n_y, 1 + 0.8 * n_y)
    k_zy = max(1 - 0.1 * lam_z / 0.75 * n_z, 1 - 0.1 / 0.75 * n_z)
    M = 642.5e3 * 355 / 1.2 / 1e6
    return {
        "chi_y": chi_y, "chi_z": chi_z,
        "6.61": n_y + k_yy * 50 / (chi_LT * M),
        "6.62": n_z + k_zy * 50 / (chi_LT * M),
    }


def test_svar(client):
    assert len(regn(client)) > 0


def test_knaekning_haandregnet(client):
    b = regn(client)
    h = haand(tal(b, "χ_LT"))
    assert tal(b, "χ_y") == pytest.approx(h["chi_y"], abs=2e-3)
    assert tal(b, "χ_z") == pytest.approx(h["chi_z"], abs=2e-3)


def test_katalogets_w_pl_er_plastisk(client):
    assert tal(regn(client), "W_pl,y") == pytest.approx(642.5, abs=0.1)


def test_samvirke_haandregnet(client):
    b = regn(client)
    h = haand(tal(b, "χ_LT"))
    assert eta(find_check(b, "6.61")) == pytest.approx(h["6.61"], abs=3e-3)
    assert eta(find_check(b, "6.62")) == pytest.approx(h["6.62"], abs=3e-3)
    assert passes(find_check(b, "6.61")) and passes(find_check(b, "6.62"))


def test_dk_na_gamma_som_standard(client):
    b = regn(client)
    assert tal(b, "γ_M0") == pytest.approx(1.10)
    assert tal(b, "γ_M1") == pytest.approx(1.20)


def test_tabel_b1_k_zy_er_0_6_k_yy(client):
    """Fastholdt mod kipning, klasse 1: k_zy = 0,6·k_yy (ikke 0,8)."""
    b = regn(client, ltb_restrained=True)
    tbl = next(x for x in b if x["type"] == "table" and x["rows"][0][0] == "k_yy")
    k = {r[0]: float(r[2]) for r in tbl["rows"]}
    assert k["k_zy"] == pytest.approx(0.6 * k["k_yy"], abs=1e-3)


def test_kort_soejle_k_zy_uden_nedre_graense(client):
    """λ̄_z < 0,4: k_zy = 0,6 + λ̄_z, ikke løftet til den anden formels nedre grænse."""
    b = regn(client, L_y_m=1.0, L_z_m=1.0, L_LTB_m=1.0)
    lam_z = tal(b, "λ̄_z")
    assert lam_z < 0.4
    tbl = next(x for x in b if x["type"] == "table" and x["rows"][0][0] == "k_yy")
    k_zy = float(tbl["rows"][2][2])
    assert k_zy == pytest.approx(0.6 + lam_z, abs=2e-3)


def test_separat_laengde_om_z(client):
    b = regn(client, L_z_m=2.0)
    assert tal(b, "L_cr,z") == pytest.approx(2.0)
    assert tal(b, "L_cr,y") == pytest.approx(4.0)


def test_overbelastet_fejler(client):
    b = regn(client, My_Ed_kNm=250.0, N_Ed_kN=1500.0)
    assert not passes(find_check(b, "6.61")) or not passes(find_check(b, "6.62"))


def test_fastholdt_giver_lavere_udnyttelse(client):
    fri = eta(find_check(regn(client), "6.61"))
    fast = eta(find_check(regn(client, ltb_restrained=True), "6.61"))
    assert fast <= fri
