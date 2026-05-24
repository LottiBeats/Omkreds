"""
holst_layout.py — Structured header page template.

Provides a tabular header (logo + project-info grid), a bordered content box,
and a single-line footer — matching the layout style in the Tinvej 12 PDF.

Usage in a template file:
    from holst_layout import generate_pdf_holst

Extra PROJECT dict keys (all optional):
    "address"       : str  — firm street address
    "phone"         : str  — firm phone number
    "cvr"           : str  — CVR / company registration number
    "email"         : str  — firm e-mail address
    "section"       : str  — document section for the "Afsnit" cell
                             (falls back to project["title"])
    "approver"      : str  — approver name (falls back to project["checker"])
    "checker_date"  : str  — date checked   (falls back to project["date"])
    "approver_date" : str  — date approved  (falls back to project["date"])
"""

import copy
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame,
    PageBreak, NextPageTemplate, Spacer,
)
from reportlab.platypus.tableofcontents import TableOfContents

from calc_core import build_story, make_styles, _TocAnchor

_BASE_DIR        = Path(__file__).resolve().parent
LOGO_PATH        = str(_BASE_DIR / "Billede2.png")
_DEFAULT_LOGO_OK = Path(LOGO_PATH).exists()   # checked once at import time

# ─────────────────────────────────────────────────────────────
# LAYOUT CONSTANTS
# ─────────────────────────────────────────────────────────────

_PG_MARGIN  = 10 * mm   # left/right page margin
_HDR_OFFSET =  8 * mm   # distance from page top to top of header
_HDR_H      = 22 * mm   # total header height
_HDR_R1     =  7 * mm   # Sag row height
_HDR_R2     =  7 * mm   # Afsnit row height
_HDR_R3     =  8 * mm   # Engineer row height  (R1+R2+R3 = _HDR_H)
_LOGO_W     = 35 * mm   # logo column width
_GAP        =  3 * mm   # gap between header bottom and content box
_BOX_PAD    =  4 * mm   # padding inside content border box
_FOOT_LINE  = 11 * mm   # y-position of the thin separator above footer
_FOOT_Y     =  5 * mm   # y-position of footer text centre line


# ─────────────────────────────────────────────────────────────
# GEOMETRY HELPER
# ─────────────────────────────────────────────────────────────

def _geo(W, H):
    """Return a dict of all derived geometry values for page size W × H."""
    hdr_left  = _PG_MARGIN
    hdr_right = W - _PG_MARGIN
    hdr_w     = hdr_right - hdr_left
    hdr_top   = H - _HDR_OFFSET          # canvas y at top of header
    hdr_bot   = hdr_top - _HDR_H         # canvas y at bottom of header

    box_top   = hdr_bot - _GAP
    box_bot   = _FOOT_LINE + 1 * mm
    box_left  = _PG_MARGIN
    box_right = W - _PG_MARGIN
    box_w     = box_right - box_left
    box_h     = box_top - box_bot

    frm_left  = box_left  + _BOX_PAD
    frm_bot   = box_bot   + _BOX_PAD
    frm_w     = box_w     - 2 * _BOX_PAD
    frm_h     = box_h     - 2 * _BOX_PAD

    info_left = hdr_left + _LOGO_W
    info_w    = hdr_w    - _LOGO_W
    sagsnr_w  = 28 * mm
    sag_w     = info_w   - sagsnr_w
    side_w    = 28 * mm
    afsnit_w  = info_w   - side_w
    col3_w    = info_w   / 6

    return dict(
        hdr_left=hdr_left, hdr_right=hdr_right, hdr_w=hdr_w,
        hdr_top=hdr_top,   hdr_bot=hdr_bot,
        box_top=box_top,   box_bot=box_bot,
        box_left=box_left, box_right=box_right, box_w=box_w, box_h=box_h,
        frm_left=frm_left, frm_bot=frm_bot, frm_w=frm_w, frm_h=frm_h,
        info_left=info_left, info_w=info_w,
        sagsnr_w=sagsnr_w, sag_w=sag_w,
        side_w=side_w, afsnit_w=afsnit_w,
        col3_w=col3_w,
    )


# ─────────────────────────────────────────────────────────────
# CELL DRAWING HELPERS
# ─────────────────────────────────────────────────────────────

