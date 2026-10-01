# -*- coding: utf-8 -*-
"""
gh_opbygninger.py - vælg standardopbygninger i rullemenuer og få et færdigt
Honeybee ConstructionSet.

Erstatter hele kæden HB Opaque Material -> HB Opaque Construction -> subsets ->
HB ConstructionSet. Opbygningerne står i en tekstfil (energi/regler/opbygninger.txt),
som I selv retter og udvider.

Sæt koden i en GhPython-komponent (IronPython 2, samme slags som Ladybug-
komponenterne, ellers kan Honeybee ikke læse resultatet).
Inputs (Item Access, Type hint: str):
    _fil          sti til opbygninger.txt. Fuld sti (C:\\...), eller relativ til
                  mappen med .gh-filen. Tom: opbygninger.txt ved siden af .gh-filen.
    _ydervaeg     navn på opbygning  \
    _tag          navn på opbygning   |  står de tomme, laver komponenten selv
    _terraendaek  navn på opbygning   |  en rullemenu med opbygningerne i filen
    _vindue       navn på vindue     /
Outputs:
    constr_set    -> _constr_set_ på HB Room from Solid
    info          tekst til et Panel: lag og U-værdier
    ydervaeg, tag, terraendaek, vindue   de enkelte konstruktioner (valgfri)
"""
from __future__ import division, unicode_literals

import io

TYPER = ["ydervaeg", "tag", "terraendaek", "vindue"]


def _ascii(tekst):
    for a, b in (("æ", "ae"), ("ø", "oe"), ("å", "aa"), ("Æ", "Ae"), ("Ø", "Oe"), ("Å", "Aa")):
        tekst = tekst.replace(a, b)
    return tekst


def _id(tekst):
    from honeybee.typing import clean_ep_string
    return clean_ep_string(_ascii(tekst))


def laes(fil):
    """Læser filen -> (materialer, opbygninger).
    materialer:  {navn_lower: (navn, lambda, densitet, varmefylde)}
    opbygninger: {type: [(navn, [(felt1, felt2), ...]), ...]} i filens rækkefølge"""
    materialer, opbygninger = {}, dict((t, []) for t in TYPER)
    afsnit, aktuel = None, None
    with io.open(fil, encoding="utf-8-sig") as f:
        for nr, linje in enumerate(f, 1):
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
                    raise ValueError("Linje %d: ukendt type '%s' (brug ydervæg, tag, terrændæk, vindue)" % (nr, typ))
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


def byg_opak(navn, lag, materialer):
    from honeybee_energy.material.opaque import EnergyMaterial
    from honeybee_energy.construction.opaque import OpaqueConstruction
    mats = []
    for mat_navn, t_mm in lag:
        m = materialer.get(mat_navn.lower())
        if m is None:
            raise ValueError("'%s' i '%s' findes ikke under [materialer]" % (mat_navn, navn))
        n, lam, rho, c = m
        em = EnergyMaterial(_id("%s %g mm" % (n, t_mm)), t_mm / 1000.0, lam, rho, c)
        em.display_name = "%s %g mm" % (n, t_mm)
        mats.append(em)
    k = OpaqueConstruction(_id(navn), mats)
    k.display_name = navn
    return k


def byg_vindue(navn, felter):
    from honeybee_energy.material.glazing import EnergyWindowMaterialSimpleGlazSys
    from honeybee_energy.construction.window import WindowConstruction
    v = dict((k.lower(), x) for k, x in felter)
    for k in ("u", "g", "lt"):
        if k not in v:
            raise ValueError("Vinduet '%s' mangler '%s'" % (navn, k))
    mat = EnergyWindowMaterialSimpleGlazSys(_id(navn + " glas"), v["u"], v["g"], v["lt"])
    k = WindowConstruction(_id(navn), [mat])
    k.display_name = navn
    return k


def byg_saet(fil, ydervaeg, tag, terraendaek, vindue):
    """Returnerer (ConstructionSet, {type: konstruktion}, infotekst)."""
    from honeybee_energy.constructionset import ConstructionSet
    materialer, opb = laes(fil)
    valg = {"ydervaeg": ydervaeg, "tag": tag, "terraendaek": terraendaek, "vindue": vindue}
    k = {}
    for typ, navn in valg.items():
        if not navn:
            continue
        n, lag = _find(opb, typ, navn)
        k[typ] = byg_vindue(n, lag) if typ == "vindue" else byg_opak(n, lag, materialer)

    cs = ConstructionSet("Projekt_konstruktioner")
    if "ydervaeg" in k:
        cs.wall_set.exterior_construction = k["ydervaeg"]
    if "tag" in k:
        cs.roof_ceiling_set.exterior_construction = k["tag"]
    if "terraendaek" in k:
        cs.floor_set.ground_construction = k["terraendaek"]
    if "vindue" in k:
        v = k["vindue"]
        cs.aperture_set.window_construction = v
        cs.aperture_set.operable_construction = v
        cs.aperture_set.skylight_construction = v
        cs.door_set.exterior_glass_construction = v

    linjer = []
    for typ, titel in (("ydervaeg", "Ydervæg"), ("tag", "Tag"), ("terraendaek", "Terrændæk")):
        if typ not in k:
            linjer.append("%s: (ikke valgt - Honeybee-standard)" % titel)
            continue
        c = k[typ]
        linjer.append("%s: %s   U = %.3f W/m2K" % (titel, c.display_name, c.u_factor))
        for m in c.materials:
            linjer.append("    %-32s R = %.2f" % (m.display_name, m.thickness / m.conductivity))
    if "vindue" in k:
        g = k["vindue"].materials[0]
        linjer.append("Vindue: %s   U = %.2f  g = %.2f  LT = %.2f" % (
            k["vindue"].display_name, g.u_factor, g.shgc, g.vt))
    else:
        linjer.append("Vindue: (ikke valgt - Honeybee-standard)")
    return cs, k, "\n".join(linjer)


def _lav_rullemenuer(komp, opb):
    """Sætter en Value List på hvert tomt opbygnings-input."""
    import Grasshopper as gh
    from System.Drawing import PointF

    def tilfoej(doc):
        for i, typ in enumerate(TYPER, 1):
            p = komp.Params.Input[i]
            if p.SourceCount > 0 or not opb[typ]:
                continue
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

    komp.OnPingDocument().ScheduleSolution(5, tilfoej)


# --- Grasshopper ------------------------------------------------------------
def find_fil(fil, gh_fil):
    """Fuld sti, eller relativ til mappen med .gh-filen. Tom -> opbygninger.txt ved siden af .gh-filen."""
    import os
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
    _fil  # noqa: F821  (findes kun i Grasshopper)
    _komp = ghenv.Component  # noqa: F821
    _fil = find_fil(_fil, _komp.OnPingDocument().FilePath)  # noqa: F821
    if any(_komp.Params.Input[i].SourceCount == 0 for i in range(1, 5)):
        _lav_rullemenuer(_komp, laes(_fil)[1])
    constr_set, _k, info = byg_saet(_fil, _ydervaeg, _tag, _terraendaek, _vindue)  # noqa: F821
    ydervaeg, tag = _k.get("ydervaeg"), _k.get("tag")
    terraendaek, vindue = _k.get("terraendaek"), _k.get("vindue")
except NameError:
    pass
