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
    _billeder_    én linje pr. billede:  filnavn = del | del | ...
                  fx  "model_syd = Model syd | Arctic"          (navngiven visning)
                      "dagslys = gruppe:Dagslysplot | Shaded"   (kun den GH-gruppe, ovenfra)
                      "komfort = gruppe:Komfort | uden rhino"   (gruppen uden Rhino-objekter)
                  Grupper navngives i Grasshopper (højreklik på gruppen). Med gruppe og
                  uden visning zoomes der automatisk ind på gruppen set fra Top.
    _filer_       stier til færdige filer (SVG/PNG fra LB Dump VisualizationSet
                  eller LB Capture View), som kopieres ind i billeder/
    _data_        data fra de andre komponenter: JSON-tekst (data fra gh_opbygninger og
                  gh_overtemperatur, data_json fra ds418_varmetab), stier til .json-filer
                  eller almindelig tekst (fx summary_grid fra HB Annual Daylight EN17037)
    _noegler_     VALGFRI. Data fra gh_opbygninger, ds418_varmetab, gh_overtemperatur og
                  gh_dagslys genkendes automatisk. Nøgler bruges kun til anden tekst
    _scenarie_    navn på scenariet, fx "1 Som tegnet" eller "2 Solafskærmende glas" (valgfri).
                  Gemmer et resumé i scenarier/, så notatet kan sammenligne koerslerne.
                  Start navnet med et tal - scenarierne vises i den rækkefølge.
    _bredde_      billedbredde i pixels (standard 3200 - skarpt i A4 i fuld bredde)
    _hoejde_      billedhøjde i pixels (standard 2000)
    _eksporter    True for at eksportere
Outputs:
    filer         de skrevne filer
"""
from __future__ import division, unicode_literals

import os

STANDARD_BREDDE, STANDARD_HOEJDE = 3200, 2000


TILSTANDE = ("wireframe", "shaded", "rendered", "ghosted", "x-ray", "technical", "artistic", "pen",
             "arctic", "raytraced", "monochrome")


def tolk_billeder(linjer):
    """Én linje pr. billede:  filnavn = del | del | ...   hvor hver del er
         gruppe:Navn   kun Grasshopper-gruppen 'Navn' vises; uden visning zoomes der
                       ind på gruppen set ovenfra (Top)
         uden rhino    Rhino-objekterne skjules, så kun Grasshopper-preview ses
         fast          brug visningen præcis som gemt (ellers zoomes der, så det viste fylder billedet)
         nr:2          kun plot nr. 2, når komponenten tegner flere plots (fx ét pr. rum)
         hver          ét billede pr. plot: filnavn_1, filnavn_2, ...
         Shaded/Arctic/Rendered ...   visningstilstand
         andet         Rhino-viewport eller navngiven visning (NamedView)
    -> liste af dicts med fil, visning, tilstand, gruppe, uden_rhino, fast, nr ("hver" eller tal)."""
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
            fil, rest = [x.strip() for x in del_.split("=", 1)]
            b = {"fil": _filnavn(fil), "visning": None, "tilstand": None, "gruppe": None, "uden_rhino": False,
                 "fast": False, "nr": None}
            for d in [x.strip() for x in rest.split("|") if x.strip()]:
                if d.lower().startswith("gruppe:"):
                    b["gruppe"] = d.split(":", 1)[1].strip()
                elif d.lower() in ("uden rhino", "kun gh", "kun grasshopper"):
                    b["uden_rhino"] = True
                elif d.lower() in ("fast", "fast visning", "uden zoom"):
                    b["fast"] = True
                elif d.lower() in ("hver", "hver gren", "hvert plot", "alle"):
                    b["nr"] = "hver"
                elif d.lower().replace(" ", "").startswith(("nr:", "gren:", "plot:")) and \
                        d.split(":", 1)[1].strip().isdigit():
                    b["nr"] = max(1, int(d.split(":", 1)[1].strip()))
                elif d.lower() in TILSTANDE:
                    b["tilstand"] = d
                else:
                    b["visning"] = d
            ud.append(b)
    return ud


def vaelg_del(grene, nr):
    """Del nr (0-baseret) af et outputs data. Flere grene: én gren pr. plot.
    Én gren: ét element pr. plot. Findes delen ikke -> []."""
    grene = [list(g) for g in grene]
    if len(grene) > 1:
        return grene[nr] if nr < len(grene) else []
    if grene and nr < len(grene[0]):
        return [grene[0][nr]]
    return []


def antal_dele(alle_grene):
    """Antal plots ud fra alle outputs' grene: flest grene, ellers flest elementer i én gren."""
    flere = [len(g) for g in alle_grene if len(g) > 1]
    if flere:
        return max(flere)
    return max([len(list(g[0])) for g in alle_grene if len(g) == 1] or [0])


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


