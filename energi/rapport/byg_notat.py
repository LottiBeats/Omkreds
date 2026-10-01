"""
byg_notat.py — energinotat (notat.md + projekt.yaml) -> PDF.

    python energi/rapport/byg_notat.py energi/projekter/hjerlesvej

Layoutet bruger Omkreds' egen identitet fra appen (frontend/src/index.css):
IBM Plex Sans og terrakotta som accent (--brand #d94a2b, --brand-ink
#b83d22, --brand-wash #fbeee9). Opbygning: forside med titel og
sagsoplysninger, side med projektdata og indholdsfortegnelse, nummererede
afsnit og tabeller med vandrette streger.
"""
import re
import sys
from html import escape
from pathlib import Path

import yaml
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle, PageBreak, NextPageTemplate,
                                KeepTogether, ListFlowable, ListItem)
from reportlab.platypus.tableofcontents import TableOfContents

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))
import pdf_fonts  # noqa: E402,F401  (registrerer IBM Plex som "Plex", "Plex-SemiBold" …)

# ── Omkreds' farver (frontend/src/index.css) ─────────────────────────────────
BRAND_HEX = "#d94a2b"
BRAND = colors.HexColor(BRAND_HEX)
BRAND_INK = colors.HexColor("#b83d22")
BRAND_WASH = colors.HexColor("#fbeee9")
INK = colors.HexColor("#1c1917")
GRAA = colors.HexColor("#78716c")
STREG = colors.HexColor("#d6d3d1")

W, H = A4
VM, HM = 22 * mm, 22 * mm
BREDDE = W - VM - HM

BRØD = ParagraphStyle("brød", fontName="Plex", fontSize=9.2, leading=14,
                      spaceAfter=7, textColor=INK)
H1 = ParagraphStyle("h1", parent=BRØD, fontName="Plex-SemiBold", fontSize=13,
                    leading=17, spaceBefore=18, spaceAfter=8)
H2 = ParagraphStyle("h2", parent=BRØD, fontName="Plex-SemiBold", fontSize=10,
                    leading=13, spaceBefore=10, spaceAfter=5)
CELLE = ParagraphStyle("celle", parent=BRØD, fontSize=8.2, leading=11, spaceAfter=0)
CELLE_H = ParagraphStyle("celleh", parent=CELLE, fontName="Plex-SemiBold", textColor=BRAND_INK)
ETIKET = ParagraphStyle("etiket", parent=BRØD, fontName="Plex-Medium", fontSize=7.5,
                        leading=10, textColor=GRAA, spaceAfter=0)
VÆRDI = ParagraphStyle("værdi", parent=BRØD, fontSize=9.5, leading=13, spaceAfter=0)
INDHOLD = ParagraphStyle("indhold", parent=H1, spaceBefore=6, spaceAfter=10)
TOC1 = ParagraphStyle("toc1", parent=BRØD, fontName="Plex-Medium", fontSize=9.2,
                      leading=12, spaceBefore=5, leftIndent=9 * mm, firstLineIndent=-9 * mm)
TOC2 = ParagraphStyle("toc2", parent=BRØD, fontSize=8.5, leading=11, textColor=GRAA,
                      spaceBefore=2, leftIndent=21 * mm, firstLineIndent=-12 * mm)


# ── Tekst ────────────────────────────────────────────────────────────────────
_LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")


def inline(s: str) -> str:
    """Markdown-linje -> ReportLab-markup: **fed**, links som tekst, § holdes sammen med tallet."""
    s = escape(_LINK.sub(r"\1", s.strip()), quote=False).replace("§ ", "§ ")
    return re.sub(r"\*\*(.+?)\*\*", r'<font name="Plex-SemiBold">\1</font>', s)


def nummer(n: str) -> str:
    return f'<font color="{BRAND_HEX}">{n}</font>'


