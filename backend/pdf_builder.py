"""
pdf_builder.py — converts v2 document blocks → PDF bytes

Each document in the v2 app stores blocks in this format:
  {"type": "heading",    "data": {"level": 1, "text": "..."}}
  {"type": "text",       "data": {"text": "..."}}
  {"type": "image",      "data": {"image_b64": "...", "caption": "..."}}
  {"type": "python_calc","data": {"title": "...", "_output_text": "...", "_figs_b64": [...]}}
  {"type": "steel_beam", "data": {"title": "...", "_result": [calc_core blocks]}}
  {"type": "rc_beam",    "data": {"title": "...", "_result": [calc_core blocks]}}
  ... etc.

The calc_core blocks (_result) are already in the format that holst_layout
and calc_core expect: {"type": "section"/"text"/"handcalc"/"check"/...}

This module converts the v2 blocks into that format and calls generate_pdf_holst.
"""

import re
import rich_text
import base64
import os
import re as _re
import tempfile
from pathlib import Path

from calc_core import COVER, TOC, PAGEBREAK, S, T, N, H1, FIG
from holst_layout import generate_pdf_holst

from figurer import figurtekst, nummerer_figurer
import pdf_fonts  # noqa: F401  (registrerer IBM Plex)
from reportlab.lib.units import mm
from reportlab.lib import colors as rl_colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Table, TableStyle, Paragraph, Spacer
from reportlab.lib.enums import TA_LEFT, TA_CENTER


# ── Block converters ──────────────────────────────────────────────────────────

def _heading(block: dict) -> list:
    level = block["data"].get("level", 1)
    text  = _pdf_text(block["data"].get("text", ""), keep_greek=True)
    if level == 1:
        return H1(text)          # H1() already returns a list — don't wrap it again
    else:
        return [S(text)]


def _text(block: dict) -> list:
    # _pdf_text staver graeske bogstaver ud ("alpha"), fordi Helvetica ikke har
    # dem. Det goer calc_core._fmt ikke laengere -- den saetter dem i en rigtig
    # Unicode-skrift. Resultatet var at det samme tegn blev til "alfa" i en
    # tekstblok og til alpha i beregningen ved siden af. Graesk holdes derfor
    # udenfor her og haandteres nede i _fmt som alle andre steder.
    text = _pdf_text(block["data"].get("text", ""), keep_greek=True).strip()
    if not text:
        return []
    # **fed** / *kursiv* fra editorens tekstfelt -> <b>/<i>. Tekst uden
    # markering kommer uændret igennem.
    # Brugerens egen tekst: decimaltegn skrives som brugeren skrev dem.
    return [{**T(rich_text.to_reportlab(text)), "user": True}]


def _image(block: dict, tmp_files: list) -> list:
    b64 = block["data"].get("image_b64")
    if not b64:
        return []

    # b64 is like "data:image/png;base64,iVBOR..."
    try:
        header, data_str = b64.split(",", 1)
        raw = base64.b64decode(data_str)

        # SVG: ReportLab cannot render vector images — skip gracefully
        if "svg" in header:
            return [N("SVG-billeder kan ikke sættes i PDF'en. "
                      "Gem billedet som PNG eller JPG og indsæt det igen.")]

        # Use Pillow to open & normalise the image.
        # This handles WebP, HEIC (if pillow-heif is installed), AVIF, RGBA PNGs,
        # palette images, and anything else the browser can show but ReportLab cannot.
        from io import BytesIO
        from PIL import Image as PILImage

        pil_img = PILImage.open(BytesIO(raw))

        # Flatten transparency onto a white background so PDF always gets RGB
        if pil_img.mode == "RGBA":
            bg = PILImage.new("RGB", pil_img.size, (255, 255, 255))
            bg.paste(pil_img, mask=pil_img.split()[3])
            pil_img = bg
        elif pil_img.mode not in ("RGB", "L"):
            pil_img = pil_img.convert("RGB")

        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        pil_img.save(tmp, format="PNG")
        tmp.close()
        tmp_files.append(tmp.name)

        d         = block["data"]
        caption   = figurtekst(d.get("_figur_nr"), d.get("caption", ""))
        width_pct = d.get("width_pct", 100)
        width_mm  = max(20, min(170, int(170 * width_pct / 100)))

        fig = FIG(tmp.name, caption, width_mm=width_mm)
        fig["align"] = d.get("align", "center")
        return [fig]
    except Exception as exc:
        return [N(f"Billedet kunne ikke indsættes: {exc}")]


def _python_calc(block: dict, tmp_files: list) -> list:
    d      = block["data"]
    result = []

    title = d.get("title", "Python Script")
    result.append(S(title))

    output = d.get("_output_text", "").strip()
    if output:
        result.append(T(output))

    for b64 in d.get("_figs_b64", []):
        try:
            tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
            tmp.write(base64.b64decode(b64))
            tmp.close()
            tmp_files.append(tmp.name)
            result.append(FIG(tmp.name, ""))
        except Exception:
            pass

    error = d.get("_error", "").strip()
    if error:
        result.append(N(f"Script error: {error}"))

    return result


def _calc_block(block: dict) -> list:
    """
    For steel_beam, rc_beam, timber_beam, timber_column, masonry_wall blocks.
    The _result field already contains a list of calc_core-format blocks
    (section, text, note, table, handcalc, check) — pass them through directly.
    If the block hasn't been run yet, insert a note instead.
    """
    d      = block["data"]
    title  = d.get("title", block["type"].replace("_", " ").title())
    result = d.get("_result")

    if result is None:
        return [S(title), N("[Beregningen er ikke udført — afsnittet er ufuldstændigt.]")]

    # Flatten one level: some calc modules call H1() which returns a list,
    # and if they appended (not extended) it ends up nested.
    flat = []
    for item in result:
        if isinstance(item, list):
            flat.extend(item)
        else:
            flat.append(item)
    return flat


# ── Beam FEM block ────────────────────────────────────────────────────────────

def _beam_fem_block(block: dict, tmp_files: list) -> list:
    """
    beam_fem blocks store results differently from other calc blocks:
      _result  : text/table calc_core blocks
      _fig_b64 : base64 PNG of the matplotlib plot (stored in _summary.fig_b64
                 or directly as block.data._fig_b64)

    We embed the figure as a FIG block so it appears in the PDF.
    """
    d      = block["data"]
    title  = d.get("title", "Beam FEM Analysis")
    result = d.get("_result")

    if result is None:
        return [S(title), N("[Beregningen er ikke udført — afsnittet er ufuldstændigt.]")]

    # Flatten in case any items are nested lists
    flat = []
    for item in result:
        if isinstance(item, list):
            flat.extend(item)
        else:
            flat.append(item)

    # Embed the matplotlib figure if available
    fig_b64 = d.get("_fig_b64")
    if fig_b64:
        try:
            tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
            tmp.write(base64.b64decode(fig_b64))
            tmp.close()
            tmp_files.append(tmp.name)
            flat.append(FIG(tmp.name, title, width_mm=160))
        except Exception as exc:
            flat.append(N(f"Could not embed FEM figure: {exc}"))

    return flat


# ── 2D Frame FEM block ────────────────────────────────────────────────────────

def _fem_table(rows, has_header=True, col_widths_mm=None, font_pt=8) -> list:
    """Build a compact ReportLab table for the FEM result sections."""
    HDR_BG = rl_colors.HexColor("#f0f0f0")
    LIGHT  = rl_colors.HexColor("#f9f9f9")
    RULE   = rl_colors.HexColor("#d8d8d8")
    RULE_H = rl_colors.HexColor("#999999")
    BLACK  = rl_colors.HexColor("#111111")

    hdr_sty  = ParagraphStyle("femHdr",  fontSize=font_pt, fontName="Plex-SemiBold",
                               textColor=BLACK, leading=font_pt + 2)
    cell_sty = ParagraphStyle("femCell", fontSize=font_pt,
                               textColor=BLACK, leading=font_pt + 2)

    n_cols  = max(len(r) for r in rows) if rows else 1
    if col_widths_mm is None:
        col_widths_mm = [(170 / n_cols) * mm] * n_cols

    rl_rows = []
    for ri, row in enumerate(rows):
        sty = hdr_sty if (has_header and ri == 0) else cell_sty
        rl_rows.append([Paragraph(_pdf(str(cell)), sty) for cell in row])

    tbl = Table(rl_rows, colWidths=col_widths_mm, repeatRows=1 if has_header else 0)
    cmds = [
        ("GRID",          (0, 0), (-1, -1), 0.4, RULE),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]
    if has_header and rl_rows:
        cmds += [
            ("BACKGROUND", (0, 0), (-1, 0), HDR_BG),
            ("LINEBELOW",  (0, 0), (-1, 0), 1.2, RULE_H),
        ]
    for r in range(1 if has_header else 0, len(rl_rows)):
        if r % 2 == 0:
            cmds.append(("BACKGROUND", (0, r), (-1, r), LIGHT))
    tbl.setStyle(TableStyle(cmds))
    return [tbl, Spacer(1, 4 * mm)]


