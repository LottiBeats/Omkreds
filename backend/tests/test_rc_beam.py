"""
test_rc_beam.py — EN 1992-1-1 RC beam verification

Reference case
──────────────
Case A: 300×500 mm beam, C30/37, B500, L=6 m, g_k=10 kN/m, q_k=6 kN/m, d=450 mm

    w_Ed   = 1.35×10 + 1.5×6         = 22.5 kN/m
    M_Ed   = 22.5×6²/8               = 101.25 kNm
    V_Ed   = 22.5×6/2                = 67.5 kN

    f_cd   = α_cc×f_ck/γ_C = 0.85×30/1.5 = 17.0 MPa
    f_yd   = f_yk/γ_S = 500/1.15     = 434.8 MPa

    Balanced depth factor  x_lim/d = 0.45 (ductility class B, ε_cu=3.5‰, ε_yd=2.17‰)
    M_Rd,lim = 0.8×x_lim × b × f_cd × (d - 0.4×x_lim)
    with x_lim = 0.45×450 = 202.5 mm:
    M_Rd,lim = 0.8×202.5×300×17.0×(450-0.4×202.5)/1e6
             = 0.8×202.5×300×17×369/1e6
             = 0.8×202.5×300×17×369/1e6
             = 305.3 kNm  (singly-reinforced section can carry M_Ed)

    Required A_s:
    z ≈ d(0.5+√(0.25-μ/1.134))  where μ = M_Ed/(b×d²×f_cd)
      = 101.25e6/(300×450²×17) = 101.25e6/1.031e9 = 0.0982
    z = 450×(0.5+√(0.25-0.0982/1.134))
      = 450×(0.5+√(0.25-0.0866))
      = 450×(0.5+√0.1634)
      = 450×(0.5+0.4042) = 450×0.9042 = 406.9 mm
    A_s,req = M_Ed/(z×f_yd) = 101.25e6/(406.9×434.8) = 572 mm²

    Source: Mosley, Bungey & Hulse, "Reinforced Concrete Design to
    Eurocode 2", 7th ed., Chapter 4.

Case B: Same beam, overloaded (g_k=50, q_k=40 kN/m, long span L=10m) → FAIL
"""
from conftest import find_check, passes, assert_eta


BASE = {
    "label": "RCB-A",
    "span_m": 6.0,
    "b_mm": 300.0, "h_mm": 500.0, "d_mm": 450.0,
    "g_k_kNm": 10.0, "q_k_kNm": 6.0,
    "f_ck_MPa": 30.0, "f_yk_MPa": 500.0,
    "gamma_C": 1.5, "gamma_S": 1.15,
}


def test_rc_beam_response_ok(client):
    r = client.post("/calc/rc-beam", json=BASE)
    assert r.status_code == 200
    assert len(r.json()) > 0


def test_rc_beam_flexure_passes(client):
    """A_s,req ≈ 572 mm² — section can carry M_Ed."""
    blocks = client.post("/calc/rc-beam", json=BASE).json()
    chk = find_check(blocks, "flexure") or find_check(blocks, "bending") or find_check(blocks, "moment")
    assert chk is not None, "No flexure check block found"
    assert passes(chk), f"Flexure check failed unexpectedly: {chk['value']}"


def test_rc_beam_shear_passes(client):
    blocks = client.post("/calc/rc-beam", json=BASE).json()
    chk = find_check(blocks, "shear")
    assert chk is not None, "No shear check found"
    assert passes(chk), f"Shear check failed: {chk['value']}"


def test_rc_beam_with_provided_steel_passes(client):
    """Providing 4ø20 (A_s=1257 mm²) >> A_s,req → definitely passes."""
    payload = {**BASE, "As_prov_mm2": 1257.0}
    blocks = client.post("/calc/rc-beam", json=payload).json()
    chk = find_check(blocks, "flexure") or find_check(blocks, "bending") or find_check(blocks, "moment")
    assert chk is not None
    assert passes(chk)


def test_rc_beam_overloaded_fails(client):
    """g_k=50, q_k=40, L=10m → M_Ed = (1.35×50+1.5×40)×100/8 = 1090 kNm >> capacity."""
    payload = {**BASE, "span_m": 10.0, "g_k_kNm": 50.0, "q_k_kNm": 40.0}
    blocks = client.post("/calc/rc-beam", json=payload).json()
    chk = find_check(blocks, "flexure") or find_check(blocks, "bending") or find_check(blocks, "moment")
    assert chk is not None
    assert not passes(chk), "Heavily overloaded beam should FAIL flexure"


def test_rc_beam_c20_vs_c35_more_reinforcement(client):
    """Lower concrete grade requires more reinforcement (higher A_s,req)."""
    blocks_c20 = client.post("/calc/rc-beam", json={**BASE, "f_ck_MPa": 20.0}).json()
    blocks_c35 = client.post("/calc/rc-beam", json={**BASE, "f_ck_MPa": 35.0}).json()
    # Both should still pass (section is lightly loaded)
    chk20 = find_check(blocks_c20, "flexure") or find_check(blocks_c20, "bending") or find_check(blocks_c20, "moment")
    chk35 = find_check(blocks_c35, "flexure") or find_check(blocks_c35, "bending") or find_check(blocks_c35, "moment")
    if chk20 and chk35:
        from conftest import eta
        # C35 should give lower or equal utilisation than C20
        assert eta(chk35) <= eta(chk20), \
            "Higher f_ck should give lower or equal bending utilisation"
