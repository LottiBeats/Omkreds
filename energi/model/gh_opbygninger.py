# -*- coding: utf-8 -*-
"""
gh_opbygninger.py - vælg standardopbygninger i rullemenuer og få et færdigt
Honeybee ConstructionSet.

Erstatter hele kæden HB Opaque Material -> HB Opaque Construction -> subsets ->
HB ConstructionSet. Opbygningerne står i en tekstfil (energi/regler/opbygninger.txt),
som I selv retter og udvider.

Scriptet bruger ikke Honeybee selv og virker derfor i alle Rhino 8's
script-komponenter (Script/IronPython 2/Python 3) og i den gamle GhPython.

Inputs (Item Access, Type hint: str):
    _fil          ENTEN et Panel med hele indholdet af opbygninger.txt (så ligger
                  biblioteket i .gh-filen; sæt _fil til List Access)
                  ELLER stien til opbygninger.txt (fuld sti, relativ til .gh-filen,
                  eller tom: opbygninger.txt ved siden af .gh-filen).
    _ydervaeg     navn på opbygning   } står de tomme, laver komponenten selv
    _tag          navn på opbygning   } en rullemenu med opbygningerne i filen
    _terraendaek  navn på opbygning   }
    _vindue       navn på vindue      }
Outputs:
    constr_set    tekst -> HB String to Object (_hb_str) -> _constr_set_ på HB Room from Solid
    info          tekst til et Panel: lag og U-værdier (ISO 6946)
    mod_set       tekst -> HB String to Object -> _mod_set_ på HB Room from Solid.
                  Samme vindue som i constr_set, så dagslys og energi bruger samme glas.
    vindue        vinduets lystransmittans (LT), fx til _trans på HB Glass Modifier
    program       tekst -> HB String to Object -> _program_ på HB Room from Solid.
                  Interne laster og setpunkter. Valgfrit input _program vælger et
                  [program: ...] i biblioteket; uden det bruges SBi 213 (bolig).
"""
from __future__ import division, unicode_literals

import io

TYPER = ["ydervaeg", "tag", "terraendaek", "vindue"]
ALLE_TYPER = TYPER + ["program"]   # program = interne laster og setpunkter (Honeybee ProgramType)

# Bruges, når der ikke er valgt et [program: ...] i biblioteket. SBi-anvisning 213 (boliger), BR18 § 443.
STANDARD_PROGRAM = ("Bolig (SBi 213)", [
    ("personer_w_m2", 1.5), ("udstyr_w_m2", 3.5), ("belysning_w_m2", 0.0),
    ("friskluft_l_s_m2", 0.3), ("infiltration_l_s_m2_facade", 0.1), ("opvarmning_c", 20.0)])
PERSON_W = 120.0   # Honeybees standard: varme pr. person (siddende voksen)


def _ascii(tekst):
    for a, b in (("æ", "ae"), ("ø", "oe"), ("å", "aa"), ("Æ", "Ae"), ("Ø", "Oe"), ("Å", "Aa")):
        tekst = tekst.replace(a, b)
    return tekst


def _id(tekst):
    """Som honeybee.typing.clean_ep_string: kun ASCII, uden , ; ! og linjeskift."""
    val = "".join(ch for ch in _ascii(tekst) if ord(ch) < 128)
    for ch in ",;!\n\t":
        val = val.replace(ch, "")
    return val.strip()[:100]


def er_indhold(fil):
    """True, hvis _fil er selve biblioteket (tekst fra et Panel) og ikke en sti."""
    return bool(fil) and ("\n" in fil or "[materialer]" in fil.lower())


def _laes_tekst(fil):
    """Hele biblioteket som tekst: enten indholdet direkte (Panel) eller filen på stien.
    IronPython 2's codecs fejler på UTF-8, så filer læses med .NET."""
    if er_indhold(fil):
        return fil
    try:
        import System
        return str(System.IO.File.ReadAllText(fil, System.Text.Encoding.UTF8))
    except ImportError:
        with io.open(fil, encoding="utf-8-sig") as f:
            return f.read()


