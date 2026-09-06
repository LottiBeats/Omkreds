"""
test_material_densities.py — DS/EN 1991-1-1:2002 bilag A, tabel A.1–A.5

Værdierne er afskrevet fra standarden og pinnes her, fordi en densitet er
ren data: der er intet i koden, der fanger en tastefejl. En 4,2 der bliver
til 4,8 giver et fuldstændig plausibelt tal hele vejen ud i dokumentet.

Stikprøven dækker mindst én række fra hver tabel og hver af de tre former
en række kan have: ét tal, et interval, og en note-afledt værdi.
"""
import pytest

import material_densities as md


# ── Tabel A.3, træ — den der bliver brugt mest her ──────────────────────────

@pytest.mark.parametrize("key,gamma", [
    ("C14", 3.5), ("C16", 3.7), ("C18", 3.8), ("C22", 4.1), ("C24", 4.2),
    ("C27", 4.5), ("C30", 4.6), ("C35", 4.8), ("C40", 5.0),
    ("D30", 6.4), ("D35", 6.7), ("D40", 7.0), ("D50", 7.8), ("D60", 8.4),
    ("D70", 10.8),
    ("GL24h", 3.7), ("GL28h", 4.0), ("GL32h", 4.2), ("GL36h", 4.4),
    ("GL24c", 3.5), ("GL28c", 3.7), ("GL32c", 4.0), ("GL36c", 4.2),
])
def test_timber_densities(key, gamma):
    assert md.DENSITIES[key]["default_kNm3"] == pytest.approx(gamma)
    assert md.DENSITIES[key]["table"].endswith("A.3")


def test_glulam_combined_is_lighter_than_homogeneous():
    """GLxxc ligger under GLxxh i hele tabellen. Fanger en ombytning."""
    for grade in ("24", "28", "32", "36"):
        assert md.DENSITIES[f"GL{grade}c"]["default_kNm3"] < \
               md.DENSITIES[f"GL{grade}h"]["default_kNm3"]


def test_hardwood_is_heavier_than_softwood():
    assert md.DENSITIES["D30"]["default_kNm3"] > md.DENSITIES["C40"]["default_kNm3"]


# ── Tabel A.1, beton og mørtel ──────────────────────────────────────────────

def test_normal_weight_concrete():
    assert md.DENSITIES["beton"]["default_kNm3"] == pytest.approx(24.0)


def test_reinforced_concrete_is_the_note_one_addition():
    """
    Jernbeton er ikke en selvstændig række — det er normalbeton plus fodnote 1,
    "increase by 1 kN/m³". Værdien skal følge normalbetonen, ikke leve sit eget
    liv.
    """
    assert md.DENSITIES["jernbeton"]["default_kNm3"] == pytest.approx(
        md.DENSITIES["beton"]["default_kNm3"] + 1.0)


def test_lightweight_concrete_classes_are_ordered():
    keys = ["lc10", "lc12", "lc14", "lc16", "lc18", "lc20"]
    tops = [md.DENSITIES[k]["max_kNm3"] for k in keys]
    assert tops == sorted(tops), "densitetsklasserne skal stige monotont"
    assert md.DENSITIES["lc20"]["max_kNm3"] < md.DENSITIES["beton"]["default_kNm3"]


def test_cement_mortar_is_a_range():
    m = md.DENSITIES["cementmoertel"]
    assert (m["min_kNm3"], m["max_kNm3"]) == pytest.approx((19.0, 23.0))
    assert m["is_range"] is True


# ── Tabel A.2, A.4, A.5 — stikprøver ────────────────────────────────────────

@pytest.mark.parametrize("key,lo,hi,table", [
    ("skifer",     28.0,  28.0,  "A.2"),
    ("granit",     27.0,  30.0,  "A.2"),
    ("staal",      77.0,  78.5,  "A.4"),
    ("aluminium",  27.0,  27.0,  "A.4"),
    ("bly",       112.0, 114.0,  "A.4"),
    ("glas_plade", 25.0,  25.0,  "A.5"),
    ("eps",         0.3,   0.3,  "A.5"),
])
def test_spot_checks(key, lo, hi, table):
    m = md.DENSITIES[key]
    assert (m["min_kNm3"], m["max_kNm3"]) == pytest.approx((lo, hi))
    assert m["table"].endswith(table)


