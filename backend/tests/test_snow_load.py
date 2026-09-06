"""
test_snow_load.py — DS/EN 1991-1-3 + DK NA

Formfaktoren og lign. 5.1 er regnet igennem uafhængigt af modulet, direkte fra
standarden; se tests/REFERENCES.md.

Bemærk hvad disse tests IKKE dækker: tabellen over danske s_k-zoner i
snow_load._DK_SNOW_ZONES er data, ikke formler, og den er ikke efterprøvet mod
DK NA. Testene her fastholder regnestykket, ikke terrænsnelasten. Angiv s_k
selv, indtil zonetabellen er verificeret.
"""
import math

import pytest

from conftest import find_calc_row


def snow(client, **kw):
    payload = {"label": "SN1", "roof_type": "pitched", "alpha_deg": 30.0,
               "s_k_kNm2": 1.0, "C_e": 1.0, "C_t": 1.0, "gamma_s": 1.5}
    payload.update(kw)
    r = client.post("/calc/snow-load", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def value(blocks, name):
    """The number in a calc row, without its unit."""
    row = find_calc_row(blocks, name)
    assert row is not None, f"ingen række ved navn {name!r}"
    return float(row["result"].split()[0].replace(",", "."))


# ── Formfaktor μ₁, tabel 5.2 ─────────────────────────────────────────────────
# μ₁ = 0,8              for α ≤ 30°
# μ₁ = 0,8·(60−α)/30    for 30° < α ≤ 60°
# μ₁ = 0                for α > 60°   (sneen skrider af)

@pytest.mark.parametrize("alpha,expected", [
    (0.0,  0.800),
    (15.0, 0.800),
    (30.0, 0.800),   # grænsen hører til den flade gren
    (45.0, 0.400),   # 0,8·(60−45)/30
    (60.0, 0.000),   # 0,8·(60−60)/30
    (75.0, 0.000),
])
def test_shape_coefficient(client, alpha, expected):
    got = value(snow(client, alpha_deg=alpha), "μ₁")
    assert got == pytest.approx(expected, abs=5e-4), f"α = {alpha}°"


def test_shape_coefficient_is_continuous_at_30_degrees(client):
    """Grenene skal mødes, ellers springer lasten ved en halv grads ændring."""
    just_below = value(snow(client, alpha_deg=29.99), "μ₁")
    just_above = value(snow(client, alpha_deg=30.01), "μ₁")
    assert abs(just_below - just_above) < 0.002


# ── Snelast på tag, lign. 5.1:  s = μ₁ · C_e · C_t · s_k ────────────────────

def test_snow_load_on_roof(client):
    blocks = snow(client, alpha_deg=30.0, s_k_kNm2=1.0)
    assert value(blocks, "s") == pytest.approx(0.800, abs=5e-4)


def test_exposure_and_thermal_coefficients_multiply(client):
    """C_e = 0,8 og C_t = 0,9 skal begge slå igennem: 0,8·0,8·0,9·1,0."""
    blocks = snow(client, alpha_deg=30.0, C_e=0.8, C_t=0.9)
    assert value(blocks, "s") == pytest.approx(0.8 * 0.8 * 0.9, abs=5e-4)


def test_snow_load_scales_with_ground_snow_load(client):
    blocks = snow(client, alpha_deg=45.0, s_k_kNm2=1.5)
    assert value(blocks, "s") == pytest.approx(0.4 * 1.5, abs=5e-4)


def test_design_value_applies_the_partial_factor(client):
    blocks = snow(client, alpha_deg=30.0, gamma_s=1.5)
    assert value(blocks, "s_d") == pytest.approx(1.5 * 0.800, abs=5e-4)


# ── Last pr. spær ───────────────────────────────────────────────────────────

def test_per_rafter_load_is_the_area_load_times_the_spacing(client):
    """
    Lasten pr. spær regnes på den vandrette projektion, så spærafstanden
    ganges direkte på — der er ingen 1/cos α her. Den ligger i s_k's
    definition (terrænsnelast pr. vandret m²).
    """
    blocks = snow(client, alpha_deg=30.0, a_m=0.9)
    assert value(blocks, "s_spær") == pytest.approx(0.800 * 0.9, abs=5e-4)


def test_no_per_rafter_row_without_a_spacing(client):
    assert find_calc_row(snow(client, a_m=0.0), "s_spær") is None


# ── Randtilfælde ────────────────────────────────────────────────────────────

def test_steep_roof_carries_no_snow(client):
    blocks = snow(client, alpha_deg=70.0)
    assert value(blocks, "s") == pytest.approx(0.0, abs=1e-9)
    notes = " ".join(b.get("content", "") for b in blocks if b.get("type") == "note")
    assert "60" in notes, "et tag over 60° skal sige hvorfor der ikke er sne"


def test_flat_roof_uses_the_same_shape_coefficient(client):
    """Et fladt tag er ikke et særtilfælde i formlen — μ₁ er stadig 0,8."""
    assert value(snow(client, roof_type="flat", alpha_deg=0.0), "μ₁") == \
        pytest.approx(0.8, abs=5e-4)


def test_ridge_height_follows_the_pitch(client):
    """
    Rygningshøjde = remhøjde + (spænd/2)·tan α. Geometri, men den står i
    dokumentet og bliver læst som et faktum om bygningen.
    """
    blocks = snow(client, alpha_deg=30.0, roof_span_m=8.0, eave_height_m=3.0)
    expected = 3.0 + 4.0 * math.tan(math.radians(30.0))
    assert value(blocks, "Rygningshøjde") == pytest.approx(expected, abs=5e-3)