def laes(fil):
    """Læser filen -> (materialer, opbygninger).
    materialer:  {navn_lower: (navn, lambda, densitet, varmefylde)}
    opbygninger: {type: [(navn, [(felt1, felt2), ...]), ...]} i filens rækkefølge"""
    materialer, opbygninger = {}, dict((t, []) for t in ALLE_TYPER)
    afsnit, aktuel = None, None
    for nr, linje in enumerate(_laes_tekst(fil).splitlines(), 1):
        linje = linje.strip()
        if not linje or linje.startswith("#"):
            continue
        if linje.startswith("[") and linje.endswith("]"):
            hoved = linje[1:-1].strip()
            if hoved.lower() == "materialer":
                afsnit = "materialer"
                continue
            if ":" not in hoved:
                raise ValueError("Linje %d: skriv [type: navn], fx [ydervæg: Træskelet 250]" % nr)
            typ, navn = [s.strip() for s in hoved.split(":", 1)]
            typ = _ascii(typ.lower())
            if typ not in opbygninger:
                raise ValueError("Linje %d: ukendt type '%s' (brug ydervæg, tag, terrændæk, vindue, program)" % (nr, typ))
            aktuel = (navn, [])
            opbygninger[typ].append(aktuel)
            afsnit = typ
            continue
        felter = [s.strip() for s in linje.split("|")]
        if afsnit == "materialer":
            if len(felter) != 4:
                raise ValueError("Linje %d: materiale skal have 4 felter: navn | lambda | densitet | varmefylde" % nr)
            materialer[felter[0].lower()] = (felter[0], float(felter[1]), float(felter[2]), float(felter[3]))
        elif aktuel is not None:
            if len(felter) != 2:
                raise ValueError("Linje %d: skriv  materiale | tykkelse mm  (eller u/g/lt | tal for vinduer)" % nr)
            aktuel[1].append((felter[0], float(felter[1].replace(",", "."))))
        else:
            raise ValueError("Linje %d står uden for et afsnit" % nr)
    return materialer, opbygninger


def _find(opbygninger, typ, navn):
    for n, lag in opbygninger[typ]:
        if n.lower() == navn.strip().lower():
            return n, lag
    raise ValueError("Ukendt %s '%s'. Vælg fra listen." % (typ, navn))


# Overgangsmodstande efter DS/EN ISO 6946 (til info-panelet)
RSI_RSE = {"ydervaeg": (0.13, 0.04), "tag": (0.10, 0.04), "terraendaek": (0.17, 0.04)}


def byg_opak(navn, lag, materialer, typ="ydervaeg"):
    """Returnerer (Honeybee-dict for OpaqueConstruction, U-værdi efter ISO 6946)."""
    mats, r_sum = [], 0.0
    for mat_navn, t_mm in lag:
        m = materialer.get(mat_navn.lower())
        if m is None:
            raise ValueError("'%s' i '%s' findes ikke under [materialer]" % (mat_navn, navn))
        n, lam, rho, c = m
        vist = "%s %g mm" % (n, t_mm)
        mats.append({"type": "EnergyMaterial", "identifier": _id(vist), "display_name": vist,
                     "roughness": "MediumRough", "thickness": t_mm / 1000.0, "conductivity": lam,
                     "density": rho, "specific_heat": c, "thermal_absorptance": 0.9,
                     "solar_absorptance": 0.7, "visible_absorptance": 0.7})
        r_sum += t_mm / 1000.0 / lam
    rsi, rse = RSI_RSE.get(typ, (0.13, 0.04))
    d = {"type": "OpaqueConstruction", "identifier": _id(navn), "display_name": navn, "materials": mats}
    return d, 1.0 / (rsi + r_sum + rse)


def byg_vindue(navn, felter):
    """Returnerer Honeybee-dict for WindowConstruction (simpelt glassystem)."""
    v = dict((k.lower(), x) for k, x in felter)
    for k in ("u", "g", "lt"):
        if k not in v:
            raise ValueError("Vinduet '%s' mangler '%s'" % (navn, k))
    glas = {"type": "EnergyWindowMaterialSimpleGlazSys", "identifier": _id(navn + " glas"),
            "u_factor": v["u"], "shgc": v["g"], "vt": v["lt"]}
    return {"type": "WindowConstruction", "identifier": _id(navn), "display_name": navn,
            "materials": [glas]}, v