def _frame_fem_block(block: dict, tmp_files: list) -> list:
    """
    Render a frame_fem block to PDF:
      1. Regenerate the 5-panel matplotlib figure from the stored arrays
         (xs / N_arr / V_arr / M_arr are kept in element_results)
      2. Summary bar table  (max M / V / N / δ)
      3. Reactions table
      4. Element forces table

    No re-running of OpenSeesPy is needed — all data was saved on last Run.
    """
    d      = block["data"]
    title  = d.get("title", "2D Frame Analysis")
    result = d.get("_result")

    if result is None:
        return [S(title),
                N("[Beregningen er ikke udført — afsnittet er ufuldstændigt.]")]

    out = [S(title)]

    # ── 1. Figure ─────────────────────────────────────────────────────────────
    try:
        from frame_fem import _make_figure   # internal but safe — same package
        nodes        = d.get("nodes", [])
        elements     = d.get("elements", [])
        supports     = d.get("supports", [])
        loads        = d.get("loads", [])
        elem_results = result.get("element_results", [])
        node_disps   = result.get("node_disps", [])
        nd_dict      = {nd["node_id"]: nd for nd in node_disps}

        fig_b64 = _make_figure(nodes, elements, supports, loads,
                               elem_results, nd_dict, title)
        tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        tmp.write(base64.b64decode(fig_b64))
        tmp.close()
        tmp_files.append(tmp.name)
        out.append(FIG(tmp.name, title, width_mm=170))
    except Exception as exc:
        out.append(N(f"Could not render FEM figure: {exc}"))

    # ── 2. Summary ────────────────────────────────────────────────────────────
    sm = result.get("summary", {})
    if sm:
        out += _fem_table([
            ["max M (kNm)", "max V (kN)", "max N (kN)", "max δ (mm)"],
            [f"{sm.get('max_M_kNm', 0):.3f}",
             f"{sm.get('max_V_kN',  0):.3f}",
             f"{sm.get('max_N_kN',  0):.3f}",
             f"{sm.get('max_disp_mm', 0):.4f}"],
        ], col_widths_mm=[42.5 * mm] * 4)

    # ── 3. Reactions ──────────────────────────────────────────────────────────
    reactions = result.get("reactions", [])
    if reactions:
        out.append(S("Reactions"))
        rows = [["Node", "Rx (kN)", "Ry (kN)", "Mz (kNm)"]]
        for r in reactions:
            rows.append([
                f"N{r['node_id']}",
                f"{r.get('Rx_kN',  0):.3f}",
                f"{r.get('Ry_kN',  0):.3f}",
                f"{r.get('Mz_kNm', 0):.3f}",
            ])
        out += _fem_table(rows,
                          col_widths_mm=[20 * mm, 50 * mm, 50 * mm, 50 * mm])

    # ── 4. Element forces ─────────────────────────────────────────────────────
    ers = result.get("element_results", [])
    if ers:
        out.append(S("Element forces"))
        rows = [["Elem", "L(m)", "Ni(kN)", "Nj(kN)",
                 "Vi(kN)", "Vj(kN)", "Mi(kNm)", "Mj(kNm)", "|M|max"]]
        for er in ers:
            rows.append([
                f"E{er['elem_id']}",
                f"{er.get('L_m',        0):.2f}",
                f"{er.get('N_start_kN', 0):.2f}",
                f"{er.get('N_end_kN',   0):.2f}",
                f"{er.get('V_start_kN', 0):.2f}",
                f"{er.get('V_end_kN',   0):.2f}",
                f"{er.get('M_start_kNm',0):.2f}",
                f"{er.get('M_end_kNm',  0):.2f}",
                f"{er.get('M_max_kNm',  0):.2f}",
            ])
        # 9 columns — use 6 pt so it fits on the 170 mm page width
        cw = [mm * w for w in [16, 14, 20, 20, 20, 20, 20, 20, 20]]
        out += _fem_table(rows, col_widths_mm=cw, font_pt=6)

    return out


# ── Unicode → PDF-safe text ──────────────────────────────────────────────────
# Helvetica (the default PDF font) only covers Latin-1 + some extras.
# Unicode subscript/superscript digits and a handful of other maths symbols
# are outside that range and render as ■.  Map them to plain ASCII equivalents.

_PDF_CHAR_MAP = str.maketrans(
    '₀₁₂₃₄₅₆₇₈₉'   # subscript digits U+2080-U+2089
    '⁰¹²³⁴⁵⁶⁷⁸⁹'   # superscript digits
    '–—'             # en-dash, em-dash
    '≤≥≠≈·×',
    '0123456789'
    '0123456789'
    '--'
    '<>!=.*',
)

def _pdf(s) -> str:
    """
    Gør en tabelcelle klar til PDF'en.

    Tidligere fladede den ·, × og ≤ ud til ., * og <, og droppede græsk helt —
    "45 × 195 mm" blev til "45 * 195 mm" og en kolonne med overskriften
    "Udnyttelse η" mistede sit η. To af de tegn er endda Latin-1, som
    Helvetica tegner udmærket.

    Cellerne er Paragraph-objekter, så de kan bruge nøjagtig samme vej som
    brødtekst og beregningsrækker: græsk og de matematiske tegn sættes i
    Unicode-skriften, Latin-1 bliver hvor det er, og sænkede tegn bliver til
    markup i stedet for at forsvinde. Ét sted i stedet for tre.
    """
    from calc_core import _para_fmt
    return _para_fmt(s)


# Text and heading blocks take a different route than table cells: the story
# renderer already turns `x_y` into a subscript and Latin-1 covers ° ² ³ × ·,
# so those must be left alone.  What it does *not* handle is anything outside
# Latin-1 — Greek letters, arrows, ≤ — which Helvetica drops silently.  A value
# vanishing from an engineering document is the worst possible failure mode, so
# map them to something readable instead.
_TEXT_CHAR_MAP = {
    ord('→'): '->', ord('←'): '<-', ord('↔'): '<->', ord('⇒'): '=>',
    ord('≤'): '<=', ord('≥'): '>=', ord('≠'): '!=', ord('≈'): '~',
    ord('√'): 'sqrt', ord('∑'): 'sum', ord('∆'): 'delta', ord('∞'): 'uendelig',
    ord('‰'): 'promille',
    # Greek — spelled out, the same convention the calculation blocks use
    ord('α'): 'alpha', ord('β'): 'beta',  ord('γ'): 'gamma', ord('δ'): 'delta',
    ord('ε'): 'epsilon', ord('ζ'): 'zeta', ord('η'): 'eta',  ord('θ'): 'theta',
    ord('λ'): 'lambda', ord('μ'): 'my',   ord('ν'): 'ny',    ord('ξ'): 'xi',
    ord('π'): 'pi',     ord('ρ'): 'rho',  ord('σ'): 'sigma', ord('τ'): 'tau',
    ord('φ'): 'phi',    ord('χ'): 'chi',  ord('ψ'): 'psi',   ord('ω'): 'omega',
    ord('Γ'): 'Gamma',  ord('Δ'): 'Delta', ord('Σ'): 'Sigma',
    ord('Φ'): 'Phi',    ord('Ω'): 'Omega',
}
# Subscript/superscript digits become the markup the story renderer understands,
# so they keep rendering as sub/superscripts rather than disappearing.
for _i, _sub in enumerate('₀₁₂₃₄₅₆₇₈₉'):
    _TEXT_CHAR_MAP[ord(_sub)] = f'_{_i}'
for _i, _sup in enumerate('⁰¹²³⁴⁵⁶⁷⁸⁹'):
    if _sup not in '¹²³':          # these three are Latin-1 and render as-is
        _TEXT_CHAR_MAP[ord(_sup)] = f'^{_i}'


_TEXT_CHAR_MAP_KEEP_GREEK = {k: v for k, v in _TEXT_CHAR_MAP.items()
                             if not (0x0370 <= k <= 0x03FF)}


# IBM Plex har de fleste af tegnene ovenfor (→, ≤, græsk, …). Kun dem, skriften
# mangler, skrives om; sænkede/hævede cifre bliver stadig til markup, så de
# tegnes som ægte sub/superscript.
_SUBSUP = set('₀₁₂₃₄₅₆₇₈₉⁰⁴⁵⁶⁷⁸⁹')
_TEXT_CHAR_MAP = {k: v for k, v in _TEXT_CHAR_MAP.items()
                  if chr(k) in _SUBSUP or not pdf_fonts.covers(chr(k))}
_TEXT_CHAR_MAP_KEEP_GREEK = {k: v for k, v in _TEXT_CHAR_MAP.items()
                             if not (0x0370 <= k <= 0x03FF)}


def _pdf_text(s, keep_greek: bool = False) -> str:
    """Make prose safe for the PDF story renderer without flattening sub/superscripts."""
    table = _TEXT_CHAR_MAP_KEEP_GREEK if keep_greek else _TEXT_CHAR_MAP
    return str(s).translate(table)


# ── Editable table block ─────────────────────────────────────────────────────

