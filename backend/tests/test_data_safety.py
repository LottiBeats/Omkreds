"""
test_data_safety.py — version history, optimistic concurrency, soft delete.

These cover the three mechanisms that stand between a user and a lost working
day, so they exercise db.py directly (against a temp file) as well as through
the API.
"""
import json
import sqlite3
import time
from datetime import datetime, timedelta, timezone

import pytest

import db as _db


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def dbfile(tmp_path):
    """A throwaway database file; every db function takes an explicit path."""
    p = tmp_path / "test.db"
    _db.init_db(p)
    return p


def _project(pid="p1", name="Test", owner="u1"):
    return {
        "id": pid,
        "owner_id": owner,
        "visibility": "personal",
        "metadata": {"project_name": name},
        "documents": {},
    }


def _age_versions(dbfile, minutes: int) -> None:
    """
    Backdate every stored snapshot.

    The autosnapshot throttle is time-based; rather than sleeping for 15
    minutes, we move the existing history into the past.
    """
    import sqlite3
    past = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
    with sqlite3.connect(str(dbfile)) as conn:
        conn.execute("UPDATE project_versions SET created_at = ?", (past,))
        conn.commit()


# ── Version history ───────────────────────────────────────────────────────────

def test_first_save_creates_no_version(dbfile):
    """Nothing is overwritten on a create, so there is nothing to snapshot."""
    _db.save_project(_project(), user="u1", path=dbfile)
    assert _db.list_versions("p1", path=dbfile) == []


def test_second_save_snapshots_the_previous_state(dbfile):
    p = _project(name="Original")
    _db.save_project(p, user="u1", path=dbfile)

    p["metadata"]["project_name"] = "Renamed"
    _db.save_project(p, user="u1", path=dbfile)

    versions = _db.list_versions("p1", path=dbfile)
    assert len(versions) == 1
    snapshot = _db.load_version("p1", versions[0]["id"], path=dbfile)
    # The snapshot holds the state *before* the save that triggered it
    assert snapshot["metadata"]["project_name"] == "Original"
    assert _db.load_project("p1", path=dbfile)["metadata"]["project_name"] == "Renamed"


def test_autosnapshots_are_throttled(dbfile):
    """Rapid saves (the auto-save loop) must not flood the history."""
    p = _project()
    for i in range(6):
        p["metadata"]["project_name"] = f"v{i}"
        _db.save_project(p, user="u1", path=dbfile)
    assert len(_db.list_versions("p1", path=dbfile)) == 1

    _age_versions(dbfile, _db.AUTOSNAPSHOT_INTERVAL_MIN + 1)
    p["metadata"]["project_name"] = "later"
    _db.save_project(p, user="u1", path=dbfile)
    assert len(_db.list_versions("p1", path=dbfile)) == 2


def test_auto_versions_are_pruned_but_explicit_ones_survive(dbfile):
    p = _project()
    _db.save_project(p, user="u1", path=dbfile)
    _db.create_version("p1", kind=_db.KIND_ISSUE, label="Udstedt A2", user="u1", path=dbfile)

    for i in range(_db.MAX_AUTO_VERSIONS + 5):
        p["metadata"]["project_name"] = f"v{i}"
        _db.save_project(p, user="u1", path=dbfile)
        _age_versions(dbfile, _db.AUTOSNAPSHOT_INTERVAL_MIN + 1)

    versions = _db.list_versions("p1", path=dbfile)
    autos = [v for v in versions if v["kind"] == _db.KIND_AUTO]
    issues = [v for v in versions if v["kind"] == _db.KIND_ISSUE]
    assert len(autos) <= _db.MAX_AUTO_VERSIONS
    assert len(issues) == 1, "explicit snapshots must never be pruned"


def test_restore_brings_back_old_state_and_is_itself_undoable(dbfile):
    p = _project(name="Good")
    _db.save_project(p, user="u1", path=dbfile)
    p["metadata"]["project_name"] = "Broken"
    _db.save_project(p, user="u1", path=dbfile)

    version_id = _db.list_versions("p1", path=dbfile)[0]["id"]
    restored = _db.restore_version("p1", version_id, user="u1", path=dbfile)

    assert restored["metadata"]["project_name"] == "Good"
    assert _db.load_project("p1", path=dbfile)["metadata"]["project_name"] == "Good"
    kinds = [v["kind"] for v in _db.list_versions("p1", path=dbfile)]
    assert _db.KIND_PRE_RESTORE in kinds, "the replaced state must be recoverable"


