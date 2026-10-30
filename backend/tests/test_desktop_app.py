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
    # Blankt papir: ingen A2-forside, indholdsfortegnelse eller tegningshoved.
    assert len(doc) == 1
    assert "Statiske beregninger" not in tekst and "Indholdsfortegnelse" not in tekst
    assert "Kontrolleret af" not in tekst
    assert "1 Rammeberegning" in tekst or "1  Rammeberegning" in tekst


def test_lokal_bruger_uden_login():
    import desktop_app
    from auth import get_current_user
    assert desktop_app.main.app.dependency_overrides[get_current_user]()["id"] == "lokal"


def test_pdf_med_egenvaegt_og_sne(client):
    """Rapportens små moduler kommer med i PDF'en (pdf_builder._CALC_TYPES)."""
    import desktop_app  # noqa: F401
    r = client.post("/desktop/pdf", json={"blocks": [
        {"type": "rapport_egenvaegt", "data": {"title": "Egenvægt tag", "_result": [
            {"type": "section", "content": "Egenvægt tag"},
            {"type": "table", "headers": ["Lag", "t [mm]", "γ [kN/m³]", "g [kN/m²]"],
             "rows": [["Gipsplade", "13", "9,0", "0,117"], ["Sum", "", "", "0,12"]]},
            {"type": "calc_row", "name": "g_k", "formula": "Σ t · γ", "result": "0,12 kN/m²", "label": "Karakteristisk egenlast"},
        ]}},
        {"type": "rapport_sne", "data": {"title": "Snelast", "_result": [
            {"type": "section", "content": "Snelast"},
            {"type": "calc_row", "name": "s", "formula": "μ_1 · C_e · C_t · s_k", "result": "0,80 kN/m²", "label": "Snelast på taget"},
        ]}},
    ]})
    assert r.status_code == 200, r.text
    import pypdfium2 as pdfium
    tekst = "\n".join(p.get_textpage().get_text_range() for p in pdfium.PdfDocument(r.content))
    assert "Gipsplade" in tekst and "0,80 kN/m" in tekst and "EGENVÆGT TAG" in tekst.upper()


def test_underdokumenter_nummereres_forfra():
    """"A2.1 Laster" får ikke selv et nummer, og hvert underdokument starter ved 1."""
    from main import _underdok_overskrift
    from pdf_builder import _number_headings
    bl = [
        {"type": "heading", "data": _underdok_overskrift("A2.1  Laster")},
        {"type": "heading", "data": {"level": 1, "text": "Grundlag"}},
        {"type": "heading", "data": {"level": 1, "text": "Egenlast"}},
        {"type": "heading", "data": _underdok_overskrift("A2.2  Tag")},
        {"type": "heading", "data": {"level": 1, "text": "Spær"}},
    ]
    tekster = [b["data"]["text"] for b in _number_headings(bl)]
    assert tekster == ["A2.1  Laster", "1  Grundlag", "2  Egenlast", "A2.2  Tag", "1  Spær"]


def test_hele_omkreds_vaelges_med_app_flaget():
    import desktop_app
    assert desktop_app._hvilken_app(["--app", "omkreds", "--port", "1"]) == "omkreds"
    assert desktop_app._hvilken_app(["--app=omkreds"]) == "omkreds"
    assert desktop_app._hvilken_app(["--port", "1"]) == "fem"


def test_datamappe_kan_flyttes(monkeypatch, tmp_path):
    import desktop_app
    monkeypatch.setenv("OMKREDS_DATA", str(tmp_path / "data"))
    assert desktop_app.datamappe() == tmp_path / "data"
    monkeypatch.delenv("OMKREDS_DATA")
    assert desktop_app.datamappe().name == "Omkreds"


def test_appens_adresser_giver_index_html(monkeypatch, tmp_path):
    """/projects/ab12cd34/A2 er appens egen adresse: genindlæses den, skal
    serveren svare med index.html -- men en manglende fil er stadig 404."""
    import desktop_app
    from fastapi.testclient import TestClient
    (tmp_path / "index.html").write_text('<div id="root"></div>', encoding="utf-8")
    (tmp_path / "fem.html").write_text("fem", encoding="utf-8")
    monkeypatch.setattr(desktop_app, "APP", "omkreds")
    monkeypatch.setattr(desktop_app, "_dist_dir", lambda: tmp_path)
    with TestClient(desktop_app.lav_app()) as c:
        assert 'id="root"' in c.get("/").text
        assert 'id="root"' in c.get("/projects/ab12cd34/A2").text
        assert c.get("/fem.html").text == "fem"
        assert c.get("/assets/mangler.js").status_code == 404
        assert c.get("/api/health").json()["status"] == "ok"
