"""
byg_indeklimanotat.py — notat om varmetab, termisk indeklima og dagslys i
Holst Engineerings layout, bygget direkte fra Grasshopper-eksporten.

    python energi/rapport/byg_indeklimanotat.py <eksportmappe> <projekt.yaml> [-o notat.pdf]

Eksportmappen er den, gh_eksport.py skriver:
    resultater.json   opbygninger, varmetab, overtemperatur, dagslys
    billeder/         model_syd.png, komfort.png, ...

projekt.yaml giver sagsoplysninger, logo og de antagelser, modellen ikke
kender (udluftning, vejrfil). Grænseværdier læses fra ../regler/br18_energi.yaml.

Layout: Holst Engineerings identitet fra Word-skabelonen (Manrope, navy
#252652 og grøn #5DBDAB, logo i sidehovedet, firmaoplysninger i sidefoden),
med Funktionen-notatets opbygning: forside, sammenfatning med status pr. krav,
nummererede afsnit, tabeller og figurer.
"""
import argparse
import json
import re
from datetime import date
from html import escape
from pathlib import Path

import yaml

import beskaer
import figurer
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.platypus import (BaseDocTemplate, Frame, Image, KeepTogether, NextPageTemplate,
                                PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle)

HER = Path(__file__).resolve().parent
REGLER = HER.parent / "regler" / "br18_energi.yaml"

# ── stil: sort/hvid og minimalistisk ───────────────────────────────────────
SORT = colors.black
GRAA = colors.HexColor("#6b6b6b")

for vaegt, navn in ((300, "Man-Light"), (400, "Man"), (600, "Man-Semi"), (700, "Man-Bold")):
    pdfmetrics.registerFont(TTFont(navn, str(HER / "fonts" / ("Manrope-%d.ttf" % vaegt))))
pdfmetrics.registerFontFamily("Man", normal="Man", bold="Man-Bold", italic="Man", boldItalic="Man-Bold")

W, H = A4
VM = HM = 22 * mm
TOP, BUND = 32 * mm, 24 * mm
BREDDE = W - VM - HM

BROED = ParagraphStyle("broed", fontName="Man", fontSize=9, leading=14, spaceAfter=7, textColor=SORT)
H1 = ParagraphStyle("h1", parent=BROED, fontName="Man-Bold", fontSize=10, leading=14,
                    spaceBefore=16, spaceAfter=8, keepWithNext=1)
H2 = ParagraphStyle("h2", parent=BROED, fontName="Man-Bold", fontSize=9, leading=13,
                    spaceBefore=10, spaceAfter=4, keepWithNext=1)
CELLE = ParagraphStyle("celle", parent=BROED, fontSize=8.2, leading=11, spaceAfter=0)
CELLE_FED = ParagraphStyle("cellefed", parent=CELLE, fontName="Man-Bold")
CELLE_H = ParagraphStyle("celleh", parent=CELLE, fontName="Man-Bold")
FIGTEKST = ParagraphStyle("fig", parent=BROED, fontSize=8, leading=11, textColor=GRAA, spaceBefore=4)
FIGTEKST_C = ParagraphStyle("figc", parent=FIGTEKST, alignment=1)
NOTE = ParagraphStyle("note", parent=BROED, fontSize=8, leading=11, textColor=GRAA)
TOC1 = ParagraphStyle("toc1", parent=BROED, fontName="Man-Bold", fontSize=8.5, leading=11,
                      leftIndent=9 * mm, firstLineIndent=-9 * mm, spaceBefore=4)
INFO_ETIKET = ParagraphStyle("ie", parent=BROED, fontName="Man-Bold", fontSize=8.5, leading=12, spaceAfter=0)
INFO_VAERDI = ParagraphStyle("iv", parent=BROED, fontSize=8.5, leading=12, spaceAfter=0)


# ── hjælpere ────────────────────────────────────────────────────────────────
def tal(x, dec=1):
    """Dansk talformat: 1.234,5"""
    if x is None:
        return "–"
    s = ("{:,.%df}" % dec).format(float(x))
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def p(tekst, stil=BROED):
    return Paragraph(tekst, stil)


