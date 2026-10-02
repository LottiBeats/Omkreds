# -*- coding: utf-8 -*-
"""
gh_eksport.py - samler billeder og resultater til rapporten.

Tager billeder af navngivne visninger i Rhino (model, plots, diagrammer) med
faste filnavne, kopierer SVG/PNG-filer fra fx LB Dump VisualizationSet ind i
samme mappe og skriver alle tal til resultater.json. Rapportscriptet læser
mappen og sætter billeder og tabeller ind i notatet.

    <_mappe>/
        resultater.json
        billeder/solbane.png, model_syd.png, temperatur_stue.svg, ...

Bruger ikke Ladybug/Honeybee selv og virker i Rhino 8's script-komponenter.
Slet de inputs, du ikke bruger (tomme inputs stopper Rhino 8-komponenter).

Inputs:
    _mappe        eksportmappen, fx C:\\Sager\\Hjerlesvej\\eksport
    _billeder_    én linje pr. billede:  filnavn = navngivet visning [| visningstilstand]
                  fx  "model_syd = Model syd | Shaded"   eller   "solbane = Solbane"
                  Visningen gemmes i Rhino med NamedView (Gem visning).
    _filer_       stier til færdige filer (SVG/PNG fra LB Dump VisualizationSet
                  eller LB Capture View), som kopieres ind i billeder/
    _data_        data fra de andre komponenter: JSON-tekst (data fra gh_opbygninger og
                  gh_overtemperatur, data_json fra ds418_varmetab), stier til .json-filer
                  eller almindelig tekst (fx summary_grid fra HB Annual Daylight EN17037)
    _noegler_     et navn pr. _data_, fx "opbygninger", "varmetab", "overtemperatur",
                  "dagslys". Er der flere _data_ end nøgler, får resten den sidste nøgle
    _bredde_      billedbredde i pixels (standard 1600)
    _hoejde_      billedhøjde i pixels (standard 1000)
    _eksporter    True for at eksportere
Outputs:
    filer         de skrevne filer
"""
from __future__ import division, unicode_literals

import os

STANDARD_BREDDE, STANDARD_HOEJDE = 1600, 1000


def tolk_billeder(linjer):
    """'filnavn = visning | tilstand' -> [(filnavn, visning, tilstand eller None)]"""
    if linjer is None:
        return []
    if not isinstance(linjer, (list, tuple)):
        linjer = list(linjer) if hasattr(linjer, "__iter__") and not _er_tekst(linjer) else [linjer]
    ud = []
    for linje in linjer:
        for del_ in ("%s" % linje).splitlines():
            del_ = del_.strip()
            if not del_ or del_.startswith("#") or "=" not in del_:
                continue
            fil, rest = [s.strip() for s in del_.split("=", 1)]
            tilstand = None
            if "|" in rest:
                rest, tilstand = [s.strip() for s in rest.split("|", 1)]
            ud.append((_filnavn(fil), rest, tilstand or None))
    return ud


def _er_tekst(x):
    try:
        return isinstance(x, basestring)  # noqa: F821  (Python 2)
    except NameError:
        return isinstance(x, str)


def _filnavn(navn):
    """Sikkert filnavn uden endelse: kun bogstaver, tal, - og _."""
    for a, b in (("æ", "ae"), ("ø", "oe"), ("å", "aa"), ("Æ", "Ae"), ("Ø", "Oe"), ("Å", "Aa")):
        navn = navn.replace(a, b)
    navn = os.path.splitext(navn)[0]
    return "".join(ch if (ch.isalnum() and ord(ch) < 128) or ch in "-_" else "_" for ch in navn).strip("_")


def tolk_vaerdi(d):
    """Én _data_-værdi -> Python. Klarer JSON-tekst, sti til en .json-fil (fx dagslysets
    summary fra HB Annual Daylight EN17037) og almindelig tekst."""
    import json
    tekst = ("%s" % d).strip()
    if tekst.lower().endswith(".json") and os.path.isfile(tekst):
        with open(tekst) as f:
            tekst = f.read()
    try:
        return json.loads(tekst)
    except ValueError:
        return tekst


def saml_resultater(data, noegler, billeder):
    """_data_ + _noegler_ -> én dict til resultater.json. Flere værdier med samme nøgle
    (fx en liste fra summary_grid) samles i en liste."""
    ud = {"billeder": sorted(billeder)}
    data = [d for d in (data or []) if d is not None and "%s" % d != ""]
    noegler = list(noegler or [])
    for i, d in enumerate(data):
        noegle = "%s" % (noegler[i] if i < len(noegler) and noegler[i] else
                         (noegler[-1] if noegler else "data_%d" % (i + 1)))
        v = tolk_vaerdi(d)
        if noegle in ud:
            if not isinstance(ud[noegle], list) or not getattr(ud[noegle], "_flere", False):
                ud[noegle] = _Flere([ud[noegle]])
            ud[noegle].append(v)
        else:
            ud[noegle] = v
    return dict((k, list(v) if isinstance(v, _Flere) else v) for k, v in ud.items())


class _Flere(list):
    _flere = True


