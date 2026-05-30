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

import base64
import os
import tempfile
from pathlib import Path

from calc_core import COVER, TOC, PAGEBREAK, S, T, N, H1, FIG
from holst_layout import generate_pdf_holst

from reportlab.lib.units import mm
from reportlab.lib import colors as rl_colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Table, TableStyle, Paragraph, Spacer
from reportlab.lib.enums import TA_LEFT, TA_CENTER


# ── Block converters ──────────────────────────────────────────────────────────

def _heading(block: dict) -> list:
    level = block["data"].get("level", 1)
    text  = block["data"].get("text", "")
    if level == 1:
        return H1(text)          # H1() already returns a list — don't wrap it again
    else:
        return [S(text)]


def _text(block: dict) -> list:
    text = block["data"].get("text", "").strip()
    if not text:
        return []
    return [T(text)]


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
            return [N("SVG images are not supported in PDF export. "
                      "Please convert to PNG or JPEG before uploading.")]

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

        caption   = block["data"].get("caption", "")
        width_pct = block["data"].get("width_pct", 100)
        width_mm  = max(40, min(170, int(170 * width_pct / 100)))

        return [FIG(tmp.name, caption, width_mm=width_mm)]
    except Exception as exc:
        return [N(f"Image could not be embedded: {exc}")]


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
        return [S(title), N("This block has not been run yet — open the editor and click 'Run check'.")]

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
        return [S(title), N("This block has not been run yet — open the editor and click 'Run'.")]

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

    hdr_sty  = ParagraphStyle("femHdr",  fontSize=font_pt, fontName="Helvetica-Bold",
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
                N("Block has not been run yet — open the editor and click 'Run analysis'.")]

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
    """Make a string safe for Helvetica-encoded PDF cells."""
    return str(s).translate(_PDF_CHAR_MAP)


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
                                 fontName="Helvetica-Bold", leading=font_pt + 2)
    cell_style = ParagraphStyle("tblCell", fontSize=font_pt,
                                 textColor=BLACK, leading=font_pt + 2)
    cap_style  = ParagraphStyle("tblCap",  fontSize=8, fontName="Helvetica-Oblique",
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

    hdr_style = ParagraphStyle("cpHdr",  fontSize=8,  textColor=WHITE, fontName="Helvetica-Bold",   leading=10, spaceAfter=0)
    cell_style= ParagraphStyle("cpCell", fontSize=8,  textColor=rl_colors.HexColor("#1e293b"),       leading=10, spaceAfter=0)
    mono_style= ParagraphStyle("cpMono", fontSize=7,  textColor=rl_colors.HexColor("#475569"),       leading=9,  spaceAfter=0, fontName="Courier")

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
        ("FONTNAME",    (0, 0), (-1, 0),           "Helvetica-Bold"),
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
                                leading=9, fontName="Helvetica-Oblique")
    result.append(Paragraph(f"Kontroltype: {ctrl_legend}", legend_st))
    result.append(Spacer(1, 2*mm))

    return result


# ── General / Portal Frame FEM blocks ────────────────────────────────────────

def _figs_b64_to_pdf(figs_b64: list, tmp_files: list, captions: list) -> list:
    """Decode a list of base64 PNGs and return FIG() blocks."""
    out = []
    for i, b64 in enumerate(figs_b64):
        try:
            tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
            tmp.write(base64.b64decode(b64))
            tmp.close()
            tmp_files.append(tmp.name)
            caption = captions[i] if i < len(captions) else ""
            out.append(FIG(tmp.name, caption, width_mm=160))
        except Exception as exc:
            out.append(N(f"Could not embed figure: {exc}"))
    return out


