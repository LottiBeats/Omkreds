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
    from honeybee_energy.ventcool.opening import VentilationOpening
    from honeybee_energy.ventcool.control import VentilationControl
    for r in rum:        # som HB Window Opening + HB Ventilation Control
        r.properties.energy.window_vent_control = VentilationControl(24, 100, 12, 100, 1)
        for f in r.faces:
            for ap in f.apertures:
                ap.is_operable = True
                ap.properties.energy.vent_opening = VentilationOpening(0.3, 1.0, 0.35)
    return Model("Testhus", rum, tolerance=0.01)


def _syntetiske_temperaturer():
    """Syntetisk vejr og rumtemperaturer (ikke simuleret) - kun til at afprøve figurerne."""
    import math
    import random
    random.seed(1)
    ude, rum = [], {"Stue og køkken": [], "Soveværelse": [], "Værelse": []}
    sol = {"Stue og køkken": 7.5, "Soveværelse": 4.2, "Værelse": 5.0}
    for t in range(8760):
        dag, time = t // 24, t % 24
        aar = math.sin(2 * math.pi * (dag - 110) / 365.0)
        doegn = math.sin(2 * math.pi * (time - 9) / 24.0)
        u = 8 + 8 * aar + 4 * doegn + random.gauss(0, 1.5)
        ude.append(u)
        solfaktor = max(0.0, doegn) * max(0.0, aar + 0.3)
        for n in rum:
            rum[n].append(max(20.5 + 0.6 * random.random(), 0.45 * u + 12.5 + sol[n] * solfaktor))
    return ude, rum


def lav(mappe):
    mappe = Path(mappe)
    fil = str(HER.parent / "regler" / "opbygninger.txt")
    opb = go.rapport_data(fil, "Træskelet 300 + 45 installationslag", "Skråtag/A-hus 350 + 45",
                          "EPS 300 + beton 100, trægulv", "3-lag energi g50")
    u = dict((o["type"], o["U_W_m2K"]) for o in opb["opbygninger"])
    vt = ds.beregn(_testhus(), u="ydervaeg=%s, tag=%s, terraendaek=%s, vindue=%s" % (
        u["Ydervæg"], u["Tag"], u["Terrændæk"], opb["vindue"]["U_W_m2K"]))
    import gh_overtemperatur as otm
    ude, rum = _syntetiske_temperaturer()
    ot = otm.beregn([rum[n] for n in rum], navne=list(rum), ude=ude, med_serier=True)
    import gh_dagslys as gd
    dl = [gd.til_json(gd.beregn([78.0, 61.0, 44.0], list(rum)))]
    res = ek.saml_resultater([go.til_json(opb), json.dumps(vt), ek.til_json(ot)] + dl,
                             ["opbygninger", "varmetab", "overtemperatur", "dagslys"], [])
    (mappe / "billeder").mkdir(parents=True, exist_ok=True)
    (mappe / "scenarier").mkdir(exist_ok=True)
    for navn, faktor in (("1 Som tegnet", 1.0), ("2 Solafskærmende glas (g 0,35)", 0.62),
                         ("3 Glas g 0,35 og udhæng 0,8 m", 0.30), ("4 Forsigtig udluftning", 1.45)):
        o = {"graenser": ot["graenser"], "rum": [dict(r, timer={k: int(v * faktor) for k, v in r["timer"].items()})
                                                 for r in ot["rum"]]}
        for r in o["rum"]:
            r["ok"] = r["timer"]["over_27"] <= 100 and r["timer"]["over_28"] <= 25
        o["ok"] = all(r["ok"] for r in o["rum"])
        ek.skriv_tekst(str(mappe / "scenarier" / (ek._filnavn(navn) + ".json")),
                       ek.til_json({"scenarie": navn, "overtemperatur": o}))
    ek.skriv_tekst(str(mappe / "resultater.json"), ek.til_json(res))
    return mappe


if __name__ == "__main__":
    print(lav(sys.argv[1]))
