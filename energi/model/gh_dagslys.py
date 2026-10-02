# -*- coding: utf-8 -*-
"""
gh_dagslys.py - dagslys pr. rum efter BR18 § 379 (300 lux-metoden).

Kravet: mindst 300 lux på mindst halvdelen af gulvarealet i mindst halvdelen af
dagslystimerne. Det svarer til en spatial daylight autonomy (sDA) på mindst 50 %,
regnet med grænsen 300 lux og tidskravet 50 %:

    HB Annual Daylight (_thresholds_ "-t 300") -> DA
    DA -> HB Spatial Daylight Autonomy (_target_time_ 50, mesh_ = målenettets mesh) -> sDA
    sDA -> denne komponent

Bruger ikke Ladybug/Honeybee selv og virker i Rhino 8's script-komponenter.
Slet de inputs, du ikke bruger.

Inputs:
    _sda        sDA i procent, én værdi pr. målenet/rum (List Access)
    _navne_     rumnavne i samme rækkefølge (List Access, valgfri)
    _krav_      krævet andel af gulvarealet i procent (valgfri, standard 50)
Outputs:
    tabel       tekst til et Panel
    ok          True, hvis alle rum opfylder kravet
    data        tekst (JSON) -> _data_ på gh_eksport med nøglen "dagslys"
"""
from __future__ import division, unicode_literals


def beregn(sda, navne=None, krav=50.0):
    navne = ["%s" % n for n in (navne or []) if n]
    rum = []
    for i, v in enumerate(sda or []):
        try:
            v = float(v)
        except Exception:
            continue
        rum.append({"rum": navne[i] if i < len(navne) else "Rum %d" % (i + 1),
                    "andel_pct": round(v, 1), "ok": v >= krav})
    return {"metode": "300 lux på mindst %g %% af gulvarealet i mindst 50 %% af tiden" % krav,
            "krav_pct": krav, "rum": rum, "ok": all(r["ok"] for r in rum) if rum else None}


def tabeltekst(d):
    linjer = ["%-24s %18s  Status" % ("Rum", "Andel med 300 lux")]
    for r in d["rum"]:
        linjer.append("%-24s %17.0f%%  %s" % (r["rum"][:24], r["andel_pct"], "OK" if r["ok"] else "IKKE OPFYLDT"))
    linjer.append("")
    linjer.append("Krav: %s" % d["metode"])
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
    for ch in "%s" % x:
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
    _s = globals().get("_sda")
    if _s is not None and not hasattr(_s, "__iter__"):
        _s = [_s]
    _n = globals().get("_navne_")
    if _n is not None and not hasattr(_n, "__iter__"):
        _n = [_n]
    _d = beregn(list(_s or []), list(_n or []), float(globals().get("_krav_") or 50))
    tabel = tabeltekst(_d)
    ok = _d["ok"]
    data = til_json(_d)
    print("Rum fundet: %d" % len(_d["rum"]))