def tabel(rows, bredder, hoejre=(), fed_sidste=False, samlet=True, **_):
    """Akademisk tabel (booktabs): streg over, under overskriften og under tabellen.
    rows[0] = overskrift. Kolonner i `hoejre` højrestilles."""
    data = []
    for i, r in enumerate(rows):
        celler = []
        for j, c in enumerate(r):
            if isinstance(c, Paragraph):
                celler.append(c)
                continue
            stil = CELLE_H if i == 0 else (CELLE_FED if fed_sidste and i == len(rows) - 1 else CELLE)
            if j in hoejre:
                stil = ParagraphStyle("h", parent=stil, alignment=2)
            celler.append(Paragraph(escape("%s" % c), stil))
        data.append(celler)
    t = Table(data, colWidths=bredder, repeatRows=1, hAlign="LEFT")
    stil = [("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 2.6), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.6),
            ("LEFTPADDING", (0, 0), (0, -1), 0), ("LEFTPADDING", (1, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("LINEABOVE", (0, 0), (-1, 0), 0.9, SORT),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, SORT),
            ("LINEBELOW", (0, -1), (-1, -1), 0.9, SORT),
            ("TOPPADDING", (0, 1), (-1, 1), 4)]
    if fed_sidste and len(rows) > 2:
        stil.append(("LINEABOVE", (0, -1), (-1, -1), 0.5, SORT))
    t.setStyle(TableStyle(stil))
    return KeepTogether([t]) if samlet and len(rows) <= 14 else t


KONKL = ParagraphStyle("konkl", parent=BROED, fontSize=9.5, leading=14.5, spaceAfter=0)
PUNKT = ParagraphStyle("punkt", parent=BROED, leftIndent=5 * mm, bulletIndent=0)


def konklusion(*tekster):
    """Konklusion fremhævet med en lodret streg i venstre side."""
    t = Table([[Paragraph("<br/><br/>".join(tekster), KONKL)]], colWidths=[BREDDE], hAlign="LEFT")
    t.setStyle(TableStyle([("LINEBEFORE", (0, 0), (0, 0), 2, SORT),
                           ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                           ("TOPPADDING", (0, 0), (-1, -1), 1.5 * mm), ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm)]))
    return [Spacer(1, 1 * mm), t, Spacer(1, 5 * mm)]


FORELOEBIG = [False]   # sættes i byg, når der er udestående punkter


def status(ok, tekst=None):
    """Status som almindelig tekst. Ikke overholdt fremhæves med fed. I et foreløbigt notat
    står der 'Foreløbigt overholdt', så resultatet ikke ser endeligt ud."""
    if ok is None:
        return Paragraph(escape(tekst or "Ikke beregnet"), CELLE)
    if ok:
        t = tekst or "Overholdt"
        if FORELOEBIG[0]:
            t = "Foreløbigt " + t[0].lower() + t[1:]
        return Paragraph(escape(t), CELLE)
    return Paragraph(escape(tekst or "Ikke overholdt"), CELLE_FED)


_FIGNR = [0]
FIGMAPPE = [None]     # mappe til figurer tegnet fra data (sættes i byg)
SCENARIER = [[]]      # resuméer fra eksportmappen/scenarier (sættes i byg)


def figur(sti, tekst, maks_h=105 * mm):
    if not sti or not Path(sti).exists():
        return []
    _FIGNR[0] += 1
    iw, ih = ImageReader(str(sti)).getSize()
    b = BREDDE
    h = b * ih / float(iw)
    if h > maks_h:
        h, b = maks_h, maks_h * iw / float(ih)
    billede = Image(str(sti), width=b, height=h)
    billede.hAlign = "CENTER"
    return [KeepTogether([Spacer(1, 3 * mm), billede,
                          p("Figur %d – %s" % (_FIGNR[0], escape(tekst)), FIGTEKST_C), Spacer(1, 2 * mm)])]


class Overskrift(Paragraph):
    """Nummereret afsnitsoverskrift med versaler; kommer i indholdsfortegnelsen."""
    def __init__(self, nr, tekst):
        self.toc_tekst = "%s\u00a0\u00a0%s" % (nr, tekst.upper()) if nr else tekst.upper()
        Paragraph.__init__(self, "%s&nbsp;&nbsp;&nbsp;%s" % (nr, escape(tekst.upper())), H1)


# ── sider ───────────────────────────────────────────────────────────────────
class TaelCanvas(rl_canvas.Canvas):
    """Canvas der kender det samlede sidetal (til 'Side x af y')."""
    def __init__(self, *a, **k):
        rl_canvas.Canvas.__init__(self, *a, **k)
        self._sider = []

    def showPage(self):
        self._sider.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        n = len(self._sider)
        for s in self._sider:
            self.__dict__.update(s)
            if self._pageNumber > 1:
                self.setFont("Man", 7)
                self.setFillColor(GRAA)
                self.drawRightString(W - HM, 12 * mm, "%d / %d" % (self._pageNumber, n))
            rl_canvas.Canvas.showPage(self)
        rl_canvas.Canvas.save(self)


def _logo(c, prj, x_hoejre, y, h):
    """Logo højrestillet med højre kant i x_hoejre. Uden logo: firmanavn som tekst."""
    logo = prj.get("_logo")
    if logo and Path(logo).exists():
        iw, ih = ImageReader(str(logo)).getSize()
        b = h * iw / float(ih)
        c.drawImage(str(logo), x_hoejre - b, y, width=b, height=h, mask="auto")
        return
    c.setFont("Man", 8)
    c.setFillColor(SORT)
    c.drawRightString(x_hoejre, y + h / 2, prj.get("firma") or "")


def _sidefod(c, prj):
    c.setFont("Man", 7)
    c.setFillColor(GRAA)
    c.drawString(VM, 12 * mm, prj.get("sidefod") or "")


def side_indhold(c, doc):
    prj = doc.prj
    c.saveState()
    _logo(c, prj, W - HM, H - 21 * mm, 10 * mm)
    c.setFont("Man-Bold", 7.5)
    c.setFillColor(SORT)
    c.drawString(VM, H - 20 * mm, prj.get("kort_titel") or prj.get("sag", ""))
    c.setStrokeColor(SORT)
    c.setLineWidth(0.5)
    c.line(VM, H - 23.5 * mm, W - HM, H - 23.5 * mm)
    _sidefod(c, prj)
    c.restoreState()


def side_forside(c, doc):
    """Forside: stor, let titel, projektlinje, billede og sagsoplysninger i bunden."""
    prj = doc.prj
    c.saveState()
    _logo(c, prj, W - HM, H - 38 * mm, 18 * mm)
    c.setFillColor(GRAA)
    c.setFont("Man-Bold", 7.5)
    c.drawString(VM, H - 30 * mm, ("%s" % (prj.get("dokumenttype") or "Notat")).upper())
    c.setFillColor(SORT)
    y = H - 78 * mm
    c.setFont("Man-Light", 27)
    for linje in prj.get("titel_linjer") or [prj.get("emne", "")]:
        c.drawString(VM, y, "%s" % linje)
        y -= 11 * mm
    y -= 3 * mm
    c.setFont("Man-Semi", 10.5)
    for linje in prj.get("projekt_linjer") or [prj.get("sag", "")]:
        c.drawString(VM, y, "%s" % linje)
        y -= 6 * mm
    omslag = prj.get("_omslag")
    bund = 62 * mm
    if omslag and Path(omslag).exists():
        iw, ih = ImageReader(str(omslag)).getSize()
        bh, bb = y - 10 * mm - bund, BREDDE
        f = min(bb / iw, bh / ih)
        c.drawImage(str(omslag), VM + (bb - iw * f) / 2, bund + (bh - ih * f) / 2, width=iw * f, height=ih * f,
                    mask="auto")
    # sagsoplysninger i en række nederst
    c.setStrokeColor(SORT)
    c.setLineWidth(0.5)
    c.line(VM, 48 * mm, W - HM, 48 * mm)
    felter = [("Adresse", prj.get("adresse")), ("Fase", prj.get("fase")), ("Dato", prj.get("_dato")),
              ("Revision", prj.get("_rev") or "0")]
    kol = BREDDE / len(felter)
    for k, (etiket, vaerdi) in enumerate(felter):
        x = VM + k * kol
        c.setFillColor(GRAA)
        c.setFont("Man-Bold", 6.5)
        c.drawString(x, 43 * mm, etiket.upper())
        c.setFillColor(SORT)
        c.setFont("Man", 8.5)
        c.drawString(x, 38 * mm, "%s" % (vaerdi or "–"))
    _sidefod(c, prj)
    c.restoreState()


class Notat(BaseDocTemplate):
    def __init__(self, fil, prj):
        BaseDocTemplate.__init__(self, str(fil), pagesize=A4, title=prj.get("kort_titel", ""),
                                 author=prj.get("firma", ""))
        self.prj = prj
        ramme = Frame(VM, BUND, BREDDE, H - TOP - BUND, id="indhold", leftPadding=0, rightPadding=0,
                      topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate("forside", [ramme], onPage=side_forside),
                               PageTemplate("indhold", [ramme], onPage=side_indhold)])

    def afterFlowable(self, f):
        if isinstance(f, Overskrift):
            self.notify("TOCEntry", (0, f.toc_tekst, self.page))


def side_info(prj):
    """Side 2: sagsoplysninger og indholdsfortegnelse (som i Funktionen-notatet)."""
    felter = [("PROJEKT", prj.get("sag")), ("ADRESSE", prj.get("adresse")), ("MATRIKEL", prj.get("matrikel")),
              ("SAGSNR.", prj.get("sagsnr")), ("FASE", prj.get("fase")), ("DATO", prj["_dato"]),
              ("REVISION", prj.get("_rev")), ("UDARBEJDET", prj.get("udarbejdet")),
              ("KONTROLLERET", prj.get("kontrolleret"))]
    rows = [[Paragraph(k, INFO_ETIKET), Paragraph(escape("%s" % v), INFO_VAERDI)] for k, v in felter if v]
    info = Table(rows, colWidths=[32 * mm, BREDDE - 32 * mm], hAlign="LEFT")
    info.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 1),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    toc = TableOfContents(dotsMinLevel=0)
    toc.levelStyles = [TOC1]
    kant = Table([[Paragraph("INDHOLD", H1)]], colWidths=[BREDDE], hAlign="LEFT")
    kant.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, SORT), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    return [info, Spacer(1, 14 * mm), kant, Spacer(1, 2 * mm), toc, PageBreak()]


