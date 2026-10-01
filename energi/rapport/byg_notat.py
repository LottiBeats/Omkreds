"""
byg_notat.py — energinotat (notat.md + projekt.yaml) -> PDF.

    python energi/rapport/byg_notat.py energi/projekter/hjerlesvej

Layoutet er et klassisk rådgivernotat: luftig forside med titlen midt på
siden, sort titelbjælke og spærret firmanavn på hver side, sort
"INDHOLD"-bjælke med prikket indholdsfortegnelse, nummererede overskrifter
med versaler og tabeller med tynde sorte streger.

Skriften er Titillium Web (SIL OFL, ligger i ./fonts). Den mangler → og ψ;
de to tegn sættes med IBM Plex fra backend/fonts.
"""
import re
import sys
from html import escape
from pathlib import Path

import yaml
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.fonts import addMapping
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle, PageBreak, NextPageTemplate,
                                KeepTogether, ListFlowable, ListItem)
from reportlab.platypus.tableofcontents import TableOfContents

HER = Path(__file__).resolve().parent
PLEX = HER.parents[1] / "backend" / "fonts"

# ── Skrifter ─────────────────────────────────────────────────────────────────
for navn, fil in {"Tit": "TitilliumWeb-Regular.ttf", "Tit-Bold": "TitilliumWeb-Bold.ttf",
                  "Tit-Semi": "TitilliumWeb-SemiBold.ttf", "Tit-Light": "TitilliumWeb-Light.ttf",
                  "Tit-Italic": "TitilliumWeb-Italic.ttf"}.items():
    pdfmetrics.registerFont(TTFont(navn, str(HER / "fonts" / fil)))
pdfmetrics.registerFont(TTFont("PlexFb", str(PLEX / "IBMPlexSans-Regular.ttf")))
addMapping("Tit", 0, 0, "Tit")
addMapping("Tit", 1, 0, "Tit-Bold")
addMapping("Tit", 0, 1, "Tit-Italic")
addMapping("Tit", 1, 1, "Tit-Bold")

# ── Mål og farver ────────────────────────────────────────────────────────────
W, H = A4
VM, HM = 23 * mm, 23 * mm               # venstre/højre margen
BREDDE = W - VM - HM
SORT = colors.black
GRAA = colors.HexColor("#8a8a8a")

BRØD = ParagraphStyle("brød", fontName="Tit", fontSize=9.5, leading=14.5,
                      spaceAfter=7, alignment=TA_LEFT)
H1 = ParagraphStyle("h1", parent=BRØD, fontName="Tit-Bold", fontSize=10.5,
                    leading=14, spaceBefore=16, spaceAfter=8)
H2 = ParagraphStyle("h2", parent=BRØD, fontName="Tit-Bold", fontSize=9.5,
                    leading=13, spaceBefore=10, spaceAfter=5)
CELLE = ParagraphStyle("celle", parent=BRØD, fontSize=8.5, leading=11.5, spaceAfter=0)
CELLE_B = ParagraphStyle("celleb", parent=CELLE, fontName="Tit-Bold")
INFO_L = ParagraphStyle("infol", parent=BRØD, fontName="Tit-Bold", fontSize=9, spaceAfter=0)
INFO = ParagraphStyle("info", parent=BRØD, fontSize=9, spaceAfter=0)
BJÆLKE = ParagraphStyle("bjælke", parent=BRØD, fontName="Tit-Bold", fontSize=8.5,
                        leading=11, textColor=colors.white, spaceAfter=0)
TOC1 = ParagraphStyle("toc1", parent=BRØD, fontName="Tit-Bold", fontSize=9,
                      leading=12, spaceBefore=4.5, leftIndent=8 * mm, firstLineIndent=-8 * mm)
TOC2 = ParagraphStyle("toc2", parent=BRØD, fontSize=8.5, leading=11,
                      spaceBefore=2, leftIndent=19 * mm, firstLineIndent=-11 * mm)


# ── Tekst ────────────────────────────────────────────────────────────────────
_LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")


def inline(s: str) -> str:
    """Markdown-linje -> ReportLab-markup: **fed**, links som tekst, → og ψ i Plex."""
    s = escape(_LINK.sub(r"\1", s.strip()), quote=False).replace("§ ", "§\u00a0")
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    for tegn in "→ψ":
        s = s.replace(tegn, f'<font name="PlexFb">{tegn}</font>')
    return s


