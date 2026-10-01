# -*- coding: utf-8 -*-
"""
gh_eksport_geometri.py - Grasshopper-komponent: Rhino-lag -> geometri.json

Sæt koden i en GhPython-komponent (IronPython 2, ikke Python 3).
Input:  _mappe     (str)   projektmappen, fx C:\\...\\energi\\projekter\\hjerlesvej
        _eksporter (bool)  sæt til True for at skrive filen
Output: rapport    (str)   hvad der blev fundet, og evt. fejl

Komponenten læser KUN geometri og lagnavne. Al logik (rum, vinduer,
konstruktioner, beregning) ligger i byg_hbmodel.py, som kører uden for Rhino.
Tegnekonventionen står i README.md i samme mappe.
"""
from __future__ import unicode_literals

import json
import os

import Rhino
from ladybug_rhino.togeometry import to_polyface3d, to_face3d, to_mesh3d

KATEGORIER = ("RUM", "GLAS", "SKYGGE", "AFSKAERMNING")


def _lag(doc, obj):
    sti = doc.Layers[obj.Attributes.LayerIndex].FullPath
    dele = sti.split("::")
    return dele[0].upper(), (dele[1] if len(dele) > 1 else "")


def _som_brep(geo):
    if isinstance(geo, Rhino.Geometry.Extrusion):
        return geo.ToBrep()
    return geo


def eksporter(mappe):
    doc = Rhino.RhinoDoc.ActiveDoc
    skala = Rhino.RhinoMath.UnitScale(doc.ModelUnitSystem, Rhino.UnitSystem.Meters)
    data = {"skala_til_meter": skala, "rum": [], "glas": [], "skygge": [], "afskaermning": []}
    fejl, antal = [], {k: 0 for k in KATEGORIER}

    for obj in doc.Objects:
        if obj.IsDeleted or not obj.Visible:
            continue
        kat, under = _lag(doc, obj)
        if kat not in KATEGORIER:
            continue
        navn = obj.Attributes.Name or ""
        geo = _som_brep(obj.Geometry)
        try:
            if kat == "RUM":
                if not (isinstance(geo, Rhino.Geometry.Brep) and geo.IsSolid):
                    fejl.append("RUM '%s' på lag %s er ikke et lukket volumen" % (navn, under))
                    continue
                pf = to_polyface3d(geo)
                data["rum"].append({"navn": navn, "program": under, "geometri": pf.to_dict()})
            else:
                if isinstance(geo, Rhino.Geometry.Mesh):
                    flader = [f.to_dict() for f in [to_mesh3d(geo)]]
                    noegle = "mesh"
                else:
                    flader = [f.to_dict() for f in to_face3d(geo)]
                    noegle = "flader"
                data[kat.lower()].append({"type": under, "navn": navn, noegle: flader})
            antal[kat] += 1
        except Exception as e:
            fejl.append("%s '%s' (%s): %s" % (kat, navn, under, e))

    sti = os.path.join(mappe, "geometri.json")
    with open(sti, "w") as f:
        json.dump(data, f)
    linjer = ["Skrevet: %s" % sti] + ["%s: %d" % (k, antal[k]) for k in KATEGORIER]
    if fejl:
        linjer += ["", "FEJL:"] + fejl
    return "\n".join(linjer)


if _eksporter and _mappe:
    rapport = eksporter(_mappe)
else:
    rapport = "Angiv _mappe og sæt _eksporter til True"