# ── indhold ─────────────────────────────────────────────────────────────────
def _br18(prj):
    try:
        regler = yaml.safe_load(REGLER.read_text(encoding="utf-8"))
        vid = prj.get("regelversion")
        for v in regler["versioner"]:
            if not vid or v["id"] == vid:
                return v
    except Exception:
        pass
    return {"sommerhus": {"u_vaerdier": {"ydervaeg": 0.25, "terraendaek": 0.15, "loft_tag": 0.15,
                                         "vinduer_doere_glas": 1.80}, "glasandel_max": 0.30},
            "termisk_indeklima": {"timer_over_27_max": 100, "timer_over_28_max": 25,
                                  "klimafil": "DRY 2013"},
            "dagslys": {"glasareal_andel_min": 0.10, "lux": 300}}


def _som_liste(x):
    if x is None:
        return []
    return x if isinstance(x, list) else [x]


TAL_STOR = ParagraphStyle("talstor", parent=BROED, fontName="Man-Light", fontSize=24, leading=27, spaceAfter=0)
TAL_TEKST = ParagraphStyle("taltekst", parent=BROED, fontSize=7.5, leading=10, textColor=GRAA, spaceAfter=0)


def noegletal(felter):
    """Række af store tal: [(tal, enhed, tekst), ...] med en tynd streg over hvert felt."""
    if not felter:
        return []
    celler = [[Paragraph('%s<font name="Man" size="10"> %s</font>' % (escape(t), escape(e)), TAL_STOR),
               Paragraph(tekst, TAL_TEKST)] for t, e, tekst in felter]
    b = BREDDE / len(felter)
    t = Table([[c[0] for c in celler], [c[1] for c in celler]], colWidths=[b] * len(felter), hAlign="LEFT")
    t.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), 0.9, SORT),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                           ("TOPPADDING", (0, 0), (-1, 0), 6), ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
                           ("TOPPADDING", (0, 1), (-1, 1), 2)]))
    return [t, Spacer(1, 7 * mm)]


def _noegletal_felter(res, regler):
    felter = []
    ot, ti = res.get("overtemperatur"), regler["termisk_indeklima"]
    if ot and ot.get("rum"):
        v = max(ot["rum"], key=lambda r: r["timer"].get("over_27", 0))
        for g, maks in ((27, ti["timer_over_27_max"]), (28, ti["timer_over_28_max"])):
            h = v["timer"].get("over_%d" % g, 0)
            felter.append((tal(h, 0), "h", "over %d °C i %s<br/>kriterie højst %d h%s"
                           % (g, escape(v["rum"]), maks, " · <b>ikke overholdt</b>" if h > maks else "")))
    dl = res.get("dagslys")
    if isinstance(dl, list) and len(dl) == 1:
        dl = dl[0]
    if isinstance(dl, dict) and dl.get("rum"):
        lav = min(dl["rum"], key=lambda r: r["andel_pct"])
        felter.append((tal(lav["andel_pct"], 0), "%", "af gulvet med 300 lux i %s<br/>kriterie mindst %s %%%s"
                       % (escape(lav["rum"]), tal(dl.get("krav_pct", 50), 0),
                          "" if lav["ok"] else " · <b>ikke overholdt</b>")))
    vt = res.get("varmetab")
    if vt:
        felter.append((tal(vt["projekt_sum_W_K"], 0), "W/K", "H<sub>T</sub> mod en ramme på %s W/K"
                       % tal(vt["ramme_sum_W_K"], 0)))
    else:
        for o in (res.get("opbygninger") or {}).get("opbygninger") or []:
            if o.get("type") == "Ydervæg":
                felter.append((tal(o["U_W_m2K"], 3), "W/m²K", "U-værdi for ydervæggen<br/>krav højst %s W/m²K"
                               % tal(regler["sommerhus"]["u_vaerdier"].get("ydervaeg", 0.25), 2)))
    return felter[:4]


GENERISK_RUM = re.compile(r"^(residence|rum|room|zone)\s*\d+$", re.I)


def udestaaende(res, prj):
    """Kontrol af, om beregningsgrundlaget er afklaret nok til endelig dokumentation.
    Returnerer en liste af punkter; er den tom, er notatet endeligt."""
    ud = []
    dl_prj = prj.get("dagslys") or {}
    vt = res.get("varmetab") or {}
    ot = res.get("overtemperatur") or {}
    a_et = vt.get("opvarmet_etageareal_m2") or 0
    a_tag = (vt.get("arealer_m2") or {}).get("tag") or 0
    if a_et and a_tag < 0.6 * a_et:
        ud.append("Tagarealet i modellen er %s m² mod et opvarmet etageareal på %s m². Kontrollér, at alle "
                  "tagflader er klassificeret som tag (fx tagvinkel på HB Room from Solid), og vedlæg en "
                  "arealopgørelse." % (tal(a_tag), tal(a_et)))
    if res.get("dagslys"):
        h = dl_prj.get("maaleplan_m")
        if h is None or abs(float(h) - 0.50) > 0.005:
            ud.append("Dagslys skal for boliger beregnes på et måleplan 0,50 m over gulv (BR18's "
                      "dagslysvejledning). %s" % ("Måleplanet er ikke angivet." if h is None else
                                                 "Beregningen er udført i %s m." % tal(h, 2)))
        if (dl_prj.get("tidsgrundlag") or "").lower() != "dagslystimer":
            ud.append("Dagslyset skal opgøres for vejledningens dagslystimer (den halvdel af årets timer med "
                      "mest dagslys). Tidsgrundlaget for beregningen er ikke dokumenteret som sådan.")
    if not prj.get("u_vaerdier_endelige"):
        ud.append("U-værdierne er beregnet for homogene lag uden træskelet, spær og samlinger. Endelige "
                  "U-værdier efter DS 418 og vinduesdata (Uw for hele vinduet) fra producenten skal indgå i "
                  "både varmetabsramme og indeklimaberegning.")
    if ot.get("rum") and not ot.get("ok"):
        ud.append("Grænserne for termisk indeklima er overskredet i %s. En konkret løsning (glas, "
                  "solafskærmning, styring og åbningsarealer) skal vælges og eftervises med ny beregning af "
                  "både temperaturer og dagslys." % ", ".join(r["rum"] for r in ot["rum"] if not r["ok"]))
    navne = [r["rum"] for r in ot.get("rum") or []]
    if navne and all(GENERISK_RUM.match(n) for n in navne):
        ud.append("Beregningszonerne har ikke rumnavne. En plan med rum, funktioner, arealer og zoner skal "
                  "vedlægges, og soverum skal vurderes særskilt.")
    zoner = sorted((r.get("areal_m2") or 0 for r in vt.get("dim_varmetab_pr_rum") or []), reverse=True)
    if len(zoner) > 1 and zoner[0] > 50 and zoner[0] > 3 * zoner[1]:
        ud.append("Én beregningszone på %s m² samler en stor del af huset. Lokale problemer i de enkelte rum "
                  "kan derfor være skjult; kritiske rum bør modelleres som egne zoner." % tal(zoner[0]))
    arbejde = prj.get("byggearbejde") or []
    if "ombygning" in arbejde and not prj.get("bygningsdele"):
        ud.append("Projektet omfatter ombygning og tilbygning. Det skal fremgå, hvilke bygningsdele der "
                  "bevares, ændres og opføres nye, og hvilke krav (§§ 283–285) der gælder for hver.")
    if not (prj.get("indeklima") or {}).get("ventilation_princip"):
        ud.append("Grundventilationen (%s l/s pr. m²) er en modelforudsætning. Ventilationsprincip, "
                  "udeluftventiler, aftræk og luftoverføring skal beskrives (BR18 §§ 443–446)."
                  % tal(((res.get("opbygninger") or {}).get("program") or {}).get("friskluft_l_s_m2", 0.3), 2))
    if not ((prj.get("indeklima") or {}).get("udluftning") or {}).get("aabningsareal_m2"):
        ud.append("Udluftningen er modelleret som en andel af vinduesarealet. Hvilke vinduer der kan åbnes, det "
                  "frie åbningsareal pr. rum og en følsomhedsberegning med mindre udluftning skal dokumenteres.")
    return ud + list(prj.get("udestaaende") or [])