def test_restore_does_not_resurrect_old_ownership(dbfile):
    """A snapshot must not carry stale owner/visibility back into the live row."""
    p = _project(owner="u1")
    _db.save_project(p, user="u1", path=dbfile)
    version_id = None

    p["metadata"]["project_name"] = "changed"
    _db.save_project(p, user="u1", path=dbfile)
    version_id = _db.list_versions("p1", path=dbfile)[0]["id"]

    # Ownership transfers after the snapshot was taken
    live = _db.load_project("p1", path=dbfile)
    live["owner_id"] = "u2"
    live["visibility"] = "team"
    _db.save_project(live, user="u2", path=dbfile)

    _db.restore_version("p1", version_id, user="u2", path=dbfile)
    after = _db.load_project("p1", path=dbfile)
    assert after["owner_id"] == "u2"
    assert after["visibility"] == "team"


# ── Optimistic concurrency ────────────────────────────────────────────────────

def test_rev_increments_on_every_save(dbfile):
    p = _project()
    assert _db.save_project(p, user="u1", path=dbfile) == 1
    assert _db.save_project(p, user="u1", path=dbfile) == 2
    assert _db.load_project("p1", path=dbfile)["_rev"] == 2


def test_stale_rev_is_rejected(dbfile):
    p = _project()
    _db.save_project(p, user="u1", path=dbfile)          # rev 1

    stale = json.loads(json.dumps(p))                    # what tab A holds
    _db.save_project(p, user="u2", path=dbfile)          # tab B saves → rev 2

    with pytest.raises(_db.ConflictError) as excinfo:
        _db.save_project(stale, user="u1", path=dbfile, expected_rev=1)
    assert excinfo.value.current_rev == 2
    assert excinfo.value.updated_by == "u2"


def test_conflict_leaves_the_stored_project_untouched(dbfile):
    p = _project(name="Theirs")
    _db.save_project(p, user="u1", path=dbfile)
    _db.save_project(p, user="u2", path=dbfile)

    mine = _project(name="Mine")
    with pytest.raises(_db.ConflictError):
        _db.save_project(mine, user="u1", path=dbfile, expected_rev=1)
    assert _db.load_project("p1", path=dbfile)["metadata"]["project_name"] == "Theirs"


def test_matching_rev_is_accepted(dbfile):
    p = _project()
    rev = _db.save_project(p, user="u1", path=dbfile)
    assert _db.save_project(p, user="u1", path=dbfile, expected_rev=rev) == rev + 1


def test_no_expected_rev_keeps_last_write_wins(dbfile):
    """Older clients (and internal writes) must not start failing."""
    p = _project()
    _db.save_project(p, user="u1", path=dbfile)
    _db.save_project(p, user="u2", path=dbfile)
    _db.save_project(p, user="u1", path=dbfile)          # no expected_rev → fine
    assert _db.load_project("p1", path=dbfile)["_rev"] == 3


# ── Soft delete ───────────────────────────────────────────────────────────────

def test_delete_hides_but_keeps_the_project(dbfile):
    _db.save_project(_project(), user="u1", path=dbfile)
    _db.delete_project("p1", user="u1", path=dbfile)

    assert _db.load_project("p1", path=dbfile) is None
    assert _db.load_all_projects("u1", path=dbfile) == []
    trashed = _db.load_deleted_projects("u1", path=dbfile)
    assert len(trashed) == 1 and trashed[0]["id"] == "p1"
    assert _db.load_project("p1", path=dbfile, include_deleted=True) is not None


def test_delete_snapshots_the_state_at_deletion(dbfile):
    _db.save_project(_project(name="Final"), user="u1", path=dbfile)
    _db.delete_project("p1", user="u1", path=dbfile)
    versions = _db.list_versions("p1", path=dbfile)
    assert any(v["kind"] == _db.KIND_PRE_DELETE for v in versions)


def test_restore_from_trash(dbfile):
    _db.save_project(_project(), user="u1", path=dbfile)
    _db.delete_project("p1", user="u1", path=dbfile)

    assert _db.restore_deleted_project("p1", path=dbfile) is True
    assert _db.load_project("p1", path=dbfile) is not None
    assert _db.load_deleted_projects("u1", path=dbfile) == []
    assert _db.restore_deleted_project("p1", path=dbfile) is False


def test_saving_a_trashed_project_undeletes_it(dbfile):
    """An edit is an implicit restore — never a silent write to a hidden row."""
    p = _project()
    _db.save_project(p, user="u1", path=dbfile)
    _db.delete_project("p1", user="u1", path=dbfile)
    _db.save_project(p, user="u1", path=dbfile)
    assert _db.load_project("p1", path=dbfile) is not None