def _table_block(block: dict) -> list:
    """
    Render a user-created table block as a PDF table.
    Data shape: { caption, has_header, rows: str[][], highlighted: str[] }

    highlighted is a list of "ri,ci" strings — those cells get a yellow
    background in the PDF, matching the frontend highlight mode.
    """
    d           = block["data"]
    caption     = d.get("caption", "").strip()
    has_header  = d.get("has_header", True)
    rows_data   = d.get("rows", [])
    highlighted = set(d.get("highlighted", []))  # e.g. {"1,0", "1,1", ...}

    if not rows_data:
        return []

    HDR_BG    = rl_colors.HexColor("#f0f0f0")   # light grey header
    BLACK     = rl_colors.HexColor("#111111")
    LIGHT     = rl_colors.HexColor("#f9f9f9")
    RULE      = rl_colors.HexColor("#d8d8d8")
    RULE_H    = rl_colors.HexColor("#999999")   # heavier rule under header
    HL_BG     = rl_colors.HexColor("#fef08a")   # yellow highlight (matches frontend)
    HL_BORDER = rl_colors.HexColor("#ca8a04")   # amber border for highlighted cells

    # Column widths — use stored percentages if available, else distribute evenly
    n_cols = max(len(r) for r in rows_data) if rows_data else 1
    stored_widths = d.get("col_widths")   # list of percentages (sum ~100) or None
    TOTAL_MM = 170
    if stored_widths and len(stored_widths) == n_cols:
        # Normalise in case they don't sum to exactly 100
        total_pct = sum(stored_widths)
        col_widths_mm = [(w / total_pct) * TOTAL_MM * mm for w in stored_widths]
    else:
        col_widths_mm = [(TOTAL_MM / n_cols) * mm] * n_cols

    # Auto-scale font size based on column count so wide tables don't wrap horribly.
    # 8pt works fine up to ~6 columns. Each extra column above 6 costs half a point,
    # floored at 6pt (still readable, just compact).
    if n_cols <= 6:
        font_pt = 8
    elif n_cols <= 8:
        font_pt = 7
    else:
        font_pt = 6

    hdr_style  = ParagraphStyle("tblHdr",  fontSize=font_pt, textColor=BLACK,
                                 fontName="Plex-SemiBold", leading=font_pt + 2)
    cell_style = ParagraphStyle("tblCell", fontSize=font_pt,
                                 textColor=BLACK, leading=font_pt + 2)
    cap_style  = ParagraphStyle("tblCap",  fontSize=8, fontName="Plex-Italic",
                                 textColor=rl_colors.HexColor("#555555"), leading=10,
                                 spaceAfter=2)

    result = []
    if caption:
        result.append(Paragraph(_pdf(caption), cap_style))

    # Build ReportLab rows — _pdf() strips chars Helvetica can't render
    rl_rows = []
    for ri, row in enumerate(rows_data):
        is_hdr = has_header and ri == 0
        sty    = hdr_style if is_hdr else cell_style
        rl_rows.append([Paragraph(_pdf(cell), sty) for cell in row])

    tbl = Table(rl_rows, colWidths=col_widths_mm, repeatRows=1 if has_header else 0)

    style_cmds = [
        ("GRID",          (0, 0), (-1, -1),  0.4, RULE),
        ("TOPPADDING",    (0, 0), (-1, -1),  3),
        ("BOTTOMPADDING", (0, 0), (-1, -1),  3),
        ("LEFTPADDING",   (0, 0), (-1, -1),  5),
        ("RIGHTPADDING",  (0, 0), (-1, -1),  5),
        ("VALIGN",        (0, 0), (-1, -1),  "MIDDLE"),
    ]
    if has_header and rl_rows:
        style_cmds += [
            ("BACKGROUND", (0, 0), (-1, 0),  HDR_BG),
            ("LINEBELOW",  (0, 0), (-1, 0),  1.2, RULE_H),
        ]
        # Alternating rows start at row 1
        for r in range(1, len(rl_rows)):
            if r % 2 == 0:
                style_cmds.append(("BACKGROUND", (0, r), (-1, r), LIGHT))
    else:
        for r in range(len(rl_rows)):
            if r % 2 == 0:
                style_cmds.append(("BACKGROUND", (0, r), (-1, r), LIGHT))

    # Highlighted cells — applied last so they override alternating-row colours
    for key in highlighted:
        try:
            ri, ci = (int(x) for x in key.split(","))
            if 0 <= ri < len(rl_rows) and 0 <= ci < n_cols:
                style_cmds.append(("BACKGROUND", (ci, ri), (ci, ri), HL_BG))
                style_cmds.append(("BOX",        (ci, ri), (ci, ri), 0.8, HL_BORDER))
        except ValueError:
            pass   # malformed key — skip silently

    tbl.setStyle(TableStyle(style_cmds))
    result.append(tbl)
    result.append(Spacer(1, 4 * mm))
    return result


# ── DS 1140 Control plan block ────────────────────────────────────────────────

def _control_plan(block: dict) -> list:
    """
    Render a control_plan block as a formatted DS 1140 table.
    Supports both plan mode (B2) and report mode (B3).
    """
    d        = block["data"]
    title    = d.get("title", "Kontrolplan")
    is_report = d.get("mode", "plan") == "report"
    items    = d.get("items", [])

    result = [S(title)]

    if not items:
        result.append(N("Ingen kontrolpunkter defineret."))
        return result

    # ── Styles ────────────────────────────────────────────────────────────────
    NAVY  = rl_colors.HexColor("#1e3a5f")
    WHITE = rl_colors.white
    LIGHT = rl_colors.HexColor("#f8fafc")
    RULE  = rl_colors.HexColor("#e2e8f0")
    GREEN = rl_colors.HexColor("#16a34a")
    RED   = rl_colors.HexColor("#dc2626")
    AMBER = rl_colors.HexColor("#b45309")
    GREY  = rl_colors.HexColor("#94a3b8")

    hdr_style = ParagraphStyle("cpHdr",  fontSize=8,  textColor=WHITE, fontName="Plex-SemiBold",   leading=10, spaceAfter=0)
    cell_style= ParagraphStyle("cpCell", fontSize=8,  textColor=rl_colors.HexColor("#1e293b"),       leading=10, spaceAfter=0)
    mono_style= ParagraphStyle("cpMono", fontSize=7,  textColor=rl_colors.HexColor("#475569"),       leading=9,  spaceAfter=0, fontName="Plex")

    # ── Column definitions ────────────────────────────────────────────────────
    # plan  cols: Pos | Beskrivelse | KK | Kontroltype | Ansvarlig | Reference
    # report cols: same + Status | Dato | Udøver | Bemærkninger
    if is_report:
        col_widths = [10*mm, 52*mm, 12*mm, 22*mm, 16*mm, 14*mm,
                      16*mm, 17*mm, 16*mm, 25*mm]
        headers = ["Pos", "Beskrivelse", "KK", "Kontroltype",
                   "Ansvarlig", "Ref.",
                   "Status", "Dato", "Udøver", "Bemærkninger"]
    else:
        col_widths = [10*mm, 78*mm, 12*mm, 28*mm, 20*mm, 22*mm]
        headers    = ["Pos", "Beskrivelse", "KK", "Kontroltype",
                      "Ansvarlig", "Reference"]

    # ── Header row ────────────────────────────────────────────────────────────
    rows = [[Paragraph(h, hdr_style) for h in headers]]

    # ── Control-type mapping ──────────────────────────────────────────────────
    _CTRL_LABEL = {"E": "E – Egenkontrol", "U": "U – Uvildig", "T": "T – Tilsyn"}

    # ── Status colour mapping ─────────────────────────────────────────────────
    _STATUS_COLOUR = {
        "OK":       GREEN,
        "N/A":      GREY,
        "Afventer": AMBER,
        "Fejl":     RED,
    }

    for item in items:
        pos    = str(item.get("pos", "")).strip()
        desc   = item.get("description", "").strip()
        kk     = item.get("kk", "").strip()
        ctrl   = item.get("control", "E")
        resp   = item.get("responsible", "").strip()
        ref    = item.get("reference", "").strip()

        ctrl_label = _CTRL_LABEL.get(ctrl, ctrl)

        row = [
            Paragraph(pos,        cell_style),
            Paragraph(desc,       cell_style),
            Paragraph(kk,         mono_style),
            Paragraph(ctrl_label, mono_style),
            Paragraph(resp,       cell_style),
            Paragraph(ref,        mono_style),
        ]

        if is_report:
            status     = item.get("status", "").strip()
            date_val   = item.get("date", "").strip()
            performer  = item.get("performed_by", "").strip()
            remarks    = item.get("remarks", "").strip()
            row += [
                Paragraph(status or "—",  cell_style),
                Paragraph(date_val,       mono_style),
                Paragraph(performer,      cell_style),
                Paragraph(remarks,        cell_style),
            ]

        rows.append(row)

    # ── Build table ───────────────────────────────────────────────────────────
    tbl = Table(rows, colWidths=col_widths, repeatRows=1)

    n_cols = len(headers)
    n_rows = len(rows)

    style_cmds = [
        # Header row background
        ("BACKGROUND",  (0, 0), (-1, 0),         NAVY),
        ("TEXTCOLOR",   (0, 0), (-1, 0),          WHITE),
        ("FONTNAME",    (0, 0), (-1, 0),           "Plex-SemiBold"),
        # Alternating rows
        ("BACKGROUND",  (0, 1), (-1, -1),         WHITE),
        # Grid
        ("GRID",        (0, 0), (-1, -1),          0.4, RULE),
        ("LINEABOVE",   (0, 0), (-1, 0),           1,   NAVY),
        # Padding
        ("TOPPADDING",  (0, 0), (-1, -1),          3),
        ("BOTTOMPADDING", (0, 0), (-1, -1),        3),
        ("LEFTPADDING", (0, 0), (-1, -1),          4),
        ("RIGHTPADDING",(0, 0), (-1, -1),          4),
        # Vertical alignment
        ("VALIGN",      (0, 0), (-1, -1),          "TOP"),
    ]

    # Alternating row shading
    for r in range(1, n_rows):
        if r % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, r), (-1, r), LIGHT))

    # Colour status column cells (if report mode)
    if is_report:
        STATUS_COL = 6  # 0-based index
        for r, item in enumerate(items, start=1):
            status = item.get("status", "").strip()
            clr = _STATUS_COLOUR.get(status)
            if clr:
                style_cmds.append(("TEXTCOLOR", (STATUS_COL, r), (STATUS_COL, r), clr))

    tbl.setStyle(TableStyle(style_cmds))
    result.append(tbl)
    result.append(Spacer(1, 4*mm))

    # Legend
    ctrl_legend = "  ·  ".join(f"{v[0]} = {v[2:]}" for v in
                                ["E – Egenkontrol", "U – Uvildig kontrol", "T – Tilsyn"])
    legend_st = ParagraphStyle("legend", fontSize=7, textColor=rl_colors.HexColor("#64748b"),
                                leading=9, fontName="Plex-Italic")
    result.append(Paragraph(f"Kontroltype: {ctrl_legend}", legend_st))
    result.append(Spacer(1, 2*mm))

    return result