def afsnit_udestaaende(punkter):
    if not punkter:
        return []
    ud = [p("Udestående før endelig dokumentation", H2),
          p("Notatet er foreløbigt. Resultaterne kan bruges til at vælge løsninger, men følgende skal være "
            "afklaret, før de kan bruges som endelig dokumentation over for kommunen:")]
    for t in punkter:
        ud.append(Paragraph(escape(t), PUNKT, bulletText="–"))
    return ud


def afsnit_sammenfatning(res, regler):
    ud = [Overskrift("2.", "Sammenfatning")]
    ud += noegletal(_noegletal_felter(res, regler))
    rows = [["Emne", "Krav", "Resultat", "Status"]]
    vt = res.get("varmetab")
    if vt:
        rows.append(["Varmetabsramme", "§ 284: varmetab højst som referencen (DS 418)",
                     "Projekt %s W/K mod ramme %s W/K" % (tal(vt["projekt_sum_W_K"]), tal(vt["ramme_sum_W_K"])),
                     status(vt.get("overholdt"))])
    else:
        rows.append(["Varmetabsramme", "§ 284 (DS 418)", "–", status(None)])
    opb = res.get("opbygninger") or {}
    graenser = regler["sommerhus"]["u_vaerdier"]
    u_ok = _u_overholdt(opb, graenser)
    rows.append(["U-værdier", "§ 283, bilag 2 tabel 4", "Se afsnit 4", status(u_ok)])
    ot = res.get("overtemperatur")
    ti = regler["termisk_indeklima"]
    if ot and ot.get("rum"):
        vaerst = max(ot["rum"], key=lambda r: r["timer"].get("over_27", 0))
        rows.append(["Termisk indeklima", "§ 386, vejledningens boligkriterier: højst %d h over 27 °C og %d h over 28 °C"
                     % (ti["timer_over_27_max"], ti["timer_over_28_max"]),
                     "Værste rum: %s, %d h / %d h" % (vaerst["rum"], vaerst["timer"].get("over_27", 0),
                                                      vaerst["timer"].get("over_28", 0)),
                     status(ot.get("ok"))])
    else:
        rows.append(["Termisk indeklima", "§ 386", "–", status(None)])
    dl = res.get("dagslys")
    if isinstance(dl, list) and len(dl) == 1 and isinstance(dl[0], dict):
        dl = dl[0]
    if isinstance(dl, dict) and dl.get("rum"):
        laveste = min(dl["rum"], key=lambda r: r["andel_pct"])
        rows.append(["Dagslys", "§ 379: 300 lux på halvdelen af gulvet i halvdelen af dagslystimerne",
                     "Laveste: %s, %s %%" % (laveste["rum"], tal(laveste["andel_pct"], 0)),
                     status(dl.get("ok"), "Opfyldt" if dl.get("ok") else "Ikke opfyldt")])
    else:
        rows.append(["Dagslys", "§ 379: 10 %-regel eller 300 lux", "Se afsnit 7" if dl else "–",
                     status(None, "Se afsnit 7") if dl else status(None)])
    tabellen = tabel(rows, [30 * mm, 52 * mm, 60 * mm, 28 * mm])
    konkl = []
    if vt:
        konkl.append("Varmetabsrammen er %s med en vinduesandel på %s %% af det opvarmede etageareal."
                     % (("foreløbigt overholdt" if FORELOEBIG[0] else "overholdt") if vt.get("overholdt")
                        else "<b>ikke</b> overholdt",
                        tal(100 * vt["glasandel"], 0)))
    if ot and ot.get("rum"):
        if ot.get("ok"):
            konkl.append("Alle rum overholder vejledningens kriterier for termisk indeklima under de angivne "
                         "forudsætninger for udluftning (afsnit 6).")
        else:
            daarlige = [r["rum"] for r in ot["rum"] if not r["ok"]]
            konkl.append("Vejledningens kriterier for termisk indeklima er overskredet i %s. Projektet er ikke "
                         "afklaret på dette punkt; en konkret løsning skal vælges og eftervises (afsnit 6)."
                         % escape(", ".join(daarlige)))
    if konkl:
        ud += konklusion(*konkl)
    ud.append(tabellen)
    return ud


def _u_overholdt(opb, graenser):
    noegle = {"Ydervæg": "ydervaeg", "Tag": "loft_tag", "Terrændæk": "terraendaek"}
    tjek = [o["U_W_m2K"] <= graenser[noegle[o["type"]]] for o in opb.get("opbygninger", []) if o["type"] in noegle]
    if opb.get("vindue"):
        tjek.append(opb["vindue"]["U_W_m2K"] <= graenser["vinduer_doere_glas"])
    return all(tjek) if tjek else None


def afsnit_grundlag(prj, res, regler):
    ik = prj.get("indeklima") or {}
    ud = [Overskrift("3.", "Beregningsgrundlag")]
    ud.append(p("Beregningerne er udført i en samlet parametrisk model i Rhino/Grasshopper med Ladybug Tools. "
                "Termisk indeklima er beregnet time for time med EnergyPlus (via OpenStudio), dagslys med "
                "Radiance, og varmetabsrammen efter DS 418 direkte på modellens arealer og længder."))
    rows = [["Forudsætning", "Værdi"],
            ["Tegningsgrundlag", prj.get("grundlag") or "–"],
            ["Bygningsreglement", prj.get("regel_tekst") or "BR18 (version gældende for byggesagen skal angives)"],
            ["Vejrdata", ik.get("vejrfil") or regler["termisk_indeklima"].get("klimafil", "DRY 2013")],
            ["Beregningsprogrammer", ik.get("program_version") or "Ladybug Tools / EnergyPlus / Radiance"],
            ["Brugsprofil", ik.get("brugsprofil") or "SBi-anvisning 213 (udgave skal angives)"]]
    ud.append(tabel(rows, [55 * mm, BREDDE - 55 * mm]))
    prog = (res.get("opbygninger") or {}).get("program")
    if prog:
        ud.append(p("Brug og drift", H2))
        ud.append(p("Interne laster og luftskifte er sat efter %s og regnes konstant hele året. "
                    "Der er ingen mekanisk køling, så temperaturen svinger frit om sommeren." % escape(prog["navn"])))
        rows = [["Parameter", "Værdi"],
                ["Personer", "%s W/m²" % tal(prog["personer_w_m2"])],
                ["Udstyr", "%s W/m²" % tal(prog["udstyr_w_m2"])],
                ["Belysning", "%s W/m²" % tal(prog["belysning_w_m2"])],
                ["Friskluft", "%s l/s pr. m² etageareal" % tal(prog["friskluft_l_s_m2"], 2)],
                ["Infiltration", "%s l/s pr. m² facade" % tal(prog["infiltration_l_s_m2_facade"], 2)],
                ["Opvarmning", "%s °C" % tal(prog["opvarmning_c"], 0)],
                ["Køling", "Ingen"]]
        ud.append(tabel(rows, [60 * mm, 50 * mm], hoejre=(1,)))
    udl = ik.get("udluftning")
    if udl:
        ud.append(p("Udluftning", H2))
        ud.append(p("Oplukkelige vinduer åbnes i modellen, når det er varmt inde og køligere ude. "
                    "Udluftningen har stor betydning for resultatet og forudsætter, at beboerne lufter ud. "
                    "Hvilke vinduer der kan åbnes, og deres frie åbningsareal, skal svare til projektet."))
        rows = [["Parameter", "Værdi"],
                ["Vinduer åbnes ved indetemperatur over", "%s °C" % tal(udl.get("min_inde_c"), 0)],
                ["Kun når udetemperaturen er mindst", "%s °C" % tal(udl.get("min_ude_c"), 0)],
                ["og mindst så meget lavere end inde", "%s °C" % tal(udl.get("delta_c"), 0)],
                ["Oplukkelig andel af vinduesarealet", "%s %%" % tal(100 * udl.get("andel_oplukkelig", 0), 0)],
                ["Udledningskoefficient", tal(udl.get("udledningskoefficient"), 2)]]
        ud.append(tabel(rows, [80 * mm, 30 * mm], hoejre=(1,)))
    return ud


