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

    # Decode base64 data URL and write to a temp file
    # b64 is like "data:image/png;base64,iVBOR..."
    try:
        header, data = b64.split(",", 1)
        ext = "png"
        if "jpeg" in header or "jpg" in header:
            ext = "jpg"
        elif "svg" in header:
            ext = "svg"

        tmp = tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False)
        tmp.write(base64.b64decode(data))
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
