"""
test_steel_column.py — EN 1993-1-1 §6.3.1 steel column verification

Reference case
──────────────
HEB 200, S355, L=3 m, N_Ed=500 kN, k_y=k_z=1.0

HEB 200 properties (ARCELOR catalog / EN 1993-1-1 Tables):
    A   = 78.08 cm²
    i_y = 8.54 cm  → i_y = 85.4 mm
    i_z = 5.07 cm  → i_z = 50.7 mm
    Buckling curves: y-y → curve b (α=0.34), z-z → curve c (α=0.49)
    [hot-rolled H section, h/b=200/200=1.0 ≤ 1.2, t_f=15mm ≤ 100mm → Table 6.2]

f_y = 355 MPa  (S355, t_f=15mm < 16mm → same yield)
N_pl,Rd = 7808 mm² × 355 MPa / 1000 = 2771.8 kN

λ_1 = π√(E/f_y) = π√(210000/355) = 76.41

y-y axis (Curve b, α=0.34):
    λ_y = (L_cr,y/i_y)/λ_1 = (3000/85.4)/76.41 = 0.4595
    Φ_y = 0.5[1 + 0.34(0.4595-0.2) + 0.4595²]
        = 0.5[1 + 0.0882 + 0.2111] = 0.5×1.299 = 0.650
    χ_y = 1/(0.650+√(0.650²-0.4595²)) = 1/(0.650+√(0.4225-0.2111))
        = 1/(0.650+√0.2114) = 1/(0.650+0.4598) = 1/1.110 = 0.901
    N_b,y,Rd = 0.901×2771.8 = 2497 kN

z-z axis (Curve c, α=0.49):
    λ_z = (3000/50.7)/76.41 = 59.17/76.41 = 0.7745
    Φ_z = 0.5[1 + 0.49(0.7745-0.2) + 0.7745²]
        = 0.5[1 + 0.2815 + 0.5999] = 0.5×1.881 = 0.941
    χ_z = 1/(0.941+√(0.941²-0.7745²)) = 1/(0.941+√(0.885-0.600))
        = 1/(0.941+√0.285) = 1/(0.941+0.534) = 1/1.475 = 0.678
    N_b,z,Rd = 0.678×2771.8 = 1879 kN   ← governs

    η_column = N_Ed/N_b,z,Rd = 500/1879 = 0.266 → PASS

    Source: EN 1993-1-1 §6.3.1.2 / Formulae verified by hand.
            Section data: ARCELOR-Mittal "Sections and Merchant Bars" catalog.
"""
import pytest

from conftest import find_check, passes, assert_eta, eta


BASE = {
    "label": "SC1",
    "section": "HEB200", "grade": "S355",
    "length_m": 3.0, "N_Ed_kN": 500.0,
    "k_y": 1.0, "k_z": 1.0,
    "gamma_M0": 1.0, "gamma_M1": 1.0,
}


def test_steel_column_response_ok(client):
    r = client.post("/calc/steel-column", json=BASE)
    assert r.status_code == 200
    assert len(r.json()) > 0


def test_steel_column_buckling_passes(client):
    """N_Ed=500 kN << N_b,z,Rd≈1879 kN → η ≈ 0.266."""
    blocks = client.post("/calc/steel-column", json=BASE).json()
    chk = find_check(blocks, "z–z")
    assert chk is not None, "No column buckling check found"
    assert passes(chk), f"Column buckling check failed: {chk['value']}"
    assert_eta(chk, 0.266, tol=0.04)  # 4% tolerance: section i_z from catalog vs ARCELOR hand-calc differs slightly


def test_steel_column_overloaded_fails(client):
    """N_Ed=3000 kN > N_b,z,Rd ≈ 1879 kN → FAIL."""
    blocks = client.post("/calc/steel-column", json={**BASE, "N_Ed_kN": 3000.0}).json()
    chk = find_check(blocks, "z–z")
    assert chk is not None
    assert not passes(chk), "N_Ed=3000kN should exceed buckling resistance"


def test_steel_column_longer_column_higher_utilisation(client):
    """Doubling the length should increase utilisation (lower χ)."""
    blocks_3m = client.post("/calc/steel-column", json={**BASE}).json()
    blocks_6m = client.post("/calc/steel-column", json={**BASE, "length_m": 6.0}).json()
    chk3 = find_check(blocks_3m, "z–z")
    chk6 = find_check(blocks_6m, "z–z")
    assert chk3 and chk6
    from conftest import eta
    assert eta(chk6) > eta(chk3), "Longer column should have higher buckling utilisation"


def test_steel_column_s355_stronger_than_s275(client):
    """S355 (f_y=355) gives lower utilisation than S275 (f_y=275) for same geometry."""
    blocks_s355 = client.post("/calc/steel-column", json={**BASE}).json()
    blocks_s275 = client.post("/calc/steel-column", json={**BASE, "grade": "S275"}).json()
    chk355 = find_check(blocks_s355, "z–z")
    chk275 = find_check(blocks_s275, "z–z")
    if chk355 and chk275:
        from conftest import eta
        assert eta(chk355) <= eta(chk275), \
            "S355 should give lower or equal buckling utilisation than S275"