def _general_frame_fem_block(block: dict, tmp_files: list) -> list:
    from calc_core import MH, S, T, TBL, N, FIG, H1
    d       = block["data"]
    title   = d.get("title", "2D Frame FEM")
    summary = d.get("_summary")
    figs    = d.get("_figs_b64", [])

    out = [MH(title, "2D Frame FEM — OpenSeesPy", "general")]

    if not summary:
        out.append(N("Block has not been run yet — open the editor and click ▶ Run FEM."))
        return out

    # ── Figures ──────────────────────────────────────────────────────────────
    out += _figs_b64_to_pdf(
        figs, tmp_files,
        ["Deflected shape", "Bending moment diagram", "Shear force diagram", "Axial force diagram"],
    )

    # ── Headline results ─────────────────────────────────────────────────────
    out.append(S("Key results"))
    out.append(TBL(
        ["Result", "Value", "Location"],
        [
            ["Max horizontal displacement δ_x",
             f"{summary['max_ux_mm']:.2f} mm", f"Node {summary['max_ux_node']}"],
            ["Max vertical displacement δ_y",
             f"{summary['max_uy_mm']:.2f} mm", f"Node {summary['max_uy_node']}"],
            ["Max bending moment M",
             f"{summary['max_moment_kNm']:.2f} kNm",
             f"Element {summary['max_moment_ele']}"],
        ],
    ))

    # ── Applied loads ─────────────────────────────────────────────────────────
    loads_table = summary.get("loads_table", [])
    if loads_table:
        out.append(S("Applied loads"))
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
        out.append(S("Element cross-section forces"))
        out.append(T(
            "Forces in local element axes. "
            "End i = start node, end j = end node. "
            "N: axial (+ tension)  V: shear  M: bending moment."
        ))
        out.append(TBL(
            ["Elem", "Type", "L (m)", "A (cm²)", "Iz (cm⁴)",
             "N_i (kN)", "V_i (kN)", "M_i (kNm)",
             "N_j (kN)", "V_j (kN)", "M_j (kNm)"],
            [
                [
                    str(e["id"]), e["type"], f"{e['L_m']:.2f}",
                    str(e["A_cm2"]),
                    str(e["Iz_cm4"]) if e["type"] == "beam" else "—",
                    f"{e['N_i_kN']:.2f}", f"{e['V_i_kN']:.2f}", f"{e['M_i_kNm']:.2f}",
                    f"{e['N_j_kN']:.2f}", f"{e['V_j_kN']:.2f}", f"{e['M_j_kNm']:.2f}",
                ]
                for e in ele_table
            ],
        ))

    # ── Node displacements ────────────────────────────────────────────────────
    node_table = summary.get("node_disp_table", [])
    if node_table:
        out.append(S("Nodal displacements"))
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
        out.append(S("Support reactions"))
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
        out.append(N("Block has not been run yet — open the editor and click ▶ Run FEM."))
        return out

    out += _figs_b64_to_pdf(
        figs, tmp_files,
        ["Deflected shape", "Bending moment diagram", "Shear force diagram", "Axial force diagram"],
    )

    out.append(S("Key results"))
    out.append(TBL(
        ["Result", "Value", "Location"],
        [
            ["Max lateral displacement δ_x",
             f"{summary['max_lateral_disp_mm']:.2f} mm",
             f"Node {summary['max_lateral_disp_node']}"],
            ["Max vertical displacement δ_y",
             f"{summary['max_vertical_disp_mm']:.2f} mm",
             f"Node {summary['max_vertical_disp_node']}"],
            ["Max bending moment M",
             f"{summary['max_moment_kNm']:.2f} kNm",
             f"Element {summary['max_moment_ele']}"],
        ],
    ))

    reactions = summary.get("reactions", {})
    if reactions:
        out.append(S("Support reactions"))
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
    "wind_load", "snow_load",
    "foundation",
    "load_combo",
    "bolt_group", "fillet_weld",
    "plate_girder",
    "saved_calc",
}


def _convert_block(block: dict, tmp_files: list) -> list:
    t = block.get("type", "")
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

def _flatten_project(project: dict, doc_id: str = "") -> dict:
    """
    holst_layout.py expects a flat dict with keys like "project", "ref",
    "engineer", etc.  The v2 app stores all this inside project["metadata"]
    with slightly different names.  Map them here.

    doc_id is passed so the header can show e.g. "A2 – Statiske beregninger".
    """
    meta = project.get("metadata", {})
    return {
        # Project info
        "project":       meta.get("project_name", ""),
        "ref":           meta.get("project_ref",  ""),
        "title":         meta.get("project_name", ""),   # cover page title
        "revision":      meta.get("revision",     "A"),
        "revision_desc": meta.get("revision_desc",""),
        "client":        meta.get("client",       ""),
        "standard":      meta.get("standard",     ""),
        # Signatures
        "engineer":      meta.get("engineer",     ""),
        "checker":       meta.get("checker",      ""),
        "approver":      meta.get("approver",     ""),
        "date":          meta.get("date",         ""),
        # Firm contact info (footer)
        "firm":          meta.get("firm_name",    ""),
        "address":       meta.get("firm_address", ""),
        "phone":         meta.get("phone",        ""),
        "email":         meta.get("email",        ""),
        "cvr":           meta.get("cvr",          ""),
        # Document reference for header Afsnit field
        "doc_id":        doc_id,
        # Revision history list [{rev, date, description, by, checked}]
        "revisions":     meta.get("revisions",    []),
        # Cover image — populated by build_pdf() after decoding the b64 blob
        "cover_image_path": "",
    }


def _number_headings(blocks: list) -> list:
    """
    Return a new block list where heading text is prefixed with section numbers.
    Level 1 → "1.  Title"
    Level 2 → "1.1  Title"
    Level 3 → "1.1.1  Title"
    """
    result = []
    counters = [0, 0, 0]   # level-1, level-2, level-3

    for block in blocks:
        if block.get("type") == "heading":
            level = block["data"].get("level", 1)
            text  = block["data"].get("text", "")
            idx   = level - 1  # 0, 1, or 2

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

    # holst_layout expects flat keys; v2 stores them nested under "metadata"
    flat_project = _flatten_project(project, doc_id=doc_id)

    # Decode cover image (stored as base64 data URL in project metadata)
    cover_b64 = (project.get("metadata") or {}).get("cover_image_b64", "")
    if cover_b64:
        try:
            header, data = cover_b64.split(",", 1)
            ext = "jpg" if ("jpeg" in header or "jpg" in header) else "png"
            tmp = tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False)
            tmp.write(base64.b64decode(data))
            tmp.close()
            tmp_files.append(tmp.name)
            flat_project["cover_image_path"] = tmp.name
        except Exception:
            pass   # silently ignore — cover page just won't have an image

    # Pre-number headings so the TOC and body both show "1.", "1.1." etc.
    numbered_blocks = _number_headings(blocks)

    try:
        # Build the full list of calc_core blocks
        all_blocks = COVER(flat_project) + TOC()

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
