"""
test_timber_beam.py — EN 1995-1-1 + DS/EN 1990 DK NA

Referencetilfælde: 90×220 mm C24, L = 4,0 m, g_k = 3,0 kN/m, q_k = 2,0 kN/m,
anvendelsesklasse 1, variabel last af middel varighed, γ_M = 1,3.

LASTKOMBINATIONEN vælges efter EN 1995-1-1 §2.2.3: for træ er den
dimensionsgivende kombination den med det største w/k_mod, ikke den med den
største last, fordi k_mod følger varigheden. Kandidaterne er DK NA tabel
A1.2(B+C):

    6.10a   w = 1,2·K_FI·g_k = 3,60 kN/m   permanent   k_mod 0,60   w/k = 6,00
    6.10b   w = 1,0·K_FI·g_k + 1,5·K_FI·q_k = 6,00     middel      k_mod 0,80   w/k = 7,50
                                                                   → 6.10b styrer

    w_Ed = 6,00 kN/m    M_Ed = wL²/8 = 12,00 kNm    V_Ed = wL/2 = 12,00 kN
    f_m,d = 0,80·24/1,3 = 14,769 MPa
    f_v,d = 0,80·4,0/1,3 = 2,4615 MPa

Case A — 90×220:
    W_y   = 90·220²/6 = 726 000 mm³
    σ_m,d = 12,00e6/726000 = 16,529 MPa
    η     = 16,529/14,769 = 1,119  → FAIL
    τ_d   = 1,5·12000/19800 = 0,9091 MPa
    η     = 0,9091/2,4615 = 0,369  → OK

Case B — 150×300:
    W_y   = 150·300²/6 = 2 250 000 mm³
    σ_m,d = 12,00e6/2250000 = 5,333 MPa
    η     = 5,333/14,769 = 0,361  → OK

Modulet regnede tidligere 1,35·g_k + 1,5·q_k med den varighed brugeren valgte.
1,35 findes ikke i DK NA, og én fast kombination kan ikke være styrende for
både et let og et tungt tag. Værdierne ovenfor er derfor ikke de samme som før
— aktionssiden er ændret, bæreevnesiden er den samme.
"""
import pytest

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
    90×220 C24 ved 4 m er for lille: σ_m,d = 16,53 MPa > f_m,d = 14,77 MPa.
    """
    blocks = client.post("/calc/timber-beam", json=BASE_A).json()
    chk = find_check(blocks, "bøjning")
    assert chk is not None, "No bending check found"
    assert not passes(chk), "90×220 C24 at 4m should FAIL bending"
    assert_eta(chk, 1.119)


def test_timber_beam_A_shear_passes(client):
    """Forskydningen er langt inden for: η = 0,369."""
    blocks = client.post("/calc/timber-beam", json=BASE_A).json()
    chk = find_check(blocks, "forskydning")
    assert chk is not None, "No shear check found"
    assert passes(chk), f"Shear check failed: {chk['value']}"
    assert_eta(chk, 0.369)


def test_timber_beam_B_bending_passes(client):
    """150×300: η_bøjning = 0,361 → OK."""
    blocks = client.post("/calc/timber-beam", json={
        **BASE_A, "b_mm": 150.0, "h_mm": 300.0,
    }).json()
    chk = find_check(blocks, "bøjning")
    assert chk is not None
    assert passes(chk), f"150×300 should PASS bending: {chk['value']}"
    assert_eta(chk, 0.361)


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


# ── Valget af lastkombination (EN 1995-1-1 §2.2.3) ──────────────────────────

def _row(blocks, name):
    for b in blocks:
        if b.get("type") == "calc_row" and b.get("name") == name:
            return b
    return None


def _governing(blocks):
    for b in blocks:
        if b.get("type") == "note" and "Dimensionsgivende" in b.get("content", ""):
            return b["content"]
    raise AssertionError("ingen note om dimensionsgivende kombination")


def test_both_combinations_are_shown(client):
    """
    Læseren skal kunne se den kombination, der IKKE vandt. Ellers er der ingen
    måde at efterprøve valget på.
    """
    blocks = client.post("/calc/timber-beam", json=BASE_A).json()
    assert _row(blocks, "6.10a") is not None
    assert _row(blocks, "6.10b") is not None


def test_light_roof_is_governed_by_the_variable_load(client):
    """g = 0,9 / q = 0,63 kort: 6.10b giver 2,05 mod 6.10a's 1,80."""
    blocks = client.post("/calc/timber-beam", json={
        **BASE_A, "g_k_kNm": 0.9, "q_k_kNm": 0.63, "load_duration": "short",
    }).json()
    assert "6.10b" in _governing(blocks)


def test_heavy_roof_is_governed_by_permanent_load_alone(client):
    """
    g = 2,5 / q = 0,2 kort: 6.10a giver 3,00/0,60 = 5,00 mod 6.10b's
    2,80/0,90 = 3,11. Den mindste last styrer, fordi k_mod er lavere.
    Det er hele pointen i §2.2.3, og det, en fast kombination ikke kan fange.
    """
    blocks = client.post("/calc/timber-beam", json={
        **BASE_A, "g_k_kNm": 2.5, "q_k_kNm": 0.2, "load_duration": "short",
    }).json()
    gov = _governing(blocks)
    assert "6.10a" in gov and "permanent" in gov


def test_the_governing_choice_moves_with_the_load_ratio(client):
    """Der findes et skift, og det ligger hvor w/k_mod krydser."""
    def gov(g, q):
        return _governing(client.post("/calc/timber-beam", json={
            **BASE_A, "g_k_kNm": g, "q_k_kNm": q, "load_duration": "short",
        }).json())
    assert "6.10b" in gov(1.0, 1.0)
    assert "6.10a" in gov(3.0, 0.1)


def test_permanent_only_uses_k_mod_060(client):
    """Vinder 6.10a, skal f_m,d falde tilsvarende: 0,60·24/1,3 = 11,08 MPa."""
    blocks = client.post("/calc/timber-beam", json={
        **BASE_A, "g_k_kNm": 2.5, "q_k_kNm": 0.2, "load_duration": "short",
    }).json()
    f_md = float(_row(blocks, "f_m,d")["result"].split()[0])
    assert f_md == pytest.approx(0.60 * 24 / 1.3, abs=0.02)


def test_k_fi_scales_both_combinations(client):
    """K_FI ganges på begge — CC3 giver 10 % mere i begge rækker."""
    def w(kfi, name):
        blocks = client.post("/calc/timber-beam",
                             json={**BASE_A, "K_FI": kfi}).json()
        return float(_row(blocks, name)["result"].split()[0])
    for name in ("6.10a", "6.10b"):
        assert w(1.1, name) == pytest.approx(1.1 * w(1.0, name), rel=0.01)


def test_imported_actions_do_not_get_a_combination_section(client):
    """
    Kommer snitkræfterne fra rammeberegningen, er kombinationen allerede
    valgt der. Modulet må ikke vælge en ny oveni.
    """
    blocks = client.post("/calc/timber-beam", json={
        **BASE_A,
        "M_Ed_kNm_direct": 10.0, "V_Ed_kN_direct": 8.0,
        "fem_label": "Rammeberegning",
    }).json()
    assert _row(blocks, "6.10a") is None
    assert _row(blocks, "6.10b") is None
