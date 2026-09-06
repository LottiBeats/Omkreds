"""
test_roof_dead_load.py — tagets egenlast, vandret projektion

Ingen Eurocode-formel her, kun geometri — men det er geometri, som resten af
A2 bygger på, og som en læser tager for pålydende:

    g_tag,proj = Σg_lag / cos α · a          [kN/m]
    g_spær     = b·h·ρ / cos α               [kN/m]
    g_k        = g_tag,proj + g_spær

Divisionen med cos α er der, fordi lagene er givet pr. m² TAGFLADE, mens
lasten skal virke pr. m vandret projektion — en skrå tagflade er længere end
sin egen grundplan. Ganger man i stedet for at dividere, bliver et 45°-tag
30 % lettere end det er, og det ser plausibelt ud hele vejen til taget.
"""
import math

import pytest

from conftest import find_calc_row

LAG = [{"description": "Tagsten", "g_kNm2": 0.50}]


def roof(client, **kw):
    payload = {"title": "G", "label": "G1", "alpha_deg": 30.0, "a_m": 0.9,
               "layers": LAG, "b_mm": 45.0, "h_mm": 195.0, "rho_kgm3": 450.0}
    payload.update(kw)
    r = client.post("/calc/roof-dead-load", json=payload)
    assert r.status_code == 200, r.text
    return r.json()["_result"]


def value(blocks, name):
    row = find_calc_row(blocks, name)
    assert row is not None, f"ingen række ved navn {name!r}"
    return float(row["result"].split()[0].replace(",", "."))


def hand(alpha=30.0, a=0.9, g_tag=0.50, b_mm=45.0, h_mm=195.0, rho=450.0):
    """Uafhængig gennemregning."""
    cos_a = math.cos(math.radians(alpha))
    g_clad = g_tag / cos_a * a
    g_raft = (b_mm / 1000) * (h_mm / 1000) * (rho * 9.81 / 1000) / cos_a
    return g_clad, g_raft, g_clad + g_raft


# ── Beklædning ──────────────────────────────────────────────────────────────

def test_cladding_projected_per_rafter(client):
    """0,50 / cos30° · 0,9 = 0,5196 kN/m."""
    assert value(roof(client), "g_tag,proj") == pytest.approx(hand()[0], abs=5e-4)


def test_layers_are_summed(client):
    blocks = roof(client, layers=[
        {"description": "Tagsten",  "g_kNm2": 0.50},
        {"description": "Lægter",   "g_kNm2": 0.06},
        {"description": "Undertag", "g_kNm2": 0.04},
    ])
    assert value(blocks, "g_tag,proj") == pytest.approx(hand(g_tag=0.60)[0], abs=5e-4)


def test_no_layers_gives_only_the_rafter(client):
    blocks = roof(client, layers=[])
    assert value(blocks, "g_tag,proj") == pytest.approx(0.0, abs=1e-9)
    assert value(blocks, "g_k") == pytest.approx(hand(g_tag=0.0)[1], abs=5e-4)


# ── Spærets egenlast ────────────────────────────────────────────────────────

def test_rafter_self_weight(client):
    """45×195 mm, ρ = 450 kg/m³ → 0,0447 kN/m ved 30°."""
    assert value(roof(client), "g_spær") == pytest.approx(hand()[1], abs=5e-4)


def test_rafter_weight_scales_with_section(client):
    """
    Lineært i h. Tolerancen er 2 %, ikke fordi formlen er usikker, men fordi
    tallene læses tilbage fra en streng med tre decimaler: g_spær er ca.
    0,0447 kN/m og trykkes som "0,045".
    """
    lille = value(roof(client, b_mm=45.0, h_mm=145.0), "g_spær")
    stor  = value(roof(client, b_mm=45.0, h_mm=195.0), "g_spær")
    assert stor / lille == pytest.approx(195.0 / 145.0, rel=0.02)


# ── Hældningen ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("alpha", [0.0, 15.0, 30.0, 45.0])
def test_projection_across_pitches(client, alpha):
    assert value(roof(client, alpha_deg=alpha), "g_k") == \
        pytest.approx(hand(alpha=alpha)[2], abs=5e-4)


def test_a_steeper_roof_is_heavier_per_horizontal_metre(client):
    """
    Fortegnet på 1/cos α. Et 45°-tag har mere tagflade pr. vandret meter end
    et fladt, så lasten pr. vandret meter er STØRRE, ikke mindre.
    """
    flad  = value(roof(client, alpha_deg=0.0),  "g_k")
    skrå  = value(roof(client, alpha_deg=45.0), "g_k")
    assert skrå > flad
    assert skrå / flad == pytest.approx(1 / math.cos(math.radians(45.0)), rel=0.01)


def test_flat_roof_needs_no_projection(client):
    """Ved α = 0 er cos α = 1, så lasten er lagene gange spærafstanden."""
    assert value(roof(client, alpha_deg=0.0), "g_tag,proj") == \
        pytest.approx(0.50 * 0.9, abs=5e-4)


# ── Sammentælling ───────────────────────────────────────────────────────────

def test_total_is_the_sum_of_its_parts(client):
    blocks = roof(client)
    assert value(blocks, "g_k") == pytest.approx(
        value(blocks, "g_tag,proj") + value(blocks, "g_spær"), abs=2e-3)


def test_spacing_scales_the_cladding_but_not_the_rafter(client):
    """Spærafstanden er lastbredden. Spærets egen vægt er den samme uanset."""
    smal = roof(client, a_m=0.6)
    bred = roof(client, a_m=1.2)
    assert value(bred, "g_tag,proj") == pytest.approx(2 * value(smal, "g_tag,proj"), rel=0.01)
    assert value(bred, "g_spær") == pytest.approx(value(smal, "g_spær"), abs=1e-6)
