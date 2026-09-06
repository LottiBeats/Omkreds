"""
test_pdf_block_coverage.py — hver bloktype skal kunne komme med i PDF'en

`roof_dead_load` stod i paletten, i A2-skabelonen og i editoren, men ikke i
pdf_builder._CALC_TYPES. Blokken blev derfor droppet lydløst i eksporten:
overskriften "2.1 Egenlast" stod i dokumentet, indholdet gjorde ikke. Ingen
fejl, intet i loggen — kun et tomt afsnit, som man skal kigge efter for at se.

Testen læser bloktyperne ud af frontendens egen liste, så den fanger den næste,
der bliver tilføjet uden en vej gennem eksporten.
"""
import io
import os
import re

import pytest

BLOCKLIST = os.path.join(os.path.dirname(__file__), "..", "..",
                         "frontend", "src", "components", "blocks", "BlockList.jsx")
PDF_BUILDER = os.path.join(os.path.dirname(__file__), "..", "pdf_builder.py")

# Bloktyper der med vilje ikke trykkes, med grunden.
IKKE_TRYKT = {
    "project_basis": "har intet _result — eksporterer kun partialkoefficienter "
                     "til andre blokke",
    "python_calc":   "admin-værktøj, ikke en del af dokumentet",
}


def _frontend_block_types():
    src = io.open(BLOCKLIST, encoding="utf-8").read()
    # Kun de yderste registreringer i BLOCK_TYPES, ikke 'udl' og lignende
    # inde i default-objekterne.
    return set(re.findall(r"^  \{ type: '([a-z_]+)'", src, re.M))


def _pdf_renderable():
    src = io.open(PDF_BUILDER, encoding="utf-8").read()
    blok = src[src.index("_CALC_TYPES = {"):src.index("def _convert_block")]
    calc = set(re.findall(r'"([a-z_]+)"', blok))
    eksplicit = set(re.findall(r't == "([a-z_]+)"', src))
    udvidet = set(re.findall(r'block.get\("type"\) == "([a-z_]+)"', src))
    return calc | eksplicit | udvidet


def test_the_frontend_list_can_be_read():
    typer = _frontend_block_types()
    assert len(typer) > 25, f"fandt kun {len(typer)} bloktyper — er regexen forældet?"
    assert "timber_beam" in typer and "roof_dead_load" in typer


def test_every_block_type_has_a_path_through_the_pdf():
    mangler = _frontend_block_types() - _pdf_renderable() - set(IKKE_TRYKT)
    assert not mangler, (
        "Disse bloktyper kan tilføjes i editoren, men forsvinder i eksporten:\n  "
        + "\n  ".join(sorted(mangler))
        + "\n\nTilføj dem til pdf_builder._CALC_TYPES, giv dem en egen "
          "renderer i _convert_block, eller skriv dem ind i IKKE_TRYKT her "
          "med grunden til at de ikke skal trykkes.")


def test_the_deliberate_exclusions_still_exist():
    """En undtagelse for en blok, der ikke findes mere, skjuler den næste fejl."""
    typer = _frontend_block_types()
    forældet = set(IKKE_TRYKT) - typer
    assert not forældet, f"IKKE_TRYKT nævner bloktyper der ikke findes: {forældet}"


@pytest.mark.parametrize("blok", ["roof_dead_load", "snow_load", "wind_load",
                                  "timber_beam", "timber_column", "steel_column",
                                  "load_combo", "custom_calc"])
def test_a_block_with_a_result_reaches_the_page(blok):
    """
    Ikke bare listet — den skal faktisk komme ud på papiret. En markørtekst
    lægges i blokkens _result og læses tilbage ud af den færdige PDF.
    """
    pdfium = pytest.importorskip("pypdfium2")
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from calc_core import S, T
    from pdf_builder import build_pdf
    import tempfile

    markoer = "XKONTROLXMARKOERX"
    project = {"id": "t", "metadata": {"project_name": "Daekningstest"}, "documents": {}}
    blocks = [{"type": blok, "data": {"title": "Test",
                                      "_result": [S("Afsnit"), T(markoer)]}}]
    pdf = build_pdf(project, blocks, doc_id="A2")

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

    assert markoer in tekst, f"{blok} naaede ikke ud paa siden"
