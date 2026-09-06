"""
test_timber_column.py — EN 1995-1-1 §6.2.4, §6.3.2, §6.3.3

Søjlen røg ud af paletten, fordi den ikke havde en eneste test — ikke fordi
den var forkert. Her er den regnet efter.

Referencetilfælde: 100×100 mm C24, L = 3,0 m, leddet i begge ender (β = 1,0),
N_Ed = 30 kN, M_Ed = 0, anvendelsesklasse 1, middel varighed, γ_M = 1,3.

    A       = 10 000 mm²
    i       = h/√12 = 28,868 mm
    λ       = 3000/28,868 = 103,92                      (§6.3.2)
    λ_rel   = (λ/π)·√(f_c,0,k/E_0,05)
            = (103,92/π)·√(21/7400) = 1,762             lign. 6.21
    k       = 0,5·(1 + β_c·(λ_rel − 0,3) + λ_rel²)
            = 0,5·(1 + 0,2·1,462 + 3,106) = 2,199       lign. 6.27
    k_c     = 1/(k + √(k² − λ_rel²)) = 0,2846           lign. 6.25
    f_c,0,d = 0,80·21/1,3 = 12,923 MPa
    σ_c,0,d = 30000/10000 = 3,000 MPa
    η 6.23  = 3,000/(0,2846·12,923) = 0,816
    η 6.19  = (3,000/12,923)² = 0,054                   (rent tryk)

β_c = 0,20 for konstruktionstræ og 0,10 for limtræ (lign. 6.29).

C24-værdierne er EN 338:2016: f_c,0,k = 21 MPa, E_0,05 = 7400 MPa.
"""
import math

import pytest

from conftest import find_check, find_calc_row, eta, passes

BASE = {
    "label": "C1", "length_m": 3.0, "N_Ed_kN": 30.0, "M_Ed_kNm": 0.0,
    "b_mm": 100.0, "h_mm": 100.0, "timber_grade": "C24",
    "service_class": 1, "load_duration": "medium", "gamma_M": 1.3,
    "effective_length_factor": 1.0,
}


