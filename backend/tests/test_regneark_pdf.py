"""Regnearket (RegnearkBlock) i PDF og Word: de viste tal, som på skærmen."""
import pytest

from pdf_builder import regneark_som_tabel

BLOK = {"type": "regneark", "data": {
    "navn": "Vægskive", "titel": "Væltning", "overskrift": True,
    "celler": [["Last", "W", "R"], ["W1", "46,75", "=-B2*4,71/8,2"], ["", "", ""]],
    "_vist": [["Last", "W", "R"], ["W1", "46,75", "-26,85"], ["", "", ""]],
    "bredder": [150, 92, 92],
}}


def test_som_tabel_bruger_de_viste_tal_og_fjerner_tomme_raekker():
    t = regneark_som_tabel(BLOK)["data"]
    assert t["rows"] == [["Last", "W", "R"], ["W1", "46,75", "-26,85"]]
    assert t["caption"] == "Væltning" and t["has_header"] is True
    assert abs(sum(t["col_widths"]) - 100) < 1e-9


def test_pdf_med_regneark():
    pdfium = pytest.importorskip("pypdfium2")
    from pdf_builder import build_pdf_simpel
    pdf = build_pdf_simpel([BLOK])
    tekst = "\n".join(p.get_textpage().get_text_range() for p in pdfium.PdfDocument(pdf))
    assert "-26,85" in tekst and "Væltning" in tekst
    assert "=-B2" not in tekst, "formlen må ikke stå i rapporten, kun værdien"


def test_word_med_regneark():
    pytest.importorskip("docx")
    from word_builder import build_word
    docx = build_word({"id": "x", "metadata": {}, "documents": {}}, [BLOK], doc_id="A2")
    import io, docx as d
    tekst = "\n".join(c.text for t in d.Document(io.BytesIO(docx)).tables for r in t.rows for c in r.cells)
    assert "-26,85" in tekst
