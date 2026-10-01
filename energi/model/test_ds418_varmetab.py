"""
Test af ds418_varmetab.py: et 10 x 10 x 3 m hus med 40 m2 glas (40 % af etagearealet).
Alle tal kan regnes efter i hånden.

    python -m pytest energi/model/test_ds418_varmetab.py
"""
from ladybug_geometry.geometry3d import Point3D, Polyface3D, Face3D
from honeybee.model import Model
from honeybee.room import Room
from honeybee.aperture import Aperture

import ds418_varmetab as ds


def _hus():
    room = Room.from_polyface3d("Hus", Polyface3D.from_box(10, 10, 3), ground_depth=0.01)
    syd = [f for f in room.faces if f.type.name == "Wall" and f.normal.y < -0.9][0]
    # 2 vinduer à 20 m2 (10 x 2 m) kan ikke være i en 10 x 3 m væg -> ét på syd, ét på nord
    nord = [f for f in room.faces if f.type.name == "Wall" and f.normal.y > 0.9][0]
    syd.add_aperture(Aperture("V1", Face3D([Point3D(0.5, 0, 0.5), Point3D(9.5, 0, 0.5),
                                            Point3D(9.5, 0, 2.722), Point3D(0.5, 0, 2.722)])))
    nord.add_aperture(Aperture("V2", Face3D([Point3D(9.5, 10, 0.5), Point3D(0.5, 10, 0.5),
                                             Point3D(0.5, 10, 2.722), Point3D(9.5, 10, 2.722)])))
    return Model("Test", [room], tolerance=0.01)


def test_arealer_og_ramme():
    d = ds.beregn(_hus(), u="ydervaeg=0.15, tag=0.10, terraendaek=0.10, vindue=0.80", gulvvarme=True)
    glas = 2 * 9 * 2.222
    assert abs(d["glasareal_m2"] - glas) < 0.1
    assert abs(d["opvarmet_etageareal_m2"] - 100) < 0.1
    assert d["glasandel_over_30"]
    assert abs(d["arealer_m2"]["ydervaeg"] - (120 - glas)) < 0.1
    assert abs(d["laengder_m"]["fundament"] - 40) < 0.1
    assert abs(d["laengder_m"]["vindue"] - 2 * 2 * (9 + 2.222)) < 0.1

    b = 20 / 32
    # Projekt: glas 0,80, væg 0,15, tag 0,10, terrændæk 0,10*b, psi vindue 0,03, fundament 0,15*b
    p = 0.8 * glas + 0.15 * (120 - glas) + 0.10 * 100 + 0.10 * 100 * b + 0.15 * 40 * b + 0.03 * 44.888
    assert abs(d["projekt_sum_W_K"] - p) < 0.5
    # Ramme: glas begrænset til 30 m2 a 1,80, resten som væg a 0,25
    r = 1.8 * 30 + 0.25 * (120 - glas + glas - 30) + 0.15 * 100 + 0.15 * 100 * b + 0.15 * 40 * b + 0.03 * 44.888 * 30 / glas
    assert abs(d["ramme_sum_W_K"] - r) < 0.5
    assert d["overholdt"]
