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
from datetime import date
from html import escape
from pathlib import Path

import yaml
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (BaseDocTemplate, Frame, Image, KeepTogether, NextPageTemplate,
                                PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle)

HER = Path(__file__).resolve().parent
REGLER = HER.parent / "regler" / "br18_energi.yaml"

# ── Holst Engineering ──────────────────────────────────────────────────────
NAVY = colors.HexColor("#252652")
NAVY_MOERK = colors.HexColor("#0e1022")
GROEN = colors.HexColor("#5DBDAB")
GROEN_LYS = colors.HexColor("#e6f4f1")
ROED = colors.HexColor("#c0392b")
ROED_LYS = colors.HexColor("#f8e1de")
GUL = colors.HexColor("#d9a400")
GUL_LYS = colors.HexColor("#fbf1d0")
GRAA = colors.HexColor("#666666")
GRAA_LYS = colors.HexColor("#f2f2f2")
STREG = colors.HexColor("#d0d0d0")

for vaegt, navn in ((300, "Man-Light"), (400, "Man"), (600, "Man-Semi"), (700, "Man-Bold")):
    pdfmetrics.registerFont(TTFont(navn, str(HER / "fonts" / ("Manrope-%d.ttf" % vaegt))))
pdfmetrics.registerFontFamily("Man", normal="Man", bold="Man-Bold", italic="Man", boldItalic="Man-Bold")

W, H = A4
VM = HM = 20 * mm
TOP, BUND = 30 * mm, 22 * mm
BREDDE = W - VM - HM

BROED = ParagraphStyle("broed", fontName="Man", fontSize=9.2, leading=14, spaceAfter=7, textColor=NAVY_MOERK)
H1 = ParagraphStyle("h1", parent=BROED, fontName="Man-Semi", fontSize=13, leading=17,
                    spaceBefore=16, spaceAfter=8, textColor=NAVY, keepWithNext=1)
H2 = ParagraphStyle("h2", parent=BROED, fontName="Man-Semi", fontSize=10, leading=13,
                    spaceBefore=10, spaceAfter=5, textColor=NAVY, keepWithNext=1)
CELLE = ParagraphStyle("celle", parent=BROED, fontSize=8.2, leading=11, spaceAfter=0)
CELLE_FED = ParagraphStyle("cellefed", parent=CELLE, fontName="Man-Semi")
CELLE_H = ParagraphStyle("celleh", parent=CELLE, fontName="Man-Semi", textColor=colors.white)
CELLE_HOEJRE = ParagraphStyle("celleh0", parent=CELLE, alignment=2)
FIGTEKST = ParagraphStyle("fig", parent=BROED, fontSize=8, leading=11, textColor=GRAA, spaceBefore=3)
NOTE = ParagraphStyle("note", parent=BROED, fontSize=8, leading=11, textColor=GRAA)


# ── hjælpere ────────────────────────────────────────────────────────────────
def tal(x, dec=1):
    """Dansk talformat: 1.234,5"""
    if x is None:
        return "–"
    s = ("{:,.%df}" % dec).format(float(x))
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def p(tekst, stil=BROED):
    return Paragraph(tekst, stil)


