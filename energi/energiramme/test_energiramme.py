"""
Test af energirammeværktøjet. Kræver regnearket fra sbst.dk (hentes) og LibreOffice
eller Excel til genberegning; ellers springes testene over.

    python -m pytest energi/energiramme/test_energiramme.py
"""
import os
import shutil
import sys

import pytest

HER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HER)
sys.path.insert(0, os.path.join(HER, "..", "rapport"))

import be_regneark as be  # noqa: E402

CACHE = os.environ.get("BE_SKABELON_MAPPE", os.path.join(HER, ".skabelon"))


@pytest.fixture(scope="module")
def skabelon():
    if not be._soffice():
        pytest.skip("LibreOffice ikke installeret")
    try:
        return be.hent_skabelon(CACHE)
    except Exception as e:  # ingen net
        pytest.skip("Kan ikke hente regnearket: %s" % e)


def test_orientering_og_haeldning():
    assert [be.orientering(a) for a in (0, 44, 46, 90, 180, 200, 270, 330, 359)] == \
        ["n", "nø", "nø", "ø", "s", "s", "v", "nv", "n"]
    assert be.haeldning(91) == 90 and be.haeldning(44) == 45 and be.haeldning(3) == 0


def test_regnearkets_eksempel_uaendret(skabelon, tmp_path):
    """Uændret eksempel genberegnet uden Excel skal give regnearkets eget resultat."""
    fil = str(tmp_path / "eksempel.xlsx")
    be.udfyld(skabelon, fil, {"forsyning": "regneark"})
    be.genberegn(fil)
    r = be.resultat(fil)
    assert abs(r["energirammer"]["BR18"]["behov"] - 45.64407736422052) < 1e-6
    assert abs(r["energirammer"]["BR18"]["ramme"] - 46.55555555555556) < 1e-9
    assert r["energirammer"]["BR18"]["opfyldt"]


def test_fra_honeybee_model(skabelon, tmp_path):
    import eksempel_eksport as ek
    import be_model
    data = be_model.fra_model(ek._testhus(), {"navn": "Testhus"})
    assert data["bygning"]["etageareal"] == 120.0
    assert {v["orientering"] for v in data["vinduer"]} == {"s"}
    assert any(k["navn"].startswith("Terrændæk") and k["inde"] == 30 for k in data["konstruktioner"])
    fil = str(tmp_path / "testhus.xlsx")
    be.udfyld(skabelon, fil, data)
    be.genberegn(fil)
    r = be.resultat(fil)
    br = r["energirammer"]["BR18"]
    assert r["etageareal_m2"] == 120
    assert 10 < br["behov"] < 200 and br["ramme"] > 0
