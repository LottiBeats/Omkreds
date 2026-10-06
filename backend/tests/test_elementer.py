"""
test_elementer.py — konstruktionselementer (A2.2) i PDF og Word

Et element er en blok med nummer, navn, art og materiale. I rapporten bliver
det til en overskrift med elementets eget nummer -- "B.1  Bjaelke over doer"
-- og ikke et autonummer foran, for B.1 er det nummer, tegningerne og
kontrolplanen bruger.
"""
import io
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pdf_builder import _expand_generated_blocks, _number_headings, build_pdf  # noqa: E402

ELEMENT = {"type": "element", "data": {
    "nr": "B.1", "navn": "Bjælke over dør", "art": "bjaelke",
    "materiale": "trae", "beskrivelse": "Bærer etagedæk over ny åbning", "level": 2}}


def _tekst(blokke):
    return [b["data"].get("text") for b in blokke]


def test_et_element_bliver_til_overskrift_og_linje():
    ud = _expand_generated_blocks([ELEMENT], {})
    assert [b["type"] for b in ud] == ["heading", "text"]
    assert ud[0]["data"]["text"] == "B.1  Bjælke over dør"
    assert ud[0]["data"]["level"] == 2
    assert ud[1]["data"]["text"] == "Bjælke i træ. Bærer etagedæk over ny åbning."


def test_elementets_nummer_er_dets_eget():
    blokke = [
        {"type": "heading", "data": {"level": 1, "text": "Konstruktionsafsnit"}},
        ELEMENT,
        {"type": "heading", "data": {"level": 2, "text": "Robusthed"}},
    ]
    ud = _tekst(_number_headings(_expand_generated_blocks(blokke, {})))
    assert ud[0] == "1  Konstruktionsafsnit"
    assert ud[1] == "B.1  Bjælke over dør"        # ikke "1.1  B.1 …"
    # Elementet bruger ikke et afsnitsnummer, saa det naeste er stadig 1.1.
    assert ud[3] == "1.1  Robusthed"


def test_word_nummererer_som_pdfen():
    from word_builder import _number_headings as word
    blokke = [
        {"type": "heading", "data": {"level": 2, "text": "1. Lastgrundlag"}},
        {"type": "heading", "data": {"level": 2, "text": "Laster"}},
    ]
    # Foer: Word skrev "1.1  1. Lastgrundlag", fordi kopien ikke kendte reglen.
    assert _tekst(word(blokke)) == _tekst(_number_headings(blokke))


def test_et_element_uden_navn_faar_sin_art():
    ud = _expand_generated_blocks([{"type": "element", "data": {"nr": "S.2", "art": "soejle"}}], {})
    assert ud[0]["data"]["text"] == "S.2  Søjle"


def test_elementet_naar_ud_paa_siden():
    pdfium = pytest.importorskip("pypdfium2")
    project = {"id": "t", "metadata": {"project_name": "Elementtest"}, "documents": {}}
    pdf = build_pdf(project, [ELEMENT], doc_id="A2")
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
        fh.write(pdf)
        path = fh.name
    try:
        doc = pdfium.PdfDocument(path)
        tekst = "\n".join(p.get_textpage().get_text_range() for p in doc)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
    assert "B.1" in tekst and "Bjælke over dør" in tekst


# ── Elementer, der er stænger i en rammeberegning ────────────────────────────

def _ramme(checks):
    return {"id": 77, "type": "general_frame_fem",
            "data": {"title": "Portalramme", "_member_checks": checks}}


def _linjer(element, ramme):
    return _tekst(_expand_generated_blocks([ramme, element], {}))[1:]   # rammen selv er ikke et element


def test_en_soejle_i_rammen_faar_rammens_knaekeftervisning_i_rapporten():
    soejle = {"type": "element", "data": {
        "nr": "S.1", "navn": "Søjle", "art": "soejle", "materiale": "trae",
        "kilde": {"fem_block_id": 77, "member_id": 3, "elem_id": None}}}
    ramme = _ramme({"3": {"eta": 0.734, "mode": "column", "combo": "6.10b sne",
                          "N_Ed_kN": 42.15, "M_Ed_kNm": 3.2, "L_cr_m": 3.1}})
    linje = _linjer(soejle, ramme)[-1]
    assert "stang 3" in linje
    assert "søjle" in linje and "DS/EN 1995-1-1 §6.3" in linje
    assert "η = 0,73" in linje and "6.10b sne" in linje
    assert "N_Ed = 42,1 kN" in linje or "N_Ed = 42,2 kN" in linje
    assert "L_cr = 3,10 m" in linje


def test_en_stang_rammen_springer_over_siges_at_vaere_det():
    hb = {"type": "element", "data": {
        "nr": "HB.1", "art": "hanebaand", "materiale": "trae",
        "kilde": {"fem_block_id": 77, "member_id": 4, "elem_id": None}}}
    linje = _linjer(hb, _ramme({"4": {"skipped": "træk N = 3,1 kN — eftervises særskilt"}}))[-1]
    assert "eftervisner ikke stangen" in linje and "eftervises særskilt" in linje


def test_en_ramme_der_ikke_er_koert_eftervisner_intet():
    b = {"type": "element", "data": {"nr": "B.1", "art": "bjaelke", "materiale": "staal",
                                     "kilde": {"fem_block_id": 77, "member_id": 1, "elem_id": None}}}
    assert "ikke kørt" in _linjer(b, _ramme(None))[-1]
