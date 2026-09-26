"""
pdf_fonts.py — IBM Plex i PDF'en.

Appen bruger IBM Plex på skærmen; rapporten skal se ud som det samme
program. Skriften ligger i backend/fonts (SIL Open Font License, se
LICENSE-IBM-Plex.txt), så den findes overalt, hvor backenden kører.

Navnene her er dem, resten af PDF-koden bruger: "Plex", "Plex-Bold",
"Plex-Italic", "Plex-BoldItalic", "Plex-Medium", "Plex-SemiBold" og
"PlexMono". Familien er registreret, så <b> og <i> i et afsnit virker.

Plex har græsk, √, ≤, ≥, → og sænkede cifre. COVERS fortæller, hvilke tegn
skriften har, så kun de få, den mangler, sendes til en anden skrift.
"""
from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.fonts import addMapping

FONT_DIR = Path(__file__).resolve().parent / "fonts"

_FILES = {
    "Plex":            "IBMPlexSans-Regular.ttf",
    "Plex-Italic":     "IBMPlexSans-Italic.ttf",
    "Plex-Bold":       "IBMPlexSans-Bold.ttf",
    "Plex-BoldItalic": "IBMPlexSans-BoldItalic.ttf",
    "Plex-Medium":     "IBMPlexSans-Medium.ttf",
    "Plex-SemiBold":   "IBMPlexSans-SemiBold.ttf",
    "PlexMono":        "IBMPlexMono-Regular.ttf",
    "PlexMono-Medium": "IBMPlexMono-Medium.ttf",
}

COVERS: frozenset = frozenset()


def _register() -> bool:
    global COVERS
    for name, fn in _FILES.items():
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / fn)))
    for bold, italic, face in ((0, 0, "Plex"), (1, 0, "Plex-Bold"),
                               (0, 1, "Plex-Italic"), (1, 1, "Plex-BoldItalic")):
        addMapping("Plex", bold, italic, face)
    pdfmetrics.registerFontFamily("Plex", normal="Plex", bold="Plex-Bold",
                                  italic="Plex-Italic", boldItalic="Plex-BoldItalic")
    try:
        from fontTools.ttLib import TTFont as _FT
        COVERS = frozenset(_FT(str(FONT_DIR / _FILES["Plex"])).getBestCmap())
    except Exception:
        # Uden fontTools: tegnene fra græsk og de matematiske blokke, som
        # Plex har, plus Latin-1.
        COVERS = frozenset(list(range(0x20, 0x250)) + list(range(0x370, 0x400))
                           + [ord(c) for c in "≤≥≠≈√→←↔−·×∞∑∆⁰₀₁₂₃₄₅₆₇₈₉"])
    return True


REGISTERED = _register()


def covers(ch: str) -> bool:
    return ord(ch) in COVERS


# Standardskriften for alt, der ikke selv nævner en: ParagraphStyle uden
# fontName og canvas-tekst før første setFont. Ellers fik forsiden Helvetica.
from reportlab import rl_config as _rl_config
from reportlab.lib.styles import ParagraphStyle as _PS
_rl_config.canvas_basefontname = "Plex"
_PS.defaults["fontName"] = "Plex"
_PS.defaults["bulletFontName"] = "Plex"
# Tabelceller med ren tekst (ikke Paragraph) tegnes med CellStyle.fontname.
from reportlab.platypus.tables import CellStyle as _CellStyle
_CellStyle.fontname = "Plex"
