"""
test_timber_sls_fire.py — nedbøjning (EN 1995-1-1 §7.2) og brand (EN 1995-1-2)

Nedbøjningen fandtes ikke i modulet. Den er tit dimensionsgivende for en
træbjælke, og det viste sig med det samme: husets spær, 45×195 C24 over 4,0 m,
ligger på 0,52 i bøjning og **1,72 i nedbøjning**.

Brandberegningen fandtes, men endpointet eksponerede den ikke, så den kunne
ikke nås fra brugerfladen.

Referencetilfælde — 45×195 C24, L = 4,0 m, g_k = 0,862, q_k = 0,720 kN/m,
anvendelsesklasse 1, ψ₂ = 0 (sne, DK NA tabel A1.1):

    E_0,mean = 7400/0,67          = 11 045 MPa      EN 338 §5
    I_y      = 45·195³/12         = 27 805 781 mm⁴
    w_inst,G = 5·0,862·4000⁴/(384·11045·27805781) =  9,36 mm
    w_inst,Q = 0,720/0,862 · 9,36                 =  7,82 mm
    w_inst                                        = 17,17 mm
    k_def (anvendelsesklasse 1, tabel 3.2)        = 0,60
    w_fin,G  = 9,36·(1+0,60)                      = 14,97 mm
    w_fin,Q  = 7,82·(1+0·0,60)                    =  7,82 mm
    w_fin                                         = 22,79 mm
"""
import re

import pytest

from conftest import find_check, find_calc_row, eta, passes

BASE = {
    "label": "SP1", "span_m": 4.0, "b_mm": 45.0, "h_mm": 195.0,
    "timber_grade": "C24", "g_k_kNm": 0.862, "q_k_kNm": 0.720,
    "service_class": 1, "load_duration": "short", "gamma_M": 1.3,
    "psi_1": 0.2, "psi_2": 0.0,
}


