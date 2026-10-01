# -*- coding: utf-8 -*-
"""
gh_overtemperatur.py - timer med for høj operativ temperatur pr. rum (BR18 § 386).

Tæller årets timer over 27 °C og 28 °C pr. rum og sammenligner med vejledningens
grænser: højst 100 timer over 27 °C og højst 25 timer over 28 °C.

Bruger ikke Ladybug/Honeybee selv og virker i alle Rhino 8's script-komponenter
(Script/IronPython 2/Python 3) og i den gamle GhPython.

Inputs:
    _temp       oper_temp fra HB Read Room Comfort Result (én datasamling pr. rum).
                Tree Access eller List Access. Tal virker også (fx fra LB Deconstruct
                Data): så er hver gren ét rum.
    _navne_     rumnavne i samme rækkefølge (valgfri). Ellers bruges zonenavnet
                fra simuleringen.
    _graenser_  tekst, fx "27=100, 28=25" (valgfri; standard er BR18-vejledningens)
Outputs:
    tabel       tekst til et Panel
    ok          True, hvis alle rum overholder grænserne
    data        tekst (JSON) til eksport / rapport
"""
from __future__ import division, unicode_literals

STANDARD_GRAENSER = [(27.0, 100), (28.0, 25)]   # (°C, maks. timer pr. år)


def tolk_graenser(tekst):
    if not tekst:
        return list(STANDARD_GRAENSER)
    ud = []
    for del_ in str(tekst).replace(";", ",").split(","):
        if "=" in del_:
            t, h = del_.split("=", 1)
            ud.append((float(t.strip().replace(" ", "")), int(float(h.strip()))))
    return sorted(ud)


def _er_tal(x):
    if x is None or hasattr(x, "values"):     # Ladybug-datasamling, ikke et tal
        return False
    try:
        float(x)
        return True
    except Exception:                          # IronPython kan give AttributeError
        return False


def _grene(x):
    """Grasshopper-input -> liste af grene (lister). Virker med DataTree, lister og enkeltobjekter."""
    if x is None:
        return []
    if hasattr(x, "BranchCount"):                       # DataTree (Tree Access)
        return [list(x.Branch(i)) for i in range(x.BranchCount)]
    if hasattr(x, "values") or _er_tal(x):               # ét objekt
        return [[x]]
    x = list(x)
    if x and all(isinstance(e, (list, tuple)) for e in x):   # liste af lister: én gren pr. rum
        return [list(e) for e in x]
    return [x]


def rum_serier(temp):
    """-> liste af (zonenavn eller None, [timeværdier]). Én datasamling = ét rum;
    en gren med tal = ét rum."""
    ud = []
    for gren in _grene(temp):
        tal = [v for v in gren if _er_tal(v)]
        if tal and len(tal) == len(gren):
            ud.append((None, [float(v) for v in tal]))
            continue
        for obj in gren:
            if hasattr(obj, "values"):
                zone = None
                try:
                    zone = obj.header.metadata.get("Zone") or obj.header.metadata.get("System")
                except Exception:
                    pass
                ud.append((zone, [float(v) for v in obj.values]))
    return ud


def beregn(temp, navne=None, graenser=None):
    graenser = tolk_graenser(graenser) if not isinstance(graenser, list) else graenser
    navne = [n for n in (navne or []) if n]
    rum = []
    for i, (zone, vaerdier) in enumerate(rum_serier(temp)):
        if not vaerdier:
            continue
        timer_pr_vaerdi = 8760.0 / len(vaerdier) if len(vaerdier) >= 8760 else 1.0
        navn = navne[i] if i < len(navne) else (zone or "Rum %d" % (i + 1))
        r = {"rum": navn, "max_C": round(max(vaerdier), 1), "timer": {}, "ok": True}
        for graense, maks in graenser:
            h = int(round(sum(1 for v in vaerdier if v > graense) * timer_pr_vaerdi))
            r["timer"]["over_%g" % graense] = h
            if h > maks:
                r["ok"] = False
        rum.append(r)
    return {"graenser": [{"C": g, "maks_timer": m} for g, m in graenser],
            "rum": rum, "ok": all(r["ok"] for r in rum) if rum else None}


def tabeltekst(d):
    gr = d["graenser"]
    hoved = "%-24s %7s" % ("Rum", "Max °C") + "".join(" %8s" % (">%g °C" % g["C"]) for g in gr) + "  Status"
    linjer = [hoved, "%-24s %7s" % ("", "") + "".join(" %8s" % ("(≤%d)" % g["maks_timer"]) for g in gr)]
    for r in d["rum"]:
        linjer.append("%-24s %7.1f" % (r["rum"][:24], r["max_C"]) +
                      "".join(" %8d" % r["timer"]["over_%g" % g["C"]] for g in gr) +
                      "  " + ("OK" if r["ok"] else "OVERSKREDET"))
    linjer.append("")
    if d["ok"] is None:
        linjer.append("Ingen temperaturdata - forbind oper_temp fra HB Read Room Comfort Result")
    else:
        linjer.append("Alle rum overholder BR18-vejledningens grænser" if d["ok"] else
                      "Mindst ét rum overskrider grænserne - se tiltag (afskærmning, udluftning, glas)")
    return "\n".join(linjer)


def til_json(x):
    """Enkel JSON-skriver (IronPython 2's json-modul fejler på æ/ø/å)."""
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


# --- Grasshopper ------------------------------------------------------------
try:
    ghenv  # noqa: F821  (findes kun i Grasshopper)
    _i_gh = True
except NameError:
    _i_gh = False

if _i_gh:
    import sys
    print("gh_overtemperatur kører i Python %s" % sys.version.split()[0])
    _t = globals().get("_temp")
    print("Input _temp: %s" % (type(_t).__name__ if _t is not None else "tomt"))
    _n = globals().get("_navne_")
    if _n is not None and not hasattr(_n, "__iter__"):
        _n = [_n]
    _d = beregn(globals().get("_temp"), ["%s" % x for x in (_n or [])], globals().get("_graenser_"))
    tabel = tabeltekst(_d)
    ok = _d["ok"]
    data = til_json(_d)
    print("Rum fundet: %d" % len(_d["rum"]))
