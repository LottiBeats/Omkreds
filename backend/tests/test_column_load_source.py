"""
test_column_load_source.py — en lastkombination som søjlelast

En lastkombinationsblok regner i den enhed, brugeren sætter den til, og den er
som standard kN/m. En søjles normalkraft er en kraft. Uden en kontrol blev en
linjelast på 8,0 kN/m til en normalkraft på 8,0 kN uden en lyd, og resten af
eftervisningen så fuldstændig rigtig ud — den slags kan ikke ses i dokumentet
bagefter, kun på at tallet er for lille.

En kombination i kN/m er ikke forkert. Den er bare ikke en søjlelast, og at
gange den med sit lastareal er en beslutning, ingeniøren skal tage.
"""
import pytest

TIMBER = {"label": "C1", "length_m": 3.0, "N_Ed_kN": 8.0,
          "b_mm": 120.0, "h_mm": 120.0, "timber_grade": "C24"}
STEEL = {"label": "SC1", "section": "HEB200", "grade": "S355",
         "length_m": 3.0, "N_Ed_kN": 8.0, "gamma_M1": 1.2}


@pytest.mark.parametrize("path,base", [
    ("/calc/timber-column", TIMBER),
    ("/calc/steel-column",  STEEL),
])
@pytest.mark.parametrize("unit", ["kN/m", "kN/m²", "kNm", "", "m"])
def test_a_non_force_combination_is_refused(client, path, base, unit):
    r = client.post(path, json={**base, "combo_label": "LC1", "combo_unit": unit})
    assert r.status_code == 422, f"{unit!r} blev accepteret som normalkraft"
    assert "kraft" in r.json()["detail"]


@pytest.mark.parametrize("path,base", [
    ("/calc/timber-column", TIMBER),
    ("/calc/steel-column",  STEEL),
])
@pytest.mark.parametrize("unit", ["kN", "N", "MN", "kn"])
def test_a_force_combination_is_accepted(client, path, base, unit):
    r = client.post(path, json={**base, "combo_label": "LC1", "combo_unit": unit})
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("path,base", [
    ("/calc/timber-column", TIMBER),
    ("/calc/steel-column",  STEEL),
])
def test_a_typed_in_force_is_never_blocked(client, path, base):
    """Vagten gælder kun, når lasten kommer fra en kombination."""
    assert client.post(path, json=base).status_code == 200


def test_the_source_is_named_in_the_document(client):
    """
    Står tallet fra en kombination, skal dokumentet sige hvilken. Ellers er
    der ingen vej tilbage til, hvor det kom fra.
    """
    blocks = client.post("/calc/steel-column", json={
        **STEEL, "combo_label": "LC2", "combo_unit": "kN"}).json()
    text = " ".join(str(v) for b in blocks for v in b.values() if isinstance(v, str))
    assert "LC2" in text