def genkend(v):
    """Nøgle ud fra indholdet, så rækkefølgen i _noegler_ ikke kan gå galt."""
    if isinstance(v, dict):
        if "graenser" in v and "rum" in v:
            return "overtemperatur"
        if "projekt_sum_W_K" in v:
            return "varmetab"
        if "opbygninger" in v and "program" in v:
            return "opbygninger"
        if "krav_pct" in v and "rum" in v:
            return "dagslys"
    return None


def saml_resultater(data, noegler, billeder):
    """_data_ (+ evt. _noegler_) -> én dict til resultater.json. Data fra vores egne komponenter
    genkendes på indholdet; _noegler_ bruges kun til andet (fx tekst). Ens værdier gemmes én gang;
    forskellige værdier med samme nøgle samles i en liste."""
    ud = {"billeder": sorted(billeder)}
    data = [d for d in (data or []) if d is not None and "%s" % d != ""]
    noegler = list(noegler or [])
    for i, d in enumerate(data):
        v = tolk_vaerdi(d)
        noegle = genkend(v) or "%s" % (noegler[i] if i < len(noegler) and noegler[i] else
                                         (noegler[-1] if noegler else "data_%d" % (i + 1)))
        if noegle in ud:
            eksisterende = ud[noegle] if isinstance(ud[noegle], _Flere) else [ud[noegle]]
            if v in eksisterende:
                continue
            if not isinstance(ud[noegle], _Flere):
                ud[noegle] = _Flere([ud[noegle]])
            ud[noegle].append(v)
        else:
            ud[noegle] = v
    return dict((k, list(v) if isinstance(v, _Flere) else v) for k, v in ud.items())


class _Flere(list):
    _flere = True


FORVENTET = {
    "opbygninger": ("opbygninger", "data fra gh_opbygninger"),
    "varmetab": ("projekt_sum_W_K", "data_json fra ds418_varmetab"),
    "overtemperatur": ("rum", "data fra gh_overtemperatur"),
}


def tjek_resultater(res):
    """Advarsler, hvis en nøgle har fået tekst (fx tabel) i stedet for data, eller ukendte nøgler."""
    adv = []
    for k, (felt, hvad) in FORVENTET.items():
        v = res.get(k)
        if v is None:
            adv.append("%s mangler (forbind %s)" % (k, hvad))
        elif not isinstance(v, dict) or felt not in v:
            adv.append("%s er ikke data - forbind %s, ikke tabel/tekst" % (k, hvad))
    ukendte = [k for k in res if k not in FORVENTET and k not in ("billeder", "dagslys")]
    if ukendte:
        adv.append("ukendte nøgler: %s (tjek Panelet på _noegler_)" % ", ".join(ukendte))
    return adv