def _draw_logo_or_firm(canvas, project, hl, hb):
    """
    Draw the logo cell.  Priority:
      1. project['logo_path'] — custom logo uploaded by the firm
      2. LOGO_PATH             — default logo bundled with the app
      3. Text fallback          — firm name in bold if no image available
    """
    pad = 2 * mm
    draw_x = hl + pad
    draw_y = hb + pad
    draw_w = _LOGO_W - 2 * pad
    draw_h = _HDR_H - 2 * pad

    # Resolve logo path
    logo = project.get("logo_path", "")
    if not (logo and Path(logo).exists()):
        logo = LOGO_PATH if _DEFAULT_LOGO_OK else ""

    if logo:
        try:
            canvas.drawImage(
                logo, draw_x, draw_y,
                width=draw_w, height=draw_h,
                preserveAspectRatio=True, anchor="c", mask="auto",
            )
            return
        except Exception:
            pass   # fall through to text

    # Text fallback — firm name centred in the logo cell
    firm = project.get("firm", "")
    if firm:
        canvas.setFont("Helvetica-Bold", 7)
        canvas.setFillColor(colors.black)
        canvas.drawCentredString(hl + _LOGO_W / 2, hb + _HDR_H / 2 - 2.5, firm)


def _label(c, x, y, text):
    """Tiny field-name label pinned to the top-left corner of a header cell."""
    c.setFont("Helvetica", 5.5)
    c.setFillColor(colors.black)
    c.drawString(x + 1.2 * mm, y - 2.0 * mm, text)


def _value(c, cx, cy, cw, ch, text, size=7.5, centered=True, max_chars=None):
    """Value text placed in the lower portion of a header cell (below the label)."""
    if max_chars and len(text) > max_chars:
        text = text[:max_chars - 1] + "…"
    c.setFont("Helvetica", size)
    c.setFillColor(colors.black)
    # Reserve top 2.8 mm for the label; centre value in remaining space
    label_zone = 2.8 * mm
    remaining  = ch - label_zone
    ty = cy - label_zone - remaining / 2 - size * 0.18
    if centered:
        c.drawCentredString(cx + cw / 2, ty, text)
    else:
        c.drawString(cx + 1.5 * mm, ty, text)


# ─────────────────────────────────────────────────────────────
# PAGE DRAWING FUNCTIONS
# ─────────────────────────────────────────────────────────────

def _draw_header(canvas, doc, project, total_pages=None):
    """Draw the structured table header at the top of every page."""
    W, H = A4
    g = _geo(W, H)
    canvas.saveState()
    canvas.setStrokeColor(colors.black)
    canvas.setLineWidth(0.4)

    hl = g["hdr_left"]
    hr = g["hdr_right"]
    ht = g["hdr_top"]
    hb = g["hdr_bot"]
    il = g["info_left"]

    r1t = ht
    r2t = r1t - _HDR_R1
    r3t = r2t - _HDR_R2
    r3b = r3t - _HDR_R3   # == hb

    # Outer border and logo/info divider
    canvas.rect(hl, hb, g["hdr_w"], _HDR_H)
    canvas.line(il, ht, il, hb)

    # Row dividers
    canvas.line(il, r2t, hr, r2t)
    canvas.line(il, r3t, hr, r3t)

    # ── Row 1: Sag | [project] | Sagsnr | [ref] ──────────────
    sag_w    = g["sag_w"]
    sagsnr_w = g["sagsnr_w"]
    canvas.line(il + sag_w, r1t, il + sag_w, r2t)

    _label(canvas, il,           r1t, "Sag")
    _label(canvas, il + sag_w,   r1t, "Sagsnr")
    _value(canvas, il,           r1t, sag_w,    _HDR_R1, project.get("project", ""), size=8)
    _value(canvas, il + sag_w,   r1t, sagsnr_w, _HDR_R1, project.get("ref", ""))

    # ── Row 2: Afsnit | [section] | Side | [page] ────────────
    afsnit_w = g["afsnit_w"]
    side_w   = g["side_w"]
    canvas.line(il + afsnit_w, r2t, il + afsnit_w, r3t)

    _label(canvas, il,             r2t, "Afsnit")
    _label(canvas, il + afsnit_w,  r2t, "Side")
    # If a doc_id was injected (e.g. "A2"), prefix the section name
    doc_id  = project.get("doc_id", "")
    section = project.get("section", project.get("title", ""))
    section_str = f"{doc_id}  –  {section}" if doc_id and section else (doc_id or section)
    _value(canvas, il,             r2t, afsnit_w, _HDR_R2, section_str, size=7)
    page_str = f"{doc.page} af {total_pages}" if total_pages else str(doc.page)
    _value(canvas, il + afsnit_w,  r2t, side_w,   _HDR_R2, page_str)

    # ── Row 3: Beregnet af | Dato | Kontrolleret af | Dato | Godkendt af | Dato ──
    col3_w = g["col3_w"]
    lbls = ["Beregnet af", "Dato", "Kontrolleret af", "Dato", "Godkendt af", "Dato"]
    vals = [
        project.get("engineer", ""),
        project.get("date", ""),
        project.get("checker", ""),
        project.get("checker_date",  project.get("date", "")),
        project.get("approver",      project.get("checker", "")),
        project.get("approver_date", project.get("date", "")),
    ]
    for i, (lbl, val) in enumerate(zip(lbls, vals)):
        cx = il + i * col3_w
        if i > 0:
            canvas.line(cx, r3t, cx, r3b)
        _label(canvas, cx, r3t, lbl)
        _value(canvas, cx, r3t, col3_w, _HDR_R3, val, size=6.5, max_chars=12)

    # ── Logo (or firm name text if no logo) ───────────────────
    _draw_logo_or_firm(canvas, project, hl, hb)

    canvas.restoreState()


