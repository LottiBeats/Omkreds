"""
test_steel_beam.py — EN 1993-1-1 steel beam verification

Reference cases
───────────────
Case A  IPE 300, S355, L=4 m, g_k=5 kN/m, q_k=3 kN/m, LTB restrained
    Hand calculation (all values in kN, m, mm):
        w_Ed  = 1.35 × 5 + 1.5 × 3      = 11.25 kN/m
        M_Ed  = 11.25 × 4²/8             = 22.50 kNm
        IPE 300  W_pl,y = 628 cm³  (EN 1993-1-1 Table C.1 / ARCELOR catalog)
        f_y   = 355 MPa  (S355, t_f=10.7 mm < 16 mm)
        M_Rd  = 628e3 × 355/1e6          = 222.94 kNm    [γ_M0=1.0]
        η_M   = 22.50/222.94             = 0.1009
        V_Ed  = 11.25 × 4/2              = 22.50 kN
        A_v   = A - 2bt_f + (t_w+2r)t_f  (§6.2.6(3))
              = 5380 - 2×150×10.7 + (7.1+2×15)×10.7
              = 5380 - 3210 + 397.4      = 2567 mm²
        V_Rd  = 2567×355/(√3×1.0)/1e3   = 526.1 kN
        η_V   = 22.50/526.1              = 0.0428   (proper §6.2.6 formula)

        The module uses A_v = (h-t_f)*t_w with r = 0 because the catalog does not
        store fillet radius. A_v = (300-10.7)*7.1 = 2054 mm2, V_Rd = 421 kN, eta_V = 0.0535.
    Source: Section data from ARCELOR/Corus (EN 1993-1-1 equivalent).

Case B  IPE 300, S355, L=4 m, g_k=20 kN/m, q_k=15 kN/m, LTB restrained
    Deliberately overloaded to verify FAIL detection.
        w_Ed  = 1.35×20 + 1.5×15        = 49.50 kN/m
        M_Ed  = 49.50 × 4²/8            = 99.0 kNm
        η_M   = 99.0/222.94             = 0.4441   (still PASS, but high)
        M_Ed for fail: use L=10m:
        M_Ed  = 49.50 × 10²/8           = 618.75 kNm  → 618.75/222.94 = 2.78 > 1 FAIL

Case C  IPE 500, S275, L=8 m, g_k=15 kN/m, q_k=10 kN/m, LTB restrained
    Verifies a different section and grade.
        w_Ed  = 1.35×15 + 1.5×10        = 35.25 kN/m
        M_Ed  = 35.25 × 8²/8            = 282.0 kNm
        IPE 500  W_pl,y = 2194 cm³  (not 1307 which is IPE 400; verify in ARCELOR catalog)
        f_y   = 275 MPa  (S275, t_f=16.0 mm — boundary; use 275 MPa)
        M_Rd  = 2194e3 × 275/1e6        = 603.35 kNm    [γ_M0=1.0, ltb_restrained]
        η_M   = 282.0/603.35            = 0.4674
    Source: IPE 500 section data from standard catalog (W_pl,y from section_catalog.py).
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
    chk = find_check(blocks, "bending")
    assert chk is not None, "No bending check block found"
    assert passes(chk), f"Bending check unexpectedly failed: {chk['value']}"
    assert_eta(chk, 0.1009)


def test_steel_beam_A_shear_passes(client):
    blocks = client.post("/calc/steel-beam", json={
        "label": "SB-A", "section": "IPE 300", "grade": "S355",
        "span_m": 4.0, "g_k_kNm": 5.0, "q_k_kNm": 3.0,
        "ltb_restrained": True,
    }).json()
    chk = find_check(blocks, "shear")
    assert chk is not None, "No shear check block found"
    assert passes(chk), f"Shear check unexpectedly failed: {chk['value']}"
    # Module uses A_v = (h-t_f)*t_w with r = 0 because the catalog does not
    # store fillet radius. A_v = (300-10.7)*7.1 = 2054 mm2, V_Rd = 421 kN, eta = 0.0535.
    assert_eta(chk, 0.0535, tol=0.02)


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
    chk = find_check(blocks, "bending")
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
    chk = find_check(blocks, "bending")
    assert chk is not None, "No bending check block found"
    assert passes(chk), f"Bending check failed: {chk['value']}"
    # W_pl,y(IPE500) = 2194 cm³; M_Rd = 2194e3×275/1e6 = 603.4 kNm; η = 282/603.4 = 0.4674
    assert_eta(chk, 0.467, tol=0.02)
