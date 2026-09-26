import base64, io
from PIL import Image
import pdf_builder, word_builder
from figurer import nummerer_figurer, figurtekst


def _png():
    buf = io.BytesIO(); Image.new("RGB", (40, 20), (200, 0, 0)).save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def test_figurer_nummereres_i_raekkefoelge_og_kan_slaas_fra():
    b = [{"type": "image", "data": {"image_b64": "x", "caption": "Plan"}},
         {"type": "image", "data": {"image_b64": None}},
         {"type": "image", "data": {"image_b64": "x", "numbered": False, "caption": "Foto"}},
         {"type": "image", "data": {"image_b64": "x"}}]
    nr = [x["data"].get("_figur_nr") for x in nummerer_figurer(b)]
    assert nr == [1, None, None, 2]
    assert figurtekst(1, "Plan") == "Figur 1: Plan"
    assert figurtekst(2, "") == "Figur 2"
    assert figurtekst(None, "Foto") == "Foto"


def test_pdf_og_word_skriver_figurnummer_og_justering():
    import pymupdf
    blocks = [{"id": "a", "type": "image",
               "data": {"image_b64": _png(), "caption": "Facade mod syd", "width_pct": 40, "align": "left"}}]
    pdf = pdf_builder.build_pdf({"metadata": {"project_name": "T"}}, blocks)
    text = "".join(p.get_text() for p in pymupdf.open(stream=pdf))
    assert "Figur 1: Facade mod syd" in text
    docx = word_builder.build_word({"metadata": {"project_name": "T"}}, blocks)
    from docx import Document
    doc = Document(io.BytesIO(docx))
    assert any(p.text == "Figur 1: Facade mod syd" for p in doc.paragraphs)