def bjælke(tekst: str) -> Table:
    t = Table([[Paragraph(escape(tekst.upper()), BJÆLKE)]], colWidths=[BREDDE])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SORT),
                           ("LEFTPADDING", (0, 0), (-1, -1), 7),
                           ("TOPPADDING", (0, 0), (-1, -1), 5),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    return t


def tabel(rækker: list[list[str]]) -> Table:
    n = max(len(r) for r in rækker)
    rækker = [r + [""] * (n - len(r)) for r in rækker]
    # Kolonnebredde efter indhold: lange tekstkolonner får pladsen, korte tal-
    # og paragrafkolonner holdes smalle.
    vægt = [max(6, min(48, max(len(re.sub(r"\*", "", r[i])) for r in rækker))) for i in range(n)]
    bredder = [BREDDE * v / sum(vægt) for v in vægt]
    # Ingen kolonne smallere end dens længste ord, ellers deles ordet midt over.
    def ord_bredde(i):
        ord_ = [w for r in rækker for w in re.sub(r"\*", "", r[i]).replace("§ ", "§\u00a0").split(" ")] or [""]
        return max(pdfmetrics.stringWidth(w, "Tit-Bold", 8.5) for w in ord_) + 11
    mindst = [ord_bredde(i) for i in range(n)]
    for _ in range(3):
        for i in range(n):
            if bredder[i] < mindst[i]:
                mangel = mindst[i] - bredder[i]
                andre = [j for j in range(n) if bredder[j] - mangel / max(1, n - 1) > mindst[j]]
                if not andre:
                    break
                bredder[i] = mindst[i]
                for j in andre:
                    bredder[j] -= mangel / len(andre)
    data = [[Paragraph(inline(c), CELLE_B if ri == 0 else CELLE) for c in r]
            for ri, r in enumerate(rækker)]
    t = Table(data, colWidths=bredder, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, SORT),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 5),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                           ("TOPPADDING", (0, 0), (-1, -1), 4),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    return t


# ── Markdown -> flowables ────────────────────────────────────────────────────

def md_til_flowables(md: str) -> list:
    md = re.sub(r"<!--.*?-->", "", md, flags=re.S)
    ud, afsnit, tab, liste = [], [], [], []
    liste_type = [None]
    nr = [0, 0]

    def tøm():
        if afsnit:
            ud.append(Paragraph(inline(" ".join(afsnit)), BRØD))
            afsnit.clear()
        if tab:
            rows = [[c.strip() for c in r.strip().strip("|").split("|")]
                    for r in tab if not re.fullmatch(r"\|[\s:|-]+\|", r.strip())]
            ud.extend([tabel(rows), Spacer(1, 9)])
            tab.clear()
        if liste:
            kind = liste_type[0]
            ud.append(ListFlowable(
                [ListItem(Paragraph(inline(x), BRØD), leftIndent=13) for x in liste],
                bulletType="1" if kind == "nr" else "bullet", start="1" if kind == "nr" else "•",
                bulletFontName="Tit", bulletFontSize=9.5,
                bulletFormat="%s." if kind == "nr" else None,
                leftIndent=13, bulletDedent=11 if kind == "nr" else 9))
            liste.clear()

    for linje in md.splitlines():
        s = linje.strip()
        if s.startswith("|"):
            if afsnit or liste:
                tøm()
            tab.append(s)
            continue
        if tab:
            tøm()
        m_liste = re.match(r"^(- |\d+\. )(.*)", s)
        if m_liste:
            kind = "nr" if m_liste.group(1)[0].isdigit() else "pkt"
            if afsnit or (liste and liste_type[0] != kind):
                tøm()
            liste_type[0] = kind
            liste.append(m_liste.group(2))
            continue
        if liste:
            tøm()
        if not s:
            tøm()
        elif s.startswith("# "):
            continue
        elif s.startswith("## "):
            tøm()
            nr[0] += 1
            nr[1] = 0
            tekst = f"{nr[0]}.&nbsp;&nbsp;&nbsp;{inline(s[3:]).upper()}"
            p = Paragraph(tekst, H1)
            p._toc = (0, f"{nr[0]}.", inline(s[3:]).upper())
            ud.append(p)
        elif s.startswith("### "):
            tøm()
            nr[1] += 1
            p = Paragraph(f"{nr[0]}.{nr[1]}&nbsp;&nbsp;&nbsp;{inline(s[4:])}", H2)
            p._toc = (1, f"{nr[0]}.{nr[1]}", inline(s[4:]))
            ud.append(p)
        else:
            afsnit.append(s)
    tøm()

    # Overskrift må ikke stå alene nederst på en side
    holdt = []
    i = 0
    while i < len(ud):
        if hasattr(ud[i], "_toc") and i + 1 < len(ud):
            holdt.append(KeepTogether([ud[i], ud[i + 1]]))
            holdt[-1]._toc = ud[i]._toc
            holdt[-1]._toc_p = ud[i]
            i += 2
        else:
            holdt.append(ud[i])
            i += 1
    return holdt


