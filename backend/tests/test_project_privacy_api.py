"""
Gennem API'et: en bruger kan hverken se, åbne, gemme eller slette en anden
brugers projekt -- heller ikke et, der er oprettet med visibility=team.
"""
from fastapi.testclient import TestClient
import main
from auth import get_current_user


def _as(uid):
    main.app.dependency_overrides[get_current_user] = lambda: {"id": uid, "email": f"{uid}@x.dk", "name": uid}
    return TestClient(main.app)


def test_other_users_projects_are_invisible(tmp_path, monkeypatch):
    monkeypatch.setattr(main._db, "DB_PATH", tmp_path / "p.db")
    before = main.app.dependency_overrides.get(get_current_user)
    try:
        alice = _as("alice")
        pid = alice.post("/projects", params={"name": "A", "visibility": "team"}).json()["id"]
        proj = alice.get(f"/projects/{pid}").json()
        assert proj["visibility"] == "personal"

        bob = _as("bob")
        assert pid not in {p["id"] for p in bob.get("/projects").json()}
        assert bob.get(f"/projects/{pid}").status_code == 404
        assert bob.put(f"/projects/{pid}", json=proj).status_code == 404
        assert bob.delete(f"/projects/{pid}").status_code == 404

        alice = _as("alice")
        assert pid in {p["id"] for p in alice.get("/projects").json()}
    finally:
        if before is not None:
            main.app.dependency_overrides[get_current_user] = before
        else:
            main.app.dependency_overrides.pop(get_current_user, None)