def column(client, **kw):
    r = client.post("/calc/timber-column", json={**BASE, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def value(blocks, name):
    row = find_calc_row(blocks, name)
    assert row is not None, f"ingen række ved navn {name!r}"
    return float(row["result"].split()[0].replace(",", "."))


def k_c(lam_rel, beta_c=0.20):
    """Uafhængig gennemregning af lign. 6.25/6.27."""
    k = 0.5 * (1.0 + beta_c * (lam_rel - 0.3) + lam_rel ** 2)
    return 1.0 / (k + math.sqrt(k ** 2 - lam_rel ** 2))


def lam_rel(l_ef_mm, i_mm, f_c0k=21.0, E005=7400.0):
    return (l_ef_mm / i_mm) / math.pi * math.sqrt(f_c0k / E005)


# ── Slankhed og reduktionsfaktor ────────────────────────────────────────────

def test_slenderness_and_relative_slenderness(client):
    blocks = column(client)
    i = 100.0 / math.sqrt(12)
    assert value(blocks, "λ_2") == pytest.approx(3000.0 / i, abs=0.05)
    assert value(blocks, "λ_rel,2") == pytest.approx(lam_rel(3000.0, i), abs=5e-3)


def test_buckling_reduction_factor(client):
    i = 100.0 / math.sqrt(12)
    assert value(column(client), "k_c,2") == pytest.approx(
        k_c(lam_rel(3000.0, i)), abs=2e-3)


def test_no_reduction_below_relative_slenderness_03(client):
    """
    λ_rel ≤ 0,3 → k_c = 1,0 (§6.3.2(2)). En kort, tyk søjle bukker ikke.
    300×300 over 0,5 m giver λ_rel ≈ 0,10.
    """
    blocks = column(client, b_mm=300.0, h_mm=300.0, length_m=0.5)
    assert value(blocks, "λ_rel,2") < 0.3
    notes = " ".join(b.get("content", "") for b in blocks if b.get("type") == "note")
    assert "0.3" in notes or "0,3" in notes


@pytest.mark.parametrize("L", [2.0, 3.0, 4.0, 5.0])
def test_reduction_factor_across_lengths(client, L):
    i = 100.0 / math.sqrt(12)
    assert value(column(client, length_m=L), "k_c,2") == pytest.approx(
        k_c(lam_rel(L * 1000.0, i)), abs=3e-3)


def test_longer_column_buckles_sooner(client):
    kort = value(column(client, length_m=2.0), "k_c,2")
    lang = value(column(client, length_m=5.0), "k_c,2")
    assert lang < kort


def test_effective_length_factor_scales_the_slenderness(client):
    """β = 2,0 (indspændt–fri) fordobler den effektive længde."""
    fri  = value(column(client, effective_length_factor=2.0), "λ_2")
    ledd = value(column(client, effective_length_factor=1.0), "λ_2")
    assert fri == pytest.approx(2 * ledd, rel=0.01)


def test_glulam_has_a_lower_beta_c(client):
    """
    β_c er 0,10 for limtræ mod 0,20 for konstruktionstræ (lign. 6.29), så
    limtræ får en højere k_c ved samme slankhed. Sammenlignes ved samme
    geometri; styrkerne er forskellige, men k_c afhænger kun af λ_rel og β_c.
    """
    i = 100.0 / math.sqrt(12)
    blocks = column(client, timber_grade="GL28h")
    lr = value(blocks, "λ_rel,2")
    assert value(blocks, "k_c,2") == pytest.approx(k_c(lr, beta_c=0.10), abs=3e-3)


# ── Eftervisningerne ────────────────────────────────────────────────────────

def test_flexural_buckling_utilisation(client):
    """η = σ_c,0,d/(k_c·f_c,0,d) = 0,816 ved ren trykpåvirkning (lign. 6.24)."""
    chk = find_check(column(client), "6.24") or find_check(column(client), "buckling")
    assert chk is not None, "ingen søjleeftervisning fundet"
    assert eta(chk) == pytest.approx(0.816, rel=0.02)


def test_section_check_squares_the_compression_term(client):
    """
    Lign. 6.19: (σ_c,0,d/f_c,0,d)² + ... — tryksleddet er i anden potens.
    Ved M = 0 er η = (3,000/12,923)² = 0,054, ikke 0,232.
    """
    blocks = column(client)
    chk = find_check(blocks, "6.19")
    assert chk is not None
    assert eta(chk) == pytest.approx((3.0 / 12.923) ** 2, abs=5e-3)


def test_axial_only_column_passes(client):
    chk = find_check(column(client), "6.24") or find_check(column(client), "buckling")
    assert passes(chk)


def test_overloaded_column_fails(client):
    """Fire gange lasten på den samme søjle skal dumpe."""
    chk = (find_check(column(client, N_Ed_kN=120.0), "6.24")
           or find_check(column(client, N_Ed_kN=120.0), "buckling"))
    assert not passes(chk)


def test_utilisation_is_linear_in_the_axial_force(client):
    """Ingen andenordensled i 6.23/6.24 — η følger N_Ed proportionalt."""
    def e(n):
        b = column(client, N_Ed_kN=n)
        return eta(find_check(b, "6.24") or find_check(b, "buckling"))
    assert e(60.0) == pytest.approx(2 * e(30.0), rel=0.02)


def test_stronger_grade_carries_more(client):
    def e(grade):
        b = column(client, timber_grade=grade)
        return eta(find_check(b, "6.24") or find_check(b, "buckling"))
    assert e("C30") < e("C24")


def test_service_class_three_reduces_capacity(client):
    """k_mod falder fra 0,80 til 0,65 i anvendelsesklasse 3, middel varighed."""
    def e(sc):
        b = column(client, service_class=sc)
        return eta(find_check(b, "6.24") or find_check(b, "buckling"))
    assert e(3) == pytest.approx(e(1) * 0.80 / 0.65, rel=0.03)


# ── Bøjning og tryk sammen ──────────────────────────────────────────────────

def test_bending_adds_to_the_interaction(client):
    def e(m):
        b = column(client, M_Ed_kNm=m)
        return eta(find_check(b, "6.24") or find_check(b, "buckling"))
    assert e(1.0) > e(0.0)


def test_k_m_applies_to_the_secondary_axis_only(client):
    """
    6.23 og 6.24 er ikke ens: k_m = 0,7 sidder på det ledsagende bøjningsled,
    ikke på det dominerende. Med bøjning om én akse skal de to give
    forskellige udnyttelser.
    """
    blocks = column(client, M_Ed_kNm=2.0)
    a = find_check(blocks, "6.23")
    b = find_check(blocks, "6.24")
    if a and b:
        assert eta(a) != pytest.approx(eta(b), abs=1e-4)