def byg_saet(fil, ydervaeg, tag, terraendaek, vindue):
    """Returnerer (ConstructionSet som Honeybee-dict, infotekst).
    Dict'en bliver til et rigtigt ConstructionSet via HB String to Object."""
    materialer, opb = laes(fil)
    cs = {"type": "ConstructionSet", "identifier": "Projekt_konstruktioner"}
    linjer = []
    for typ, titel, saet, felt in (
            ("ydervaeg", "Ydervæg", "wall_set", "exterior_construction"),
            ("tag", "Tag", "roof_ceiling_set", "exterior_construction"),
            ("terraendaek", "Terrændæk", "floor_set", "ground_construction")):
        navn = {"ydervaeg": ydervaeg, "tag": tag, "terraendaek": terraendaek}[typ]
        if not navn:
            linjer.append("%s: (ikke valgt - Honeybee-standard)" % titel)
            continue
        n, lag = _find(opb, typ, navn)
        d, u = byg_opak(n, lag, materialer, typ)
        cs[saet] = {"type": {"wall_set": "WallConstructionSet", "roof_ceiling_set": "RoofCeilingConstructionSet",
                             "floor_set": "FloorConstructionSet"}[saet], felt: d}
        linjer.append("%s: %s   U = %.3f W/m2K" % (titel, n, u))
        for m in d["materials"]:
            linjer.append("    %-32s R = %.2f" % (m["display_name"], m["thickness"] / m["conductivity"]))
    if vindue:
        n, felter = _find(opb, "vindue", vindue)
        d, v = byg_vindue(n, felter)
        cs["aperture_set"] = {"type": "ApertureConstructionSet", "window_construction": d,
                              "operable_construction": d, "skylight_construction": d}
        cs["door_set"] = {"type": "DoorConstructionSet", "exterior_glass_construction": d}
        linjer.append("Vindue: %s   U = %.2f  g = %.2f  LT = %.2f" % (n, v["u"], v["g"], v["lt"]))
    else:
        linjer.append("Vindue: (ikke valgt - Honeybee-standard)")
    return cs, "\n".join(linjer)


def _skema(navn, vaerdi, graense):
    """Konstant årsskema som Honeybee ScheduleRuleset-dict."""
    graenser = {
        "Fractional": {"type": "ScheduleTypeLimit", "identifier": "Fractional", "lower_limit": 0.0,
                       "upper_limit": 1.0, "numeric_type": "Continuous", "unit_type": "Dimensionless"},
        "Temperature": {"type": "ScheduleTypeLimit", "identifier": "Temperature", "lower_limit": -273.15,
                        "upper_limit": {"type": "NoLimit"}, "numeric_type": "Continuous",
                        "unit_type": "Temperature"},
        "Activity Level": {"type": "ScheduleTypeLimit", "identifier": "Activity Level", "lower_limit": 0.0,
                           "upper_limit": {"type": "NoLimit"}, "numeric_type": "Continuous",
                           "unit_type": "ActivityLevel"},
    }
    dag = navn + "_dag"
    return {"type": "ScheduleRuleset", "identifier": navn,
            "day_schedules": [{"type": "ScheduleDay", "identifier": dag, "values": [float(vaerdi)],
                               "times": [[0, 0]], "interpolate": False}],
            "default_day_schedule": dag, "schedule_type_limit": graenser[graense]}


def byg_program(fil, valg):
    """Returnerer (Honeybee ProgramType-dict, infotekst). valg = navn på [program: ...] i
    biblioteket; tomt -> STANDARD_PROGRAM (SBi 213). Laster er konstante hele året."""
    if valg:
        n, felter = _find(laes(fil)[1], "program", valg)
    else:
        n, felter = STANDARD_PROGRAM
    v = dict(STANDARD_PROGRAM[1])
    v.update(dict((k.lower(), x) for k, x in felter))
    pid = _id(n).replace(" ", "_")
    altid = _skema("Altid", 1, "Fractional")
    prog = {
        "type": "ProgramType", "identifier": pid, "display_name": n,
        "people": {"type": "People", "identifier": pid + "_personer",
                   "people_per_area": v["personer_w_m2"] / PERSON_W, "occupancy_schedule": altid,
                   "activity_schedule": _skema("Aktivitet_120W", PERSON_W, "Activity Level"),
                   "radiant_fraction": 0.3, "latent_fraction": {"type": "Autocalculate"}},
        "lighting": {"type": "Lighting", "identifier": pid + "_lys", "watts_per_area": v["belysning_w_m2"],
                     "schedule": altid, "return_air_fraction": 0.0, "radiant_fraction": 0.32,
                     "visible_fraction": 0.25},
        "electric_equipment": {"type": "ElectricEquipment", "identifier": pid + "_udstyr",
                               "watts_per_area": v["udstyr_w_m2"], "schedule": altid,
                               "radiant_fraction": 0.0, "latent_fraction": 0.0, "lost_fraction": 0.0},
        "infiltration": {"type": "Infiltration", "identifier": pid + "_infiltration",
                         "flow_per_exterior_area": v["infiltration_l_s_m2_facade"] / 1000.0, "schedule": altid},
        "ventilation": {"type": "Ventilation", "identifier": pid + "_friskluft",
                        "flow_per_area": v["friskluft_l_s_m2"] / 1000.0},
        "setpoint": {"type": "Setpoint", "identifier": pid + "_setpunkt",
                     "heating_schedule": _skema(pid + "_varme", v["opvarmning_c"], "Temperature"),
                     # ingen køling: setpunkt 99 °C, så temperaturen svinger frit om sommeren
                     "cooling_schedule": _skema(pid + "_ingen_koeling", 99, "Temperature")},
    }
    info = ("Program: %s   personer %.1f W/m2, udstyr %.1f W/m2, lys %.1f W/m2, "
            "friskluft %.2f l/s m2, infiltration %.2f l/s m2 facade, varme %g C, ingen køling") % (
        n, v["personer_w_m2"], v["udstyr_w_m2"], v["belysning_w_m2"], v["friskluft_l_s_m2"],
        v["infiltration_l_s_m2_facade"], v["opvarmning_c"])
    return prog, info