# ── Tabellens form ──────────────────────────────────────────────────────────

def test_every_entry_cites_its_table():
    for key, m in md.DENSITIES.items():
        assert m["table"].startswith("EN 1991-1-1 tabel"), key


def test_ranges_default_to_the_upper_end():
    """Egenlast er ugunstig, så et interval regnes fra toppen med mindre andet vælges."""
    for key, m in md.DENSITIES.items():
        assert m["default_kNm3"] == m["max_kNm3"], key
        assert m["min_kNm3"] <= m["max_kNm3"], key


def test_no_material_is_weightless_or_absurd():
    for key, m in md.DENSITIES.items():
        assert 0.0 < m["min_kNm3"] <= 120.0, key


def test_groups_cover_every_material_once():
    listed = [mat["key"] for g in md.groups() for mat in g["materials"]]
    assert sorted(listed) == sorted(md.DENSITIES)
    assert len(listed) == len(set(listed))


# ── g = γ·t ─────────────────────────────────────────────────────────────────

def test_area_load_from_thickness():
    """50 mm normalbeton = 0,050 m · 24 kN/m³ = 1,20 kN/m²."""
    r = md.area_load_kNm2("beton", 50.0)
    assert r["g_kNm2"] == pytest.approx(1.20, abs=1e-9)
    assert r["density_kNm3"] == pytest.approx(24.0)
    assert r["density_was_overridden"] is False


def test_area_load_scales_linearly_with_thickness():
    assert md.area_load_kNm2("C24", 100.0)["g_kNm2"] == pytest.approx(
        2 * md.area_load_kNm2("C24", 50.0)["g_kNm2"])


def test_density_can_be_overridden_and_says_so():
    """Standardens interval er et spænd; den der vælger i det, skal ses."""
    r = md.area_load_kNm2("cementmoertel", 20.0, density_kNm3=19.0)
    assert r["g_kNm2"] == pytest.approx(19.0 * 0.020)
    assert r["density_was_overridden"] is True


def test_zero_thickness_weighs_nothing():
    assert md.area_load_kNm2("beton", 0.0)["g_kNm2"] == pytest.approx(0.0)


def test_unknown_material_is_refused():
    with pytest.raises(KeyError):
        md.area_load_kNm2("gummiged", 10.0)


def test_negative_thickness_is_refused():
    with pytest.raises(ValueError):
        md.area_load_kNm2("beton", -10.0)


# ── Gennem API'et ───────────────────────────────────────────────────────────

def test_endpoint_lists_the_groups(client):
    groups = client.get("/materials/densities").json()["groups"]
    assert [g["table"] for g in groups] == ["A.1", "A.2", "A.3", "A.4", "A.5"]


def test_roof_layer_from_material_and_thickness(client):
    """
    Et lag angivet som materiale + tykkelse skal give samme fladelast som det
    samme lag angivet direkte — og skrive densiteten og dens tabel ud.
    """
    def total(layers):
        r = client.post("/calc/roof-dead-load", json={
            "label": "G1", "alpha_deg": 0.0, "a_m": 1.0, "layers": layers,
            "b_mm": 45, "h_mm": 195, "rho_kgm3": 420})
        assert r.status_code == 200, r.text
        return r.json()["_result"]

    via_material = total([{"material": "beton", "thickness_mm": 50.0}])
    direct       = total([{"description": "Beton", "g_kNm2": 1.20}])

    def g_k(blocks):
        for b in blocks:
            if b.get("type") == "calc_row" and b.get("name") == "g_k":
                return float(b["result"].split()[0])
        raise AssertionError("ingen g_k")

    assert g_k(via_material) == pytest.approx(g_k(direct), abs=1e-3)

    tables = [b for b in via_material if b.get("type") == "table"]
    text = " ".join(" ".join(map(str, row)) for row in tables[0]["rows"])
    assert "24.0 kN/m³" in text and "tabel A.1" in text
