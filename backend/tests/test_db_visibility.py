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


def test_projects_are_filtered_by_owner_and_team_visibility(tmp_path):
    db_path = tmp_path / "projects.db"

    db.save_project(_project("alice-private", "alice", "personal"), path=db_path)
    db.save_project(_project("bob-private", "bob", "personal"), path=db_path)
    db.save_project(_project("team-project", "bob", "team"), path=db_path)

    alice_ids = {p["id"] for p in db.load_all_projects(user_id="alice", path=db_path)}
    bob_ids = {p["id"] for p in db.load_all_projects(user_id="bob", path=db_path)}
    all_ids = {p["id"] for p in db.load_all_projects(path=db_path)}

    assert alice_ids == {"alice-private", "team-project"}
    assert bob_ids == {"bob-private", "team-project"}
    assert all_ids == {"alice-private", "bob-private", "team-project"}


def test_project_metadata_columns_update_on_save(tmp_path):
    db_path = tmp_path / "projects.db"
    project = _project("p1", "alice", "personal")

    db.save_project(project, path=db_path)
    project["visibility"] = "team"
    db.save_project(project, path=db_path)

    bob_ids = {p["id"] for p in db.load_all_projects(user_id="bob", path=db_path)}

    assert bob_ids == {"p1"}


def test_templates_are_filtered_by_owner_and_team_visibility(tmp_path):
    db_path = tmp_path / "projects.db"

    alice_private = db.save_template(
        name="Alice private",
        owner_id="alice",
        visibility="personal",
        path=db_path,
    )
    bob_private = db.save_template(
        name="Bob private",
        owner_id="bob",
        visibility="personal",
        path=db_path,
    )
    team_template = db.save_template(
        name="Team",
        owner_id="bob",
        visibility="team",
        path=db_path,
    )

    alice_ids = {t["id"] for t in db.load_all_templates(user_id="alice", path=db_path)}
    bob_ids = {t["id"] for t in db.load_all_templates(user_id="bob", path=db_path)}
    all_ids = {t["id"] for t in db.load_all_templates(path=db_path)}

    assert alice_ids == {alice_private, team_template}
    assert bob_ids == {bob_private, team_template}
    assert all_ids == {alice_private, bob_private, team_template}


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