def _transmissivitet(t):
    """Glassets transmittans (databladets LT) -> Radiance-transmissivitet (samme formel som honeybee-radiance)."""
    import math
    if t <= 0:
        return 0.0
    v = (math.sqrt(0.8402528435 + 0.0072522239 * t ** 2) - 0.9166530661) / 0.0036261119 / t
    return max(v, 0.0)


def byg_modifier_saet(fil, vindue):
    """Returnerer (Radiance ModifierSet som Honeybee-dict, LT). Kun glasset sættes; vægge,
    gulve og lofter beholder Honeybees standardreflektanser (0,5 / 0,2 / 0,8)."""
    ms = {"type": "ModifierSet", "identifier": "Projekt_modifiers"}
    if not vindue:
        return ms, None
    n, felter = _find(laes(fil)[1], "vindue", vindue)
    lt = dict((k.lower(), x) for k, x in felter)["lt"]
    tau = _transmissivitet(lt)
    rad_id = "".join(ch if ch.isalnum() or ch in "_-." else "_" for ch in _id(n + " glas LT%g" % lt))
    glas = {"type": "Glass", "identifier": rad_id, "display_name": n, "modifier": None, "dependencies": [],
            "r_transmissivity": tau, "g_transmissivity": tau, "b_transmissivity": tau, "refraction_index": None}
    ms["aperture_set"] = {"type": "ApertureModifierSet", "window_modifier": glas,
                          "operable_modifier": glas, "skylight_modifier": glas}
    ms["door_set"] = {"type": "DoorModifierSet", "exterior_glass_modifier": glas}
    return ms, lt


def til_json(x):
    """Enkel JSON-skriver. IronPython 2's json-modul fejler på æ/ø/å, så alt ikke-ASCII skrives som \\uXXXX."""
    if x is None:
        return "null"
    if x is True or x is False:
        return "true" if x else "false"
    if isinstance(x, (int, float)):
        return repr(float(x)) if isinstance(x, float) else str(x)
    if isinstance(x, dict):
        return "{" + ", ".join(til_json(k) + ": " + til_json(v) for k, v in x.items()) + "}"
    if isinstance(x, (list, tuple)):
        return "[" + ", ".join(til_json(v) for v in x) + "]"
    ud = []
    for ch in x:
        o = ord(ch)
        if ch == '"' or ch == "\\":
            ud.append("\\" + ch)
        elif o < 32 or o > 126:
            ud.append("\\u%04x" % o)
        else:
            ud.append(ch)
    return '"' + "".join(ud) + '"'


def tomme_input(komp, opb):
    """Inputs (_ydervaeg, _tag, ..., _program), der ikke er forbundet og har valgmuligheder i biblioteket."""
    ud = []
    for p in komp.Params.Input:
        typ = p.NickName.lstrip("_")
        if typ in ALLE_TYPER and p.SourceCount == 0 and opb.get(typ):
            ud.append(p)
    return ud


