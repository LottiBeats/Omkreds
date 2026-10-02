"""
eksempel_eksport.py — laver en eksempel-eksportmappe, som gh_eksport.py ville skrive den,
så rapportlayoutet kan afprøves uden Rhino.

    python energi/rapport/eksempel_eksport.py <mappe>

Tallene for overtemperatur er fra eksempelhuset i Ladybug Tools (ikke Hjerlesvej).
Varmetabsrammen regnes på et 10 x 12 m testhus med 3 rum.
"""
import json
import sys
from pathlib import Path

HER = Path(__file__).resolve().parent
sys.path.insert(0, str(HER.parent / "model"))

import gh_eksport as ek          # noqa: E402
import gh_opbygninger as go      # noqa: E402
import ds418_varmetab as ds      # noqa: E402


def _testhus():
    from ladybug_geometry.geometry3d import Point3D, Polyface3D, Face3D
    from honeybee.model import Model
    from honeybee.room import Room
    from honeybee.aperture import Aperture
    from honeybee.boundarycondition import boundary_conditions as bcs
    rum = []
    for navn, x0, b in (("Stue og køkken", 0, 6), ("Soveværelse", 6, 3), ("Værelse", 9, 3)):
        pf = Polyface3D.from_box(b, 10, 2.8).move(Point3D(x0, 0, 0) - Point3D(0, 0, 0))
        r = Room.from_polyface3d("Rum_%d" % x0, pf, ground_depth=0.01)
        r.display_name = navn
        for f in r.faces:
            if f.type.name == "Wall" and f.normal.y < -0.9:
                f.apertures_by_ratio(0.6 if navn == "Stue og køkken" else 0.35, 0.01)
        rum.append(r)
    Room.solve_adjacency(rum, 0.01)
    return Model("Testhus", rum, tolerance=0.01)


def lav(mappe):
    mappe = Path(mappe)
    fil = str(HER.parent / "regler" / "opbygninger.txt")
    opb = go.rapport_data(fil, "Træskelet 300 + 45 installationslag", "Skråtag/A-hus 350 + 45",
                          "EPS 300 + beton 100, trægulv", "3-lag energi g50")
    u = dict((o["type"], o["U_W_m2K"]) for o in opb["opbygninger"])
    vt = ds.beregn(_testhus(), u="ydervaeg=%s, tag=%s, terraendaek=%s, vindue=%s" % (
        u["Ydervæg"], u["Tag"], u["Terrændæk"], opb["vindue"]["U_W_m2K"]))
    ot = {"graenser": [{"C": 27.0, "maks_timer": 100}, {"C": 28.0, "maks_timer": 25}],
          "rum": [{"rum": "Stue og køkken", "max_C": 31.1, "timer": {"over_27": 398, "over_28": 178}, "ok": False},
                  {"rum": "Soveværelse", "max_C": 27.9, "timer": {"over_27": 3, "over_28": 0}, "ok": True},
                  {"rum": "Værelse", "max_C": 28.3, "timer": {"over_27": 24, "over_28": 4}, "ok": True}],
          "ok": False}
    dl = ["Stue og køkken: 300 lux på 78 % af gulvarealet i 50 % af dagslystimerne - opfyldt",
          "Soveværelse: 300 lux på 61 % af gulvarealet - opfyldt",
          "Værelse: 300 lux på 55 % af gulvarealet - opfyldt"]
    res = ek.saml_resultater([go.til_json(opb), json.dumps(vt), ek.til_json(ot)] + dl,
                             ["opbygninger", "varmetab", "overtemperatur", "dagslys"], [])
    (mappe / "billeder").mkdir(parents=True, exist_ok=True)
    ek.skriv_tekst(str(mappe / "resultater.json"), ek.til_json(res))
    return mappe


if __name__ == "__main__":
    print(lav(sys.argv[1]))