def til_json(x, indryk=0):
    """JSON-skriver med indrykning, kun ASCII (IronPython 2's json fejler på æ/ø/å)."""
    sp, sp2 = "  " * indryk, "  " * (indryk + 1)
    if x is None:
        return "null"
    if x is True or x is False:
        return "true" if x else "false"
    if isinstance(x, (int, float)):
        return repr(float(x)) if isinstance(x, float) else str(x)
    if isinstance(x, dict):
        if not x:
            return "{}"
        return "{\n" + ",\n".join(sp2 + til_json("%s" % k) + ": " + til_json(v, indryk + 1)
                                  for k, v in x.items()) + "\n" + sp + "}"
    if isinstance(x, (list, tuple)):
        if not x:
            return "[]"
        return "[\n" + ",\n".join(sp2 + til_json(v, indryk + 1) for v in x) + "\n" + sp + "]"
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


def skriv_tekst(sti, tekst):
    with open(sti, "w") as f:
        f.write(tekst)


# --- Rhino --------------------------------------------------------------------
def _visning(navn):
    """Rhino-viewport for et viewport-navn (Top, Perspective) eller en navngivet visning,
    som så gendannes i den aktive viewport. Samme metode som LB Capture View."""
    import Rhino
    doc = Rhino.RhinoDoc.ActiveDoc
    view = doc.Views.Find(navn, False)
    if view is not None:
        return view.ActiveViewport
    for i, nv in enumerate(doc.NamedViews):
        if nv.Name == navn:
            vp = doc.Views.ActiveView.ActiveViewport
            doc.NamedViews.Restore(i, vp)
            return vp
    raise ValueError('Visningen "%s" findes ikke. Gem den i Rhino med NamedView.' % navn)


def tag_billede(navn, sti, bredde, hoejde, tilstand=None):
    import System
    import Rhino
    vp = _visning(navn)
    vp.ParentView.Redraw()
    stoerrelse = System.Drawing.Size(int(bredde), int(hoejde))
    if tilstand:
        mode = Rhino.Display.DisplayModeDescription.FindByName(tilstand)
        if mode is None:
            raise ValueError('Visningstilstanden "%s" findes ikke (fx Shaded, Rendered, Arctic).' % tilstand)
        bmp = vp.ParentView.CaptureToBitmap(stoerrelse, mode)
    else:
        bmp = vp.ParentView.CaptureToBitmap(stoerrelse)
    bmp.Save(sti, System.Drawing.Imaging.ImageFormat.Png)
    return sti


def _koer_sidst(komp):
    """Flyt komponenten forrest, så den beregnes efter alle andre (som LB Capture View)."""
    try:
        from Grasshopper import Instances
        objs = Instances.ActiveCanvas.Document.Objects
        if not objs[objs.Count - 1].InstanceGuid.Equals(komp.InstanceGuid):
            komp.OnPingDocument().DeselectAll()
            komp.Attributes.Selected = True
            komp.OnPingDocument().BringSelectionToTop()
            komp.Attributes.Selected = False
    except Exception:
        pass


# --- Grasshopper ------------------------------------------------------------
try:
    ghenv  # noqa: F821  (findes kun i Grasshopper)
    _i_gh = True
except NameError:
    _i_gh = False

if _i_gh:
    import shutil
    g = globals().get
    if not g("_eksporter"):
        print("Sæt _eksporter til True")
    elif not g("_mappe"):
        print("Angiv _mappe (eksportmappen)")
    else:
        _koer_sidst(ghenv.Component)  # noqa: F821
        mappe = "%s" % g("_mappe")
        bmappe = os.path.join(mappe, "billeder")
        if not os.path.isdir(bmappe):
            os.makedirs(bmappe)
        filer, navne, fejl = [], [], []
        b, h = g("_bredde_") or STANDARD_BREDDE, g("_hoejde_") or STANDARD_HOEJDE
        for fil, visning, tilstand in tolk_billeder(g("_billeder_")):
            sti = os.path.join(bmappe, fil + ".png")
            try:
                filer.append(tag_billede(visning, sti, b, h, tilstand))
                navne.append(fil + ".png")
                print("Billede: %s  <- %s" % (fil + ".png", visning))
            except Exception as e:
                fejl.append("%s: %s" % (fil, e))
        kilder = g("_filer_") or []
        if _er_tekst(kilder):
            kilder = [kilder]
        for kilde in kilder:
            kilde = "%s" % kilde
            if not os.path.isfile(kilde):
                fejl.append("Findes ikke: %s" % kilde)
                continue
            maal = os.path.join(bmappe, os.path.basename(kilde))
            if os.path.abspath(kilde) != os.path.abspath(maal):
                shutil.copyfile(kilde, maal)
            filer.append(maal)
            navne.append(os.path.basename(kilde))
            print("Fil: %s" % os.path.basename(kilde))
        d = g("_data_") or []
        if _er_tekst(d):
            d = [d]
        n = g("_noegler_") or []
        if _er_tekst(n):
            n = [n]
        res = saml_resultater(list(d), list(n), navne)
        jsti = os.path.join(mappe, "resultater.json")
        skriv_tekst(jsti, til_json(res))
        filer.append(jsti)
        print("resultater.json: %s" % ", ".join(k for k in res if k != "billeder"))
        for f in fejl:
            print("FEJL  " + f)
        print("Færdig - %d filer i %s" % (len(filer), mappe))
