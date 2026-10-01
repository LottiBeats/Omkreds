"""
byg_hbmodel.py - geometri.json + model.yaml -> Honeybee-model (HBJSON)

    python energi/model/byg_hbmodel.py energi/projekter/hjerlesvej

Kører i almindelig Python 3 med honeybee-energy (følger med Ladybug Tools:
C:\\Users\\<dig>\\ladybug_tools\\python\\python.exe). Rhino skal ikke være åben.

Trin:
1. Rum fra lukkede volumener (lag RUM::<program>, objektnavn = rumnavn)
2. Fælles flader mellem rum findes (indre vægge og dæk)
3. Vinduer (lag GLAS::<type>) sættes i den væg eller det tag, de ligger på
4. Skygger (SKYGGE::*, AFSKAERMNING::*) tilføjes
5. Konstruktioner, interne laster, opvarmning og udluftning fra model.yaml
6. Modellen kontrolleres, og fejl skrives tydeligt ud
"""
import json
import math
import sys
from pathlib import Path

import yaml
from ladybug_geometry.geometry3d import Polyface3D, Face3D, Mesh3D
from honeybee.model import Model
from honeybee.room import Room
from honeybee.aperture import Aperture
from honeybee.shade import Shade
from honeybee.boundarycondition import Outdoors
from honeybee.facetype import Wall, RoofCeiling
from honeybee.typing import clean_string
from honeybee_energy.material.opaque import EnergyMaterial
from honeybee_energy.material.glazing import EnergyWindowMaterialSimpleGlazSys
from honeybee_energy.construction.opaque import OpaqueConstruction
from honeybee_energy.construction.window import WindowConstruction
from honeybee_energy.constructionset import ConstructionSet
from honeybee_energy.programtype import ProgramType
from honeybee_energy.load.people import People
from honeybee_energy.load.lighting import Lighting
from honeybee_energy.load.equipment import ElectricEquipment
from honeybee_energy.load.infiltration import Infiltration
from honeybee_energy.load.ventilation import Ventilation
from honeybee_energy.load.setpoint import Setpoint
from honeybee_energy.schedule.ruleset import ScheduleRuleset
from honeybee_energy.ventcool.control import VentilationControl
from honeybee_energy.ventcool.opening import VentilationOpening
from honeybee_energy.lib.scheduletypelimits import fractional, temperature

TOL = 0.01          # m
VINKEL_TOL = 1.0    # grader
PERSON_W = 120.0    # Honeybee regner personers varme pr. person


def _konstruktion(navn, lag):
    mat = [EnergyMaterial(f"{navn}_{i}_{n}", t, lam, rho, c) for i, (n, t, lam, rho, c) in enumerate(lag)]
    return OpaqueConstruction(navn, mat)


def _glas(navn, d):
    return WindowConstruction(navn, [EnergyWindowMaterialSimpleGlazSys(f"{navn}_sys", d["u"], d["g"], d["lt"])])


def _konstant(navn, vaerdi, typ):
    return ScheduleRuleset.from_constant_value(navn, vaerdi, typ)


def _program(navn, d):
    altid = _konstant("Altid", 1, fractional)
    return ProgramType(
        navn,
        people=People(f"{navn}_personer", d["personer_w_m2"] / PERSON_W, altid),
        lighting=Lighting(f"{navn}_lys", d["belysning_w_m2"], altid),
        electric_equipment=ElectricEquipment(f"{navn}_udstyr", d["udstyr_w_m2"], altid),
        infiltration=Infiltration(f"{navn}_infiltration", d["infiltration_l_s_m2_facade"] / 1000, altid),
        ventilation=Ventilation(f"{navn}_friskluft", flow_per_area=d["friskluft_l_s_m2"] / 1000),
        setpoint=Setpoint(f"{navn}_setpunkt",
                          _konstant(f"{navn}_varme", d["opvarmning_c"], temperature),
                          _konstant(f"{navn}_ingen_koeling", 99, temperature)),  # ingen køling: fri temperatur
    )


def _find_vaertsflade(rum, glas):
    """Den udvendige væg eller det tag, glasfladen ligger i. Returnerer (flade, glas vendt rigtigt)."""
    for r in rum:
        for f in r.faces:
            if not isinstance(f.boundary_condition, Outdoors) or not isinstance(f.type, (Wall, RoofCeiling)):
                continue
            prik = f.normal.dot(glas.normal)
            if abs(prik) < math.cos(math.radians(VINKEL_TOL)):
                continue
            if f.geometry.plane.distance_to_point(glas.center) > TOL:
                continue
            if not f.geometry.is_point_on_face(glas.center, TOL):
                continue
            return f, (glas if prik > 0 else glas.flip())
    return None, glas