def _lav_rullemenuer(komp, opb):
    """Sætter en Value List på hvert tomt opbygnings-input."""
    import Grasshopper as gh
    from System.Drawing import PointF

    def tilfoej(doc):
        try:
            for p in tomme_input(komp, opb):
                typ = p.NickName.lstrip("_")
                vl = gh.Kernel.Special.GH_ValueList()
                vl.CreateAttributes()
                vl.NickName = typ
                vl.ListItems.Clear()
                for navn, _ in opb[typ]:
                    vl.ListItems.Add(gh.Kernel.Special.GH_ValueListItem(navn, '"%s"' % navn))
                g = p.Attributes.InputGrip
                vl.Attributes.Pivot = PointF(g.X - 300, g.Y - 11)
                doc.AddObject(vl, False)
                p.AddSource(vl)
            komp.ExpireSolution(False)
        except Exception as e:
            komp.AddRuntimeMessage(gh.Kernel.GH_RuntimeMessageLevel.Warning,
                                   "Rullemenuer kunne ikke laves (%s). Skriv navnene i et Panel - se info." % e)

    komp.OnPingDocument().ScheduleSolution(5, gh.Kernel.GH_Document.GH_ScheduleDelegate(tilfoej))


def tilgaengelige(fil):
    """Tekst med alle opbygningsnavne i filen, til info-panelet."""
    _, opb = laes(fil)
    linjer = ["", "Opbygninger i %s:" % ("Panelet" if er_indhold(fil) else fil)]
    for typ in ALLE_TYPER:
        linjer.append("  %s: %s" % (typ, " / ".join(n for n, _ in opb[typ])))
    return "\n".join(linjer)


# --- Grasshopper ------------------------------------------------------------
def find_fil(fil, gh_fil):
    """Fuld sti, eller relativ til mappen med .gh-filen. Tom -> opbygninger.txt ved siden af .gh-filen."""
    import os
    if er_indhold(fil):
        return fil
    mappe = os.path.dirname(gh_fil) if gh_fil else ""
    kandidater = [fil] if fil and os.path.isabs(fil) else [
        os.path.join(mappe, fil or "opbygninger.txt"), fil or "opbygninger.txt"]
    for k in kandidater:
        if os.path.isfile(k):
            return k
    raise IOError("Kan ikke finde opbygninger.txt. Prøvede:\n  " + "\n  ".join(kandidater) +
                  "\nSkriv den fulde sti, fx C:\\Users\\dig\\...\\opbygninger.txt,"
                  "\neller læg filen ved siden af .gh-filen og lad _fil stå tom.")


try:
    ghenv  # noqa: F821  (findes kun i Grasshopper)
    _i_gh = True
except NameError:
    _i_gh = False

if _i_gh:
    import sys
    print("gh_opbygninger kører i Python %s" % sys.version.split()[0])
    _komp = ghenv.Component  # noqa: F821
    try:
        _tekst_typer = (basestring,)  # noqa: F821  (Python 2)
    except NameError:
        _tekst_typer = (str,)
    if _fil is not None and not isinstance(_fil, _tekst_typer):  # noqa: F821
        # List Access: Grasshopper sender en .NET-liste med én linje pr. element
        _fil = "\n".join("%s" % x for x in _fil)  # noqa: F821
    _fil = find_fil(_fil, _komp.OnPingDocument().FilePath)  # noqa: F821
    print("Opbygninger læst fra Panelet" if er_indhold(_fil) else "Fil fundet: %s" % _fil)
    _opb = laes(_fil)[1]
    _tomme = [p.NickName for p in tomme_input(_komp, _opb)]
    if _tomme:
        _lav_rullemenuer(_komp, _opb)
        print("Rullemenuer bestilt til %s" % ", ".join(_tomme))
    _cs, info = byg_saet(_fil, _ydervaeg, _tag, _terraendaek, _vindue)  # noqa: F821
    info += "\n" + tilgaengelige(_fil)
    constr_set = til_json(_cs)
    # Samme glas til Radiance (dagslys): modifier-sæt + lystransmittans
    _ms, vindue = byg_modifier_saet(_fil, _vindue)  # noqa: F821
    mod_set = til_json(_ms)
    # Interne laster og setpunkter (valgfrit input _program; ellers SBi 213)
    _prog, _prog_info = byg_program(_fil, globals().get("_program"))
    program = til_json(_prog)
    info = _prog_info + "\n" + info
    print("Færdig - constr_set, mod_set og program går hver i sin HB String to Object")