def afsnit_opbygninger(res, regler):
    opb = res.get("opbygninger") or {}
    graenser = regler["sommerhus"]["u_vaerdier"]
    noegle = {"Ydervæg": "ydervaeg", "Tag": "loft_tag", "Terrændæk": "terraendaek"}
    ud = [Overskrift("4.", "Klimaskærm og opbygninger")]
    if not opb.get("opbygninger") and not opb.get("vindue"):
        return ud + [p("Opbygningerne er ikke eksporteret fra modellen.")]
    ud.append(p("U-værdierne er beregnet efter DS/EN ISO 6946 ud fra lagene i modellen og sammenholdt med "
                "kravene for sommerhuse i BR18 bilag 2, tabel 4. Lagene regnes som homogene; træskelet og spær "
                "er ikke medregnet. Værdierne er derfor foreløbige og skal eftervises efter DS 418 med de "
                "endelige opbygninger. Terrændækkets værdi er en lagberegning; varmetabet til jord er "
                "håndteret med temperaturfaktoren i afsnit 5."))
    rows = [["Bygningsdel", "Opbygning", "U [W/m²K]", "Krav", "Status"]]
    for o in opb.get("opbygninger", []):
        krav = graenser.get(noegle.get(o["type"]))
        rows.append([o["type"], o["navn"], tal(o["U_W_m2K"], 3), tal(krav, 2) if krav else "–",
                     status(o["U_W_m2K"] <= krav if krav else None)])
    v = opb.get("vindue")
    if v:
        rows.append(["Vinduer", v["navn"], tal(v["U_W_m2K"], 2), tal(graenser["vinduer_doere_glas"], 2),
                     status(v["U_W_m2K"] <= graenser["vinduer_doere_glas"])])
    ud.append(tabel(rows, [26 * mm, 70 * mm, 22 * mm, 18 * mm, 34 * mm], hoejre=(2, 3)))
    for o in opb.get("opbygninger", []):
        blok = [p("%s: %s" % (o["type"], escape(o["navn"])), H2)]
        rows = [["Lag (udefra og ind)", "Tykkelse [mm]", "Lambda [W/mK]", "R [m²K/W]"]]
        for lag in o["lag"]:
            rows.append([lag["materiale"], tal(lag["tykkelse_mm"], 0), tal(lag["lambda_W_mK"], 3),
                         tal(lag["R_m2K_W"], 2)])
        rows.append(["U-værdi inkl. overgangsmodstande", "", "", "%s W/m²K" % tal(o["U_W_m2K"], 3)])
        blok.append(tabel(rows, [80 * mm, 30 * mm, 30 * mm, 30 * mm], hoejre=(1, 2, 3), fed_sidste=True,
                          samlet=False))
        ud.append(KeepTogether(blok))
    if v:
        ud.append(p("Glas", H2))
        ud.append(p("Vinduerne er regnet som %s med U = %s W/m²K, brugt som U-værdi for hele vinduet, og en rude "
                    "med g-værdi %s og lystransmittans %s. Samme vindue er brugt i energi-, indeklima- og "
                    "dagslysberegningen. Det skal bekræftes med produktdata, at U-værdien gælder hele vinduet "
                    "(Uw inkl. karm og ramme) og ikke kun ruden (Ug)."
                    % (escape(v["navn"]), tal(v["U_W_m2K"], 2), tal(v["g"], 2), tal(v["LT"], 2))))
    return ud


def afsnit_varmetab(res, regler):
    vt = res.get("varmetab")
    ud = [Overskrift("5.", "Varmetabsramme")]
    if not vt:
        return ud + [p("Varmetabsrammen er ikke eksporteret fra modellen.")]
    gmax = regler["sommerhus"]["glasandel_max"]
    over = vt.get("glasandel_over_30")
    ud.append(p("Huset har et opvarmet etageareal på %s m² og %s m² vinduer og yderdøre, svarende til en "
                "vinduesandel på %s %%. %s"
                % (tal(vt["opvarmet_etageareal_m2"]), tal(vt["glasareal_m2"]), tal(100 * vt["glasandel"], 0),
                   ("Det er mere end de %s %%, BR18 § 284 tillader uden videre. Energikravet dokumenteres derfor "
                    "med en varmetabsramme efter § 284, stk. 2: husets transmissionsvarmetabskoefficient H<sub>T</sub> "
                    "[W/K] må ikke være større end for et referencehus med samme geometri, U-værdier efter "
                    "tabel 4 og højst %s %% vinduer og døre."
                    % (tal(100 * gmax, 0), tal(100 * gmax, 0))) if over else
                   ("Det er inden for de %s %% i § 284, så komponentkravene i afsnit 4 er tilstrækkelige. "
                    "Varmetabsrammen efter DS 418 er vist til orientering." % tal(100 * gmax, 0)))))
    rows = [["Bygningsdel", "Projekt [W/K]", "Ramme [W/K]"]]
    for k in vt["projekt_W_K"]:
        rows.append([k, tal(vt["projekt_W_K"][k]), tal(vt["ramme_W_K"].get(k))])
    rows.append(["Samlet", tal(vt["projekt_sum_W_K"]), tal(vt["ramme_sum_W_K"])])
    ud.append(tabel(rows, [90 * mm, 40 * mm, 40 * mm], hoejre=(1, 2), fed_sidste=True))
    ud.append(Spacer(1, 3 * mm))
    margin = 100 * (1 - vt["projekt_sum_W_K"] / vt["ramme_sum_W_K"]) if vt["ramme_sum_W_K"] else 0
    ud.append(p("<b>Varmetabsrammen er %s.</b> Projektets transmissionsvarmetabskoefficient er %s %% %s rammen."
                % (("foreløbigt overholdt" if FORELOEBIG[0] else "overholdt") if vt.get("overholdt")
                   else "ikke overholdt", tal(abs(margin), 0),
                   "under" if margin >= 0 else "over")))
    if FIGMAPPE[0]:
        ud += figur(figurer.varmetab(vt, FIGMAPPE[0] / "varmetab.png"),
                    "Varmetab pr. bygningsdel for projektet og referencerammen.", maks_h=80 * mm)
    psi = vt.get("psi_W_mK") or {}
    ud.append(p("Linjetab: vindues- og dørsamlinger %s W/mK, fundament %s W/mK, ovenlys %s W/mK. "
                "Terrændæk og fundament er vægtet med temperaturfaktoren (θ<sub>gulv</sub> − θ<sub>jord</sub>) / "
                "(θ<sub>i</sub> − θ<sub>e</sub>) = (30 − 10) / (20 − (−12)) = %s, svarende til gulvvarme med "
                "30 °C i gulvet og 10 °C i jorden. Metoden og forudsætningerne for jord og perimeter skal "
                "bekræftes efter DS 418."
                % (tal(psi.get("vindue"), 2), tal(psi.get("fundament"), 2), tal(psi.get("ovenlys"), 2),
                   tal(vt.get("jordfaktor"), 3)), NOTE))
    rum = vt.get("dim_varmetab_pr_rum") or []
    if rum:
        ud.append(p("Dimensionerende varmetab", H2))
        ud.append(p("Ved −12 °C ude og 20 °C inde (24 °C i rum, hvis navn indeholder »bad«): transmission "
                    "plus opvarmning af friskluft uden varmegenvinding. Infiltration er ikke medregnet. Tallene "
                    "er vejledende for dimensionering af varmeanlægget."))
        rows = [["Rum", "Areal [m²]", "Transmission [W]", "Ventilation [W]", "I alt [W]", "[W/m²]"]]
        for r in rum:
            rows.append([r["rum"], tal(r["areal_m2"]), tal(r["transmission_W"], 0), tal(r["ventilation_W"], 0),
                         tal(r["i_alt_W"], 0), tal(r["W_m2"])])
        rows.append(["I alt", tal(sum(r["areal_m2"] for r in rum)), "", "", tal(vt["dim_varmetab_i_alt_W"], 0), ""])
        ud.append(tabel(rows, [50 * mm, 22 * mm, 28 * mm, 26 * mm, 22 * mm, 22 * mm],
                        hoejre=(1, 2, 3, 4, 5), fed_sidste=True))
    return ud