def scenarie_resume(navn, res):
    """Det, rapporten skal bruge for at sammenligne scenarier (uden timeværdier)."""
    ud = {"scenarie": "%s" % navn}
    ot = res.get("overtemperatur")
    if isinstance(ot, dict):
        ud["overtemperatur"] = dict((k, v) for k, v in ot.items() if k not in ("serier", "ude"))
    vt = res.get("varmetab")
    if isinstance(vt, dict):
        ud["varmetab"] = dict((k, vt.get(k)) for k in ("projekt_sum_W_K", "ramme_sum_W_K", "overholdt", "glasandel"))
    opb = res.get("opbygninger")
    if isinstance(opb, dict) and opb.get("vindue"):
        ud["vindue"] = opb["vindue"]
    return ud


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
    som så gendannes i den aktive viewport. Viewportens kamera gemmes først
    (PushViewProjection), så det kan sættes tilbage bagefter."""
    import Rhino
    doc = Rhino.RhinoDoc.ActiveDoc
    if not navn:
        # ingen visning: set ovenfra i den aktive viewport (kameraet sættes tilbage bagefter)
        vp = doc.Views.ActiveView.ActiveViewport
        vp.PushViewProjection()
        vp.SetProjection(Rhino.Display.DefinedViewportProjection.Top, None, False)
        return vp
    view = doc.Views.Find(navn, False)
    if view is not None:
        vp = view.ActiveViewport
        vp.PushViewProjection()
        return vp
    for i, nv in enumerate(doc.NamedViews):
        if ("%s" % nv.Name).strip().lower() == navn.strip().lower():
            vp = doc.Views.ActiveView.ActiveViewport
            vp.PushViewProjection()
            doc.NamedViews.Restore(i, vp)
            return vp
    raise ValueError('Visningen "%s" findes ikke. Gem den i Rhino med NamedView.' % navn)


def _gruppe_medlemmer(gh_doc, navn):
    """Alle objekter i Grasshopper-gruppen 'navn' (også i undergrupper)."""
    from Grasshopper.Kernel.Special import GH_Group
    alle = [o for o in gh_doc.Objects if isinstance(o, GH_Group)]
    grupper = [o for o in alle if navn.strip().lower() == ("%s" % o.NickName).strip().lower()]
    if not grupper:
        navne = sorted(set(("%s" % o.NickName).strip() for o in alle) - set(["", "Group"]))
        raise ValueError('Grasshopper-gruppen "%s" findes ikke. %s' % (navn, (
            "Navngivne grupper i filen: " + ", ".join(navne)) if navne else
            "Der er ingen navngivne grupper i filen endnu: marker plottet, Ctrl+G, "
            "højreklik på gruppen og skriv navnet øverst i menuen."))
    ids, koe = set(), list(grupper)
    while koe:
        gr = koe.pop()
        for gid in gr.ObjectIDs:
            if gid in ids:
                continue
            ids.add(gid)
            o = gh_doc.FindObject(gid, True)
            if isinstance(o, GH_Group):
                koe.append(o)
    return ids


def _grene(param):
    """Et outputs data som liste af grene (lister af goo)."""
    d = param.VolatileData
    return [list(d.get_Branch(p)) for p in d.Paths]


def _gruppe_boks(gh_doc, ids, nr=None):
    """Boks om den geometri, gruppens komponenter faktisk viser (output med preview slået til).
    Med nr (0-baseret) kun plot nr."""
    import Rhino
    from Grasshopper.Kernel import IGH_Component, IGH_Param, IGH_PreviewObject
    from Grasshopper.Kernel.Types import IGH_GeometricGoo
    boks = None

    def tilfoej(param):
        b = None
        try:
            if isinstance(param, IGH_PreviewObject) and param.Hidden:
                return None
            data = param.VolatileData.AllData(True) if nr is None else vaelg_del(_grene(param), nr)
            for goo in data:
                if isinstance(goo, IGH_GeometricGoo):
                    bb = goo.Boundingbox
                    if bb.IsValid:
                        b = bb if b is None else Rhino.Geometry.BoundingBox.Union(b, bb)
        except Exception:
            pass
        return b

    for o in gh_doc.Objects:
        if o.InstanceGuid not in ids or not isinstance(o, IGH_PreviewObject) or o.Hidden:
            continue
        params = list(o.Params.Output) if isinstance(o, IGH_Component) else (
            [o] if isinstance(o, IGH_Param) else [])
        for p in params:
            bb = tilfoej(p)
            if bb is not None:
                boks = bb if boks is None else Rhino.Geometry.BoundingBox.Union(boks, bb)
    return boks


def _gruppe_antal(gh_doc, ids):
    """Antal plots, gruppens komponenter tegner (fx ét pr. rum)."""
    from Grasshopper.Kernel import IGH_Component, IGH_Param
    from Grasshopper.Kernel.Types import IGH_GeometricGoo
    alle = []
    for o in gh_doc.Objects:
        if o.InstanceGuid not in ids:
            continue
        params = list(o.Params.Output) if isinstance(o, IGH_Component) else (
            [o] if isinstance(o, IGH_Param) else [])
        for p in params:
            g = _grene(p)
            if any(isinstance(x, IGH_GeometricGoo) for gren in g for x in gren):
                alle.append(g)
    return antal_dele(alle)


def _synlig_boks(rdoc, gh_doc):
    """Boks om alt synligt: Rhino-objekter og Grasshopper-preview."""
    import Rhino
    from Grasshopper.Kernel import IGH_PreviewObject
    boks = None
    for ob in rdoc.Objects:
        try:
            if ob.Visible:
                bb = ob.Geometry.GetBoundingBox(True)
                if bb.IsValid:
                    boks = bb if boks is None else Rhino.Geometry.BoundingBox.Union(boks, bb)
        except Exception:
            pass
    if gh_doc is not None:
        ids = set(o.InstanceGuid for o in gh_doc.Objects if isinstance(o, IGH_PreviewObject) and not o.Hidden)
        bb = _gruppe_boks(gh_doc, ids)
        if bb is not None:
            boks = bb if boks is None else Rhino.Geometry.BoundingBox.Union(boks, bb)
    return boks


def tag_billede(navn, sti, bredde, hoejde, tilstand=None, gruppe=None, uden_rhino=False, gh_doc=None,
                fast=False, nr=None):
    """Tager billedet. Med gruppe: alle andre Grasshopper-komponenter skjules midlertidigt.
    Visningen (eller Top) zoomes, så det viste fylder billedet, medmindre fast=True.
    Med nr (1-baseret) zoomes der ind på plot nr., og billedet beskæres til det.
    Kamera, skjulte objekter og visningstilstand gendannes bagefter."""
    import System
    import Rhino
    from Grasshopper.Kernel import IGH_PreviewObject
    rdoc = Rhino.RhinoDoc.ActiveDoc
    skjulte_gh, skjulte_rhino, zoomet, gammel_tilstand, boks = [], [], None, None, None
    try:
        if gruppe:
            ids = _gruppe_medlemmer(gh_doc, gruppe)
            boks = _gruppe_boks(gh_doc, ids, None if nr is None else nr - 1)
            if nr is not None and (boks is None or not boks.IsValid):
                raise ValueError('gruppen "%s" har ikke et plot nr. %d' % (gruppe, nr))
            for o in gh_doc.Objects:
                if not isinstance(o, IGH_PreviewObject):
                    continue
                if o.InstanceGuid not in ids and not o.Hidden:
                    o.Hidden = True
                    skjulte_gh.append(o)
        if uden_rhino:
            for ob in rdoc.Objects:
                if ob.Visible and rdoc.Objects.Hide(ob, True):
                    skjulte_rhino.append(ob.Id)
        vp = _visning(navn)
        zoomet = vp
        if not fast:
            if not gruppe:
                boks = _synlig_boks(rdoc, gh_doc)
            if boks is not None and boks.IsValid:
                d = boks.Diagonal * 0.04
                vp.ZoomBoundingBox(Rhino.Geometry.BoundingBox(boks.Min - d, boks.Max + d))
        rdoc.Views.Redraw()
        vp.ParentView.Redraw()
        if tilstand:
            mode = Rhino.Display.DisplayModeDescription.FindByName(tilstand)
            if mode is None:
                raise ValueError('Visningstilstanden "%s" findes ikke (fx Shaded, Rendered, Arctic).' % tilstand)
            gammel_tilstand = (vp, vp.DisplayMode)
            vp.DisplayMode = mode
            vp.ParentView.Redraw()
        if nr is not None and boks is not None:
            # samme format som viewporten, så skærmkoordinater kan skaleres direkte
            vb, vh = vp.Size.Width, vp.Size.Height
            bmp = _fang(vp.ParentView, int(bredde), int(round(int(bredde) * vh / float(vb))))
            bmp = _beskaer(bmp, vp, boks, bmp.Width / float(vb))
        else:
            bmp = _fang(vp.ParentView, int(bredde), int(hoejde))
        bmp.Save(sti, System.Drawing.Imaging.ImageFormat.Png)
        if _ensfarvet(bmp):
            print("ADVARSEL  %s ser tom ud (én farve). Vælg visningen %s i Rhino og tjek, at plottet "
                  "kan ses, og at preview er slået til på komponenten."
                  % (os.path.basename(sti), '"%s"' % navn if navn else "Top"))
        return sti
    finally:
        for o in skjulte_gh:
            o.Hidden = False
        for oid in skjulte_rhino:
            rdoc.Objects.Show(oid, True)
        if zoomet is not None:
            zoomet.PopViewProjection()
        if gammel_tilstand is not None:
            gammel_tilstand[0].DisplayMode = gammel_tilstand[1]
        rdoc.Views.Redraw()


def _beskaer(bmp, vp, boks, skala, margen=0.03):
    """Skær billedet til boksen (set fra viewporten) plus en lille margen."""
    import System
    xs, ys = [], []
    for pt in boks.GetCorners():
        c = vp.WorldToClient(pt)
        xs.append(c.X * skala)
        ys.append(c.Y * skala)
    mx = (max(xs) - min(xs)) * margen + 4
    my = (max(ys) - min(ys)) * margen + 4
    x0, y0 = max(0, int(min(xs) - mx)), max(0, int(min(ys) - my))
    x1, y1 = min(bmp.Width, int(max(xs) + mx)), min(bmp.Height, int(max(ys) + my))
    if x1 - x0 < 10 or y1 - y0 < 10:
        return bmp
    return bmp.Clone(System.Drawing.Rectangle(x0, y0, x1 - x0, y1 - y0), bmp.PixelFormat)


def _fang(view, bredde, hoejde):
    """Billede af visningen, helst uden gitter og akser (prøver flere metoder)."""
    import System
    import Rhino
    stoerrelse = System.Drawing.Size(bredde, hoejde)

    def uden_gitter():
        return view.CaptureToBitmap(stoerrelse, False, False, False)

    def view_capture():
        vc = Rhino.Display.ViewCapture()
        vc.Width = bredde
        vc.Height = hoejde
        vc.ScaleScreenItems = False
        vc.DrawAxes = False
        vc.DrawGrid = False
        vc.DrawGridAxes = False
        vc.TransparentBackground = False
        return vc.CaptureToBitmap(view)

    def almindelig():
        return view.CaptureToBitmap(stoerrelse)

    reserve = None
    for metode in (uden_gitter, view_capture, almindelig):
        try:
            bmp = metode()
        except Exception:
            continue
        if bmp is None:
            continue
        if _ensfarvet(bmp):
            reserve = reserve or bmp      # tomt billede - prøv de andre metoder
            continue
        return bmp
    if reserve is not None:
        return reserve
    raise ValueError("Rhino kunne ikke tage et billede af visningen.")


def _ensfarvet(bmp):
    """True, hvis billedet har samme farve overalt (fx helt hvidt). Tjekker tæt nok til at
    fange tynde streger."""
    try:
        w, h = bmp.Width, bmp.Height
        trin = max(1, min(w, h) // 400)
        foerste = bmp.GetPixel(0, 0).ToArgb()
        for y in range(0, h, trin):
            for x in range(0, w, trin):
                if bmp.GetPixel(x, y).ToArgb() != foerste:
                    return False
        return True
    except Exception:
        return False


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
            try:
                os.makedirs(bmappe)
            except Exception as e:
                raise IOError(
                    "Kan ikke oprette mappen %s (%s).\n"
                    "Opret mappen selv i Stifinder, eller brug en mappe, du ved virker, fx "
                    "C:\\Users\\<dig>\\Downloads\\eksport. Ligger Dokumenter i OneDrive, "
                    "eller blokerer Windows Sikkerhed (Beskyttet mappeadgang) Rhino, "
                    "kan Rhino ikke skrive i Dokumenter." % (bmappe, e))
        filer, navne, fejl = [], [], []
        b, h = g("_bredde_") or STANDARD_BREDDE, g("_hoejde_") or STANDARD_HOEJDE
        gh_doc = ghenv.Component.OnPingDocument()  # noqa: F821
        for bil in tolk_billeder(g("_billeder_")):
            numre = [bil["nr"]]
            if bil["nr"] == "hver":
                try:
                    antal = _gruppe_antal(gh_doc, _gruppe_medlemmer(gh_doc, bil["gruppe"])) if bil["gruppe"] else 0
                except Exception as e:
                    fejl.append("%s: %s" % (bil["fil"], e))
                    continue
                if not antal:
                    fejl.append('%s: "hver" kræver en gruppe med plots (gruppe:Navn)' % bil["fil"])
                    continue
                numre = list(range(1, antal + 1))
            for nr in numre:
                fil = bil["fil"] + ("_%d" % nr if bil["nr"] == "hver" else "")
                sti = os.path.join(bmappe, fil + ".png")
                try:
                    filer.append(tag_billede(bil["visning"], sti, b, h, bil["tilstand"], bil["gruppe"],
                                             bil["uden_rhino"], gh_doc, bil.get("fast"), nr))
                    navne.append(fil + ".png")
                    print("Billede: %s  <- %s%s" % (fil + ".png", bil["visning"] or "gruppe " + (bil["gruppe"] or ""),
                                                    " nr. %d" % nr if nr else ""))
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
        for a in tjek_resultater(res):
            print("ADVARSEL  " + a)
        scen = g("_scenarie_")
        if scen:
            smappe = os.path.join(mappe, "scenarier")
            if not os.path.isdir(smappe):
                os.makedirs(smappe)
            ssti = os.path.join(smappe, _filnavn("%s" % scen) + ".json")
            skriv_tekst(ssti, til_json(scenarie_resume(scen, res)))
            filer.append(ssti)
            print("Scenarie gemt: %s" % scen)
        for f in fejl:
            print("FEJL  " + f)
        print("Færdig - %d filer i %s" % (len(filer), mappe))