def test_purge_removes_project_and_history(dbfile):
    p = _project()
    _db.save_project(p, user="u1", path=dbfile)
    _db.save_project(p, user="u1", path=dbfile)
    _db.purge_project("p1", path=dbfile)

    assert _db.load_project("p1", path=dbfile, include_deleted=True) is None
    assert _db.list_versions("p1", path=dbfile) == []


def test_expired_trash_is_purged_but_fresh_trash_is_kept(dbfile):
    import sqlite3
    _db.save_project(_project("old"), user="u1", path=dbfile)
    _db.save_project(_project("new"), user="u1", path=dbfile)
    _db.delete_project("old", user="u1", path=dbfile)
    _db.delete_project("new", user="u1", path=dbfile)

    long_ago = (datetime.now(timezone.utc) - timedelta(days=99)).isoformat()
    with sqlite3.connect(str(dbfile)) as conn:
        conn.execute("UPDATE projects SET deleted_at = ? WHERE id = 'old'", (long_ago,))
        conn.commit()

    assert _db.purge_expired_trash(path=dbfile) == 1
    assert _db.load_project("old", path=dbfile, include_deleted=True) is None
    assert _db.load_project("new", path=dbfile, include_deleted=True) is not None


# ── Backups ───────────────────────────────────────────────────────────────────

def test_backup_writes_a_readable_copy(dbfile):
    import sqlite3
    _db.save_project(_project(name="Backed up"), user="u1", path=dbfile)

    dest = _db.backup_database(path=dbfile)
    assert dest is not None and dest.exists()

    with sqlite3.connect(str(dest)) as conn:
        row = conn.execute("SELECT data FROM projects WHERE id = 'p1'").fetchone()
    assert json.loads(row[0])["metadata"]["project_name"] == "Backed up"


def test_backup_is_once_per_day_and_rotates(dbfile):
    _db.save_project(_project(), user="u1", path=dbfile)
    first = _db.backup_database(path=dbfile)
    second = _db.backup_database(path=dbfile)
    assert first == second, "a second call the same day must not rewrite"

    # Simulate a fortnight of daily backups; only `keep` may survive.
    for day in range(1, 15):
        (_db.backup_dir(dbfile) / f"projects-2020-01-{day:02d}.db").touch()
    _db.backup_database(path=dbfile, keep=7, force=True)
    assert len(list(_db.backup_dir(dbfile).glob("projects-*.db"))) == 7


# ── API layer ─────────────────────────────────────────────────────────────────

def test_api_delete_is_recoverable_via_trash(client):
    created = client.post("/projects", params={"name": "API trash test"}).json()
    pid = created["id"]

    assert client.delete(f"/projects/{pid}").json()["recoverable"] is True
    assert client.get(f"/projects/{pid}").status_code == 404
    assert any(p["id"] == pid for p in client.get("/trash").json())

    assert client.post(f"/trash/{pid}/restore").status_code == 200
    assert client.get(f"/projects/{pid}").status_code == 200

    # Purge requires the project to be in the trash first
    assert client.delete(f"/trash/{pid}").status_code == 400
    client.delete(f"/projects/{pid}")
    assert client.delete(f"/trash/{pid}").status_code == 200
    assert client.get(f"/trash/{pid}").status_code in (404, 405)


def test_api_stale_save_returns_409_with_context(client):
    project = client.post("/projects", params={"name": "Conflict test"}).json()
    pid = project["id"]

    first = client.put(f"/projects/{pid}", json=project)
    assert first.status_code == 200
    rev = first.json()["_rev"]

    # A second tab saves, moving the server ahead
    client.put(f"/projects/{pid}", json={**project, "_rev": rev})

    stale = client.put(f"/projects/{pid}", json={**project, "_rev": rev})
    assert stale.status_code == 409
    detail = stale.json()["detail"]
    assert detail["current_rev"] > rev
    assert "ændret" in detail["message"]

    client.delete(f"/projects/{pid}")