def afsnit_indeklima(res, regler, billeder):
    ot = res.get("overtemperatur")
    ti = regler["termisk_indeklima"]
    ud = [Overskrift("6.", "Termisk indeklima")]
    ud.append(p("Det termiske indeklima er beregnet time for time for et helt år med %s. BR18 § 386 er et "
                "funktionskrav. Resultaterne er vurderet efter boligkriterierne i vejledningen til § 386: den "
                "operative temperatur bør højst overstige 27 °C i %d timer og 28 °C i %d timer om året i "
                "boliger med mulighed for udluftning. Timerne er her talt over alle årets timer og ikke kun "
                "brugstiden, hvilket er på den sikre side."
                % (escape(ti.get("klimafil", "DRY 2013")), ti["timer_over_27_max"], ti["timer_over_28_max"])))
    if not ot or not ot.get("rum"):
        return ud + [p("Resultaterne for termisk indeklima er ikke eksporteret fra modellen.")]
    rows = [["Rum", "Maks. [°C]", "Timer > 27 °C", "Timer > 28 °C", "Status"]]
    for r in ot["rum"]:
        rows.append([r["rum"], tal(r["max_C"]), tal(r["timer"].get("over_27"), 0),
                     tal(r["timer"].get("over_28"), 0), status(r["ok"])])
    rows.append(["Grænse", "", tal(ti["timer_over_27_max"], 0), tal(ti["timer_over_28_max"], 0), ""])
    ud.append(tabel(rows, [56 * mm, 24 * mm, 28 * mm, 28 * mm, 34 * mm], hoejre=(1, 2, 3), fed_sidste=True))
    ud.append(Spacer(1, 4 * mm))
    if ot.get("ok"):
        ud += konklusion("<b>Alle rum overholder vejledningens kriterier</b> under de forudsætninger for brug og "
                         "udluftning, der er beskrevet i afsnit 3.")
    else:
        ud += konklusion("<b>Vejledningens kriterier er overskredet</b> i %s. Projektet er ikke afklaret på "
                         "dette punkt. Mulige tiltag er udvendig solafskærmning, glas med lavere g-værdi og større "
                         "oplukkelige arealer; den valgte løsning skal beregnes og eftervises for både temperatur "
                         "og dagslys." % escape(", ".join(r["rum"] for r in ot["rum"] if not r["ok"])))
    if FIGMAPPE[0]:
        ud += figur(figurer.timer_pr_rum(ot, FIGMAPPE[0] / "timer_pr_rum.png"),
                    "Timer pr. år over 27 og 28 °C i hvert rum. Den stiplede linje er kravet.", maks_h=90 * mm)
    serier = ot.get("serier") or {}
    if serier and FIGMAPPE[0]:
        vaerst = max(ot["rum"], key=lambda r: r["timer"].get("over_27", 0))["rum"]
        if vaerst in serier:
            ud.append(p("Hvornår bliver det varmt?", H2))
            ud.append(p("Figurerne viser det varmeste rum, %s. %s" % (escape(vaerst),
                                                                    _hvornaar(serier[vaerst]))))
            ud += figur(figurer.maaneder(serier[vaerst], vaerst, 27, FIGMAPPE[0] / "maaneder.png"),
                        "Timer over 27 °C pr. måned i %s." % vaerst, maks_h=60 * mm)
            ud += figur(figurer.varighedskurve(serier, vaerst, FIGMAPPE[0] / "varighed.png"),
                        "Årets varmeste timer sorteret efter temperatur. %s er fremhævet; de øvrige rum er "
                        "grå." % vaerst, maks_h=70 * mm)
            ud += figur(figurer.varmeste_uge(serier[vaerst], ot.get("ude"), vaerst, FIGMAPPE[0] / "uge.png"),
                        "Den varmeste uge time for time i %s%s." % (vaerst, " og udetemperaturen"
                                                                    if ot.get("ude") else ""), maks_h=70 * mm)
    sc = SCENARIER[0]
    if sc:
        ud.append(p("Scenarier", H2))
        ud.append(p("Modellen er regnet med forskellige tiltag for at vise, hvad hvert tiltag betyder for "
                    "overophedningen. Tabellen viser det varmeste rum i hvert scenarie."))
        rows = [["Scenarie", "Varmeste rum", "Timer > 27 °C", "Timer > 28 °C", "Status"]]
        for x in sc:
            o = x.get("overtemperatur") or {}
            if not o.get("rum"):
                continue
            v = max(o["rum"], key=lambda r: r["timer"].get("over_27", 0))
            rows.append([x["scenarie"], v["rum"], tal(v["timer"].get("over_27"), 0),
                         tal(v["timer"].get("over_28"), 0), status(o.get("ok"))])
        ud.append(tabel(rows, [52 * mm, 38 * mm, 24 * mm, 24 * mm, 28 * mm], hoejre=(2, 3)))
        if FIGMAPPE[0]:
            ud += figur(figurer.scenarier(sc, FIGMAPPE[0] / "scenarier.png"),
                        "Timer over 27 °C i det varmeste rum for hvert scenarie.", maks_h=80 * mm)
    ud += gh_figurer(billeder, ("komfort",), "Komfort time for time",
                     "Plottene er lavet i Ladybug Tools med PMV-modellen (ISO 7730) og viser for hver time kl. "
                     "8–22, om en person vurderes at have det behageligt, for varmt eller for koldt. %s Plottene "
                     "er en illustration og indgår ikke i eftervisningen, som alene bygger på timerne over 27 og "
                     "28 °C." % escape((prj_global().get("indeklima") or {}).get("komfort_tekst") or
                                       "Beklædning, aktivitet og lufthastighed er ikke angivet."),
                     [r["rum"] for r in ot["rum"]],
                     "Komfort time for time hen over året, %s.")
    ud += gh_figurer(billeder, ("temperatur", "adaptiv"), None, None, None,
                     "Årsgennemsnit af den operative temperatur pr. rum. Figuren viser ikke sommerens "
                     "overophedning.")
    return ud