def _draw_content_border(canvas, doc):
    """Draw the thin rectangular border around the content area."""
    W, H = A4
    g = _geo(W, H)
    canvas.saveState()
    canvas.setStrokeColor(colors.black)
    canvas.setLineWidth(0.5)
    canvas.rect(g["box_left"], g["box_bot"], g["box_w"], g["box_h"])
    canvas.restoreState()


def _draw_footer(canvas, doc, project):
    """Draw the single-line footer with firm contact details."""
    W, H = A4
    canvas.saveState()
    canvas.setStrokeColor(colors.black)
    canvas.setLineWidth(0.3)
    canvas.line(_PG_MARGIN, _FOOT_LINE, W - _PG_MARGIN, _FOOT_LINE)

    parts = []
    for key, prefix in [
        ("firm",    ""),
        ("address", ""),
        ("phone",   "Tlf: "),
        ("cvr",     "Cvr: "),
        ("email",   "Mail: "),
    ]:
        val = project.get(key, "")
        if val:
            parts.append(f"{prefix}{val}")

    canvas.setFont("Helvetica", 6.5)
    canvas.setFillColor(colors.black)
    canvas.drawCentredString(W / 2, _FOOT_Y, "    ".join(parts))
    canvas.restoreState()


def _draw_content_page(canvas, doc, project, total_pages=None):
    """Combined draw callback for every content page."""
    _draw_header(canvas, doc, project, total_pages=total_pages)
    _draw_content_border(canvas, doc)
    _draw_footer(canvas, doc, project)