def test_api_version_history_roundtrip(client):
    project = client.post("/projects", params={"name": "History test"}).json()
    pid = project["id"]

    project["metadata"]["project_name"] = "Renamed once"
    client.put(f"/projects/{pid}", json=project)

    tagged = client.post(f"/projects/{pid}/versions", json={"label": "Til kontrol"})
    assert tagged.status_code == 200

    versions = client.get(f"/projects/{pid}/versions").json()
    assert len(versions) >= 1
    labelled = [v for v in versions if v["label"] == "Til kontrol"]
    assert labelled, "manual snapshot should appear in the history"

    vid = labelled[0]["id"]
    snapshot = client.get(f"/projects/{pid}/versions/{vid}").json()
    assert snapshot["metadata"]["project_name"] == "Renamed once"

    project["metadata"]["project_name"] = "Broken"
    client.put(f"/projects/{pid}", json=project)

    restored = client.post(f"/projects/{pid}/versions/{vid}/restore").json()
    assert restored["metadata"]["project_name"] == "Renamed once"

    client.delete(f"/projects/{pid}")
    client.delete(f"/trash/{pid}")


# ── Issuing documents ─────────────────────────────────────────────────────────

def _new_project(client, name="Issue test"):
    return client.post("/projects", params={"name": name}).json()


def test_issue_records_revision_and_snapshot(client):
    project = _new_project(client)
    pid = project["id"]

    res = client.post(f"/projects/{pid}/issue/A2",
                      json={"revision": "A", "description": "Første udgave"})
    assert res.status_code == 200
    entry = res.json()["revision"]
    assert entry["rev"] == "A"
    assert entry["description"] == "Første udgave"
    assert entry["issued_by"]

    stored = client.get(f"/projects/{pid}").json()
    assert stored["documents"]["A2"]["revisions"][0]["rev"] == "A"

    versions = client.get(f"/projects/{pid}/versions").json()
    issues = [v for v in versions if v["kind"] == "issue"]
    assert len(issues) == 1
    assert "A2 rev A" in issues[0]["label"]

    client.delete(f"/projects/{pid}")
    client.delete(f"/trash/{pid}")


def test_revisions_are_per_document(client):
    project = _new_project(client)
    pid = project["id"]

    client.post(f"/projects/{pid}/issue/A2", json={"revision": "A", "description": "Udgave 1"})
    client.post(f"/projects/{pid}/issue/A2", json={"revision": "B", "description": "Tilføjet hanebånd"})
    client.post(f"/projects/{pid}/issue/B1", json={"revision": "A", "description": "Første udgave"})

    docs = client.get(f"/projects/{pid}").json()["documents"]
    assert [r["rev"] for r in docs["A2"]["revisions"]] == ["A", "B"]
    assert [r["rev"] for r in docs["B1"]["revisions"]] == ["A"]
    assert docs["A1"].get("revisions", []) == []

    client.delete(f"/projects/{pid}")
    client.delete(f"/trash/{pid}")


def test_reissuing_same_revision_replaces_the_row(client):
    """Two rows for rev B would make the table lie about which one you hold."""
    project = _new_project(client)
    pid = project["id"]

    client.post(f"/projects/{pid}/issue/A2", json={"revision": "B", "description": "Første forsøg"})
    client.post(f"/projects/{pid}/issue/A2", json={"revision": "B", "description": "Rettet tegningsnr."})

    revs = client.get(f"/projects/{pid}").json()["documents"]["A2"]["revisions"]
    assert len(revs) == 1
    assert revs[0]["description"] == "Rettet tegningsnr."

    client.delete(f"/projects/{pid}")
    client.delete(f"/trash/{pid}")


def test_issue_requires_revision_and_description(client):
    project = _new_project(client)
    pid = project["id"]

    assert client.post(f"/projects/{pid}/issue/A2", json={"description": "x"}).status_code == 400
    assert client.post(f"/projects/{pid}/issue/A2", json={"revision": "A"}).status_code == 400
    assert client.post(f"/projects/{pid}/issue/ZZ",
                       json={"revision": "A", "description": "x"}).status_code == 404

    client.delete(f"/projects/{pid}")
    client.delete(f"/trash/{pid}")


def test_override_reason_is_recorded(client):
    """Issuing past a failed integrity check must leave a trace."""
    project = _new_project(client)
    pid = project["id"]

    client.post(f"/projects/{pid}/issue/A2", json={
        "revision": "A", "description": "Udgave 1",
        "override_reason": "Beregning kontrolleret i hånden",
    })
    revs = client.get(f"/projects/{pid}").json()["documents"]["A2"]["revisions"]
    assert revs[0]["override_reason"] == "Beregning kontrolleret i hånden"

    client.delete(f"/projects/{pid}")
    client.delete(f"/trash/{pid}")