def beam(client, **kw):
    r = client.post("/calc/timber-beam", json={**BASE, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def value(blocks, name):
    row = find_calc_row(blocks, name)
    assert row is not None, f"ingen række {name!r}"
    return float(row["result"].split()[0])


# ── Nedbøjning ──────────────────────────────────────────────────────────────

def test_mean_modulus_not_the_fifth_percentile(client):
    """
    §2.2.3: nedbøjning regnes med E_0,mean. Bruges 5 %-fraktilen, bliver
    nedbøjningen 49 % for stor — konservativt, men forkert.
    """
    assert value(beam(client), "E_0,mean") == pytest.approx(11045, rel=0.01)


def test_instantaneous_deflection(client):
    b = beam(client)
    assert value(b, "w_inst,G") == pytest.approx(9.36, abs=0.1)
    assert value(b, "w_inst,Q") == pytest.approx(7.82, abs=0.1)
    assert value(b, "w_inst")   == pytest.approx(17.17, abs=0.15)


def test_creep_applies_fully_to_the_permanent_part(client):
    """w_fin,G = w_inst,G·(1 + k_def) med k_def = 0,60."""
    b = beam(client)
    assert value(b, "w_fin,G") == pytest.approx(9.36 * 1.60, abs=0.15)


def test_snow_does_not_creep_in_denmark(client):
    """
    ψ₂ = 0 for sne i DK NA tabel A1.1, så w_fin,Q = w_inst,Q. Det er ikke en
    forglemmelse i formlen — det er den danske tabel.
    """
    b = beam(client)
    assert value(b, "w_fin,Q") == pytest.approx(value(b, "w_inst,Q"), abs=0.02)


def test_imposed_load_does_creep(client):
    """Med ψ₂ = 0,2 (kategori A) kryber den variable del også."""
    b = beam(client, psi_2=0.2)
    assert value(b, "w_fin,Q") == pytest.approx(
        value(b, "w_inst,Q") * (1 + 0.2 * 0.60), abs=0.1)


@pytest.mark.parametrize("sc,k_def", [(1, 0.60), (2, 0.80), (3, 2.00)])
def test_k_def_per_service_class(client, sc, k_def):
    """EN 1995-1-1 tabel 3.2, konstruktionstræ og limtræ."""
    assert value(beam(client, service_class=sc), "k_def") == pytest.approx(k_def)


def test_the_reference_rafter_fails_deflection(client):
    """
    Det spær holder i bøjning ved 0,52 og dumper nedbøjningen ved 1,72.
    Præcis derfor er kontrollen ikke valgfri.
    """
    b = beam(client)
    assert eta(find_check(b, "w_inst")) == pytest.approx(1.72, rel=0.02)
    assert not passes(find_check(b, "w_net,fin"))
    assert passes(find_check(b, "Bøjning"))


def test_a_deeper_section_fixes_it(client):
    """45×245 er det mindste, der holder — nedbøjningen styrer stadig."""
    b = beam(client, h_mm=245.0)
    assert passes(find_check(b, "w_inst"))
    assert eta(find_check(b, "w_inst")) > eta(find_check(b, "Bøjning"))


def test_deflection_scales_with_the_cube_of_the_depth(client):
    lav = value(beam(client, h_mm=195.0), "w_inst")
    hoej = value(beam(client, h_mm=245.0), "w_inst")
    assert lav / hoej == pytest.approx((245 / 195) ** 3, rel=0.02)


def test_precamber_is_subtracted(client):
    b = beam(client, w_c_mm=10.0)
    assert value(b, "w_net,fin") == pytest.approx(value(b, "w_fin") - 10.0, abs=0.05)


def test_limits_are_configurable_and_named(client):
    b = beam(client, limit_inst=500, limit_net_fin=250)
    assert find_calc_row(b, "L/500") is not None
    assert find_calc_row(b, "L/250") is not None
    assert value(b, "L/500") == pytest.approx(4000 / 500, abs=0.05)


def test_deflection_can_be_switched_off(client):
    assert find_check(beam(client, check_deflection=False), "w_inst") is None


def test_imported_actions_say_why_creep_is_not_checked(client):
    """
    Kommer snitkræfterne fra en rammeberegning, følger opdelingen i permanent
    og variabel ikke med, og krybningen kan ikke regnes. Det skal siges.
    """
    b = beam(client, M_Ed_kNm_direct=5.0, V_Ed_kN_direct=4.0, fem_label="FEM")
    noter = " ".join(x.get("content", "") for x in b if x.get("type") == "note")
    assert "w_fin" in noter and "ikke eftervist" in noter
    assert find_check(b, "w_net,fin") is None


# ── Brand ───────────────────────────────────────────────────────────────────
# d_char,n = β_n·t + k₀·d₀ = 0,7·30 + 1,0·7 = 28 mm pr. brandpåvirket side.

def test_no_fire_section_unless_asked(client):
    assert find_check(beam(client), "Brand") is None


def test_a_45mm_rafter_burns_through_in_30_minutes(client):
    """
    2 · 28 = 56 mm > 45 mm. Uden en kontrol gav det b_fi = −11 mm, et negativt
    modstandsmoment og et forhold på −0,971, som blev trykt som "OK".
    """
    b = beam(client, h_mm=245.0, fire_t_min=30)
    chk = find_check(b, "resttværsnit")
    assert chk is not None and not passes(chk)
    noter = " ".join(x.get("content", "") for x in b if x.get("type") == "note")
    assert "brænder igennem" in noter


def test_a_glulam_beam_survives(client):
    b = beam(client, b_mm=115.0, h_mm=315.0, timber_grade="GL28h",
             gamma_M=1.25, fire_t_min=30)
    assert passes(find_check(b, "Brand bøjning"))
    assert passes(find_check(b, "Brand forskydning"))


def test_charring_depth_grows_with_time(client):
    def d_char(t):
        return value(beam(client, b_mm=140.0, h_mm=405.0, timber_grade="GL28h",
                          gamma_M=1.25, fire_t_min=t), "d_char,n")
    assert d_char(30) == pytest.approx(0.7 * 30 + 7, abs=0.2)
    assert d_char(60) == pytest.approx(0.7 * 60 + 7, abs=0.2)


def test_eta_fi_is_derived_from_the_loads(client):
    """
    η_fi = (g_k + ψ₁·q_k)/w_Ed. Brandkombinationen er G + A_d + ψ₁·Q₁ (DK NA
    tabel A1.3), og A_d er nul: branden virker gennem det reducerede tværsnit.
    """
    b = beam(client, b_mm=140.0, h_mm=405.0, timber_grade="GL28h",
             gamma_M=1.25, fire_t_min=30)
    noter = " ".join(x.get("content", "") for x in b if x.get("type") == "note")
    assert "η_fi" in noter
    fundet = float(re.search(r"= (0\.\d{3})\.", noter).group(1))
    forventet = (0.862 + 0.2 * 0.720) / value(b, "w_Ed")
    assert fundet == pytest.approx(forventet, abs=0.002)


def test_no_negative_utilisation_can_report_ok():
    """
    Generel vagt i CheckContext: et negativt forhold betyder at en af
    størrelserne har skiftet fortegn, og det er aldrig en lav udnyttelse.
    """
    from calc_core import CheckContext
    chk = CheckContext().check("Nonsens", -5.0, 10.0)
    assert chk["passes"] is False
    assert "negativt" in chk["value"]