# ── General / Portal Frame FEM blocks ────────────────────────────────────────

def _figs_b64_to_pdf(figs_b64: list, tmp_files: list, captions: list,
                     width_mm: int = 140, max_h_mm: int = 80) -> list:
    """
    Afkod base64-PNG'erne og returner FIG()-blokke.

    140 x 80 mm i stedet for 160 mm bred uden loft. En rammeberegning har fem
    figurer, og uden loftet fyldte de 564 mm -- 2,3 siders billede, foer der
    stod tekst. Loftet er det, der goer forskellen paa en hoej model: den bliver
    smallere i stedet for at fylde en halv side.
    """
    out = []
    for i, b64 in enumerate(figs_b64):
        try:
            tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
            tmp.write(base64.b64decode(b64))
            tmp.close()
            tmp_files.append(tmp.name)
            caption = captions[i] if i < len(captions) else ""
            out.append(FIG(tmp.name, caption, width_mm=width_mm,
                           max_h_mm=max_h_mm))
        except Exception as exc:
            out.append(N(f"Could not embed figure: {exc}"))
    return out


def _dk(v, d=2):
    return f"{v:.{d}f}".replace(".", ",")


def _general_frame_fem_block(block: dict, tmp_files: list) -> list:
    from calc_core import MH, S, T, TBL, N, FIG, H1
    d       = block["data"]
    title   = d.get("title", "Rammeberegning")
    summary = d.get("_summary")
    figs    = d.get("_figs_b64", [])

    # Løseren er ikke nødvendigvis OpenSees (standard er den direkte
    # stivhedsmetode), så overskriften nævner metoden, ikke et program.
    out = [MH(title, "Rammeberegning — plan ramme, lineær elastisk FEM", "general")]

    if not summary:
        out.append(N("[Beregningen er ikke udført — afsnittet er ufuldstændigt.]"))
        return out

    # ── Figures ──────────────────────────────────────────────────────────────
    # Figurteksten bærer tallet. Den der bladrer i en statisk beregning leder
    # efter det dimensionsgivende snit, ikke efter en billedtekst der gentager
    # hvad figuren allerede har skrevet i sit eget hjørne.
    def _cap(base, value, unit, ele=None, dec=2):
        if value is None:
            return base
        where = f" i element {ele}" if ele is not None else ""
        return f"{base} — max {_dk(float(value), dec)} {unit}{where}"

    out += _figs_b64_to_pdf(
        figs, tmp_files,
        [
            "Statisk model og last",
            _cap("Deformeret form",
                 max(abs(summary.get('max_ux_mm') or 0.0),
                     abs(summary.get('max_uy_mm') or 0.0)), "mm", dec=1),
            _cap("Momentkurve", summary.get('max_moment_kNm'), "kNm",
                 summary.get('max_moment_ele')),
            _cap("Forskydningskurve", summary.get('max_shear_kN'), "kN",
                 summary.get('max_shear_ele')),
            _cap("Normalkraftkurve", summary.get('max_axial_kN'), "kN",
                 summary.get('max_axial_ele')),
            # Udnyttelseskurverne staar bagest og er der kun, naar mindst én
            # stang har et traetvaersnit. _figs_b64_to_pdf laeser kun saa mange
            # tekster, som der er figurer, saa de to sidste falder bare bort,
            # naar de ikke er der.
            "Udnyttelse — bøjning. Stiplet linje er η = 1,0",
            "Udnyttelse — forskydning. Stiplet linje er η = 1,0",
        ],
    )

    # ── Lastbilleder ─────────────────────────────────────────────────────────
    #
    # Ét pr. lasttilfælde. Den samlede model viser alle laster oven på
    # hinanden, og med fire tilfælde er det ikke en tegning, det er et virvar.
    #
    # De står her, mellem modellen og resultaterne, fordi det er den
    # rækkefølge en kontrollant læser i: hvad er der påsat, og hvad kom der
    # ud. En eftervisning kan kun kontrolleres, hvis lasterne kan ses — en
    # tabel med tal siger ikke, om vindlasten sidder på den rigtige side af
    # rammen.
    lastfigurer = summary.get('lastfigurer') or []
    if lastfigurer:
        out.append(S("Lasttilfælde"))
        out.append(T(
            f"Modellen er påsat {len(lastfigurer)} lasttilfælde. "
            "Hvert er tegnet for sig med sine karakteristiske laster; "
            "partialkoefficienterne påsættes i kombinationerne nedenfor."))
        out += _figs_b64_to_pdf(
            [f.get('b64') for f in lastfigurer if f.get('b64')],
            tmp_files,
            [f.get('navn', '') for f in lastfigurer if f.get('b64')],
            width_mm=120, max_h_mm=70,
        )

    # ── Headline results ─────────────────────────────────────────────────────
    out.append(S("Hovedresultater"))
    rows = [
        ["Største vandrette flytning δ_x",
         f"{_dk(summary['max_ux_mm'])} mm", f"Knude {summary['max_ux_node']}"],
        ["Største lodrette flytning δ_y",
         f"{_dk(summary['max_uy_mm'])} mm",
         # Ligger den stoerste nedboejning inde i et fag, er der ingen knude
         # at pege paa -- "Knude 1" var en understoetning.
         (f"Element {summary['max_uy_elem']}, x = {_dk(summary.get('max_uy_x_m') or 0)} m"
          if summary.get('max_uy_elem') is not None
          else f"Knude {summary['max_uy_node']}")],
        ["Største moment M",
         f"{_dk(summary['max_moment_kNm'])} kNm",
         f"Element {summary['max_moment_ele']}"],
    ]
    # V og N stod kun i elementtabellen, hvor de skulle findes blandt alt
    # andet — men det er dem eftervisningen falder på lige så ofte som på M.
    if summary.get('max_shear_ele') is not None:
        rows.append(["Største forskydning V",
                     f"{_dk(summary['max_shear_kN'])} kN",
                     f"Element {summary['max_shear_ele']}"])
    if summary.get('max_axial_ele') is not None:
        N_Ed = float(summary.get('max_axial_kN') or 0.0)
        rows.append(["Største normalkraft N",
                     f"{_dk(N_Ed)} kN ({'træk' if N_Ed > 0 else 'tryk'})",
                     f"Element {summary['max_axial_ele']}"])
    out.append(TBL(["Resultat", "Værdi", "Placering"], rows))

    # ── Applied loads ─────────────────────────────────────────────────────────
    loads_table = summary.get("loads_table", [])
    if loads_table:
        out.append(S("Påførte laster"))
        if "vaerdi" in loads_table[0]:
            out.append(TBL(
                ["Type", "Hvor", "Lasttilfælde", "Retning", "Størrelse"],
                [[l["type"], l["target"], l.get("lasttilfaelde", "—"),
                  l.get("retning", "—"), l["vaerdi"]] for l in loads_table],
            ))
        else:   # gemte resultater fra før
            out.append(TBL(
                ["Type", "Target", "Fx (kN)", "Fy (kN)", "Mz (kNm)", "wy (kN/m)", "wx (kN/m)"],
                [
                    [
                        l["type"], l["target"],
                        f"{l['Fx_kN']:.2f}"  if l.get("Fx_kN")  is not None else "—",
                        f"{l['Fy_kN']:.2f}"  if l.get("Fy_kN")  is not None else "—",
                        f"{l['Mz_kNm']:.2f}" if l.get("Mz_kNm") is not None else "—",
                        f"{l['wy_kNm']:.2f}" if l.get("wy_kNm") is not None else "—",
                        f"{l['wx_kNm']:.2f}" if l.get("wx_kNm") is not None else "—",
                    ]
                    for l in loads_table
                ],
            ))

    # ── Element section forces ────────────────────────────────────────────────
    ele_table = summary.get("ele_force_table", [])
    if ele_table:
        out.append(S("Snitkræfter i elementerne"))
        out.append(T(
            "Snitkræfter i lokale elementakser. "
            "Ende i = startknude, ende j = slutknude. "
            "N: normalkraft (+ træk)  V: forskydning  M: moment.  "
            "M_max er det største moment et vilkårligt sted langs elementet, "
            "og x angiver hvor. På et element med linjelast ligger maksimum "
            "mellem knuderne — det er den værdi, eftervisningen regner med."
        ))
        out.append(TBL(
            ["Elem", "Type", "L (m)", "A (cm²)", "Iz (cm⁴)",
             "N_i (kN)", "V_i (kN)", "M_i (kNm)",
             "N_j (kN)", "V_j (kN)", "M_j (kNm)",
             "M_max (kNm)", "x (m)"],
            [
                [
                    str(e["id"]), {"beam": "bjælke", "truss": "gitterstang"}.get(e["type"], e["type"]), f"{e['L_m']:.2f}",
                    _dk(float(e["A_cm2"]), 1),
                    _dk(float(e["Iz_cm4"]), 0) if e["type"] == "beam" else "—",
                    f"{e['N_i_kN']:.2f}", f"{e['V_i_kN']:.2f}", f"{e['M_i_kNm']:.2f}",
                    f"{e['N_j_kN']:.2f}", f"{e['V_j_kN']:.2f}", f"{e['M_j_kNm']:.2f}",
                    f"{e['M_max_kNm']:.2f}" if e.get("M_max_kNm") is not None else "—",
                    f"{e['x_M_max_m']:.2f}" if e.get("x_M_max_m") is not None else "—",
                ]
                for e in ele_table
            ],
        ))

    # ── Node displacements ────────────────────────────────────────────────────
    node_table = summary.get("node_disp_table", [])
    if node_table:
        out.append(S("Knudeflytninger"))
        out.append(TBL(
            ["Node", "x (m)", "y (m)", "δ_x (mm)", "δ_y (mm)", "θ_z (mrad)"],
            [
                [
                    str(n["id"]), f"{n['x_m']:.3f}", f"{n['y_m']:.3f}",
                    f"{n['ux_mm']:.3f}", f"{n['uy_mm']:.3f}", f"{n['rz_mrad']:.3f}",
                ]
                for n in node_table
            ],
        ))

    # ── Reactions ─────────────────────────────────────────────────────────────
    reactions = summary.get("reactions", {})
    if reactions:
        out.append(S("Reaktioner"))
        out.append(TBL(
            ["Node", "Fx (kN)", "Fy (kN)", "Mz (kNm)"],
            [
                [nid, f"{R['Fx_kN']:.2f}", f"{R['Fy_kN']:.2f}", f"{R['Mz_kNm']:.2f}"]
                for nid, R in reactions.items()
            ],
        ))

    return out