def tabel(rækker: list[list[str]]) -> Table:
    n = max(len(r) for r in rækker)
    rækker = [r + [""] * (n - len(r)) for r in rækker]
    rå = [[re.sub(r"\*", "", c).replace("§ ", "§ ") for c in r] for r in rækker]

    # Bredde efter indhold, men ingen kolonne smallere end dens længste ord.
    vægt = [max(6, min(48, max(len(r[i]) for r in rå))) for i in range(n)]
    bredder = [BREDDE * v / sum(vægt) for v in vægt]
    mindst = [max(pdfmetrics.stringWidth(w, "Plex-SemiBold", 8.2)
                  for r in rå for w in r[i].split(" ")) + 12 for i in range(n)]
    for i in range(n):
        if bredder[i] < mindst[i]:
            mangel = mindst[i] - bredder[i]
            andre = [j for j in range(n) if j != i and bredder[j] - mangel / (n - 1) > mindst[j]]
            if andre:
                bredder[i] = mindst[i]
                for j in andre:
                    bredder[j] -= mangel / len(andre)

    data = [[Paragraph(inline(c), CELLE_H if ri == 0 else CELLE) for c in r]
            for ri, r in enumerate(rækker)]
    t = Table(data, colWidths=bredder, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_WASH),
        ("LINEBELOW", (0, 0), (-1, 0), 0.9, BRAND),
        ("LINEBELOW", (0, 1), (-1, -2), 0.4, STREG),
        ("LINEBELOW", (0, -1), (-1, -1), 0.8, INK),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
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
            ud.extend([tabel(rows), Spacer(1, 10)])
            tab.clear()
        if liste:
            nr_liste = liste_type[0] == "nr"
            ud.append(ListFlowable(
                [ListItem(Paragraph(inline(x), BRØD), leftIndent=14) for x in liste],
                bulletType="1" if nr_liste else "bullet", start="1" if nr_liste else "–",
                bulletFontName="Plex-SemiBold", bulletFontSize=9, bulletColor=BRAND,
                bulletFormat="%s." if nr_liste else None,
                leftIndent=14, bulletDedent=12 if nr_liste else 10))
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
        m = re.match(r"^(- |\d+\. )(.*)", s)
        if m:
            kind = "nr" if m.group(1)[0].isdigit() else "pkt"
            if afsnit or (liste and liste_type[0] != kind):
                tøm()
            liste_type[0] = kind
            liste.append(m.group(2))
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
            p = Paragraph(f"{nummer(str(nr[0]))}&nbsp;&nbsp;&nbsp;{inline(s[3:])}", H1)
            p._toc = (0, str(nr[0]), inline(s[3:]))
            ud.append(p)
        elif s.startswith("### "):
            tøm()
            nr[1] += 1
            n = f"{nr[0]}.{nr[1]}"
            p = Paragraph(f"{nummer(n)}&nbsp;&nbsp;&nbsp;{inline(s[4:])}", H2)
            p._toc = (1, n, inline(s[4:]))
            ud.append(p)
        else:
            afsnit.append(s)
    tøm()

    # En overskrift må ikke stå alene nederst på en side.
    holdt, i = [], 0
    while i < len(ud):
        if hasattr(ud[i], "_toc") and i + 1 < len(ud):
            k = KeepTogether([ud[i], ud[i + 1]])
            k._toc = ud[i]._toc
            holdt.append(k)
            i += 2
        else:
            holdt.append(ud[i])
            i += 1
    return holdt


# ── Dokument ─────────────────────────────────────────────────────────────────