def test_pdf_revision_table_uses_the_documents_own_history():
    """The cover table must show A2's revisions, not B1's."""
    from pdf_builder import _flatten_project
    project = {
        "metadata": {"project_name": "P", "revision": "X", "engineer": "NJ"},
        "documents": {
            "A2": {"revisions": [
                {"rev": "A", "date": "2026-08-01", "description": "Udgave 1"},
                {"rev": "B", "date": "2026-08-12", "description": "Tilføjet hanebånd"},
            ]},
            "B1": {"revisions": [{"rev": "A", "date": "2026-08-02", "description": "Første"}]},
            "A1": {},
        },
    }
    a2 = _flatten_project(project, "A2")
    assert [r["rev"] for r in a2["revisions"]] == ["A", "B"]
    assert a2["revision"] == "B", "header shows the latest issued revision"
    assert a2["revision_desc"] == "Tilføjet hanebånd"

    b1 = _flatten_project(project, "B1")
    assert [r["rev"] for r in b1["revisions"]] == ["A"]

    # Never issued → falls back to the manually maintained project fields
    a1 = _flatten_project(project, "A1")
    assert a1["revision"] == "X"
    assert a1["revisions"] == []


# ── PDF text rendering ────────────────────────────────────────────────────────
# Tegn uden for Latin-1 blev droppet lydløst fra tekst- og overskriftsblokke.
# En værdi, der forsvinder ud af en statisk dokumentation, er værre end en grim
# erstatning, så de blev stavet ud: "sigma", "gamma", "<=".
#
# Det gælder ikke længere for græsk. calc_core registrerer en rigtig
# Unicode-skrift til de tegn (se test_pdf_symbols.py), så σ SKAL nu komme
# uændret igennem og bliver sat i den skrift længere nede. Blev det stadig
# stavet ud her, ville det samme tegn hedde "sigma" i en tekstblok og stå som
# σ i beregningen lige ved siden af.
#
# Pile og ulighedstegn gaar ogsaa gennem den skrift nu. Latin-1-tegnene
# (² ° æ ø) skal fortsat vaere i fred — Helvetica tegner dem selv, og det
# passer bedre til teksten omkring dem.

def test_greek_survives_into_the_text_block():
    from pdf_builder import _heading, _text

    block = {"type": "text", "data": {
        "text": "σ = 250 kN/m², φ_k = 30°, γ_M = 1,30, s ≤ 0,9, dæk → søjle"}}
    out = _text(block)[0]["content"]

    for ch in "σφγ":
        assert ch in out, f"{ch} skal naa uaendret frem til skriftvalget"
    for word in ("sigma", "phi", "gamma"):
        assert word not in out, f"{word!r} blev stavet ud i stedet for at blive sat"

    head = _heading({"type": "heading", "data": {"level": 2, "text": "Kontrol af γ_M"}})
    assert "γ" in head[0]["content"]


def test_latin1_characters_are_left_alone():
    """Helvetica tegner dem selv, og de passer bedre til teksten omkring dem."""
    from pdf_builder import _text
    out = _text({"type": "text", "data": {
        "text": "250 kN/m², 30°, dæk og søjle, ± 5 %"}})[0]["content"]
    for ch in "²°æø±":
        assert ch in out, f"{ch} er Latin-1 og skal staa uroert"


def test_subscript_digits_become_markup_not_nothing():
    """
    Saenkede cifre har ingen glyf i Helvetica. De laves om til den notation,
    story-rendereren forstaar, saa de bliver tegnet som saenkede — i stedet for
    at forsvinde.
    """
    from pdf_builder import _text
    out = _text({"type": "text", "data": {"text": "f₁ ≥ 8 Hz, γ₃ = 1,00"}})[0]["content"]
    assert "f_1" in out and "_3" in out
    assert "₁" not in out and "₃" not in out


def test_a_greek_letter_in_a_text_block_reaches_the_page():
    """
    Det afgoerende er ikke hvad _text() returnerer, men hvad der staar paa
    papiret. Teksten laeses tilbage ud af den faerdige PDF.
    """
    import os
    import tempfile

    pytest.importorskip("pypdfium2")
    import pypdfium2 as pdfium
    from pdf_builder import build_pdf

    project = {"id": "t", "metadata": {"project_name": "Tegntest"}, "documents": {}}
    blocks = [{"type": "text", "data": {"text": "Partialkoefficienten γ_M er 1,30."}}]
    pdf = build_pdf(project, blocks, doc_id="A2")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
        fh.write(pdf)
        path = fh.name
    try:
        doc = pdfium.PdfDocument(path)
        tekst = "\n".join(pg.get_textpage().get_text_range() for pg in doc)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

    assert "γ" in tekst, "gamma naaede ikke ud paa siden"