def _draw_revision_table(canvas, g, project):
    """
    Draw a professional revision history table at the bottom of the cover page.

    Reads project["revisions"] — a list of dicts with keys:
      rev, date, description, by, checked
    Falls back to displaying the current revision if the list is empty.
    """
    # Collect revision rows (newest last → displayed newest at top)
    revisions = list(project.get("revisions") or [])
    cur = {
        "rev":         project.get("revision", ""),
        "date":        project.get("date", ""),
        "description": project.get("revision_desc", ""),
        "by":          project.get("engineer", ""),
        "checked":     project.get("checker", ""),
    }
    # Only append current rev if not already listed
    cur_rev_str = cur["rev"]
    if cur_rev_str and not any(r.get("rev") == cur_rev_str for r in revisions):
        revisions.append(cur)

    MAX_ROWS = 4
    rows = revisions[-MAX_ROWS:]   # keep newest MAX_ROWS

    HDR_H  = 5.0 * mm
    ROW_H  = 6.5 * mm
    n      = len(rows)
    tbl_h  = HDR_H + n * ROW_H
    pad    = 5 * mm

    tbl_l = g["box_left"]  + pad
    tbl_r = g["box_right"] - pad
    tbl_w = tbl_r - tbl_l
    tbl_b = g["box_bot"]   + pad          # bottom of table
    tbl_t = tbl_b + tbl_h                 # top of table

    # Column definitions: [fraction of tbl_w]
    col_fracs  = [0.07, 0.14, 0.49, 0.15, 0.15]
    col_labels = ["Rev", "Dato", "Beskrivelse", "Udarbj.", "Kontr."]
    col_ws     = [f * tbl_w for f in col_fracs]

    canvas.saveState()
    canvas.setStrokeColor(colors.black)
    canvas.setLineWidth(0.4)

    # Outer border
    canvas.rect(tbl_l, tbl_b, tbl_w, tbl_h)

    # Header background
    canvas.setFillColor(colors.HexColor("#f0f0f0"))
    canvas.rect(tbl_l, tbl_b + n * ROW_H, tbl_w, HDR_H, fill=1, stroke=0)

    # Horizontal lines
    canvas.setFillColor(colors.black)
    canvas.setLineWidth(0.6)
    canvas.line(tbl_l, tbl_b + n * ROW_H, tbl_r, tbl_b + n * ROW_H)  # header separator
    canvas.setLineWidth(0.3)
    for i in range(1, n):
        y = tbl_b + i * ROW_H
        canvas.line(tbl_l, y, tbl_r, y)

    # Vertical column dividers
    x = tbl_l
    for w in col_ws[:-1]:
        x += w
        canvas.setLineWidth(0.4)
        canvas.line(x, tbl_b, x, tbl_t)

    # Header text
    canvas.setFont("Helvetica-Bold", 6)
    x = tbl_l
    for lbl, cw in zip(col_labels, col_ws):
        canvas.drawCentredString(x + cw / 2, tbl_b + n * ROW_H + HDR_H * 0.35, lbl)
        x += cw

    # Data rows — newest revision at top
    canvas.setFont("Helvetica", 6)
    for i, rev in enumerate(reversed(rows)):
        y_text = tbl_b + (n - i - 0.5) * ROW_H - 2
        x = tbl_l
        vals = [
            rev.get("rev", ""),
            rev.get("date", ""),
            rev.get("description", ""),
            rev.get("by", ""),
            rev.get("checked", ""),
        ]
        for j, (val, cw) in enumerate(zip(vals, col_ws)):
            text = str(val)
            # Truncate to fit column width (approx 5pt per char)
            max_ch = max(4, int(cw / (6 * 0.47)))
            if len(text) > max_ch:
                text = text[:max_ch - 1] + "…"
            canvas.drawCentredString(x + cw / 2, y_text, text)
            x += cw

    canvas.restoreState()
    return tbl_t   # return top-of-table y so title can avoid it


def _draw_cover_page(canvas, doc, project):
    """Cover page: header table + bordered box + large project title."""
    W, H = A4
    g = _geo(W, H)

    _draw_header(canvas, doc, project, total_pages=None)
    _draw_footer(canvas, doc, project)

    canvas.saveState()
    canvas.setStrokeColor(colors.black)
    canvas.setLineWidth(0.5)
    canvas.rect(g["box_left"], g["box_bot"], g["box_w"], g["box_h"])

    # ── Revision table at bottom of cover box (drawn first so we know its top) ──
    rev_tbl_top = _draw_revision_table(canvas, g, project)

    # ── Standard / ref line just above the revision table ────────────────────────
    ref_line_y = rev_tbl_top + 5 * mm
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#595F61"))
    canvas.drawCentredString(
        W / 2,
        ref_line_y,
        "  ·  ".join(filter(None, [
            project.get("ref", ""),
            f"Rev {project.get('revision', '')}" if project.get("revision") else "",
            project.get("standard", ""),
        ])),
    )

    # ── Cover image (fills the middle band of the box) ────────────────────────────
    img_path = project.get("cover_image_path")
    if img_path and Path(img_path).exists():
        # Vertical band: below the title area, above the ref / revision table
        img_area_top = g["box_top"] - 58 * mm   # below project name + title text
        img_area_bot = ref_line_y   + 8 * mm    # a little gap above ref line
        avail_h = img_area_top - img_area_bot

        if avail_h > 15 * mm:
            h_margin = 8 * mm
            img_x    = g["box_left"] + h_margin
            img_w    = g["box_w"]    - 2 * h_margin
            try:
                canvas.drawImage(
                    img_path,
                    img_x, img_area_bot,
                    width=img_w, height=avail_h,
                    preserveAspectRatio=True,
                    anchor='c',
                    mask='auto',
                )
            except Exception:
                pass   # silently skip if image can't be drawn

    # ── Large project name ────────────────────────────────────────────────────────
    canvas.setFillColor(colors.black)
    canvas.setFont("Helvetica-Bold", 24)
    canvas.drawCentredString(W / 2, g["box_top"] - 22 * mm, project.get("project", ""))

    # ── Report title — word-wrap at ~38 chars ─────────────────────────────────────
    canvas.setFont("Helvetica", 15)
    words = project.get("title", "").split()
    lines, line = [], ""
    for word in words:
        test = (line + " " + word).strip()
        if len(test) > 38 and line:
            lines.append(line)
            line = word
        else:
            line = test
    if line:
        lines.append(line)

    ty = g["box_top"] - 35 * mm
    for ln in lines:
        canvas.drawCentredString(W / 2, ty, ln)
        ty -= 20

    canvas.restoreState()