class Notat(BaseDocTemplate):
    def __init__(self, sti, p: dict):
        super().__init__(str(sti), pagesize=A4, leftMargin=VM, rightMargin=HM,
                         title=p.get("emne", ""), author=p.get("firma", ""))
        self.p = p
        kw = dict(leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([
            PageTemplate("forside", [Frame(VM, 20 * mm, BREDDE, H - 40 * mm, **kw)],
                         onPage=self._forside),
            PageTemplate("side", [Frame(VM, 22 * mm, BREDDE, H - 50 * mm, **kw)],
                         onPage=self._side)])

    def afterFlowable(self, f):
        toc = getattr(f, "_toc", None)
        if toc:
            niveau, n, tekst = toc
            self.notify("TOCEntry", (niveau, f"{nummer(n)}&nbsp;&nbsp;&nbsp;{tekst}", self.page))

    def _ordmærke(self, c, x, y, størrelse):
        c.setFillColor(BRAND)
        c.setFont("Plex-SemiBold", størrelse)
        c.drawString(x, y, self.p.get("firma_kort") or "omkreds")

    def _forside(self, c, doc):
        p = self.p
        # Smal terrakotta-kant i venstre side og ordmærket øverst
        c.setFillColor(BRAND)
        c.rect(0, 0, 6 * mm, H, stroke=0, fill=1)
        self._ordmærke(c, VM, H - 26 * mm, 13)

        # Titel
        c.setFillColor(GRAA)
        c.setFont("Plex-Medium", 9)
        c.drawString(VM, H * 0.62 + 30, (p.get("dokumenttype") or "Notat").upper())
        c.setFillColor(INK)
        c.setFont("Plex-SemiBold", 24)
        y = H * 0.62
        for linje in p["titel_linjer"]:
            c.drawString(VM, y, linje)
            y -= 30
        c.setFillColor(BRAND_INK)
        c.setFont("Plex", 13)
        y -= 6
        for linje in p["projekt_linjer"]:
            c.drawString(VM, y, linje)
            y -= 18

        # Sagsoplysninger nederst
        felter = [("Projekt", p.get("sag", "")), ("Fase", p.get("fase", "")),
                  ("Dato", p["dato"]), ("Revision", p.get("rev", ""))]
        c.setStrokeColor(STREG)
        c.setLineWidth(0.6)
        c.line(VM, 52 * mm, W - HM, 52 * mm)
        kol = BREDDE / len(felter)
        for i, (k, v) in enumerate(felter):
            x = VM + i * kol
            c.setFillColor(GRAA)
            c.setFont("Plex-Medium", 7.5)
            c.drawString(x, 45 * mm, k.upper())
            c.setFillColor(INK)
            c.setFont("Plex", 10)
            c.drawString(x, 39 * mm, str(v))

    def _side(self, c, doc):
        p = self.p
        self._ordmærke(c, VM, H - 17 * mm, 10)
        c.setFillColor(GRAA)
        c.setFont("Plex", 8)
        c.drawRightString(W - HM, H - 17 * mm, p.get("kort_titel", ""))
        c.setStrokeColor(STREG)
        c.setLineWidth(0.5)
        c.line(VM, H - 20.5 * mm, W - HM, H - 20.5 * mm)
        c.line(VM, 15 * mm, W - HM, 15 * mm)
        c.setFont("Plex", 7.5)
        c.drawString(VM, 10.5 * mm, p.get("sidefod", ""))
        c.setFillColor(INK)
        c.setFont("Plex-Medium", 7.5)
        c.drawRightString(W - HM, 10.5 * mm, f"Side {doc.page}")


def info_blok(p: dict) -> Table:
    rækker = [("Projekt", p.get("info_projekt") or p.get("sag", "")),
              ("Fase", p.get("fase", "")), ("Dato", p["dato"]),
              ("Revision", f"{p.get('rev', '')} – {p.get('rev_tekst', '')}".strip(" –")),
              ("Grundlag", p.get("grundlag", ""))]
    t = Table([[Paragraph(k.upper(), ETIKET), Paragraph(inline(str(v)), VÆRDI)]
               for k, v in rækker if v], colWidths=[30 * mm, BREDDE - 30 * mm], hAlign="LEFT")
    t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("VALIGN", (0, 0), (-1, -1), "BASELINE"),
                           ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
                           ("LINEBELOW", (0, -1), (-1, -1), 0.5, STREG)]))
    return t


def byg(projektmappe: Path) -> Path:
    p = yaml.safe_load((projektmappe / "projekt.yaml").read_text(encoding="utf-8"))
    md = (projektmappe / p.get("kilde", "notat.md")).read_text(encoding="utf-8")
    sidste = (p.get("revisioner") or [{}])[-1]
    p.setdefault("dato", sidste.get("dato", ""))
    p.setdefault("rev", sidste.get("rev", ""))
    p.setdefault("rev_tekst", sidste.get("beskrivelse", ""))
    p.setdefault("titel_linjer", [p.get("emne", "")])
    p.setdefault("projekt_linjer", [p.get("sag", "")])
    p.setdefault("kort_titel", p.get("sag", ""))

    ud = projektmappe / "ud" / f"{p.get('filnavn') or 'Energinotat_' + p.get('sag', 'projekt')}.pdf"
    ud.parent.mkdir(exist_ok=True)

    toc = TableOfContents(dotsMinLevel=0)
    toc.levelStyles = [TOC1, TOC2]
    flow = [NextPageTemplate("side"), PageBreak(),
            info_blok(p), Spacer(1, 18), Paragraph("Indhold", INDHOLD), toc, PageBreak()]
    flow += md_til_flowables(md)
    Notat(ud, p).multiBuild(flow)
    return ud


if __name__ == "__main__":
    mappe = Path(sys.argv[1] if len(sys.argv) > 1 else "energi/projekter/hjerlesvej")
    print(byg(mappe.resolve()))