_PRJ = [{}]


def prj_global():
    return _PRJ[0]


def _hvornaar(serie, graense=27.0):
    """Beskriv ud fra data, hvornår rummet er over grænsen (måneder og tid på døgnet)."""
    import calendar
    timer = [i for i, t in enumerate(serie) if t > graense]
    if not timer:
        return "Rummet kommer ikke over %d °C." % graense
    maaned = [0] * 12
    dage = [calendar.monthrange(2010, m + 1)[1] for m in range(12)]
    graenser, acc = [], 0
    for d in dage:
        acc += d * 24
        graenser.append(acc)
    doegn = [0] * 24
    for i in timer:
        maaned[next(m for m, g in enumerate(graenser) if i < g)] += 1
        doegn[i % 24] += 1
    navne = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober",
             "november", "december"]
    mest = [navne[m] for m in sorted(range(12), key=lambda m: -maaned[m])[:2] if maaned[m]]
    top = sorted(range(24), key=lambda h: -doegn[h])[:4]
    return ("Timerne over %d °C ligger især i %s og hyppigst mellem kl. %d og %d."
            % (graense, " og ".join(mest), min(top), max(top) + 1))


def gh_figurer(billeder, foranstillinger, overskrift, tekst, rum, billedtekst):
    """Skærmbilleder fra Grasshopper, hvis navn starter med en af foranstillingerne.
    Billeder med flere plots under hinanden (ét pr. rum) deles op, når antallet passer
    med antallet af rum."""
    navne = [n for n in list(billeder) if n.lower().startswith(foranstillinger)]
    if not navne:
        return []
    ud = []
    if overskrift:
        ud.append(p(overskrift, H2))
    if tekst:
        ud.append(p(tekst))
    for navn in navne:
        sti = billeder.pop(navn)
        dele = []
        if rum and len(rum) > 1:
            dele = beskaer.del_op(sti, FIGMAPPE[0] / "dele", len(rum))
        if len(dele) == len(rum or []) and len(dele) > 1:
            for r, d in zip(rum, dele):
                ud += figur(d, billedtekst % r if "%s" in billedtekst else billedtekst, maks_h=60 * mm)
        else:
            ud += figur(_trim(sti), (billedtekst % "alle rum") if "%s" in billedtekst else billedtekst,
                        maks_h=85 * mm)
    return ud


def _trim(sti):
    try:
        return beskaer.trim(sti, FIGMAPPE[0] / ("trim_" + Path(sti).name))
    except Exception:
        return sti


def afsnit_dagslys(res, billeder):
    dl = res.get("dagslys")
    ud = [Overskrift("7.", "Dagslys")]
    dp = prj_global().get("dagslys") or {}
    ud.append(p("BR18 § 379 kan dokumenteres med 10 %-reglen eller med en beregning efter vejledningen, der viser "
                "mindst 300 lux på mindst halvdelen af det relevante gulvareal i mindst halvdelen af "
                "dagslystimerne. Dagslystimerne er den halvdel af årets timer, hvor der er mest dagslys. For "
                "boliger regnes på et måleplan 0,50 m over gulvet med en randzone på 0,5 m langs væggene. "
                "Dagslyset er beregnet med Radiance."))
    def _v(k, fmt="%s"):
        x = dp.get(k)
        return (fmt % x) if x not in (None, "") else "Ikke angivet"
    rows = [["Metode", "Værdi"],
            ["Måleplan over gulv", _v("maaleplan_m", "%s m").replace(".", ",")],
            ["Randzone langs vægge", _v("randzone_m", "%s m").replace(".", ",")],
            ["Netafstand", _v("netafstand_m", "%s m").replace(".", ",")],
            ["Tidsgrundlag", _v("tidsgrundlag")],
            ["Reflektanser (gulv / væg / loft)", _v("reflektanser")],
            ["Omgivelser og skygger", _v("omgivelser")]]
    ud.append(tabel(rows, [60 * mm, BREDDE - 60 * mm]))
    ud.append(Spacer(1, 3 * mm))
    if isinstance(dl, list) and len(dl) == 1 and isinstance(dl[0], dict):
        dl = dl[0]
    if isinstance(dl, dict) and dl.get("rum"):
        rows = [["Rum", "Andel af gulvarealet med mindst 300 lux i mindst halvdelen af dagslystimerne [%]",
                 "Status"]]
        for r in dl["rum"]:
            rows.append([r["rum"], tal(r["andel_pct"], 0),
                         status(r["ok"], "Opfyldt" if r["ok"] else "Ikke opfyldt")])
        ud.append(tabel(rows, [50 * mm, 86 * mm, 34 * mm], hoejre=(1,)))
        ud.append(Spacer(1, 4 * mm))
        ud += konklusion("<b>%s</b>%s" % (
            ("Alle rum opfylder kriteriet i beregningen." if dl.get("ok") else "Ikke alle rum opfylder kriteriet."),
            " Resultatet er foreløbigt, indtil måleplan og tidsgrundlag svarer til vejledningen."
            if FORELOEBIG[0] else ""))
    elif not dl:
        ud.append(p("Resultaterne for dagslys er ikke eksporteret fra modellen."))
    else:
        for v in _som_liste(dl):
            if isinstance(v, dict):
                rows = [["Rum / måling", "Resultat"]] + [[k, "%s" % x] for k, x in v.items()]
                ud.append(tabel(rows, [90 * mm, BREDDE - 90 * mm]))
            else:
                ud.append(p("• " + escape("%s" % v)))
    lux = {n: billeder.pop(n) for n in list(billeder) if n.lower().startswith(("lux", "dagslys_lux", "dagslys_time"))}
    ud += gh_figurer(billeder, ("dagslys",), None, None, None,
                     "Andel af tiden med mindst 300 lux i hvert punkt af målenettet (daylight autonomy).")
    ud += gh_figurer(lux, ("lux", "dagslys_lux", "dagslys_time"), None, None, None,
                     "Belysningsstyrke time for time hen over året i ét målepunkt. Figuren viser lysforløbet "
                     "i punktet og siger ikke noget om blænding eller direkte sol (§ 381).")
    return ud


def afsnit_forbehold(prj):
    ud = [Overskrift("8.", "Forudsætninger og forbehold")]
    for t in ("Beregningerne er udført for et typisk år (referencevejrår) og viser bygningens forventede "
              "egenskaber, ikke en garanti for oplevede temperaturer i et bestemt år.",
              "Resultatet for termisk indeklima afhænger af, at beboerne lufter ud som forudsat i afsnit 3.",
              "U-værdier er beregnet for homogene lag og skal eftervises efter DS 418 med de endelige "
              "opbygninger, træandele og linjetab i projekteringen.",
              "Notatet skal opdateres, hvis glasarealer, solafskærmning eller opbygninger ændres.",
              "Notatet omfatter varmetab, termisk indeklima (overtemperatur) og dagslys. Det dokumenterer ikke "
              "luftkvalitet, fugt, radon, lyd eller blænding og gener fra direkte sol (§ 381).") + \
            tuple(prj.get("forbehold") or ()):
        ud.append(Paragraph(t, PUNKT, bulletText="–"))
    return ud