def _portal_frame_fem_block(block: dict, tmp_files: list) -> list:
    from calc_core import MH, S, T, TBL, N
    d       = block["data"]
    title   = d.get("title", "Portal Frame FEM")
    summary = d.get("_summary")
    figs    = d.get("_figs_b64", [])

    out = [MH(title, "Portal Frame FEM — OpenSeesPy", "general")]

    if not summary:
        out.append(N("[Beregningen er ikke udført — afsnittet er ufuldstændigt.]"))
        return out

    out += _figs_b64_to_pdf(
        figs, tmp_files,
        ["Static model", "Deflected shape", "Bending moment diagram", "Shear force diagram", "Axial force diagram"],
    )

    out.append(S("Hovedresultater"))
    out.append(TBL(
        ["Resultat", "Værdi", "Placering"],
        [
            ["Max lateral displacement δ_x",
             f"{summary['max_lateral_disp_mm']:.2f} mm",
             f"Node {summary['max_lateral_disp_node']}"],
            ["Største lodrette flytning δ_y",
             f"{summary['max_vertical_disp_mm']:.2f} mm",
             f"Node {summary['max_vertical_disp_node']}"],
            ["Største moment M",
             f"{summary['max_moment_kNm']:.2f} kNm",
             f"Element {summary['max_moment_ele']}"],
        ],
    ))

    reactions = summary.get("reactions", {})
    if reactions:
        out.append(S("Reaktioner"))
        out.append(TBL(
            ["Column", "Fx (kN)", "Fy (kN)", "Mz (kNm)"],
            [
                [col, f"{R['Fx_kN']:.2f}", f"{R['Fy_kN']:.2f}", f"{R['Mz_kNm']:.2f}"]
                for col, R in reactions.items()
            ],
        ))

    return out


# ── Dispatch table ────────────────────────────────────────────────────────────

_CALC_TYPES = {
    "steel_beam", "steel_column", "beam_column",
    "rc_beam", "rc_column", "rc_slab",
    "timber_beam", "timber_column",
    "masonry_wall",
    "custom_calc",
    # roof_dead_load manglede her indtil 2026-09-06. Blokken blev droppet
    # lydloest i eksporten -- overskriften stod i dokumentet, indholdet ikke --
    # og den ligger i A2-skabelonen for tagkonstruktioner, saa hvert A2 derfra
    # er eksporteret uden sit egenlastafsnit. Se test_pdf_block_coverage.py.
    "wind_load", "snow_load", "roof_dead_load", "egenlast",
    "frame_loads",
    "foundation",
    "load_combo",
    "bolt_group", "fillet_weld",
    "plate_girder",
    "saved_calc",
    # Egenvægt og Sne i skrivebordsprogrammets rapport (lib/rapportModuler.js).
    "rapport_egenvaegt", "rapport_sne",
}


def regneark_som_tabel(block: dict) -> dict:
    """Et regneark (frontend: RegnearkBlock) som en almindelig tabel.

    Tallene er de viste tekster (data._vist), som regnearket selv gemmer, så
    rapporten viser det samme som skærmen. Tomme rækker og kolonner i
    slutningen udelades; kolonnebredderne følger arket.
    """
    d = block.get("data") or {}
    rows = [list(r) for r in (d.get("_vist") or [])]
    if not rows:
        rows = [[str(c) for c in r] for r in (d.get("celler") or []) if not any(str(c).startswith("=") for c in r)]
    while rows and not any(str(c).strip() for c in rows[-1]):
        rows.pop()
    bredde = 0
    for r in rows:
        for k in range(len(r) - 1, -1, -1):
            if str(r[k]).strip():
                bredde = max(bredde, k + 1)
                break
    rows = [(r + [""] * bredde)[:bredde] for r in rows]
    bredder = list(d.get("bredder") or [])
    col = None
    if bredde and bredder:
        b = [(bredder[k] if k < len(bredder) and bredder[k] else (150 if k == 0 else 92)) for k in range(bredde)]
        col = [100.0 * x / sum(b) for x in b]
    return {"type": "table", "data": {
        "caption": d.get("titel") or "", "has_header": d.get("overskrift", True) is not False,
        "rows": rows, "col_widths": col,
    }}


def _laes_adresse(a: str):
    import re
    m = re.fullmatch(r"\$?([A-Za-z]{1,2})\$?(\d+)", a.strip())
    if not m:
        return None
    k = 0
    for ch in m.group(1).upper():
        k = k * 26 + (ord(ch) - 64)
    return int(m.group(2)) - 1, k - 1


def _laes_omraade(tekst: str):
    """"A1:D34" → (r0, k0, r1, k1), 0-baseret. Tomt eller ugyldigt → None (hele arket)."""
    t = str(tekst or "").strip()
    if not t:
        return None
    dele = t.split(":")
    fra = _laes_adresse(dele[0])
    til = _laes_adresse(dele[1]) if len(dele) > 1 else fra
    if not fra or not til or len(dele) > 2:
        return None
    return min(fra[0], til[0]), min(fra[1], til[1]), max(fra[0], til[0]), max(fra[1], til[1])


def _adresse(r: int, k: int) -> str:
    navn, k1 = "", k + 1
    while k1:
        k1, rest = divmod(k1 - 1, 26)
        navn = chr(65 + rest) + navn
    return f"{navn}{r + 1}"


_TAL = re.compile(r"[-+−]?\d{1,3}(\.\d{3})*(,\d+)?|[-+−]?\d+([.,]\d+)?([eE][-+]?\d+)?")


def _er_tal(t: str) -> bool:
    return bool(_TAL.fullmatch(str(t).strip().replace("\u00a0", "").replace(" ", "")))


def _celle_art(raw) -> str:
    """'f' formel, 'i' indtastet tal (inddata), 't' tekst, '' tom (som celleArt i regnearksbog.js)."""
    t = str(raw if raw is not None else "").strip()
    if not t:
        return ""
    if t.startswith("=") and len(t) > 1:
        return "f"
    return "i" if _er_tal(t) else "t"


def _regneark_raekketyper(rows, fed, art, overskrift) -> list:
    """Rækkernes rolle — samme regler som raekkeTyper i frontend/src/lib/regnearksbog.js."""
    typer = []
    for i, r in enumerate(rows):
        fyldte = [k for k, c in enumerate(r) if str(c).strip()]
        if i == 0 and overskrift:
            typer.append("hoved"); continue
        if not fyldte:
            typer.append("tom"); continue
        forste = str(r[fyldte[0]]).strip()
        if fyldte[0] <= 1 and forste.startswith("Σ"):
            typer.append("sum"); continue
        alle_fede = all(fed.get(_adresse(i, k)) for k in fyldte)
        versal = len(forste) > 3 and forste == forste.upper() and re.search(r"[A-ZÆØÅ]", forste)
        if len(fyldte) == 1 and fyldte[0] == 0 and art[i][0] == "t" and (fed.get(_adresse(i, 0)) or versal):
            typer.append("sektion"); continue
        efter_tom = i > 0 and not any(str(c).strip() for c in rows[i - 1])
        if len(fyldte) > 1 and alle_fede and efter_tom and all(art[i][k] == "t" for k in fyldte):
            typer.append("hoved"); continue
        typer.append("")
    return typer


