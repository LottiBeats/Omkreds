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
from conftest import find_check, passes, assert_eta


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
    chk = find_check(blocks, "buckling") or find_check(blocks, "column")
    assert chk is not None, "No column buckling check found"
    assert passes(chk), f"Column buckling check failed: {chk['value']}"
    assert_eta(chk, 0.266, tol=0.04)  # 4% tolerance: section i_z from catalog vs ARCELOR hand-calc differs slightly


def test_steel_column_overloaded_fails(client):
    """N_Ed=3000 kN > N_b,z,Rd ≈ 1879 kN → FAIL."""
    blocks = client.post("/calc/steel-column", json={**BASE, "N_Ed_kN": 3000.0}).json()
    chk = find_check(blocks, "buckling") or find_check(blocks, "column")
    assert chk is not None
    assert not passes(chk), "N_Ed=3000kN should exceed buckling resistance"


def test_steel_column_longer_column_higher_utilisation(client):
    """Doubling the length should increase utilisation (lower χ)."""
    blocks_3m = client.post("/calc/steel-column", json={**BASE}).json()
    blocks_6m = client.post("/calc/steel-column", json={**BASE, "length_m": 6.0}).json()
    chk3 = find_check(blocks_3m, "buckling") or find_check(blocks_3m, "column")
    chk6 = find_check(blocks_6m, "buckling") or find_check(blocks_6m, "column")
    assert chk3 and chk6
    from conftest import eta
    assert eta(chk6) > eta(chk3), "Longer column should have higher buckling utilisation"


def test_steel_column_s355_stronger_than_s275(client):
    """S355 (f_y=355) gives lower utilisation than S275 (f_y=275) for same geometry."""
    blocks_s355 = client.post("/calc/steel-column", json={**BASE}).json()
    blocks_s275 = client.post("/calc/steel-column", json={**BASE, "grade": "S275"}).json()
    chk355 = find_check(blocks_s355, "buckling") or find_check(blocks_s355, "column")
    chk275 = find_check(blocks_s275, "buckling") or find_check(blocks_s275, "column")
    if chk355 and chk275:
        from conftest import eta
        assert eta(chk355) <= eta(chk275), \
            "S355 should give lower or equal buckling utilisation than S275"