def rumnavn(n):
    """RESIDENCE_1_180C163A -> Residence 1, "2" -> Rum 2. Navne med små bogstaver beholdes."""
    n = "%s" % n
    if n.strip().isdigit():
        return "Rum %s" % n.strip()
    n = re.sub(r"_[0-9A-Fa-f]{8}$", "", n).replace("_", " ").strip()
    return n.capitalize() if n.isupper() else n


def rens_rumnavne(res):
    ot = res.get("overtemperatur")
    if isinstance(ot, dict):
        for r in ot.get("rum") or []:
            r["rum"] = rumnavn(r["rum"])
        if isinstance(ot.get("serier"), dict):
            ot["serier"] = {rumnavn(k): v for k, v in ot["serier"].items()}
    vt = res.get("varmetab")
    if isinstance(vt, dict):
        for r in vt.get("dim_varmetab_pr_rum") or []:
            if isinstance(r, dict) and "rum" in r:
                r["rum"] = rumnavn(r["rum"])
    for d in _som_liste(res.get("dagslys")):
        if isinstance(d, dict):
            for r in d.get("rum") or []:
                r["rum"] = rumnavn(r["rum"])
    return res


def rens_resultater(res):
    """Fjerner værdier, der er tekst i stedet for data (fx en tabel fra et Panel), så notatet
    skriver 'ikke eksporteret' i stedet for at fejle. Advarslerne printes."""
    # flyt data, der ligger under en forkert nøgle (fx "Temp"), hen hvor indholdet hører til
    for k in list(res):
        for v in _som_liste(res[k]):
            if isinstance(v, dict):
                rigtig = ("overtemperatur" if "graenser" in v and "rum" in v else
                          "varmetab" if "projekt_sum_W_K" in v else
                          "dagslys" if "krav_pct" in v else
                          "opbygninger" if "opbygninger" in v and "program" in v else None)
                if rigtig and rigtig != k and rigtig not in res:
                    res[rigtig] = v
    krav = {"opbygninger": "opbygninger", "varmetab": "projekt_sum_W_K", "overtemperatur": "rum"}
    for k, felt in krav.items():
        v = res.get(k)
        if v is not None and not (isinstance(v, dict) and felt in v):
            print("ADVARSEL: %s er ikke data (er der forbundet en tabel?) - springes over" % k)
            res.pop(k)
    dl = [x for x in _som_liste(res.get("dagslys"))
          if not (isinstance(x, str) and (x.startswith("Rum ") or "Data Collection" in x))]
    if res.get("dagslys") is not None and len(dl) != len(_som_liste(res.get("dagslys"))):
        print("ADVARSEL: dele af dagslys var ikke dagslysresultater - springes over")
    resume = [x for x in dl if isinstance(x, dict) and "krav_pct" in x]
    if resume:            # samme resultat flere gange (komponenten kørt pr. gren) -> brug ét
        dl = resume[:1]
    res["dagslys"] = dl or None
    return rens_rumnavne(res)


def byg(eksport, projekt_yaml, ud_fil=None):
    eksport = Path(eksport)
    projekt_yaml = Path(projekt_yaml)
    prj = yaml.safe_load(projekt_yaml.read_text(encoding="utf-8")) or {}
    res = json.loads((eksport / "resultater.json").read_text(encoding="utf-8"))
    res = rens_resultater(res)
    regler = _br18(prj)

    bmappe = eksport / "billeder"
    billeder = {}
    if bmappe.is_dir():
        for f in sorted(bmappe.iterdir()):
            if f.suffix.lower() in (".png", ".jpg", ".jpeg"):
                billeder[f.stem] = f
    revs = prj.get("revisioner") or []
    prj["_rev"] = revs[-1]["rev"] if revs else ""
    prj["_dato"] = revs[-1]["dato"] if revs else date.today().strftime("%d.%m.%Y")
    logo = prj.get("logo")
    if logo and not Path(logo).is_absolute():
        logo = projekt_yaml.parent / logo
    prj["_logo"] = logo
    forside = prj.get("forsidebillede", "model_syd")
    if forside not in billeder:
        forside = next((n for n in billeder if n.lower().startswith("model")), forside)
    prj["_forsidebillede"] = billeder.pop(forside, None)

    _FIGNR[0] = 0
    FIGMAPPE[0] = eksport / "_figurer"
    FIGMAPPE[0].mkdir(exist_ok=True)
    if prj.get("_forsidebillede"):
        prj["_forsidebillede"] = _trim(prj["_forsidebillede"])
    omslag = billeder.get(prj.get("omslag") or "") or prj.get("_forsidebillede") or next(
        (billeder[n] for pre in ("dagslys", "temperatur") for n in billeder
         if n.lower().startswith(pre) and not n.lower().startswith("dagslys_lux")), None)
    prj["_omslag"] = _trim(omslag) if omslag and omslag != prj.get("_forsidebillede") else omslag
    SCENARIER[0] = [json.loads(f.read_text(encoding="utf-8"))
                    for f in sorted((eksport / "scenarier").glob("*.json"))] \
        if (eksport / "scenarier").is_dir() else []
    story = [NextPageTemplate("indhold"), PageBreak()] + side_info(prj)
    _PRJ[0] = prj
    punkter = udestaaende(res, prj)
    FORELOEBIG[0] = bool(punkter)
    if FORELOEBIG[0]:
        prj["dokumenttype"] = "Foreløbigt notat"
        prj["kort_titel"] = (prj.get("kort_titel") or prj.get("sag", "")) + " · foreløbig"
    story.append(Overskrift("1.", "Indledning"))
    story.append(p("Dette notat dokumenterer varmetab, termisk indeklima og dagslys for %s, %s, i forhold til "
                   "kravene i BR18. Projektet er et sommerhus, som ikke er omfattet af energirammen "
                   "(§ 283, stk. 2). Energikravet dokumenteres i stedet med U-værdier og en varmetabsramme."
                   % (escape(prj.get("undertitel") or prj.get("sag", "")).lower(),
                      escape(prj.get("adresse") or ""))))
    story += afsnit_sammenfatning(res, regler)
    story += afsnit_udestaaende(punkter)
    story += afsnit_grundlag(prj, res, regler)
    story += figur(prj.get("_forsidebillede"), "Beregningsmodellen i Rhino/Grasshopper.", maks_h=85 * mm)
    story += gh_figurer(billeder, ("solbane",), None, None, None,
                        "Solbanen for vejrfilens placering. Krydsene markerer solens position hver time.")
    story += afsnit_opbygninger(res, regler)
    story += afsnit_varmetab(res, regler)
    story += afsnit_indeklima(res, regler, billeder)
    story += afsnit_dagslys(res, billeder)
    story += afsnit_forbehold(prj)
    if billeder:
        story.append(PageBreak())
        story.append(Overskrift("", "Bilag – figurer"))
        for navn, sti in billeder.items():
            story += figur(_trim(sti), navn.replace("_", " ").capitalize(), maks_h=110 * mm)

    ud_fil = Path(ud_fil) if ud_fil else eksport / ("%s.pdf" % (prj.get("filnavn") or "Indeklimanotat"))
    Notat(ud_fil, prj).multiBuild(story, canvasmaker=TaelCanvas)
    return ud_fil


if __name__ == "__main__":
    a = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    a.add_argument("eksport")
    a.add_argument("projekt")
    a.add_argument("-o", "--ud")
    args = a.parse_args()
    print(byg(args.eksport, args.projekt, args.ud))
