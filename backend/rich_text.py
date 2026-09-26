"""
rich_text.py — the little formatting a text block can carry.

The editor's text block is Word-like (bold, italic, bullet and numbered
lists), but it still stores plain text in `data.text`, so every existing
document, template and API caller keeps working:

    **fed**        bold
    *kursiv*       italic
    ***begge***    bold italic
    • punkt        bullet line      (already how the templates write lists)
    1. punkt       numbered line

Lists need nothing here: they are ordinary lines and print as before. Only the
inline markers are translated, for ReportLab (tags) and python-docx (runs).

The single-star rule is strict on purpose. "1,35*G_k*1,5" is arithmetic, not
italics: an opening star must follow the start of the text or a space/bracket
and be followed by a non-space, and a closing star must be preceded by a
non-space and not followed by a letter or digit.
"""
from __future__ import annotations

import re

# One match per marked span. Order matters: *** before ** before *.
_INLINE = re.compile(
    r"\*\*\*(?=\S)(?P<bi>[^*\n]+?)(?<=\S)\*\*\*"
    r"|\*\*(?=\S)(?P<b>[^*\n]+?)(?<=\S)\*\*"
    r"|(?:(?<=^)|(?<=[\s(\[„\"']))\*(?=\S)(?P<i>[^*\n]+?)(?<=\S)\*(?![\w*])",
    re.MULTILINE,
)


def split_runs(text: str) -> list[tuple[str, bool, bool]]:
    """Split text into (segment, bold, italic) runs."""
    runs: list[tuple[str, bool, bool]] = []
    pos = 0
    for m in _INLINE.finditer(text):
        if m.start() > pos:
            runs.append((text[pos:m.start()], False, False))
        if m.group("bi") is not None:
            runs.append((m.group("bi"), True, True))
        elif m.group("b") is not None:
            runs.append((m.group("b"), True, False))
        else:
            runs.append((m.group("i"), False, True))
        pos = m.end()
    if pos < len(text):
        runs.append((text[pos:], False, False))
    return runs


def has_markup(text: str) -> bool:
    return bool(_INLINE.search(text or ""))


def to_reportlab(text: str) -> str:
    """Replace the inline markers with ReportLab <b>/<i> tags.

    Runs before the paragraph formatter (calc_core._para_fmt), which leaves
    tags alone and converts newlines to <br/>. Text without markers is
    returned unchanged, so existing documents print exactly as before.
    """
    if not has_markup(text):
        return text
    out = []
    for seg, bold, italic in split_runs(text):
        if bold and italic:
            out.append(f"<b><i>{seg}</i></b>")
        elif bold:
            out.append(f"<b>{seg}</b>")
        elif italic:
            out.append(f"<i>{seg}</i>")
        else:
            out.append(seg)
    return "".join(out)


def add_docx_runs(paragraph, text: str) -> None:
    """Append text to a python-docx paragraph as bold/italic runs."""
    for seg, bold, italic in split_runs(text):
        run = paragraph.add_run(seg)
        if bold:
            run.bold = True
        if italic:
            run.italic = True
