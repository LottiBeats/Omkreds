# -*- coding: utf-8 -*-
"""
gh_materialer.py - materialebibliotek med rullemenu til Honeybee

Erstatter HB Opaque Material: vælg materialet på en liste og skriv tykkelsen.
Output `mat` går direkte i `_materials` på HB Opaque Construction.

Sæt koden i en GhPython-komponent (IronPython 2, samme slags som Ladybug-
komponenterne, ellers kan HB Opaque Construction ikke læse materialet).
Inputs (Item Access):
    _materiale    tekst - navnet på materialet. Står inputtet tomt, laver
                  komponenten selv en rullemenu (Value List) med alle materialer.
    _tykkelse_mm  tal [mm]
    _sol_absp_    solabsorption 0-1 for yderste lag (valgfri, standard 0,7;
                  lys facade ca. 0,4, mørk/sort ca. 0,9)
Outputs:
    mat           Honeybee-materiale
    info          tekst til et Panel: valgte værdier og R-værdi

Værdierne er typiske designværdier (EN ISO 10456 og gængse danske produkter).
For isolering: brug lambda fra producentens datablad, hvis den kendes.
"""
from __future__ import division, unicode_literals

# navn: (lambda W/mK, densitet kg/m3, varmefylde J/kgK)
MATERIALER = [
    # --- Beklædning, plader, tag ---------------------------------------
    ("Træbeklædning (fyr/gran)", 0.13, 500, 1600),
    ("Krydsfiner", 0.13, 500, 1600),
    ("OSB", 0.13, 650, 1700),
    ("Vindgips (udvendig gips)", 0.25, 800, 1000),
    ("Træfiber vindplade", 0.05, 250, 2100),
    ("Tagpap", 0.23, 1100, 1000),
    ("Tagsten (tegl)", 1.0, 2000, 800),
    ("Mursten (tegl)", 0.60, 1800, 840),
    # --- Isolering -------------------------------------------------------
    ("Mineraluld 32", 0.032, 35, 1030),
    ("Mineraluld 34", 0.034, 30, 1030),
    ("Mineraluld 37", 0.037, 30, 1030),
    ("Papirisolering", 0.040, 45, 1900),
    ("Træfiberisolering", 0.038, 50, 2100),
    ("EPS hvid (lambda 38)", 0.038, 15, 1450),
    ("EPS 150 (lambda 36)", 0.036, 25, 1450),
    ("EPS grå (lambda 31)", 0.031, 20, 1450),
    ("XPS", 0.034, 35, 1450),
    ("PIR", 0.022, 32, 1400),
    # --- Indvendigt og tungt ---------------------------------------------
    ("Gips", 0.25, 900, 1000),
    ("Fibergips", 0.32, 1150, 1100),
    ("Beton (armeret)", 2.3, 2300, 1000),
    ("Porebeton 535", 0.13, 535, 1000),
    ("Kalksandsten", 1.0, 1900, 1000),
    ("Afretningslag (cement)", 1.0, 1800, 1000),
    ("Klinker/fliser", 1.3, 2300, 840),
    ("Trægulv eg", 0.18, 700, 1600),
    ("Trægulv fyr/plank", 0.13, 500, 1600),
]
OPSLAG = dict((m[0].lower(), m) for m in MATERIALER)


def _ascii(tekst):
    for a, b in (("æ", "ae"), ("ø", "oe"), ("å", "aa"), ("Æ", "Ae"), ("Ø", "Oe"), ("Å", "Aa")):
        tekst = tekst.replace(a, b)
    return tekst


def lav_materiale(navn, tykkelse_mm, sol_absp=None):
    """Returnerer (EnergyMaterial, infotekst)."""
    from honeybee.typing import clean_ep_string
    from honeybee_energy.material.opaque import EnergyMaterial

    m = OPSLAG.get(navn.strip().lower())
    if m is None:
        raise ValueError("Ukendt materiale '%s'. Vælg et fra listen." % navn)
    navn, lam, rho, c = m
    d = float(tykkelse_mm) / 1000.0
    ident = clean_ep_string(_ascii("%s %g mm" % (navn, tykkelse_mm)))
    mat = EnergyMaterial(ident, d, lam, rho, c)
    mat.display_name = "%s %g mm" % (navn, tykkelse_mm)
    if sol_absp is not None:
        mat.solar_absorptance = sol_absp
        mat.visible_absorptance = sol_absp
    info = "%s  %g mm\nlambda %.3f W/mK   rho %d kg/m3   c %d J/kgK\nR = %.2f m2K/W" % (
        navn, tykkelse_mm, lam, rho, c, d / lam)
    return mat, info


def _lav_rullemenu(komp):
    """Sætter en Value List med alle materialer på første input."""
    import Grasshopper as gh
    from System.Drawing import PointF

    def tilfoej(doc):
        vl = gh.Kernel.Special.GH_ValueList()
        vl.CreateAttributes()
        vl.NickName = "Materiale"
        vl.ListItems.Clear()
        for m in MATERIALER:
            vl.ListItems.Add(gh.Kernel.Special.GH_ValueListItem(m[0], '"%s"' % m[0]))
        p = komp.Params.Input[0].Attributes.InputGrip
        vl.Attributes.Pivot = PointF(p.X - 260, p.Y - 11)
        doc.AddObject(vl, False)
        komp.Params.Input[0].AddSource(vl)
        komp.ExpireSolution(False)

    komp.OnPingDocument().ScheduleSolution(5, tilfoej)


# --- Grasshopper ------------------------------------------------------------
try:
    _materiale  # noqa: F821  (findes kun i Grasshopper)
    if ghenv.Component.Params.Input[0].SourceCount == 0:  # noqa: F821
        _lav_rullemenu(ghenv.Component)  # noqa: F821
        info = "Rullemenu oprettet - vælg et materiale."
    elif _materiale and _tykkelse_mm:  # noqa: F821
        mat, info = lav_materiale(_materiale, _tykkelse_mm, _sol_absp_)  # noqa: F821
    else:
        info = "Angiv _tykkelse_mm."
except NameError:
    pass