def tabel(rows, bredder, hoejre=(), fed_sidste=False, zebra=True):
    """rows[0] = overskrift. Tal-kolonner i `hoejre` højrestilles."""
    data = []
    for i, r in enumerate(rows):
        celler = []
        for j, c in enumerate(r):
            if isinstance(c, Paragraph):
                celler.append(c)
                continue
            if i == 0:
                stil = CELLE_H if j not in hoejre else ParagraphStyle("hh", parent=CELLE_H, alignment=2)
            elif fed_sidste and i == len(rows) - 1:
                stil = CELLE_FED
            else:
                stil = CELLE
            if j in hoejre and i > 0 and stil is not CELLE_H:
                stil = ParagraphStyle("h", parent=stil, alignment=2)
            celler.append(Paragraph(escape("%s" % c), stil))
        data.append(celler)
    t = Table(data, colWidths=bredder, repeatRows=1)
    stil = [("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2),
            ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("LINEBELOW", (0, 1), (-1, -1), 0.4, STREG)]
    if zebra:
        for i in range(2, len(rows), 2):
            stil.append(("BACKGROUND", (0, i), (-1, i), GRAA_LYS))
    if fed_sidste:
        stil.append(("LINEABOVE", (0, -1), (-1, -1), 0.9, NAVY))
    t.setStyle(TableStyle(stil))
    return t


def status(ok, tekst=None):
    """Farvet statusfelt: True = overholdt, False = ikke overholdt, None = ikke beregnet."""
    if ok is None:
        t, f, b = tekst or "Ikke beregnet", GRAA, GRAA_LYS
    elif ok:
        t, f, b = tekst or "Overholdt", colors.HexColor("#1f6f5f"), GROEN_LYS
    else:
        t, f, b = tekst or "Ikke overholdt", ROED, ROED_LYS
    st = ParagraphStyle("st", parent=CELLE, fontName="Man-Semi", textColor=f, backColor=b,
                        borderPadding=(2, 4, 2, 4), alignment=1)
    return Paragraph(escape(t), st)


def figur(sti, tekst, maks_h=105 * mm):
    if not sti or not Path(sti).exists():
        return []
    iw, ih = ImageReader(str(sti)).getSize()
    b = BREDDE
    h = b * ih / float(iw)
    if h > maks_h:
        h, b = maks_h, maks_h * iw / float(ih)
    return [KeepTogether([Spacer(1, 3 * mm), Image(str(sti), width=b, height=h),
                          p(escape(tekst), FIGTEKST), Spacer(1, 2 * mm)])]


class Overskrift(Paragraph):
    """Nummereret afsnitsoverskrift."""
    def __init__(self, nr, tekst):
        Paragraph.__init__(self, '<font color="#5DBDAB">%s</font>&nbsp;&nbsp;%s' % (nr, escape(tekst)), H1)


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
                self.setFont("Man", 7.5)
                self.setFillColor(GRAA)
                self.drawRightString(W - HM, 10 * mm, "Side %d af %d" % (self._pageNumber, n))
            rl_canvas.Canvas.showPage(self)
        rl_canvas.Canvas.save(self)


def _logo(c, prj, x, y, h):
    logo = prj.get("_logo")
    if logo and Path(logo).exists():
        iw, ih = ImageReader(str(logo)).getSize()
        c.drawImage(str(logo), x, y, width=h * iw / float(ih), height=h, mask="auto")
        return h * iw / float(ih)
    c.setFont("Man-Semi", 10)
    c.setFillColor(NAVY)
    c.drawString(x, y + h / 3, prj.get("firma") or "")
    return 0


def _sidefod(c, prj):
    c.setStrokeColor(STREG)
    c.setLineWidth(0.4)
    c.line(VM, 14 * mm, W - HM, 14 * mm)
    c.setFont("Man", 7.5)
    c.setFillColor(GRAA)
    c.drawString(VM, 10 * mm, prj.get("sidefod") or "")


def side_indhold(c, doc):
    prj = doc.prj
    c.saveState()
    _logo(c, prj, W - HM - 24 * mm, H - 22 * mm, 13 * mm)
    c.setFont("Man-Semi", 8.5)
    c.setFillColor(NAVY)
    c.drawString(VM, H - 15 * mm, prj.get("kort_titel") or prj.get("sag", ""))
    c.setFont("Man", 7.5)
    c.setFillColor(GRAA)
    c.drawString(VM, H - 19.5 * mm, "   ·   ".join(x for x in (
        "Sagsnr. %s" % prj["sagsnr"] if prj.get("sagsnr") else "",
        "Dato: %s" % prj["_dato"], "Rev. %s" % prj["_rev"] if prj.get("_rev") else "") if x))
    c.setStrokeColor(GROEN)
    c.setLineWidth(1.2)
    c.line(VM, H - 24 * mm, W - HM, H - 24 * mm)
    _sidefod(c, prj)
    c.restoreState()


def side_forside(c, doc):
    prj = doc.prj
    c.saveState()
    # grøn lodret stribe som i logoets farver
    c.setFillColor(GROEN)
    c.rect(0, 0, 6 * mm, H, stroke=0, fill=1)
    _logo(c, prj, VM, H - 45 * mm, 26 * mm)
    y = H - 72 * mm
    c.setFillColor(GRAA)
    c.setFont("Man-Semi", 9)
    c.drawString(VM, y, (prj.get("dokumenttype") or "Notat").upper())
    y -= 12 * mm
    c.setFillColor(NAVY)
    c.setFont("Man-Light", 25)
    for linje in prj.get("titel_linjer") or [prj.get("emne", "")]:
        c.drawString(VM, y, linje)
        y -= 10 * mm
    y -= 3 * mm
    c.setFont("Man-Semi", 11.5)
    for linje in prj.get("projekt_linjer") or [prj.get("sag", "")]:
        c.drawString(VM, y, linje)
        y -= 6 * mm
    # forsidebillede
    billede = prj.get("_forsidebillede")
    if billede and Path(billede).exists():
        iw, ih = ImageReader(str(billede)).getSize()
        maks_b, maks_h = BREDDE, y - 72 * mm
        b = maks_b
        h = b * ih / float(iw)
        if h > maks_h:
            h, b = maks_h, maks_h * iw / float(ih)
        c.drawImage(str(billede), VM + (maks_b - b) / 2, y - 6 * mm - h, width=b, height=h, mask="auto")
    # sagsoplysninger
    felter = [("Sag", prj.get("sag")), ("Adresse", prj.get("adresse")), ("Matrikel", prj.get("matrikel")),
              ("Sagsnr.", prj.get("sagsnr")), ("Dato", prj["_dato"]), ("Revision", prj.get("_rev")),
              ("Udarbejdet", prj.get("udarbejdet")), ("Kontrolleret", prj.get("kontrolleret"))]
    felter = [(k, v) for k, v in felter if v]
    y0 = 58 * mm
    c.setStrokeColor(STREG)
    c.setLineWidth(0.4)
    c.line(VM, y0 + 5 * mm, W - HM, y0 + 5 * mm)
    kol = 2
    for i, (k, v) in enumerate(felter):
        x = VM + (i % kol) * (BREDDE / kol)
        yy = y0 - (i // kol) * 9 * mm
        c.setFont("Man", 7)
        c.setFillColor(GRAA)
        c.drawString(x, yy, k.upper())
        c.setFont("Man-Semi", 9)
        c.setFillColor(NAVY_MOERK)
        c.drawString(x, yy - 4.2 * mm, "%s" % v)
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


def afsnit_sammenfatning(res, regler):
    ud = [Overskrift("2.", "Sammenfatning")]
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
        rows.append(["Termisk indeklima", "§ 386: højst %d h over 27 °C og %d h over 28 °C"
                     % (ti["timer_over_27_max"], ti["timer_over_28_max"]),
                     "Værste rum: %s, %d h / %d h" % (vaerst["rum"], vaerst["timer"].get("over_27", 0),
                                                      vaerst["timer"].get("over_28", 0)),
                     status(ot.get("ok"))])
    else:
        rows.append(["Termisk indeklima", "§ 386", "–", status(None)])
    dl = res.get("dagslys")
    rows.append(["Dagslys", "§ 379: 10 %-regel eller 300 lux", "Se afsnit 7" if dl else "–",
                 status(None, "Se afsnit 7") if dl else status(None)])
    ud.append(tabel(rows, [30 * mm, 52 * mm, 60 * mm, 28 * mm]))
    ud.append(Spacer(1, 4 * mm))
    konkl = []
    if vt:
        konkl.append("Varmetabsrammen er %s med en glasandel på %s %% af det opvarmede etageareal."
                     % ("overholdt" if vt.get("overholdt") else "<b>ikke</b> overholdt",
                        tal(100 * vt["glasandel"], 0)))
    if ot and ot.get("rum"):
        if ot.get("ok"):
            konkl.append("Alle rum overholder grænserne for termisk indeklima under de angivne forudsætninger "
                         "for udluftning (afsnit 6).")
        else:
            daarlige = [r["rum"] for r in ot["rum"] if not r["ok"]]
            konkl.append("Grænserne for termisk indeklima er overskredet i %s. Der skal indarbejdes tiltag, "
                         "fx udvendig solafskærmning, solafskærmende glas eller øget udluftning (afsnit 6)."
                         % ", ".join(daarlige))
    ud += [p(t) for t in konkl]
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
            ["Bygningsreglement", "BR18, %s" % (prj.get("regelversion") or "")],
            ["Vejrdata", ik.get("vejrfil") or regler["termisk_indeklima"].get("klimafil", "DRY 2013")],
            ["Beregningsprogram", ik.get("program_version") or "Ladybug Tools / EnergyPlus / Radiance"]]
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
        ud.append(tabel(rows, [55 * mm, BREDDE - 55 * mm], hoejre=(1,)))
    udl = ik.get("udluftning")
    if udl:
        ud.append(p("Udluftning", H2))
        ud.append(p("Oplukkelige vinduer åbnes i modellen, når det er varmt inde og køligere ude. "
                    "Udluftningen har stor betydning for resultatet og forudsætter, at beboerne lufter ud."))
        rows = [["Parameter", "Værdi"],
                ["Vinduer åbnes ved indetemperatur over", "%s °C" % tal(udl.get("min_inde_c"), 0)],
                ["Kun når udetemperaturen er mindst", "%s °C" % tal(udl.get("min_ude_c"), 0)],
                ["og mindst så meget lavere end inde", "%s °C" % tal(udl.get("delta_c"), 0)],
                ["Oplukkelig andel af vinduesarealet", "%s %%" % tal(100 * udl.get("andel_oplukkelig", 0), 0)],
                ["Udledningskoefficient", tal(udl.get("udledningskoefficient"), 2)]]
        ud.append(tabel(rows, [80 * mm, BREDDE - 80 * mm], hoejre=(1,)))
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
                "er ikke medregnet og skal eftervises efter DS 418 i projekteringen."))
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
        blok.append(tabel(rows, [80 * mm, 30 * mm, 30 * mm, 30 * mm], hoejre=(1, 2, 3), fed_sidste=True))
        ud.append(KeepTogether(blok))
    if v:
        ud.append(p("Glas", H2))
        ud.append(p("Vinduerne er regnet som %s med U = %s W/m²K, g-værdi %s og lystransmittans %s. "
                    "Samme glas er brugt i energi-, indeklima- og dagslysberegningen."
                    % (escape(v["navn"]), tal(v["U_W_m2K"], 2), tal(v["g"], 2), tal(v["LT"], 2))))
    return ud


