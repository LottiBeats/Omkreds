"""
test_pdf_page_count.py — the "Side X af Y" header

The total is only knowable after a pass has been rendered, and it moves between
passes: filling in the table of contents can push the document onto another
page. Taking it from the first pass produced headers reading "Side 14 af 13" on
a real export.
"""
import sys, os

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from pdf_builder import build_pdf


def _project(name="Testprojekt"):
    return {
        "id": "test",
        "metadata": {"project_name": name, "project_ref": "123", "revision": "A"},
        "documents": {},
    }


def _blocks(n_sections):
    """Enough headings that the table of contents outgrows a single page."""
    out = []
    for i in range(n_sections):
        out.append({"type": "heading", "data": {"level": 2, "text": f"Afsnit {i + 1}"}})
        out.append({"type": "text", "data": {"text": "Tekst " * 40}})
    return out


@pytest.mark.parametrize("n_sections", [2, 30, 60])
def test_header_total_matches_the_real_page_count(n_sections):
    """
    The document is rendered, then reopened and counted. Whatever the header
    claims has to be what the reader can count.
    """
    pdfium = pytest.importorskip("pypdfium2")

    pdf = build_pdf(_project(), _blocks(n_sections), doc_id="A2")
    assert pdf[:4] == b"%PDF"

    doc = pdfium.PdfDocument(pdf)
    real_pages = len(doc)

    # The cover carries no "af" — every other page must name the true total.
    claimed = set()
    for i in range(1, real_pages):
        text = doc[i].get_textpage().get_text_range()
        # The header reads "<page> af <total>"; pull the total out of it
        if " af " in text:
            after = text.split(" af ", 1)[1].strip().split()
            if after and after[0].isdigit():
                claimed.add(int(after[0]))

    assert claimed, "no page carried a 'X af Y' header"
    assert claimed == {real_pages}, (
        f"header claims {sorted(claimed)} pages, document has {real_pages}")
