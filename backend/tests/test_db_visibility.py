import db


def _project(project_id, owner_id, visibility):
    return {
        "id": project_id,
        "owner_id": owner_id,
        "visibility": visibility,
        "metadata": {"project_name": project_id},
        "documents": {},
        "created": "2026-05-25",
    }


def test_projects_are_only_visible_to_their_owner(tmp_path):
    """
    "team" betød alle, der kan logge ind, og var standard i "Nyt projekt".
    Nu ser man kun sine egne -- også når et projekt stadig er markeret team.
    """
    db_path = tmp_path / "projects.db"

    db.save_project(_project("alice-private", "alice", "personal"), path=db_path)
    db.save_project(_project("bob-private", "bob", "personal"), path=db_path)
    db.save_project(_project("team-project", "bob", "team"), path=db_path)

    alice_ids = {p["id"] for p in db.load_all_projects(user_id="alice", path=db_path)}
    bob_ids = {p["id"] for p in db.load_all_projects(user_id="bob", path=db_path)}

    assert alice_ids == {"alice-private"}
    assert bob_ids == {"bob-private", "team-project"}


def test_marking_a_project_team_does_not_share_it(tmp_path):
    db_path = tmp_path / "projects.db"
    project = _project("p1", "alice", "personal")

    db.save_project(project, path=db_path)
    project["visibility"] = "team"
    db.save_project(project, path=db_path)

    bob_ids = {p["id"] for p in db.load_all_projects(user_id="bob", path=db_path)}
    assert bob_ids == set()


def test_templates_are_only_visible_to_their_owner(tmp_path):
    db_path = tmp_path / "projects.db"

    alice_private = db.save_template(name="Alice private", owner_id="alice",
                                     visibility="personal", path=db_path)
    bob_private = db.save_template(name="Bob private", owner_id="bob",
                                   visibility="personal", path=db_path)
    team_template = db.save_template(name="Team", owner_id="bob",
                                     visibility="team", path=db_path)

    alice_ids = {t["id"] for t in db.load_all_templates(user_id="alice", path=db_path)}
    bob_ids = {t["id"] for t in db.load_all_templates(user_id="bob", path=db_path)}

    assert alice_ids == {alice_private}
    assert bob_ids == {bob_private, team_template}


def test_migration_004_makes_team_rows_personal_and_remembers_them(tmp_path):
    import sqlite3
    db_path = tmp_path / "projects.db"
    db.save_project(_project("t1", "bob", "team"), path=db_path)
    db.save_project(_project("p1", "bob", "personal"), path=db_path)
    # Kør migreringen igen, som på serveren efter deploy.
    with sqlite3.connect(db_path) as conn:
        conn.execute("DELETE FROM migrations WHERE id = '004_team_to_personal_again'")
        conn.execute("UPDATE projects SET visibility = 'team' WHERE id = 't1'")
    db.init_db(db_path)
    with sqlite3.connect(db_path) as conn:
        vis = dict(conn.execute("SELECT id, visibility FROM projects").fetchall())
        flipped = conn.execute("SELECT tbl, id FROM migration_004_flipped").fetchall()
    assert vis == {"t1": "personal", "p1": "personal"}
    assert flipped == [("projects", "t1")]


def test_template_load_returns_visibility_metadata(tmp_path):
    db_path = tmp_path / "projects.db"
    template_id = db.save_template(
        name="Private",
        owner_id="alice",
        visibility="personal",
        path=db_path,
    )

    template = db.load_template(template_id, path=db_path)

    assert template["owner_id"] == "alice"
    assert template["visibility"] == "personal"
