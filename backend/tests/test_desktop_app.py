"""
test_desktop_app.py — det selvstændige FEM-program (desktop_app.py)

Programmet er main.app monteret under /api plus den byggede frontend. Testen
kører mod main.app direkte, så den ikke kræver en bygget frontend.
"""
import pytest

pytest.importorskip("pypdfium2")


def test_pdf_af_model_uden_projekt(client):
    import desktop_app  # registrerer /desktop/pdf på main.app  # noqa: F401
    from calc_core import S, T
    r = client.post("/desktop/pdf", json={
        "metadata": {"project_name": "Testhal", "project_ref": "T-1"},
        "blocks": [
            {"type": "heading", "data": {"level": 1, "text": "Rammeberegning"}},
            {"type": "steel_column", "data": {"title": "Søjle", "_result": [S("Afsnit"), T("MARKOER")]}},
        ],
    })
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    import pypdfium2 as pdfium
    doc = pdfium.PdfDocument(r.content)
    tekst = "\n".join(p.get_textpage().get_text_range() for p in doc)
    assert "Testhal" in tekst and "MARKOER" in tekst


def test_lokal_bruger_uden_login():
    import desktop_app
    from auth import get_current_user
    assert desktop_app.main.app.dependency_overrides[get_current_user]()["id"] == "lokal"