def afsnit_varmetab(res, regler):
    vt = res.get("varmetab")
    ud = [Overskrift("5.", "Varmetabsramme")]
    if not vt:
        return ud + [p("Varmetabsrammen er ikke eksporteret fra modellen.")]
    gmax = regler["sommerhus"]["glasandel_max"]
    over = vt.get("glasandel_over_30")
    ud.append(p("Huset har et opvarmet etageareal på %s m² og %s m² glas, svarende til en glasandel på %s %%. %s"
                % (tal(vt["opvarmet_etageareal_m2"]), tal(vt["glasareal_m2"]), tal(100 * vt["glasandel"], 0),
                   ("Det er mere end de %s %%, BR18 § 284 tillader uden videre. Energikravet dokumenteres derfor "
                    "med en varmetabsramme efter § 284, stk. 2: husets samlede transmissionstab må ikke være større "
                    "end for et referencehus med samme geometri, U-værdier efter tabel 4 og højst %s %% glas."
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
    ud.append(p("<b>Varmetabsrammen er %s.</b> Projektets varmetab er %s %% %s rammen."
                % ("overholdt" if vt.get("overholdt") else "ikke overholdt", tal(abs(margin), 0),
                   "under" if margin >= 0 else "over")))
    psi = vt.get("psi_W_mK") or {}
    ud.append(p("Linjetab: vindues- og dørsamlinger %s W/mK, fundament %s W/mK, ovenlys %s W/mK. "
                "Terrændæk og fundament er vægtet med %s (gulvvarme)."
                % (tal(psi.get("vindue"), 2), tal(psi.get("fundament"), 2), tal(psi.get("ovenlys"), 2),
                   tal(vt.get("jordfaktor"), 3)), NOTE))
    rum = vt.get("dim_varmetab_pr_rum") or []
    if rum:
        ud.append(p("Dimensionerende varmetab", H2))
        ud.append(p("Ved −12 °C ude og 20 °C inde (24 °C i baderum), inklusive opvarmning af friskluft uden "
                    "varmegenvinding. Tallene bruges til dimensionering af varmeanlægget."))
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
    ud.append(p("Det termiske indeklima er beregnet time for time for et helt år med %s. Kravet er efter "
                "BR18 § 386 og vejledningen hertil, at den operative temperatur højst overstiger 27 °C i "
                "%d timer og 28 °C i %d timer om året. Timerne er her talt over alle årets timer, hvilket "
                "er på den sikre side."
                % (escape(ti.get("klimafil", "DRY 2013")), ti["timer_over_27_max"], ti["timer_over_28_max"])))
    if not ot or not ot.get("rum"):
        return ud + [p("Resultaterne for termisk indeklima er ikke eksporteret fra modellen.")]
    rows = [["Rum", "Maks. [°C]", "Timer > 27 °C", "Timer > 28 °C", "Status"]]
    for r in ot["rum"]:
        rows.append([r["rum"], tal(r["max_C"]), tal(r["timer"].get("over_27"), 0),
                     tal(r["timer"].get("over_28"), 0), status(r["ok"])])
    rows.append(["Grænse", "", tal(ti["timer_over_27_max"], 0), tal(ti["timer_over_28_max"], 0), ""])
    ud.append(tabel(rows, [56 * mm, 24 * mm, 28 * mm, 28 * mm, 34 * mm], hoejre=(1, 2, 3), fed_sidste=True))
    ud.append(Spacer(1, 3 * mm))
    if ot.get("ok"):
        ud.append(p("<b>Alle rum overholder grænserne</b> under de forudsætninger for brug og udluftning, der "
                    "er beskrevet i afsnit 3."))
    else:
        ud.append(p("<b>Grænserne er overskredet</b> i %s. Overophedningen skyldes primært solindfald gennem "
                    "glas mod syd og vest. Det anbefales at undersøge udvendig solafskærmning, solafskærmende "
                    "glas med lav g-værdi og større oplukkelige arealer, og at dokumentere effekten med en ny "
                    "beregning." % ", ".join(r["rum"] for r in ot["rum"] if not r["ok"])))
    for navn, tekst in (("komfort", "Operativ temperatur time for time hen over året."),
                        ("temperatur", "Operativ temperatur time for time hen over året."),
                        ("temperatur_plan", "Rummene farvet efter operativ temperatur."),
                        ("adaptiv", "Adaptiv komfort efter DS/EN 16798-1.")):
        if navn in billeder:
            ud += figur(billeder.pop(navn), "Figur: " + tekst)
    return ud


def afsnit_dagslys(res, billeder):
    dl = res.get("dagslys")
    ud = [Overskrift("7.", "Dagslys")]
    ud.append(p("BR18 § 379 kan dokumenteres med 10 %-reglen eller med en beregning, der viser mindst 300 lux "
                "på mindst halvdelen af gulvarealet i mindst halvdelen af dagslystimerne (DS/EN 17037). "
                "Dagslyset er beregnet med Radiance på et målenet 0,85 m over gulvet."))
    if not dl:
        ud.append(p("Resultaterne for dagslys er ikke eksporteret fra modellen."))
    else:
        for v in _som_liste(dl):
            if isinstance(v, dict):
                rows = [["Rum / måling", "Resultat"]] + [[k, "%s" % x] for k, x in v.items()]
                ud.append(tabel(rows, [90 * mm, BREDDE - 90 * mm]))
            else:
                ud.append(p("• " + escape("%s" % v)))
    if "dagslys" in billeder:
        ud += figur(billeder.pop("dagslys"), "Figur: Dagslys på målenettet.")
    return ud


def afsnit_forbehold(prj):
    ud = [Overskrift("8.", "Forudsætninger og forbehold")]
    for t in ("Beregningerne er udført for et typisk år (referencevejrår) og viser bygningens forventede "
              "egenskaber, ikke en garanti for oplevede temperaturer i et bestemt år.",
              "Resultatet for termisk indeklima afhænger af, at beboerne lufter ud som forudsat i afsnit 3.",
              "U-værdier er beregnet for homogene lag og skal eftervises efter DS 418 med de endelige "
              "opbygninger, træandele og linjetab i projekteringen.",
              "Notatet skal opdateres, hvis glasarealer, solafskærmning eller opbygninger ændres.") + \
            tuple(prj.get("forbehold") or ()):
        ud.append(p("• " + t))
    return ud


def byg(eksport, projekt_yaml, ud_fil=None):
    eksport = Path(eksport)
    projekt_yaml = Path(projekt_yaml)
    prj = yaml.safe_load(projekt_yaml.read_text(encoding="utf-8")) or {}
    res = json.loads((eksport / "resultater.json").read_text(encoding="utf-8"))
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
    prj["_forsidebillede"] = billeder.pop(forside, None)

    story = [NextPageTemplate("indhold"), PageBreak()]
    story.append(Overskrift("1.", "Indledning"))
    story.append(p("Dette notat dokumenterer varmetab, termisk indeklima og dagslys for %s, %s, i forhold til "
                   "kravene i BR18. Projektet er et sommerhus, som ikke er omfattet af energirammen "
                   "(§ 283, stk. 2). Energikravet dokumenteres i stedet med U-værdier og en varmetabsramme."
                   % (escape(prj.get("undertitel") or prj.get("sag", "")).lower(),
                      escape(prj.get("adresse") or ""))))
    story += afsnit_sammenfatning(res, regler)
    story += afsnit_grundlag(prj, res, regler)
    story += afsnit_opbygninger(res, regler)
    story += afsnit_varmetab(res, regler)
    story += afsnit_indeklima(res, regler, billeder)
    story += afsnit_dagslys(res, billeder)
    story += afsnit_forbehold(prj)
    if billeder:
        story.append(PageBreak())
        story.append(Overskrift("Bilag", "Figurer"))
        for navn, sti in billeder.items():
            story += figur(sti, navn.replace("_", " ").capitalize(), maks_h=110 * mm)

    ud_fil = Path(ud_fil) if ud_fil else eksport / ("%s.pdf" % (prj.get("filnavn") or "Indeklimanotat"))
    Notat(ud_fil, prj).build(story, canvasmaker=TaelCanvas)
    return ud_fil


if __name__ == "__main__":
    a = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    a.add_argument("eksport")
    a.add_argument("projekt")
    a.add_argument("-o", "--ud")
    args = a.parse_args()
    print(byg(args.eksport, args.projekt, args.ud))