# ── Dokument ─────────────────────────────────────────────────────────────────

class Notat(BaseDocTemplate):
    def __init__(self, sti, p: dict):
        super().__init__(str(sti), pagesize=A4, leftMargin=VM, rightMargin=HM,
                         topMargin=40 * mm, bottomMargin=24 * mm,
                         title=p.get("titel", ""), author=p.get("firma", ""))
        self.p = p
        indhold = Frame(VM, 24 * mm, BREDDE, H - 64 * mm, id="indhold",
                        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        forside = Frame(VM, 24 * mm, BREDDE, H - 48 * mm, id="forside",
                        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate("forside", [forside], onPage=self._forside),
                               PageTemplate("side", [indhold], onPage=self._side)])

    def afterFlowable(self, f):
        toc = getattr(f, "_toc", None)
        if toc:
            niveau, nummer, tekst = toc
            self.notify("TOCEntry", (niveau, f"{nummer}&nbsp;&nbsp;&nbsp;{tekst}", self.page))

    # Forsiden: titel midt på siden, dato nederst – ingen bjælke, intet firmanavn.
    def _forside(self, c, doc):
        p = self.p
        c.setFont("Tit-Bold", 13.5)
        y = H * 0.70
        for linje in p["titel_linjer"]:
            c.drawString(VM + 4 * mm, y, linje.upper())
            y -= 19
        c.setFont("Tit-Bold", 13.5)
        y = H * 0.545
        for linje in p["projekt_linjer"]:
            c.drawString(VM + 4 * mm, y, linje.upper())
            y -= 19
        c.setFont("Tit-Bold", 8)
        c.drawString(VM + 4 * mm, 40 * mm, f"DATO: {p['dato']}")

    # Øvrige sider: spærret firmanavn, sort titelbjælke, sidefod.
    def _side(self, c, doc):
        p = self.p
        c.setFillColor(SORT)
        c.setFont("Tit-Light", 10)
        firma = p.get("firma_kort") or p.get("firma") or ""
        spærret = " ".join(firma.lower())
        c.drawRightString(W - HM, H - 16 * mm, spærret)
        c.rect(VM, H - 30 * mm, BREDDE, 7.5 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Tit-Bold", 8.5)
        c.drawString(VM + 3 * mm, H - 30 * mm + 2.6 * mm, p.get("kort_titel", ""))
        c.setFillColor(GRAA)
        c.setFont("Tit", 7)
        c.drawRightString(W - HM, 12 * mm, f"{p.get('sidefod', '')} {doc.page}".strip())


def byg(projektmappe: Path) -> Path:
    p = yaml.safe_load((projektmappe / "projekt.yaml").read_text(encoding="utf-8"))
    md = (projektmappe / "notat.md").read_text(encoding="utf-8")
    revs = p.get("revisioner") or [{}]
    p.setdefault("dato", revs[-1].get("dato", ""))
    p.setdefault("titel_linjer", [p.get("emne", "")])
    p.setdefault("projekt_linjer", [p.get("sag", "")])
    p.setdefault("kort_titel", p.get("sag", ""))

    ud = projektmappe / "ud" / f"Energinotat_{p.get('sag', 'projekt')}.pdf"
    ud.parent.mkdir(exist_ok=True)
    doc = Notat(ud, p)

    toc = TableOfContents(dotsMinLevel=0)
    toc.levelStyles = [TOC1, TOC2]

    info = Table([[Paragraph(k, INFO_L), Paragraph(inline(str(v)), INFO)] for k, v in
                  [("PROJEKT", p.get("info_projekt") or p.get("sag", "")),
                   ("FASE", p.get("fase", "")), ("DATO", p["dato"])]],
                 colWidths=[28 * mm, BREDDE - 28 * mm], hAlign="LEFT")
    info.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0),
                              ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))

    flow = [NextPageTemplate("side"), PageBreak(),
            info, Spacer(1, 12), bjælke("Indhold"), Spacer(1, 8), toc, PageBreak()]
    flow += md_til_flowables(md)
    doc.multiBuild(flow)
    return ud


if __name__ == "__main__":
    mappe = Path(sys.argv[1] if len(sys.argv) > 1 else "energi/projekter/hjerlesvej")
    print(byg(mappe.resolve()))
