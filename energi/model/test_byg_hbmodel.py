"""
Test af byg_hbmodel.py uden Rhino: to rum side om side, et vindue mod syd,
et ovenlys og et træ, skrevet som den geometri.json Grasshopper laver.

    python -m pytest energi/model/test_byg_hbmodel.py
"""
import json
import shutil
from pathlib import Path

from ladybug_geometry.geometry3d import Point3D, Polyface3D, Face3D

import byg_hbmodel

HER = Path(__file__).resolve().parent
MODEL_YAML = HER.parents[0] / "projekter" / "hjerlesvej" / "model.yaml"


def _kasse(x0, y0, dx, dy, h):
    return Polyface3D.from_box(dx, dy, h, base_plane=None).move(
        Point3D(x0, y0, 0) - Point3D(0, 0, 0))


def _skoaeske(mappe: Path):
    rum1 = _kasse(0, 0, 4, 4, 3)          # 4 x 4 m, syd = y=0
    rum2 = _kasse(4, 0, 4, 4, 3)          # nabo mod øst
    vindue = Face3D([Point3D(1, 0, 0.5), Point3D(3, 0, 0.5), Point3D(3, 0, 2.5), Point3D(1, 0, 2.5)])
    ovenlys = Face3D([Point3D(5, 1, 3), Point3D(6, 1, 3), Point3D(6, 2, 3), Point3D(5, 2, 3)])
    trae = Face3D([Point3D(0, -3, 0), Point3D(4, -3, 0), Point3D(4, -3, 6), Point3D(0, -3, 6)])
    data = {
        "skala_til_meter": 1.0,
        "rum": [{"navn": "Soverum 1. sal", "program": "bolig", "geometri": rum1.to_dict()},
                {"navn": "Hal", "program": "bolig", "geometri": rum2.to_dict()}],
        "glas": [{"type": "3lag_g050", "navn": "SV-gavl", "flader": [vindue.to_dict()]},
                 {"type": "3lag_g035", "navn": "Ovenlys", "flader": [ovenlys.to_dict()]}],
        "skygge": [{"type": "traeer", "navn": "Eg", "flader": [trae.to_dict()]}],
        "afskaermning": [],
    }
    (mappe / "geometri.json").write_text(json.dumps(data), encoding="utf-8")
    shutil.copy(MODEL_YAML, mappe / "model.yaml")


def test_skoaeske(tmp_path):
    _skoaeske(tmp_path)
    model, rapport, fejl = byg_hbmodel.byg(tmp_path)

    assert not fejl, fejl
    assert len(model.rooms) == 2
    assert len(model.apertures) == 2
    assert len(model.orphaned_shades) == 1
    # Væggen mellem de to rum er indvendig (Surface), ikke udvendig
    bc = [f.boundary_condition.name for r in model.rooms for f in r.faces]
    assert bc.count("Surface") == 2
    # Gulvet ligger på jord
    assert bc.count("Ground") == 2
    # Ovenlyset sidder i taget på hallen
    hal = [r for r in model.rooms if r.display_name == "Hal"][0]
    assert any(f.apertures for f in hal.faces if f.type.name == "RoofCeiling")
    assert (tmp_path / "model.hbjson").exists()