def _regneark_tabel(block: dict) -> list:
    """Et regneark i PDF'en, sat op som et ingeniør-Excel-ark: ramme om
    tabellen, streg under overskriften, Σ-rækker med streg over, sektioner
    understreget, indtastede tal (inddata) i blåt og formler i sort."""
    t = regneark_som_tabel(block)["data"]
    rows = t["rows"]
    if not rows:
        return []
    d = block.get("data") or {}
    n = len(rows[0])
    celler = d.get("celler") or []
    art = [[_celle_art(celler[r][k] if r < len(celler) and k < len(celler[r]) else "") for k in range(n)]
           for r in range(len(rows))]
    fed0 = d.get("fed") or {}
    typer = _regneark_raekketyper(rows, fed0, art, t["has_header"])
    # Flere tomme rækker i træk (fx ubrugte lastområder) bliver til én.
    behold = [i for i in range(len(rows)) if not (typer[i] == "tom" and (i == 0 or typer[i - 1] == "tom"))]
    while behold and typer[behold[-1]] == "tom":
        behold.pop()
    rows, art, typer = [rows[i] for i in behold], [art[i] for i in behold], [typer[i] for i in behold]
    fed = {_adresse(ny, k): True for ny, i in enumerate(behold) for k in range(n) if fed0.get(_adresse(i, k))}

    font_pt = 8 if n <= 6 else 7 if n <= 9 else 6 if n <= 14 else 5
    MORK = rl_colors.HexColor("#1f2937")
    LYS = rl_colors.HexColor("#e5e5e5")
    BLAA = "#1d4ed8"
    TOTAL_MM = 170
    bredder = t.get("col_widths") or [100.0 / n] * n
    col_w = [(w / sum(bredder)) * TOTAL_MM * mm for w in bredder]

    def stil(navn, bold=False, hoejre=False, farve="#111111"):
        # Tal brydes ikke midt i ("6,2 | 5"); de står højrestillet på én linje.
        return ParagraphStyle(navn, fontSize=font_pt, leading=font_pt + 2.2,
                              fontName="Plex-SemiBold" if bold else "Plex",
                              textColor=rl_colors.HexColor(farve), alignment=2 if hoejre else 0,
                              splitLongWords=0 if hoejre else 1)

    # Tekst løber ud over tomme celler til højre, som i Excel (ingen lodrette
    # streger, så det ses ikke — men en lang note bliver ikke presset ned i en
    # smal kolonne).
    spans = []
    for i, r in enumerate(rows):
        for k, c in enumerate(r):
            if not str(c).strip() or _er_tal(c) or art[i][k] == "i":
                continue
            j = k
            while j + 1 < n and not str(r[j + 1]).strip():
                j += 1
            if j > k:
                spans.append((i, k, j))
    rl_rows = []
    for i, r in enumerate(rows):
        raek = []
        for k, c in enumerate(r):
            tekst = _pdf(c)
            tal = _er_tal(c)
            bold = typer[i] in ("hoved", "sektion", "sum") or bool(fed.get(_adresse(i, k)))
            farve = BLAA if art[i][k] == "i" and tal and typer[i] != "hoved" else (
                "#b91c1c" if str(c).startswith("#") else "#111111")
            if typer[i] == "sektion" and k == 0:
                tekst = f"<u>{tekst}</u>"
            raek.append(Paragraph(tekst, stil(f"rk{i}_{k}", bold, tal, farve)))
        rl_rows.append(raek)

    cmds = [
        ("BOX", (0, 0), (-1, -1), 1.1, MORK),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]
    for i, ty in enumerate(typer):
        if ty == "hoved":
            cmds += [("LINEBELOW", (0, i), (-1, i), 1.0, MORK), ("VALIGN", (0, i), (-1, i), "BOTTOM")]
        elif ty == "sum":
            cmds.append(("LINEABOVE", (0, i), (-1, i), 0.9, MORK))
        elif ty == "sektion":
            cmds.append(("TOPPADDING", (0, i), (-1, i), 5))
        elif ty == "tom":
            cmds += [("TOPPADDING", (0, i), (-1, i), 0), ("BOTTOMPADDING", (0, i), (-1, i), 0)]
        elif i + 1 < len(typer) and typer[i + 1] not in ("sum", "tom", "sektion", "hoved"):
            cmds.append(("LINEBELOW", (0, i), (-1, i), 0.3, LYS))
    cmds += [("SPAN", (k, i), (j, i)) for i, k, j in spans]
    tbl = Table(rl_rows, colWidths=col_w, repeatRows=1 if typer and typer[0] == "hoved" else 0,
                rowHeights=[(2.2 * mm if ty == "tom" else None) for ty in typer])
    tbl.setStyle(TableStyle(cmds))
    ud = []
    if t["caption"]:
        ud.append(Paragraph(_pdf(t["caption"]), ParagraphStyle(
            "rkCap", fontSize=8, fontName="Plex-Italic", textColor=rl_colors.HexColor("#555555"), leading=10, spaceAfter=2)))
    ud += [tbl, Spacer(1, 4 * mm)]
    return ud


def udfold_arkvisninger(blocks: list, bog) -> list:
    """Blokkene med hver ark_visning erstattet af arket fra projektets bog.

    En visning peger på et ark (id) i project["bog"] og evt. et område. Den
    bliver et regneark med de viste tekster for området, så den skrives ud
    som en tabel ligesom regnearkene. En visning af et slettet ark udelades.
    """
    ark = {a.get("id"): a for a in ((bog or {}).get("ark") or []) if isinstance(a, dict)}
    ud = []
    for b in blocks:
        if b.get("type") != "ark_visning":
            ud.append(b)
            continue
        d = b.get("data") or {}
        a = ark.get(d.get("ark"))
        if not a:
            continue
        vist = [list(r) for r in (a.get("_vist") or [])]
        celler = [list(r) for r in (a.get("celler") or [])]
        bredder = list(a.get("bredder") or [])
        fed = dict(a.get("fed") or {})
        overskrift = a.get("overskrift", True) is not False
        o = _laes_omraade(d.get("omraade"))
        if o:
            r0, k0, r1, k1 = o
            klip = lambda m: [[(m[r][k] if r < len(m) and k < len(m[r]) else "") for k in range(k0, k1 + 1)]
                              for r in range(r0, r1 + 1)]
            vist, celler = klip(vist), klip(celler)
            bredder = [(bredder[k] if k < len(bredder) and bredder[k] else (150 if k == 0 else 92)) for k in range(k0, k1 + 1)]
            fed = {_adresse(r - r0, k - k0): True for r in range(r0, r1 + 1) for k in range(k0, k1 + 1)
                   if fed.get(_adresse(r, k))}
            overskrift = overskrift and r0 == 0
        ud.append({**b, "type": "regneark", "data": {
            "titel": d.get("titel") or a.get("titel") or "", "overskrift": overskrift,
            "_vist": vist, "celler": celler, "bredder": bredder, "fed": fed,
        }})
    return ud


def _convert_block(block: dict, tmp_files: list) -> list:
    t = block.get("type", "")
    if t == "regneark":
        return _regneark_tabel(block)
    if t == "heading":
        return _heading(block)
    if t == "text":
        return _text(block)
    if t == "image":
        return _image(block, tmp_files)
    if t == "python_calc":
        return _python_calc(block, tmp_files)
    if t == "beam_fem":
        return _beam_fem_block(block, tmp_files)
    if t == "frame_fem":
        return _frame_fem_block(block, tmp_files)
    if t == "general_frame_fem":
        return _general_frame_fem_block(block, tmp_files)
    if t == "frame_load_cases":
        return _calc_block(block)   # _result already contains calc_core blocks
    if t == "portal_frame_fem":
        return _portal_frame_fem_block(block, tmp_files)
    if t == "control_plan":
        return _control_plan(block)
    if t == "table":
        return _table_block(block)
    # bolt_group and fillet_weld share the BoltConnectionBlock data shape
    # but are stored as distinct types — both render via _calc_block
    if t in _CALC_TYPES:
        return _calc_block(block)
    return []


# ── Main entry point ──────────────────────────────────────────────────────────

# Official document names (BR18 §§ 494-505 / DS 1140).  Used for the header's
# "Afsnit" field when a project predates per-document titles being stored.
from doc_defs import DOC_DEFS as DOC_TITLES


def _doclist_table(project: dict) -> dict:
    """
    Build the document list BR18 § 501 requires in B1, from the project itself.

    Every DS 1140 document is listed — including the ones that have not been
    issued yet, because "mangler" is exactly what the reader of a document list
    needs to see. Revision, date and signatures come from each document's own
    issue history, so the list cannot drift from what was actually handed over.
    """
    documents = project.get("documents") or {}
    rows = [['Dok.', 'Titel', 'Rev.', 'Dato', 'Udarbejdet af', 'Kontrolleret af']]

    for doc_id, default_title in DOC_TITLES.items():
        doc = documents.get(doc_id) or {}
        title = doc.get("title") or default_title
        revisions = doc.get("revisions") or []

        if revisions:
            last = revisions[-1]
            rows.append([
                doc_id, title,
                last.get("rev", ""), last.get("date", ""),
                last.get("by", ""), last.get("checked", ""),
            ])
            continue

        # Never issued — say whether there is anything in it yet at all
        has_content = bool(doc.get("blocks")) or any(
            sd.get("blocks") for sd in (doc.get("subdocs") or [])
        )
        rows.append([
            doc_id, title, '—',
            'Under udarbejdelse' if has_content else 'Ikke udarbejdet',
            '', '',
        ])

    return {
        "type": "table",
        "data": {
            "caption": "Dokumentliste — statisk dokumentation (BR18 § 501)",
            "has_header": True,
            "rows": rows,
            "col_widths": [8, 40, 8, 20, 12, 12],
        },
    }


