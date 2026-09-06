"""
test_timber_beam.py — EN 1995-1-1 timber beam verification

Reference cases
───────────────
Case A: 90×220 mm, C24, L=4 m, g_k=3 kN/m, q_k=2 kN/m
        Service class 1, medium-term load, LTB restrained

    k_mod = 0.80 (SC1, medium-term per EN 1995-1-1 Table 3.1)
    γ_M   = 1.3  (solid timber, Table 2.3)

    w_Ed  = 1.35×3 + 1.5×2           = 7.05 kN/m
    M_Ed  = 7.05×4²/8                = 14.10 kNm
    V_Ed  = 7.05×4/2                 = 14.10 kN

    C24 properties (EN 338): f_m,k=24 MPa, f_v,k=4.0 MPa, E_0,05=7400 MPa
    f_m,d = k_mod×f_m,k/γ_M = 0.80×24/1.3 = 14.77 MPa
    f_v,d = k_mod×f_v,k/γ_M = 0.80×4.0/1.3 = 2.46 MPa

    W_y   = b×h²/6 = 90×220²/6       = 726,000 mm³
    σ_m,d = M_Ed/W_y = 14.10e6/726000 = 19.42 MPa
    η_bend= σ_m,d/f_m,d = 19.42/14.77 = 1.315   → FAIL (section undersized)

    A     = 90×220                   = 19,800 mm²
    τ_d   = 1.5×V_Ed/A = 1.5×14100/19800 = 1.068 MPa
    η_shear = τ_d/f_v,d = 1.068/2.46 = 0.434 → PASS

    Source: EN 1995-1-1 §6.1.6, §6.1.7. Values confirmed by hand calculation
            and match the PDF output from 123_A2(8).pdf page 3.

Case B: 150×300 mm, C24, L=4 m — adequately sized, bending should PASS.
    W_y   = 150×300²/6               = 2,250,000 mm³
    σ_m,d = 14.10e6/2250000          = 6.27 MPa
    η_bend= 6.27/14.77               = 0.424 → PASS
"""
from conftest import find_check, passes, assert_eta


BASE_A = {
    "label": "TB-A",
    "span_m": 4.0, "b_mm": 90.0, "h_mm": 220.0,
    "g_k_kNm": 3.0, "q_k_kNm": 2.0,
    "timber_grade": "C24",
    "service_class": 1, "load_duration": "medium",
    "compression_edge_restrained": True,
    "torsional_restraint_at_supports": True,
}


def test_timber_beam_response_ok(client):
    r = client.post("/calc/timber-beam", json=BASE_A)
    assert r.status_code == 200
    assert len(r.json()) > 0


def test_timber_beam_A_bending_fails(client):
    """
    90×220 C24 at 4m is undersized: σ_m,d=19.42 MPa > f_m,d=14.77 MPa.
    η = 1.315 (confirmed by PDF output and hand calc).
    """
    blocks = client.post("/calc/timber-beam", json=BASE_A).json()
    chk = find_check(blocks, "bøjning")
    assert chk is not None, "No bending check found"
    assert not passes(chk), "90×220 C24 at 4m should FAIL bending"
    assert_eta(chk, 1.315)


def test_timber_beam_A_shear_passes(client):
    """Shear is well within limits: η = 0.434."""
    blocks = client.post("/calc/timber-beam", json=BASE_A).json()
    chk = find_check(blocks, "forskydning")
    assert chk is not None, "No shear check found"
    assert passes(chk), f"Shear check failed: {chk['value']}"
    assert_eta(chk, 0.434)


def test_timber_beam_B_bending_passes(client):
    """150×300 section: η_bend = 0.424 → PASS."""
    blocks = client.post("/calc/timber-beam", json={
        **BASE_A, "b_mm": 150.0, "h_mm": 300.0,
    }).json()
    chk = find_check(blocks, "bøjning")
    assert chk is not None
    assert passes(chk), f"150×300 should PASS bending: {chk['value']}"
    assert_eta(chk, 0.424)


def test_timber_beam_service_class_reduces_capacity(client):
    """
    Higher service class → lower k_mod → lower f_m,d → higher utilisation.
    SC3 medium-term: k_mod=0.65 vs SC1 k_mod=0.80.
    """
    blocks_sc1 = client.post("/calc/timber-beam", json={**BASE_A, "h_mm": 300.0, "b_mm": 150.0, "service_class": 1}).json()
    blocks_sc3 = client.post("/calc/timber-beam", json={**BASE_A, "h_mm": 300.0, "b_mm": 150.0, "service_class": 3}).json()
    chk1 = find_check(blocks_sc1, "bøjning")
    chk3 = find_check(blocks_sc3, "bøjning")
    if chk1 and chk3:
        from conftest import eta
        assert eta(chk3) > eta(chk1), \
            "Service class 3 should give higher utilisation than service class 1"


def test_timber_beam_c30_stronger_than_c24(client):
    """C30 has higher f_m,k (30 MPa) → lower utilisation than C24 (24 MPa)."""
    blocks_c24 = client.post("/calc/timber-beam", json=BASE_A).json()
    blocks_c30 = client.post("/calc/timber-beam", json={**BASE_A, "timber_grade": "C30"}).json()
    chk24 = find_check(blocks_c24, "bøjning")
    chk30 = find_check(blocks_c30, "bøjning")
    if chk24 and chk30:
        from conftest import eta
        assert eta(chk30) < eta(chk24), \
            "C30 should give lower utilisation than C24 for the same geometry"
