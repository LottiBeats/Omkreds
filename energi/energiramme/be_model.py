# -*- coding: utf-8 -*-
"""
be_model.py - data til energirammeregnearket (be_regneark.udfyld) fra en Honeybee-model.

Klimaskærmen (flader, vinduer pr. orientering og hældning, linjetab) tages fra modellen.
Det, modellen ikke kender (bygningstype, varmekapacitet, ventilation, forsyning, rudeandel,
skygger), kommer fra projektets indstillinger:

    indstillinger = {
      "navn": "Hus", "type": "F", "varmekapacitet": 80, "brugstid": 168,
      "gulvvarme": True, "psi": {"fundament": 0.15, "vindue": 0.03, "ovenlys": 0.10},
      "rudeandel": 0.75,                  # FF: glasandel i vinduet
      "skygge": {"horisont": 10, "vindueshul": 5},
      "ventilation": {"qvm": 0.3, "hvgv": 0.85, "sel": 0.8, "qid": 0.13, ...},
      "intern": {"personer": 1.5, "udstyr": 3.5},
      "forsyning": "fjernvarme", "celler": {...}
    }
"""
from __future__ import division, unicode_literals

import math
import os
import sys
from collections import OrderedDict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "model"))
import ds418_varmetab as ds  # noqa: E402
from be_regneark import haeldning, orientering  # noqa: E402

NAVNE = {"ydervaeg": "Ydervæg", "tag": "Tag", "terraendaek": "Terrændæk", "gulv_ude": "Gulv mod det fri"}

# Standardværdier (svarer til en ny bolig med mekanisk ventilation og varmegenvinding)
STANDARD = {
    "type": "F", "varmekapacitet": 80, "brugstid": 168, "gulvvarme": True, "rudeandel": 0.75,
    "skygge": {"horisont": 10, "vindueshul": 5},
    "ventilation": {"fo": 1, "qvm": 0.30, "hvgv": 0.85, "tind": 18, "elvf": "n", "qid": 0.13, "qis": 0,
                    "sel": 0.8, "sommer_qvm": 0.30, "sommer_qid": 0.9, "nat_qvm": 0, "nat_qis": 0, "koeling": 0},
    "intern": {"personer": 1.5, "udstyr": 3.5, "udstyr_nat": 0},
    "forsyning": "fjernvarme",
}


def _flet(a, b):
    ud = dict(a)
    for k, v in (b or {}).items():
        ud[k] = _flet(a[k], v) if isinstance(v, dict) and isinstance(a.get(k), dict) else v
    return ud


def azimut(normal, nord=0.0):
    """Kompasretning (0 = nord, 90 = øst) for en flades normal. nord = vinkel mod uret fra +Y
    til nord, som Ladybugs north-input."""
    a = math.degrees(math.atan2(normal.x, normal.y))
    return (a + nord) % 360


def fra_model(model, indstillinger=None, nord=0.0):
    """Honeybee-model -> data til be_regneark.udfyld()."""
    ind = _flet(STANDARD, indstillinger)
    psi = dict(ds.STANDARD_PSI)
    psi.update(ind.get("psi") or {})
    gulvvarme = ind.get("gulvvarme")

    flader = OrderedDict()             # (kategori, konstruktion) -> [areal, U]
    vinduer = OrderedDict()            # (orientering, hældning, konstruktion) -> [areal, U, g]
    laengde = {"fundament": 0.0, "vindue": 0.0, "ovenlys": 0.0}
    a_et = 0.0
    for room in model.rooms:
        a_et += room.floor_area
        for f in room.faces:
            kat = ds._kategori(f)
            if kat is None:
                continue
            subs = list(f.apertures) + list(f.doors)
            a_opak = f.area - sum(s.area for s in subs)
            c = f.properties.energy.construction
            post = flader.setdefault((kat, c.display_name), [0.0, c.u_factor])
            post[0] += a_opak
            for s in subs:
                cs = s.properties.energy.construction
                n = s.normal
                tilt = math.degrees(math.acos(max(-1.0, min(1.0, n.z))))
                key = (orientering(azimut(n, nord)), haeldning(tilt), cs.display_name)
                g = getattr(cs, "shgc", None) or getattr(cs, "solar_transmittance", None)
                v = vinduer.setdefault(key, [0.0, cs.u_factor, g])
                v[0] += s.area
                laengde["ovenlys" if kat == "tag" else "vindue"] += s.geometry.perimeter
        laengde["fundament"] += ds._fundamentslaengde(room)

    konst = []
    for (kat, navn), (a, u) in flader.items():
        if a <= 0.01:
            continue
        post = {"navn": "%s: %s" % (NAVNE.get(kat, kat), navn), "areal": round(a, 2), "u": round(u, 3)}
        if kat == "terraendaek" and gulvvarme:
            post.update({"inde": 30, "ude": 10})
        elif kat == "terraendaek":
            post.update({"ude": 10})
        konst.append(post)
    linjer = []
    for n, titel in (("fundament", "Fundament"), ("vindue", "Samling om vinduer og døre"),
                     ("ovenlys", "Samling om ovenlys")):
        if laengde[n] > 0.01:
            post = {"navn": titel, "laengde": round(laengde[n], 2), "psi": psi[n]}
            if n == "fundament":
                post.update({"inde": 30, "ude": 10} if gulvvarme else {"ude": 10})
            linjer.append(post)
    vind = []
    for (ori, tilt, navn), (a, u, g) in vinduer.items():
        vind.append({"navn": "%s, %s, %d°" % (navn, ori.upper(), tilt), "antal": 1, "orientering": ori,
                     "haeldning": tilt, "areal": round(a, 2), "u": round(u, 3), "ff": ind["rudeandel"],
                     "g": round(g, 3) if g else None, "skygge": 1, "fc": 1})
    sk = ind["skygge"]
    a_et = round(a_et, 1)
    vent = dict(ind["ventilation"], navn="Hele huset", areal=a_et)
    intern = dict(ind["intern"], navn="Hele huset", areal=a_et)
    return {
        "bygning": {"navn": ind.get("navn") or "Projekt", "type": ind["type"], "etageareal": a_et,
                    "bebygget": ind.get("bebygget") or a_et, "varmekapacitet": ind["varmekapacitet"],
                    "brugstid": ind["brugstid"], "boligenheder": ind.get("boligenheder", 1)},
        "konstruktioner": konst, "linjetab": linjer, "vinduer": vind,
        "skygger": [{"navn": "Standard", "horisont": sk.get("horisont", 0), "udhaeng": sk.get("udhaeng", 0),
                     "venstre": sk.get("venstre", 0), "hoejre": sk.get("hoejre", 0),
                     "vindueshul": sk.get("vindueshul", 0)}],
        "ventilation": [vent], "intern": [intern],
        "forsyning": ind["forsyning"], "celler": ind.get("celler") or {},
    }