def _forside_blokke(project: dict, doc_id: str = "") -> list:
    """
    Forsidens fire tabeller: sagen, certificeringen, revisionerne og
    dokumentstrukturen.

    Alt laeses af projektet. Det er hele pointen -- de samme oplysninger stod
    foer i loebende tekst i hvert dokument, tastet hver gang, og saa kunne et
    projekt staa med CC2 paa forsiden af A1 og CC3 paa forsiden af B1. Én
    kilde, fire tabeller.

    Revisionstabellen er dokumentets EGEN udstedelseshistorik, ikke en tom
    raekke at skrive i. En revisionsliste, der vedligeholdes i haanden, er
    forkert i samme oejeblik der udstedes noget.
    """
    meta = project.get("metadata") or {}
    documents = project.get("documents") or {}

    def _v(*noegler):
        """Foerste udfyldte af flere navne -- og en tydelig tom celle."""
        for k in noegler:
            v = (meta.get(k) or "").strip() if isinstance(meta.get(k), str)                 else meta.get(k)
            if v:
                return v
        return "—"

    ud = []

    # ── Sagsoplysninger ──────────────────────────────────────────────────
    ud.append({"type": "table", "data": {
        "caption": "Sagsoplysninger",
        "has_header": False,
        "col_widths": [26, 74],
        "rows": [
            ["Sag:",       _v("project_name")],
            ["Emne:",      _v("emne", "subject")],
            ["Adresse:",   _v("address")],
            ["Matrikel:",  _v("matrikel", "cadastre")],
            ["Sags. nr.:", _v("project_ref")],
            ["Fase:",      _v("fase", "phase")],
        ]}})

    # ── Certificeringsoplysninger ────────────────────────────────────────
    #
    # Konstruktions- og konsekvensklasse staar her, fordi de bestemmer hvem
    # der maa skrive under. De er de samme tal, som A1 indplacerer efter, og
    # de maa ikke kunne tastes forskelligt i to dokumenter.
    certificeret = _v("certificeret", "certified_statiker")
    kk = _v("konstruktionsklasse", "kk")
    if certificeret != "—" and kk != "—" and kk not in str(certificeret):
        certificeret = f"{certificeret}, Certificeret statiker {kk}"
    ud.append({"type": "table", "data": {
        "caption": "Certificeringsoplysninger",
        "has_header": False,
        "col_widths": [26, 74],
        "rows": [
            ["Certificeret:",         certificeret],
            ["Konstruktionsklasse:",  kk],
            ["Konsekvensklasse:",     _v("konsekvensklasse", "consequence_class", "cc")],
            ["Dato starterklæring:",  _v("dato_starterklaering", "start_declaration_date")],
        ]}})

    # ── Revisioner ───────────────────────────────────────────────────────
    doc = documents.get(doc_id) or {}
    revisioner = list(doc.get("revisions") or [])
    raekker = [["Rev. nr.", "Dato", "Revision"]]
    for r in revisioner:
        raekker.append([str(r.get("rev", "")), str(r.get("date", "")),
                        # Udstedelsen gemmer "description"; "desc" og "note"
                        # er ældre navne. Før blev kun de læst, så forsiden
                        # altid havde en tom revisionstekst.
                        str(r.get("description") or r.get("desc") or r.get("note") or "")])
    if not revisioner:
        # Ikke en tom tabel uden forklaring: der staar hvorfor den er tom.
        raekker.append(["—", "—", "Dokumentet er ikke udstedt endnu"])
    ud.append({"type": "table", "data": {
        "caption": "Revisioner",
        "has_header": True,
        "col_widths": [12, 20, 68],
        "rows": raekker,
    }})

    # ── Den statiske dokumentation ───────────────────────────────────────
    #
    # Hvilke dokumenter sagen bestaar af, og hvilket af dem man sidder med.
    # Uden den markering er listen den samme paa forsiden af alle otte, og saa
    # siger den ingenting om DET dokument, den staar i.
    dok_raekker = [["", "Dokument", "Status"]]
    for d_id, standardtitel in DOC_TITLES.items():
        d = documents.get(d_id) or {}
        titel = d.get("title") or standardtitel
        revs = d.get("revisions") or []
        har = bool(d.get("blocks")) or any(
            sd.get("blocks") for sd in (d.get("subdocs") or []))
        if revs:
            status = f"Rev. {revs[-1].get('rev', '')} · {revs[-1].get('date', '')}"
        elif har:
            status = "Under udarbejdelse"
        else:
            status = "Indgår ikke"
        dok_raekker.append([
            "▶" if d_id == doc_id else "",
            f"{d_id} {titel}",
            status,
        ])
    ud.append({"type": "table", "data": {
        "caption": "Den statiske dokumentation (BR18 §§ 494-505)",
        "has_header": True,
        "col_widths": [6, 60, 34],
        "rows": dok_raekker,
    }})

    # ── Underskrifter ────────────────────────────────────────────────────
    dato = _v("date")
    ud.append({"type": "table", "data": {
        "caption": "Underskrifter",
        "has_header": True,
        "col_widths": [33, 33, 34],
        "rows": [
            ["Udarbejdet", "Kontrolleret", "Godkendt"],
            [f"Dato: {dato}", f"Dato: {dato}", f"Dato: {dato}"],
            ["", "", ""],
            [_v("engineer"), _v("checker"), _v("approver")],
            [_v("engineer_title", "firm_name"),
             _v("checker_title", "firm_name"),
             _v("approver_title", "firm_name")],
        ]}})

    return ud


_ELEMENT_ART = {
    "bjaelke": "Bjælke", "spaer": "Spær", "hanebaand": "Hanebånd",
    "soejle": "Søjle", "vaeg": "Væg", "daek": "Dæk", "samling": "Samling",
    "fundament": "Fundament", "andet": "Element",
}
_ELEMENT_MATERIALE = {"trae": "træ", "staal": "stål", "beton": "beton",
                      "murvaerk": "murværk"}


def _ramme_linje(kilde: dict, femmer: dict, materiale: str) -> str:
    """
    Hvad rammeberegningen siger om den stang, et element er koblet til.

    Rammen eftervisner hver stang -- som soejle med knaeklaengden og N og M fra
    samme kombination, naar der er tryk -- men skrev det ingen steder i
    rapporten: kun kurverne og hovedresultaterne kom med. For en soejle uden
    egen beregningsblok var eftervisningen dermed usynlig for kontrollanten.
    """
    fem = femmer.get(kilde.get("fem_block_id"))
    member = kilde.get("member_id")
    stang = f"stang {member}" if member is not None else f"element {kilde.get('elem_id')}"
    if fem is None:
        return f"Koblet til {stang} i en rammeberegning, der ikke findes i dokumentet."
    titel = (fem.get("data") or {}).get("title") or "rammeberegningen"
    linje = f"Snitkræfter fra {titel}, {stang}."
    if member is None:
        return linje
    check = ((fem.get("data") or {}).get("_member_checks") or {}).get(str(member))         or ((fem.get("data") or {}).get("_member_checks") or {}).get(member)
    if not check:
        return linje + " Rammeberegningen er ikke kørt, så stangen er ikke eftervist i den."
    if check.get("skipped"):
        return linje + f" Rammeberegningen eftervisner ikke stangen: {check['skipped']}."
    eta = check.get("eta")
    if not isinstance(eta, (int, float)):
        return linje
    if check.get("mode") == "column":
        norm = "DS/EN 1995-1-1 §6.3" if materiale == "trae" else "DS/EN 1993-1-1 §6.3.3"
        dele = [f"η = {_dk(eta)}"]
        if check.get("combo"):
            dele.append(f"kombination {check['combo']}")
        if isinstance(check.get("N_Ed_kN"), (int, float)):
            dele.append(f"N_Ed = {_dk(check['N_Ed_kN'], 1)} kN")
        if isinstance(check.get("M_Ed_kNm"), (int, float)):
            dele.append(f"M_Ed = {_dk(check['M_Ed_kNm'], 1)} kNm")
        if isinstance(check.get("L_cr_m"), (int, float)):
            dele.append(f"L_cr = {_dk(check['L_cr_m'])} m")
        linje += f" Eftervist i rammeberegningen som søjle med tryk og bøjning ({norm}): " + ", ".join(dele) + "."
    else:
        linje += f" Eftervist i rammeberegningen for bøjning og forskydning: η = {_dk(eta)}."
    if isinstance(check.get("tension"), (int, float)):
        linje += f" Træk N = {_dk(check['tension'], 1)} kN er ikke med i den eftervisning."
    return linje


def _element_blocks(block: dict, femmer: dict = None) -> list:
    """
    Et konstruktionselement (A2.2) som overskrift og en linje om det.

    Overskriften baerer elementets eget nummer -- "B.1  Bjaelke over doer" --
    og nummereres ikke af _number_headings: B.1 er det nummer, tegningerne og
    kontrolplanen bruger, og et "3.2" foran ville vaere et andet navn for det
    samme element. Er elementet en stang i en rammeberegning, staar rammens
    eftervisning af stangen under.
    """
    d = block.get("data") or {}
    nr = str(d.get("nr") or "").strip()
    navn = str(d.get("navn") or "").strip() or _ELEMENT_ART.get(d.get("art"), "Element")
    ud = [{"type": "heading",
           "data": {"level": d.get("level") or 2,
                    "text": f"{nr}  {navn}" if nr else navn,
                    "nummereret": False}}]
    art = _ELEMENT_ART.get(d.get("art"), "")
    mat = _ELEMENT_MATERIALE.get(d.get("materiale"), "")
    linje = f"{art} i {mat}" if art and mat else (art or mat)
    beskrivelse = str(d.get("beskrivelse") or "").strip()
    if beskrivelse:
        linje = f"{linje}. {beskrivelse}" if linje else beskrivelse
    if linje:
        ud.append({"type": "text", "data": {"text": linje.rstrip(".") + "."}})
    if isinstance(d.get("kilde"), dict):
        ud.append({"type": "text", "data": {"text": _ramme_linje(d["kilde"], femmer or {}, d.get("materiale"))}})
    return ud


def _expand_generated_blocks(blocks: list, project: dict,
                             doc_id: str = "") -> list:
    """
    Replace blocks that are generated from the project rather than authored.

    `doclist` and `element`. These are expanded at render time, never stored,
    so what is printed is always the current state.
    """
    femmer = {b.get("id"): b for b in blocks if b.get("type") == "general_frame_fem"}
    out = []
    for block in blocks:
        if block.get("type") == "doclist":
            out.append(_doclist_table(project))
        elif block.get("type") == "element":
            out.extend(_element_blocks(block, femmer))
        elif block.get("type") == "projektforside":
            # Den staar automatisk i hvert dokument (se build_pdf). Ligger den
            # ogsaa som en blok i et dokument fra da den var det, udelades den
            # her -- ellers ville den staa to gange.
            continue
        else:
            out.append(block)
    return out