# ── Uafhaengigt gennemregnet eksempel ───────────────────────────────────────
# structuralbasics.com/steel-column-design — HEB120, S355, L = 3,0 m,
# N_Ed = 369,3 kN, gamma_M1 = 1,2 (dansk vaerdi). Kontrolleret linje for linje
# mod EN 1993-1-1 lign. 6.47, 6.49 og 6.50 foer den blev brugt her; siden
# skriver "+" under kvadratroden i chi for z-aksen, men regner med "-" som i
# lign. 6.49, saa tallene er rigtige og formlen er en trykfejl.

HEB120 = {
    "label": "SC-HEB120", "section": "HEB120", "grade": "S355",
    "length_m": 3.0, "N_Ed_kN": 369.3,
    "k_y": 1.0, "k_z": 1.0, "gamma_M0": 1.0, "gamma_M1": 1.2,
}


def _row(blocks, name):
    for b in blocks:
        if b.get("type") == "calc_row" and b.get("name") == name:
            return float(b["result"].split()[0])
    raise AssertionError(f"ingen raekke {name!r}")


def test_reference_slenderness_lambda_1(client):
    """λ₁ = π·√(E/f_y) = π·√(210000/355) = 76,41 (§6.3.1.3)."""
    blocks = client.post("/calc/steel-column", json=HEB120).json()
    assert _row(blocks, "λ₁") == pytest.approx(76.41, abs=0.02)


def test_worked_example_strong_axis(client):
    """
    Den staerke akse er ren katalogdata -- i_y = 50,4 mm -- saa her skal
    tallene ramme eksemplet praecist:
        λ̄_y = 0,78   χ_y = 0,74   N_b,y,Rd = 741,8 kN   η = 0,498
    """
    blocks = client.post("/calc/steel-column", json=HEB120).json()
    assert _row(blocks, "λ̄_y")      == pytest.approx(0.779, abs=0.005)
    assert _row(blocks, "χ_y")       == pytest.approx(0.737, abs=0.005)
    assert _row(blocks, "N_b,y,Rd")  == pytest.approx(741.8, rel=0.005)
    assert eta(find_check(blocks, "y–y")) == pytest.approx(0.498, abs=0.005)


def test_worked_example_weak_axis_is_slightly_conservative(client):
    """
    Eksemplet har i_z = 30,6 mm fra kataloget; her udledes I_z af maalene uden
    udrundinger, hvilket giver 30,53 mm. Baereevnen bliver derfor 0,3 % lavere
    end eksemplets 398,5 kN -- paa den sikre side, og det er hele grunden til
    at udledningen er acceptabel.
    """
    blocks = client.post("/calc/steel-column", json=HEB120).json()
    N_b = _row(blocks, "N_b,z,Rd")
    assert N_b == pytest.approx(398.5, rel=0.01)
    assert N_b <= 398.5, "en udledt I_z maa ikke give en hoejere baereevne"
    assert eta(find_check(blocks, "z–z")) == pytest.approx(0.927, rel=0.01)


def test_the_weak_axis_governs(client):
    """
    92,7 % mod 49,8 %. En soejleeftervisning der kun ser paa den staerke akse
    ville melde god plads paa et tvaersnit der er taet paa at vaere brugt op.
    """
    blocks = client.post("/calc/steel-column", json=HEB120).json()
    assert eta(find_check(blocks, "z–z")) > eta(find_check(blocks, "y–y"))


def test_buckling_curves_differ_between_the_axes(client):
    """
    HEB120 har h/b = 1,0 ≤ 1,2 og t_f = 11 mm ≤ 100 mm, saa tabel 6.2 giver
    kurve b om y-y og kurve c om z-z. Samme kurve paa begge akser ville vaere
    en klassisk fejl, og den ville ikke se forkert ud i outputtet.
    """
    blocks = client.post("/calc/steel-column", json=HEB120).json()
    # Kurvevalget staar i dokumentets broedtekst, ikke i en beregningsraekke.
    # Testen kigger derfor i hele blokken frem for at gaette paa typen.
    text = " ".join(str(v) for b in blocks for v in b.values()
                    if isinstance(v, str))
    assert "0.34" in text and "0.49" in text, \
        "begge imperfektionsfaktorer skal fremgaa (alpha = 0,34 og 0,49)"


def test_gamma_m1_scales_the_resistance(client):
    """DK NA bruger 1,2 hvor Eurocoden anbefaler 1,0."""
    dk = client.post("/calc/steel-column", json=HEB120).json()
    ec = client.post("/calc/steel-column",
                     json={**HEB120, "gamma_M1": 1.0}).json()
    assert _row(ec, "N_b,z,Rd") == pytest.approx(1.2 * _row(dk, "N_b,z,Rd"), rel=0.005)


def test_unknown_section_is_refused(client):
    r = client.post("/calc/steel-column", json={**HEB120, "section": "HEB999"})
    assert r.status_code == 422


def test_the_derived_properties_are_declared(client):
    """
    A og I_z staar ikke i kataloget. Bruger dokumentet udledte tal, skal det
    sige det -- ellers ser de ud som katalogvaerdier.
    """
    blocks = client.post("/calc/steel-column", json=HEB120).json()
    notes = " ".join(b.get("content", "") for b in blocks if b.get("type") == "note")
    assert "udledt" in notes and "I_z" in notes
