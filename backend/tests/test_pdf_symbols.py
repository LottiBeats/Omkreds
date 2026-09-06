"""
test_pdf_symbols.py — Greek letters and maths symbols in the PDF

Helvetica has no glyph for γ, σ, τ or ≤, and it does not complain: it drops
them. So the exported PDF read "= k_mod·f_m,k / M" for a formula that says
gamma_M, and the bending check compared "m,d" against "f_m,d". Every partial
factor, stress and slenderness in a Eurocode document was affected, and
nothing in the app said so — the failure is only visible by looking at the
output.

The obvious fix, the base-14 Symbol font, fails the same way in a different
place: pdfium (Chrome's PDF viewer) renders it as blank space. Hence a real
Unicode face, and hence these tests, which read the text back out of a
rendered PDF rather than trusting the markup.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import calc_core
from calc_core import CALC_ROW, S, T, _fmt
from pdf_builder import build_pdf


def _text_of(pdf_bytes) -> str:
    pdfium = pytest.importorskip("pypdfium2")
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
        fh.write(pdf_bytes)
        path = fh.name
    try:
        doc = pdfium.PdfDocument(path)
        return "\n".join(page.get_textpage().get_text_range() for page in doc)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


# ── The markup ───────────────────────────────────────────────────────────────

def test_the_unicode_font_is_available():
    """
    Not a hard requirement of the code — there is a spelled-out fallback — but
    if this ever fails, every document silently changes appearance, so it
    should fail here first.
    """
    assert calc_core._GREEK_FONT, "no Unicode font registered for Greek"


def test_greek_is_wrapped_not_dropped():
    out = _fmt("γ_M")
    assert "γ" in out
    assert "<font" in out


def test_maths_symbols_are_wrapped():
    assert "≤" in _fmt("α ≤ 30°")


def test_subscripts_still_work_around_greek():
    """The font run must not swallow the subscript rule that follows it."""
    assert "<sub>M</sub>" in _fmt("γ_M")
    assert "<sub>rel</sub>" in _fmt("λ_rel,m")


# ── What actually lands on the page ──────────────────────────────────────────

def _project():
    return {"id": "t", "metadata": {"project_name": "Symboltest"}, "documents": {}}


@pytest.mark.parametrize("symbol", ["γ", "σ", "τ", "λ", "μ", "α", "Δ", "≤"])
def test_symbol_survives_into_the_pdf(symbol):
    blocks = [{
        "type": "timber_beam",
        "data": {"title": "T", "_result": [
            S("Afsnit"),
            T(f"Prosa med {symbol} i."),
            CALC_ROW(f"{symbol}_M", f"= k_mod / {symbol}_M", "1.30"),
        ]},
    }]
    text = _text_of(build_pdf(_project(), blocks, doc_id="A2"))
    assert symbol in text, f"{symbol!r} did not reach the rendered page"


def test_section_heading_keeps_its_symbol():
    """
    Headings are upper-cased. Doing that after the markup was inserted turned
    <font name="OmkredsGreek"> into <font name="OMKREDSGREEK"> — a font that
    was never registered.
    """
    blocks = [{
        "type": "timber_beam",
        "data": {"title": "T", "_result": [S("Kipning σ_m,crit"), T("x")]},
    }]
    text = _text_of(build_pdf(_project(), blocks, doc_id="A2"))
    assert "Σ" in text or "σ" in text, "the heading lost its sigma"