def _flatten_project(project: dict, doc_id: str = "") -> dict:
    """
    holst_layout.py expects a flat dict with keys like "project", "ref",
    "engineer", etc.  The v2 app stores all this inside project["metadata"]
    with slightly different names.  Map them here.

    doc_id is passed so the header can show e.g. "A2 – Statiske beregninger".

    Revisions are per document, not per project: A2 and B1 are separate
    deliverables and are revised independently, exactly like drawings.  Each
    document therefore carries its own history in
    project["documents"][doc_id]["revisions"].  Projects created before that
    existed fall back to the project-level metadata fields.
    """
    meta = project.get("metadata", {})
    doc  = (project.get("documents") or {}).get(doc_id) or {}

    doc_revisions = list(doc.get("revisions") or [])
    if doc_revisions:
        current = doc_revisions[-1]
        revision      = current.get("rev", "")
        revision_desc = current.get("description", "")
    else:
        # Never issued (or a pre-issue project) — fall back to the manual fields
        doc_revisions = list(meta.get("revisions") or [])
        revision      = meta.get("revision", "A")
        revision_desc = meta.get("revision_desc", "")

    # The header's "Afsnit" field names the document, not the project — the
    # project name is already on the line above it.
    section = doc.get("title") or DOC_TITLES.get(doc_id, "")

    # The date printed next to the signatures: the day the document was issued,
    # falling back to the manually entered project date.
    doc_date = ""
    if doc_revisions:
        doc_date = doc_revisions[-1].get("date", "")

    return {
        # Project info
        "project":       meta.get("project_name", ""),
        "ref":           meta.get("project_ref",  ""),
        # Cover: the project name is the headline, and the line under it says
        # *which* document this is — repeating the project name there told the
        # reader nothing.
        "title":         f"{doc_id}  –  {section}" if (doc_id and section) else section,
        "section":       section,                        # header "Afsnit" field
        "revision":      revision,
        "revision_desc": revision_desc,
        "client":        meta.get("client",       ""),
        "standard":      meta.get("standard",     ""),
        # Signatures
        "engineer":      meta.get("engineer",     ""),
        "checker":       meta.get("checker",      ""),
        "approver":      meta.get("approver",     ""),
        "date":          doc_date or meta.get("date", ""),
        # Firm contact info (footer)
        "firm":          meta.get("firm_name",    ""),
        "address":       meta.get("firm_address", ""),
        "phone":         meta.get("phone",        ""),
        "email":         meta.get("email",        ""),
        "cvr":           meta.get("cvr",          ""),
        # Document reference for header Afsnit field
        "doc_id":        doc_id,
        # Revision history list [{rev, date, description, by, checked}]
        "revisions":     doc_revisions,
        # Cover image and firm logo — populated by build_pdf() after decoding
        # the b64 blobs to temp files
        "cover_image_path": "",
        "logo_path":        "",
    }


# A heading that already opens with its own section number — "2.2.1 Konsekvens…"
# — must not be numbered again.  The A1 template carries SBi-anvisning 271's
# numbering, which is referenced from A2 and B1 and therefore cannot be
# renumbered by the renderer.
_ALREADY_NUMBERED = _re.compile(r'^\d+(\.\d+)*\.?\s')


def _number_headings(blocks: list) -> list:
    """
    Return a new block list where heading text is prefixed with section numbers.
    Level 1 → "1.  Title"
    Level 2 → "1.1  Title"
    Level 3 → "1.1.1  Title"

    Headings that already carry a section number are left untouched, and they
    stop the automatic counter from advancing — otherwise a document mixing the
    two styles would produce two competing numbering schemes.
    """
    result = []
    counters = [0, 0, 0]   # level-1, level-2, level-3

    for block in blocks:
        if block.get("type") == "heading":
            level = block["data"].get("level", 1)
            text  = block["data"].get("text", "")
            idx   = level - 1  # 0, 1, or 2

            # Et nyt underdokument (A2.1, A2.2 …) nummererer forfra.
            if block["data"].get("nulstil_numre"):
                counters = [0, 0, 0]

            if (block["data"].get("nummereret") is False
                    or _ALREADY_NUMBERED.match(text.strip())):
                result.append(block)
                continue

            if idx < 3:
                counters[idx] += 1
                # Reset sub-levels
                for j in range(idx + 1, 3):
                    counters[j] = 0

                num = ".".join(str(counters[k]) for k in range(idx + 1))
                new_text = f"{num}  {text}" if text else f"{num}"
                block = {**block, "data": {**block["data"], "text": new_text}}

        result.append(block)
    return result


def build_pdf(project: dict, blocks: list, doc_id: str = "") -> bytes:
    """
    Convert a list of v2 document blocks to a PDF and return the bytes.

    Parameters
    ----------
    project : dict
        The full project object (used for the cover page header).
    blocks : list
        The blocks array from project["documents"][doc_id]["blocks"].
    """
    tmp_files: list[str] = []   # temp image files to clean up afterwards
    blocks = udfold_arkvisninger(blocks, project.get("bog"))

    # holst_layout expects flat keys; v2 stores them nested under "metadata"
    flat_project = _flatten_project(project, doc_id=doc_id)

    # Decode cover image and firm logo (stored as base64 data URLs in metadata)
    meta = project.get("metadata") or {}
    for meta_key, flat_key in (
        ("cover_image_b64", "cover_image_path"),
        ("logo_b64",        "logo_path"),
    ):
        blob = meta.get(meta_key, "")
        if not blob:
            continue
        try:
            header, data = blob.split(",", 1)
            ext = "jpg" if ("jpeg" in header or "jpg" in header) else "png"
            tmp = tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False)
            tmp.write(base64.b64decode(data))
            tmp.close()
            tmp_files.append(tmp.name)
            flat_project[flat_key] = tmp.name
        except Exception:
            pass   # silently ignore — the page just won't have that image

    # Expand project-generated blocks (document list) before anything else, so
    # they are numbered and rendered like any other content.
    expanded_blocks = _expand_generated_blocks(blocks, project, doc_id)

    # Pre-number headings so the TOC and body both show "1.", "1.1." etc.
    numbered_blocks = nummerer_figurer(_number_headings(expanded_blocks))

    try:
        # Forside, sagsoplysninger, indholdsfortegnelse, indhold.
        #
        # Sagsoplysningerne, certificeringen, revisionerne, dokumentlisten og
        # underskrifterne staar i HVERT dokument, lige efter forsiden. DS 1140
        # kraever dem, og den, der laeser et enkelt afsnit, skal kunne se hvad
        # det hoerer til uden at have resten af sagen liggende.
        #
        # De staar der af sig selv og ikke som en blok, man tilfoejer. En blok
        # kan glemmes, og saa er det dokumentet uden oplysningerne, der bliver
        # udstedt -- og manglen ses ikke paa noget af det, der ER med.
        forside = _forside_blokke(project, doc_id)
        all_blocks = COVER(flat_project)
        for b in forside:
            all_blocks.extend(_convert_block(b, tmp_files))
        all_blocks += PAGEBREAK() + TOC()

        for block in numbered_blocks:
            try:
                converted = _convert_block(block, tmp_files)
                all_blocks.extend(converted)
            except Exception as exc:
                all_blocks.append(N(f"Error rendering block '{block.get('type')}': {exc}"))

        all_blocks += PAGEBREAK()

        # Write to a temp file, read back as bytes
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            out_path = tmp.name
        tmp_files.append(out_path)

        generate_pdf_holst(flat_project, all_blocks, out_path)

        with open(out_path, "rb") as f:
            return f.read()

    finally:
        # Always clean up temp files
        for path in tmp_files:
            try:
                os.unlink(path)
            except Exception:
                pass


# ── Simpel rapport (skrivebordsprogrammet) ────────────────────────────────────

def build_pdf_simpel(blocks: list, titel: str = "", bog: dict | None = None) -> bytes:
    """
    Rapporten fra skrivebordsprogrammet på blankt papir: ingen forside,
    ingen sagsoplysninger, ingen indholdsfortegnelse og intet tegningshoved
    -- kun indholdet, med overskriftsnumre og sidetal nederst.

    Blokkene tegnes af de samme funktioner som i build_pdf, så en beregning
    ser ens ud i begge.
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate
    from calc_core import build_story, make_styles

    tmp_files: list[str] = []
    numbered = nummerer_figurer(_number_headings(udfold_arkvisninger(list(blocks), bog)))
    try:
        indhold = []
        for block in numbered:
            try:
                indhold.extend(_convert_block(block, tmp_files))
            except Exception as exc:
                indhold.append(N(f"Fejl i blokken '{block.get('type')}': {exc}"))

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            out_path = tmp.name
        tmp_files.append(out_path)

        W, H = A4

        def sidefod(canv, doc):
            canv.saveState()
            canv.setFont("Plex", 8)
            canv.setFillColor(rl_colors.HexColor("#78716c"))
            if titel:
                canv.drawString(20 * mm, 10 * mm, titel)
            canv.drawRightString(W - 20 * mm, 10 * mm, f"Side {doc.page}")
            canv.restoreState()

        doc = SimpleDocTemplate(
            out_path, pagesize=A4,
            leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm, bottomMargin=20 * mm,
            title=titel or "Rapport",
        )
        doc.build(build_story(indhold, make_styles()), onFirstPage=sidefod, onLaterPages=sidefod)

        with open(out_path, "rb") as f:
            return f.read()
    finally:
        for path in tmp_files:
            try:
                os.unlink(path)
            except Exception:
                pass
