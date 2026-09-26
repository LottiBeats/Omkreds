"""
test_steel_beam.py — EN 1993-1-1 steel beam verification, DS/EN 1990 og
DS/EN 1993-1-1 DK NA (γ_M0 = 1,10, γ_M1 = 1,20, 6.10a/b med K_FI = 1,0).

Case A  IPE 300, S355, L = 4 m, g_k = 5 kN/m, q_k = 3 kN/m, kipning forhindret
    6.10a = 1,2·5          =  6,00 kN/m
    6.10b = 5 + 1,5·3      =  9,50 kN/m   → styrer
    M_Ed  = 9,5·4²/8       = 19,00 kNm
    W_pl,y = 628 cm³, f_y = 355 MPa (t_f = 10,7 mm)
    M_Rd  = 628e3·355/1,10/1e6 = 202,67 kNm   → η = 0,0938
    V_Ed  = 9,5·4/2        = 19,00 kN
    A_v   = A − 2b·t_f + (t_w + 2r)·t_f ≈ (h − t_f)·t_w + 2r·t_f + (4 − π)·r²
          = 2054 + 321 + 193 = 2568 mm²   (r = 15 mm)
    V_Rd  = 2568·355/(√3·1,10)/1e3 = 478,5 kN        → η = 0,0397

Case B  IPE 300, S355 — overbelastet ved L = 10 m for at se FAIL.

Case C  IPE 500, S275, L = 8 m, g_k = 15 kN/m, q_k = 10 kN/m, kipning forhindret
    6.10b = 15 + 1,5·10    = 30,00 kN/m  (6.10a = 18,0)
    M_Ed  = 30·8²/8        = 240,0 kNm
    W_pl,y = 2194 cm³, f_y = 275 MPa (t_f = 16 mm)
    M_Rd  = 2194e3·275/1,10/1e6 = 548,5 kNm   → η = 0,4376

Før regnede modulet 1,35·g + 1,5·q og γ_M0 = 1,0 -- EN-standardens
anbefalede værdier, ikke de danske.
"""
from conftest import find_check, passes, assert_eta


# ─────────────────────────────────────────────────────────────────────────────
# Case A — lightly loaded, LTB restrained
# ─────────────────────────────────────────────────────────────────────────────

def test_steel_beam_A_response_ok(client):
    r = client.post("/calc/steel-beam", json={
        "label": "SB-A", "section": "IPE 300", "grade": "S355",
        "span_m": 4.0, "g_k_kNm": 5.0, "q_k_kNm": 3.0,
        "ltb_restrained": True,
    })
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) > 0


def test_steel_beam_A_bending_passes(client):
    blocks = client.post("/calc/steel-beam", json={
        "label": "SB-A", "section": "IPE 300", "grade": "S355",
        "span_m": 4.0, "g_k_kNm": 5.0, "q_k_kNm": 3.0,
        "ltb_restrained": True,
    }).json()
    chk = find_check(blocks, "bøjning")
    assert chk is not None, "No bending check block found"
    assert passes(chk), f"Bending check unexpectedly failed: {chk['value']}"
    assert_eta(chk, 0.0938)


def test_steel_beam_A_shear_passes(client):
    blocks = client.post("/calc/steel-beam", json={
        "label": "SB-A", "section": "IPE 300", "grade": "S355",
        "span_m": 4.0, "g_k_kNm": 5.0, "q_k_kNm": 3.0,
        "ltb_restrained": True,
    }).json()
    chk = find_check(blocks, "forskydning")
    assert chk is not None, "No shear check block found"
    assert passes(chk), f"Shear check unexpectedly failed: {chk['value']}"
    # Module uses A_v = (h-t_f)*t_w with r = 0 because the catalog does not
    # store fillet radius. A_v = (300-10.7)*7.1 = 2054 mm2, V_Rd = 421 kN, eta = 0.0535.
    assert_eta(chk, 0.0397, tol=0.02)


# ─────────────────────────────────────────────────────────────────────────────
# Case B — overloaded, should FAIL bending
# ─────────────────────────────────────────────────────────────────────────────

def test_steel_beam_B_bending_fails(client):
    """Long span + heavy load → M_Ed = 618.75 kNm >> M_Rd = 222.9 kNm."""
    blocks = client.post("/calc/steel-beam", json={
        "label": "SB-B", "section": "IPE 300", "grade": "S355",
        "span_m": 10.0, "g_k_kNm": 20.0, "q_k_kNm": 15.0,
        "ltb_restrained": True,
    }).json()
    chk = find_check(blocks, "bøjning")
    assert chk is not None, "No bending check block found"
    assert not passes(chk), "Bending check should have FAILED for overloaded beam"


# ─────────────────────────────────────────────────────────────────────────────
# Case C — IPE 500, S275
# ─────────────────────────────────────────────────────────────────────────────

def test_steel_beam_C_bending_passes(client):
    blocks = client.post("/calc/steel-beam", json={
        "label": "SB-C", "section": "IPE 500", "grade": "S275",
        "span_m": 8.0, "g_k_kNm": 15.0, "q_k_kNm": 10.0,
        "ltb_restrained": True,
    }).json()
    chk = find_check(blocks, "bøjning")
    assert chk is not None, "No bending check block found"
    assert passes(chk), f"Bending check failed: {chk['value']}"
    # W_pl,y(IPE500) = 2194 cm³; M_Rd = 2194e3×275/1e6 = 603.4 kNm; η = 282/603.4 = 0.4674
    assert_eta(chk, 0.4376, tol=0.02)