# ─────────────────────────────────────────────────────────────
# DOCUMENT TEMPLATE
# ─────────────────────────────────────────────────────────────

class HolstDocTemplate(BaseDocTemplate):
    """
    BaseDocTemplate with the Holst-style header table + bordered content
    box + single-line footer.  Supports TOC and two-pass "X af Y" page
    numbering.
    """

    def __init__(self, filename, project, **kwargs):
        self.project      = project
        self._total_pages = None
        BaseDocTemplate.__init__(self, filename, **kwargs)

        W, H = A4
        g    = _geo(W, H)

        cover_frame = Frame(
            g["frm_left"], g["frm_bot"], g["frm_w"], g["frm_h"],
            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
            id="cover_frame",
        )
        content_frame = Frame(
            g["frm_left"], g["frm_bot"], g["frm_w"], g["frm_h"],
            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
            id="content_frame",
        )

        self.addPageTemplates([
            PageTemplate(
                id="cover",
                frames=[cover_frame],
                onPage=lambda c, d: _draw_cover_page(c, d, self.project),
            ),
            PageTemplate(
                id="content",
                frames=[content_frame],
                onPage=lambda c, d: _draw_content_page(
                    c, d, self.project, total_pages=self._total_pages
                ),
            ),
        ])

    def multiBuild(self, story, filename=None, canvasmaker=None, maxPasses=10):
        """
        Multi-pass build.
        Pass 1 — collects TOC page numbers + total page count.
        Pass 2+ — renders final PDF with correct "X af Y" in header.
        """
        if canvasmaker is None:
            from reportlab.pdfgen import canvas as _rl_canvas
            canvasmaker = _rl_canvas.Canvas

        toc = getattr(self, "_toc", None)
        for i in range(maxPasses):
            if toc:
                toc.beforeBuild()
            self._toc_counter = 0
            self.build(copy.deepcopy(story), canvasmaker=canvasmaker)
            # Capture total pages after first pass so header can show "X af Y"
            if self._total_pages is None:
                self._total_pages = self.page
            if toc is None or toc.isSatisfied():
                break
        else:
            raise IndexError(f"TOC not resolved after {maxPasses} passes")

    def afterFlowable(self, flowable):
        """Register TOC anchors emitted by calc modules."""
        if isinstance(flowable, _TocAnchor):
            self._toc_counter = getattr(self, "_toc_counter", 0) + 1
            key = f"toc_{self._toc_counter}"
            self.canv.bookmarkPage(key)
            toc = getattr(self, "_toc", None)
            if toc is not None:
                toc.addEntry(flowable.level, flowable.text, self.page, key)


# ─────────────────────────────────────────────────────────────
# PUBLIC API
# ─────────────────────────────────────────────────────────────

def generate_pdf_holst(project, all_blocks, output_path="structural_report.pdf"):
    """Build a PDF using the Holst-style page layout."""
    W, H = A4
    g    = _geo(W, H)

    doc = HolstDocTemplate(
        output_path,
        project=project,
        pagesize=A4,
        leftMargin=g["frm_left"],
        rightMargin=W - g["frm_left"] - g["frm_w"],
        topMargin=H - g["frm_bot"] - g["frm_h"],
        bottomMargin=g["frm_bot"],
        title=project.get("title", ""),
        author=project.get("engineer", ""),
    )
    styles = make_styles()
    story  = build_story(all_blocks, styles)
    doc._toc = next((fl for fl in story if isinstance(fl, TableOfContents)), None)
    doc.multiBuild(story)
    print(f"PDF saved: {output_path}")