def byg(projektmappe):
    projektmappe = Path(projektmappe)
    geo = json.loads((projektmappe / "geometri.json").read_text(encoding="utf-8"))
    cfg = yaml.safe_load((projektmappe / "model.yaml").read_text(encoding="utf-8"))
    skala = geo.get("skala_til_meter", 1.0)
    rapport, fejl = [], []

    # 1. Rum
    rum = []
    for i, r in enumerate(geo["rum"]):
        navn = r["navn"] or f"Rum_{i + 1}"
        pf = Polyface3D.from_dict(r["geometri"])
        if skala != 1:
            pf = pf.scale(skala)
        room = Room.from_polyface3d(clean_string(f"{navn}_{i}"), pf,
                                    roof_angle=cfg.get("tag_vinkel", 60),
                                    ground_depth=cfg.get("terraen_kote", 0))
        room.display_name = navn
        room.user_data = {"program": r.get("program") or cfg["standard_program"]}
        rum.append(room)
    rapport.append(f"Rum: {len(rum)}")

    # 2. Fælles flader
    Room.intersect_adjacency(rum, TOL, VINKEL_TOL)
    Room.solve_adjacency(rum, TOL)

    # 3. Vinduer
    glas_typer = {k: _glas(clean_string(f"Glas_{k}"), v) for k, v in cfg["glas"].items()}
    vent = cfg["udluftning"]
    n_glas = 0
    for g in geo["glas"]:
        gtype = g["type"] or cfg["standard_glas"]
        if gtype not in glas_typer:
            fejl.append(f"Glastype '{gtype}' findes ikke i model.yaml – bruger {cfg['standard_glas']}")
            gtype = cfg["standard_glas"]
        for j, fd in enumerate(g.get("flader", [])):
            f3 = Face3D.from_dict(fd)
            if skala != 1:
                f3 = f3.scale(skala)
            vaert, f3 = _find_vaertsflade(rum, f3)
            if vaert is None:
                fejl.append(f"Glas '{g['navn'] or gtype}' ligger ikke i en udvendig væg eller et tag")
                continue
            ap = Aperture(clean_string(f"{vaert.identifier}_glas_{n_glas}"), f3, is_operable=True)
            ap.properties.energy.construction = glas_typer[gtype]
            ap.properties.energy.vent_opening = VentilationOpening(vent["andel_oplukkelig"])
            vaert.add_aperture(ap)
            n_glas += 1
    rapport.append(f"Vinduer: {n_glas}")

    # 4. Skygger
    skygger = []
    trans = _konstant("Traeer_transmittans", cfg["skygge"]["traeer_transmittans"], fractional)
    for kat in ("skygge", "afskaermning"):
        for s in geo.get(kat, []):
            flader = [Face3D.from_dict(d) for d in s.get("flader", [])]
            for m in s.get("mesh", []):
                flader += [Face3D(m_f) for m_f in Mesh3D.from_dict(m).face_vertices]
            for f3 in flader:
                if skala != 1:
                    f3 = f3.scale(skala)
                sh = Shade(clean_string(f"{kat}_{s['type']}_{len(skygger)}"), f3)
                sh.user_data = {"kategori": kat, "type": s["type"]}
                if kat == "skygge" and s["type"].lower().startswith("trae"):
                    sh.properties.energy.transmittance_schedule = trans
                skygger.append(sh)
    rapport.append(f"Skyggeflader: {len(skygger)}")

    # 5. Energiegenskaber
    k = cfg["konstruktioner"]
    cset = ConstructionSet("Projekt_konstruktioner")
    cset.wall_set.exterior_construction = _konstruktion("Ydervaeg", k["ydervaeg"])
    cset.roof_ceiling_set.exterior_construction = _konstruktion("Tag", k["tag"])
    cset.floor_set.ground_construction = _konstruktion("Terraendaek", k["terraendaek"])
    cset.aperture_set.window_construction = glas_typer[cfg["standard_glas"]]
    programmer = {n: _program(clean_string(f"Program_{n}"), d) for n, d in cfg["programmer"].items()}
    styring = VentilationControl(min_indoor_temperature=vent["aabning_over_c"], delta_temperature=0)
    for r in rum:
        p = r.user_data["program"]
        if p not in programmer:
            fejl.append(f"Program '{p}' for rum '{r.display_name}' findes ikke i model.yaml – bruger {cfg['standard_program']}")
            p = cfg["standard_program"]
        r.properties.energy.program_type = programmer[p]
        r.properties.energy.construction_set = cset
        r.properties.energy.add_default_ideal_air()
        r.properties.energy.window_vent_control = styring

    model = Model(clean_string(projektmappe.name), rum, orphaned_shades=skygger,
                  units="Meters", tolerance=TOL, angle_tolerance=VINKEL_TOL)

    # 6. Kontrol
    kontrol = model.check_all(raise_exception=False)
    if kontrol:
        fejl.append("Honeybee-kontrol:\n" + kontrol)

    ud = projektmappe / "model.hbjson"
    ud.write_text(json.dumps(model.to_dict()), encoding="utf-8")
    rapport.append(f"Skrevet: {ud}")
    return model, rapport, fejl


if __name__ == "__main__":
    model, rapport, fejl = byg(sys.argv[1] if len(sys.argv) > 1 else ".")
    print("\n".join(rapport))
    if fejl:
        print("\nFEJL/ADVARSLER:\n" + "\n".join(fejl))
        sys.exit(1)
