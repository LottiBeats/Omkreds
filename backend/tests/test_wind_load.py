"""
test_wind_load.py — DS/EN 1991-1-4 §4.2–4.5

Hele kæden er regnet igennem uafhængigt af modulet, direkte fra standardens
ligninger (se tests/REFERENCES.md):

    v_b   = c_dir · c_season · v_b,0                    lign. 4.1
    q_b   = ½·ρ·v_b²                                    lign. 4.10
    z     = max(z_ref, z_min)                           tabel 4.1
    k_r   = 0,19·(z₀/z₀,II)^0,07                        lign. 4.5
    c_r   = k_r·ln(z/z₀)                                lign. 4.4
    I_v   = k_I/(c₀·ln(z/z₀)),  k_I = 1,0               lign. 4.7
    v_m   = c_r·c₀·v_b                                  lign. 4.3
    q_p   = (1 + 7·I_v)·½·ρ·v_m²                        lign. 4.8

Hvad de IKKE dækker: v_b,0 = 24 m/s er DK NA-data og ikke efterprøvet her, og
terrænkategori 0 (åbent hav) mangler helt i modulet — se REFERENCES.md.
"""
import math

import pytest

from conftest import find_calc_row

Z0_II = 0.05
TERRAIN = {"II": (0.05, 2.0), "III": (0.30, 5.0), "IV": (1.00, 10.0)}


def wind(client, **kw):
    payload = {"label": "W1", "terrain_category": "II", "v_b0_ms": 24.0,
               "z_ref_m": 8.0, "h_m": 8.0, "b_m": 10.0, "d_m": 12.0,
               "c_dir": 1.0, "c_season": 1.0, "rho_air": 1.25,
               "c_pe_windward": 0.8, "c_pe_leeward": -0.5, "c_pi": 0.2}
    payload.update(kw)
    r = client.post("/calc/wind-load", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def value(blocks, name):
    row = find_calc_row(blocks, name)
    assert row is not None, f"ingen række ved navn {name!r}"
    return float(row["result"].split()[0].replace(",", "."))


def expected(z_ref, tc, v_b0=24.0, rho=1.25, c_dir=1.0, c_season=1.0, c0=1.0):
    """Uafhængig gennemregning — importerer intet fra wind_load."""
    z0, z_min = TERRAIN[tc]
    v_b = c_dir * c_season * v_b0
    z = max(z_ref, z_min)
    k_r = 0.19 * (z0 / Z0_II) ** 0.07
    c_r = k_r * math.log(z / z0)
    I_v = 1.0 / (c0 * math.log(z / z0))
    v_m = c_r * c0 * v_b
    return {
        "v_b": v_b,
        "q_b": 0.5 * rho * v_b ** 2 / 1000.0,
        "k_r": k_r, "c_r": c_r, "I_v": I_v, "v_m": v_m,
        "q_p": (1.0 + 7.0 * I_v) * 0.5 * rho * v_m ** 2 / 1000.0,
    }


# ── Kæden, led for led ──────────────────────────────────────────────────────

@pytest.mark.parametrize("tc", ["II", "III", "IV"])
def test_terrain_factor(client, tc):
    """k_r = 0,19·(z₀/0,05)^0,07 — kategori II giver pr. definition 0,19."""
    assert value(wind(client, terrain_category=tc), "k_r") == \
        pytest.approx(expected(8.0, tc)["k_r"], abs=5e-5)


@pytest.mark.parametrize("tc", ["II", "III", "IV"])
def test_roughness_factor(client, tc):
    assert value(wind(client, terrain_category=tc), "c_r(z)") == \
        pytest.approx(expected(8.0, tc)["c_r"], abs=5e-5)


@pytest.mark.parametrize("tc", ["II", "III", "IV"])
def test_turbulence_intensity(client, tc):
    assert value(wind(client, terrain_category=tc), "I_v(z)") == \
        pytest.approx(expected(8.0, tc)["I_v"], abs=5e-5)


@pytest.mark.parametrize("tc", ["II", "III", "IV"])
def test_mean_wind_velocity(client, tc):
    assert value(wind(client, terrain_category=tc), "v_m(z)") == \
        pytest.approx(expected(8.0, tc)["v_m"], abs=5e-3)


@pytest.mark.parametrize("tc", ["II", "III", "IV"])
def test_peak_velocity_pressure(client, tc):
    """q_p ved 8 m: II → 0,796 · III → 0,564 · IV → 0,423 kN/m²."""
    assert value(wind(client, terrain_category=tc), "q_p(z)") == \
        pytest.approx(expected(8.0, tc)["q_p"], abs=5e-4)


def test_basic_velocity_pressure(client):
    """q_b = ½·1,25·24² = 0,360 kN/m², uafhængigt af terræn."""
    for tc in TERRAIN:
        assert value(wind(client, terrain_category=tc), "q_b") == \
            pytest.approx(0.360, abs=5e-4)


# ── Sammenhænge, der skal holde ─────────────────────────────────────────────

def test_rougher_terrain_gives_lower_pressure(client):
    """Ved samme højde: åbent terræn > forstad > bymidte."""
    q = [value(wind(client, terrain_category=tc), "q_p(z)") for tc in ("II", "III", "IV")]
    assert q[0] > q[1] > q[2]


def test_pressure_grows_with_height(client):
    lav  = value(wind(client, z_ref_m=5.0), "q_p(z)")
    høj  = value(wind(client, z_ref_m=20.0), "q_p(z)")
    assert høj > lav


def test_z_min_clips_low_reference_heights(client):
    """
    Under z_min regnes med z_min (tabel 4.1). I terrænkategori III er z_min
    = 5 m, så 1 m og 5 m skal give præcis det samme.
    """
    lav = value(wind(client, terrain_category="III", z_ref_m=1.0), "q_p(z)")
    ved = value(wind(client, terrain_category="III", z_ref_m=5.0), "q_p(z)")
    assert lav == pytest.approx(ved, abs=1e-6)


def test_directional_and_season_factors_scale_the_basic_speed(client):
    """v_b = c_dir·c_season·v_b,0 — og q_b går med kvadratet."""
    blocks = wind(client, c_dir=0.9, c_season=0.8)
    assert value(blocks, "v_b") == pytest.approx(0.9 * 0.8 * 24.0, abs=5e-3)
    assert value(blocks, "q_b") == pytest.approx(0.5 * 1.25 * (0.9 * 0.8 * 24.0) ** 2 / 1000,
                                                 abs=5e-4)


def test_unknown_terrain_category_falls_back_to_II(client):
    """Et ukendt bogstav må ikke give en tilfældig ruhed."""
    assert value(wind(client, terrain_category="Z"), "k_r") == pytest.approx(0.19, abs=5e-5)


# ── Vægtryk ─────────────────────────────────────────────────────────────────

def test_wall_pressures(client):
    """
    w = c_pe·q_p − c_pi·q_p. Luv: (0,8−0,2)·q_p. Læ: (−0,5+0,2)·q_p, altså sug.
    """
    blocks = wind(client)
    q_p = value(blocks, "q_p(z)")
    assert value(blocks, "w_los") == pytest.approx(0.6 * q_p, abs=5e-4)
    assert value(blocks, "w_læ") == pytest.approx(-0.3 * q_p, abs=5e-4)


def test_leeward_wall_is_always_suction(client):
    assert value(wind(client), "w_læ") < 0


def test_total_horizontal_pressure_spans_both_walls(client):
    blocks = wind(client)
    q_p = value(blocks, "q_p(z)")
    assert value(blocks, "w_i alt") == pytest.approx((0.8 - (-0.5)) * q_p, abs=5e-4)
