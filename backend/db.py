"""
db.py — SQLite persistence layer for OMKREDS Structural Calc.

Tables:
  projects          — one row per project (full JSON blob)
  project_versions  — append-only history of previous project states
  calc_library      — shared office calculation templates

All writes are protected by a threading.Lock so concurrent sessions
on the same server never corrupt the WAL.

Data safety
───────────
Three mechanisms protect a user's work, because a lost project means a lost
working day and there is no other copy of it anywhere:

  1. Version history — every write snapshots the *previous* state into
     project_versions (throttled to one automatic snapshot per
     AUTOSNAPSHOT_INTERVAL_MIN).  Explicit snapshots (kind != 'auto', e.g. a
     document issue) are never pruned.
  2. Optimistic concurrency — every project row carries a `rev` counter.  A
     client that sends the rev it last saw gets a ConflictError instead of
     silently overwriting a newer save from another tab or colleague.
  3. Soft delete — deleting sets `deleted_at`; the row survives in the trash
     until purged (see TRASH_RETENTION_DAYS).

Authentication is handled by Clerk (clerk.com) — no user table needed here.
"""

import json
import shutil as _shutil
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import os as _os
# On Render: set DATABASE_PATH=/var/data/projects.db (persistent disk)
# Locally: defaults to ./projects.db next to this file
DB_PATH = Path(_os.environ.get("DATABASE_PATH", "") or
               (Path(__file__).resolve().parent / "projects.db"))

_lock = threading.Lock()

# ── Retention policy ──────────────────────────────────────────────────────────
# One automatic snapshot at most per this many minutes per project.  Editing is
# continuous (the frontend auto-saves ~1 s after every typing pause), so without
# throttling every keystroke pause would become a history entry.
AUTOSNAPSHOT_INTERVAL_MIN = 15
# Automatic snapshots kept per project (oldest pruned first).  Explicit
# snapshots — issued documents, pre-restore, pre-delete — are kept forever.
MAX_AUTO_VERSIONS = 40
# Soft-deleted projects are purged this many days after deletion.
TRASH_RETENTION_DAYS = 30

# Version kinds.  'auto' is prunable; everything else is permanent.
KIND_AUTO        = "auto"
KIND_ISSUE       = "issue"        # snapshot taken when a document was issued
KIND_MANUAL      = "manual"       # user pressed "save a version"
KIND_PRE_RESTORE = "pre-restore"  # state replaced by a restore
KIND_PRE_DELETE  = "pre-delete"   # state at the moment of deletion


class ConflictError(Exception):
    """
    Raised by save_project() when the caller's `expected_rev` no longer matches
    the stored row — i.e. somebody else saved in the meantime.

    Carries enough context for the UI to tell the user *who* saved and *when*.
    """

    def __init__(self, current_rev: int, updated_at: str = "", updated_by: str = ""):
        self.current_rev = current_rev
        self.updated_at  = updated_at
        self.updated_by  = updated_by
        super().__init__(
            f"Project was modified by someone else (server rev {current_rev})"
        )


# -- Schema -------------------------------------------------------------------

def init_db(path: Path | None = None) -> None:
    """Create tables if they do not already exist."""
    p = str(path or DB_PATH)
    with sqlite3.connect(p) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id         TEXT PRIMARY KEY,
                data       TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                updated_by TEXT DEFAULT ''
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS calc_library (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                description TEXT DEFAULT '',
                blocks      TEXT NOT NULL DEFAULT '[]',
                created_by  TEXT DEFAULT '',
                created_at  TEXT NOT NULL
            )
        """)
        # Append-only history.  Rows are never updated, only inserted and
        # (for kind='auto') pruned.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS project_versions (
                id         TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                rev        INTEGER NOT NULL DEFAULT 0,
                data       TEXT NOT NULL,
                kind       TEXT NOT NULL DEFAULT 'auto',
                label      TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                created_by TEXT DEFAULT ''
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_versions_project
            ON project_versions (project_id, created_at DESC)
        """)
        # Add columns to existing databases (idempotent migrations).
        for table, col_def in [
            ("calc_library", "parameters TEXT DEFAULT '[]'"),
            ("calc_library", "code       TEXT DEFAULT ''"),
            ("calc_library", "items      TEXT DEFAULT '[]'"),
            ("projects",     "owner_id   TEXT DEFAULT ''"),
            ("projects",     "visibility TEXT DEFAULT 'personal'"),
            ("projects",     "rev        INTEGER DEFAULT 1"),
            ("projects",     "deleted_at TEXT DEFAULT ''"),
            ("projects",     "deleted_by TEXT DEFAULT ''"),
            ("calc_library", "owner_id   TEXT DEFAULT ''"),
            ("calc_library", "visibility TEXT DEFAULT 'personal'"),
        ]:
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col_def}")
            except sqlite3.OperationalError:
                pass   # column already exists

        # ── One-time data migrations ──────────────────────────────────────────
        # Tracked in the migrations table so each runs exactly once, not on
        # every request.  Add new entries here as needed; never remove old ones.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS migrations (
                id         TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)

        def _migration_done(mid: str) -> bool:
            return bool(conn.execute(
                "SELECT 1 FROM migrations WHERE id = ?", (mid,)
            ).fetchone())

        def _mark_done(mid: str) -> None:
            conn.execute(
                "INSERT OR IGNORE INTO migrations (id) VALUES (?)", (mid,)
            )

        # Migration 001 — fix orphaned 'team' projects (no owner_id set yet)
        if not _migration_done("001_fix_team_projects_orphaned"):
            conn.execute("""
                UPDATE projects
                SET   owner_id   = updated_by,
                      visibility = 'personal'
                WHERE visibility = 'team'
                  AND (owner_id = '' OR owner_id IS NULL)
                  AND updated_by IS NOT NULL AND updated_by != ''
            """)
            _mark_done("001_fix_team_projects_orphaned")

        # Migration 002 — flip ALL remaining 'team' records to 'personal'.
        # Covers calc templates and projects that already had owner_id set but
        # still carried the old default visibility = 'team'.
        if not _migration_done("002_flip_all_team_to_personal"):
            conn.execute(
                "UPDATE projects     SET visibility = 'personal' WHERE visibility = 'team'"
            )
            conn.execute(
                "UPDATE calc_library SET visibility = 'personal' WHERE visibility = 'team'"
            )
            _mark_done("002_flip_all_team_to_personal")

        # Migration 003 — repair transliterated document names.
        # Projects created before 2026-08-12 stored "Konstruktionsaendringer",
        # "Statisk projektredegoerelse" etc., which then printed on the cover
        # page and in B1's document list.  Only titles still equal to the old
        # default are touched, so a title the user has edited is left alone.
        if not _migration_done("003_fix_transliterated_doc_titles"):
            try:
                from doc_defs import DOC_DEFS, LEGACY_DOC_DEFS
                rows = conn.execute("SELECT id, data FROM projects").fetchall()
                for pid, data_str in rows:
                    try:
                        proj = json.loads(data_str)
                    except Exception:
                        continue
                    changed = False
                    for doc_id, doc in (proj.get("documents") or {}).items():
                        legacy = LEGACY_DOC_DEFS.get(doc_id)
                        correct = DOC_DEFS.get(doc_id)
                        if not legacy or not correct or legacy == correct:
                            continue
                        if isinstance(doc, dict) and doc.get("title") == legacy:
                            doc["title"] = correct
                            changed = True
                    if changed:
                        conn.execute(
                            "UPDATE projects SET data = ? WHERE id = ?",
                            (json.dumps(proj, ensure_ascii=False), pid),
                        )
            except Exception as exc:
                print(f"[db] migration 003 skipped: {exc}")
            _mark_done("003_fix_transliterated_doc_titles")

        conn.commit()


# -- Projects: read -----------------------------------------------------------

def _hydrate(data_str: str, rev: int = 1, deleted_at: str = "") -> dict | None:
    """Parse a stored JSON blob and stamp the row-level bookkeeping onto it."""
    try:
        project = json.loads(data_str)
    except Exception:
        return None
    project["_rev"] = rev or 1
    if deleted_at:
        project["_deleted_at"] = deleted_at
    return project


def load_all_projects(user_id: str = "", path: Path | None = None) -> list[dict]:
    """Return non-deleted projects visible to user_id, newest first."""
    p = str(path or DB_PATH)
    init_db(path)
    with sqlite3.connect(p) as conn:
        if user_id:
            rows = conn.execute(
                "SELECT data, rev FROM projects "
                "WHERE (owner_id = ? OR visibility = 'team') "
                "  AND COALESCE(deleted_at, '') = '' "
                "ORDER BY updated_at DESC",
                (user_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT data, rev FROM projects "
                "WHERE COALESCE(deleted_at, '') = '' "
                "ORDER BY updated_at DESC"
            ).fetchall()
    projects = []
    for data_str, rev in rows:
        project = _hydrate(data_str, rev)
        if project is not None:
            projects.append(project)
    return projects


def load_deleted_projects(user_id: str = "", path: Path | None = None) -> list[dict]:
    """Return soft-deleted ('trashed') projects visible to user_id, newest first."""
    p = str(path or DB_PATH)
    init_db(path)
    with sqlite3.connect(p) as conn:
        if user_id:
            rows = conn.execute(
                "SELECT data, rev, deleted_at, deleted_by FROM projects "
                "WHERE (owner_id = ? OR visibility = 'team') "
                "  AND COALESCE(deleted_at, '') != '' "
                "ORDER BY deleted_at DESC",
                (user_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT data, rev, deleted_at, deleted_by FROM projects "
                "WHERE COALESCE(deleted_at, '') != '' "
                "ORDER BY deleted_at DESC"
            ).fetchall()
    projects = []
    for data_str, rev, deleted_at, deleted_by in rows:
        project = _hydrate(data_str, rev, deleted_at)
        if project is not None:
            project["_deleted_by"] = deleted_by or ""
            projects.append(project)
    return projects


def load_project(
    project_id: str,
    path: Path | None = None,
    include_deleted: bool = False,
) -> dict | None:
    """Load a single project by id, or None if not found (or trashed)."""
    p = str(path or DB_PATH)
    init_db(path)
    with sqlite3.connect(p) as conn:
        row = conn.execute(
            "SELECT data, rev, COALESCE(deleted_at, ''), COALESCE(deleted_by, '') "
            "FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
    if not row:
        return None
    data_str, rev, deleted_at, deleted_by = row
    if deleted_at and not include_deleted:
        return None
    project = _hydrate(data_str, rev, deleted_at)
    if project is not None and deleted_at:
        project["_deleted_by"] = deleted_by
    return project


# -- Projects: write ----------------------------------------------------------

def _insert_version(
    conn: sqlite3.Connection,
    project_id: str,
    data_str: str,
    rev: int,
    kind: str,
    label: str,
    user: str,
) -> str:
    """Insert one history row. Caller holds the lock and commits."""
    vid = uuid.uuid4().hex[:12]
    conn.execute("""
        INSERT INTO project_versions
            (id, project_id, rev, data, kind, label, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        vid, project_id, rev, data_str, kind, label,
        datetime.now(timezone.utc).isoformat(), user,
    ))
    return vid


def _prune_auto_versions(conn: sqlite3.Connection, project_id: str) -> None:
    """Keep only the newest MAX_AUTO_VERSIONS automatic snapshots per project."""
    conn.execute("""
        DELETE FROM project_versions
        WHERE kind = ?
          AND project_id = ?
          AND id NOT IN (
              SELECT id FROM project_versions
              WHERE kind = ? AND project_id = ?
              ORDER BY created_at DESC
              LIMIT ?
          )
    """, (KIND_AUTO, project_id, KIND_AUTO, project_id, MAX_AUTO_VERSIONS))


def _should_autosnapshot(conn: sqlite3.Connection, project_id: str) -> bool:
    """True if the last automatic snapshot is older than the throttle interval."""
    row = conn.execute("""
        SELECT created_at FROM project_versions
        WHERE project_id = ? AND kind = ?
        ORDER BY created_at DESC LIMIT 1
    """, (project_id, KIND_AUTO)).fetchone()
    if not row:
        return True
    try:
        last = datetime.fromisoformat(row[0])
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
    except Exception:
        return True
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=AUTOSNAPSHOT_INTERVAL_MIN)
    return last < cutoff


def save_project(
    project: dict,
    user: str = "",
    path: Path | None = None,
    expected_rev: int | None = None,
) -> int:
    """
    Upsert a project. Stamps _updated_at / _updated_by / _rev into the dict and
    returns the new rev.

    Before overwriting, the *previous* stored state is snapshotted into
    project_versions (throttled — see AUTOSNAPSHOT_INTERVAL_MIN), so a bad save
    is always recoverable.

    If *expected_rev* is given and does not match the stored rev, nothing is
    written and ConflictError is raised.  Callers that pass None (older clients,
    internal writes) keep the previous last-write-wins behaviour.
    """
    p = str(path or DB_PATH)
    init_db(path)
    now = datetime.now(timezone.utc).isoformat()
    project_id = project["id"]
    owner_id   = project.get("owner_id",   "")
    visibility = project.get("visibility", "personal")

    with _lock:
        with sqlite3.connect(p, timeout=15) as conn:
            # BEGIN IMMEDIATE takes SQLite's write lock *before* the read, so
            # the read-check-write below is atomic across processes as well as
            # threads.  The server runs multiple uvicorn workers, and the
            # threading.Lock above only covers one of them — without this, two
            # workers could both read rev 5 and both write rev 6, which is
            # exactly the lost update the rev counter exists to prevent.
            conn.isolation_level = None
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT data, rev, updated_at, updated_by FROM projects WHERE id = ?",
                (project_id,),
            ).fetchone()

            if row is None:
                new_rev = 1
            else:
                prev_data, prev_rev, prev_at, prev_by = row
                prev_rev = prev_rev or 1
                if expected_rev is not None and expected_rev != prev_rev:
                    raise ConflictError(prev_rev, prev_at or "", prev_by or "")
                new_rev = prev_rev + 1
                if _should_autosnapshot(conn, project_id):
                    _insert_version(
                        conn, project_id, prev_data, prev_rev,
                        KIND_AUTO, "", prev_by or "",
                    )
                    _prune_auto_versions(conn, project_id)

            project["_updated_at"] = now
            project["_updated_by"] = user
            project["_rev"]        = new_rev
            data_str = json.dumps(project, ensure_ascii=False)

            conn.execute("""
                INSERT INTO projects
                    (id, data, updated_at, updated_by, owner_id, visibility, rev, deleted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, '')
                ON CONFLICT(id) DO UPDATE SET
                    data       = excluded.data,
                    updated_at = excluded.updated_at,
                    updated_by = excluded.updated_by,
                    owner_id   = excluded.owner_id,
                    visibility = excluded.visibility,
                    rev        = excluded.rev,
                    -- Editing a trashed project brings it back: a save must
                    -- never land on a row the user can no longer see.
                    deleted_at = '',
                    deleted_by = ''
            """, (project_id, data_str, now, user, owner_id, visibility, new_rev))
            conn.commit()
    return new_rev


def delete_project(
    project_id: str,
    user: str = "",
    path: Path | None = None,
) -> None:
    """
    Move a project to the trash (soft delete).

    The row and its history survive; the state at the moment of deletion is
    snapshotted first.  Use purge_project() for permanent removal.
    """
    p = str(path or DB_PATH)
    init_db(path)
    now = datetime.now(timezone.utc).isoformat()
    with _lock:
        with sqlite3.connect(p) as conn:
            row = conn.execute(
                "SELECT data, rev FROM projects WHERE id = ?", (project_id,)
            ).fetchone()
            if row:
                _insert_version(
                    conn, project_id, row[0], row[1] or 1,
                    KIND_PRE_DELETE, "Slettet", user,
                )
            conn.execute(
                "UPDATE projects SET deleted_at = ?, deleted_by = ? WHERE id = ?",
                (now, user, project_id),
            )
            conn.commit()


def restore_deleted_project(project_id: str, path: Path | None = None) -> bool:
    """Bring a project back from the trash. Returns False if it wasn't there."""
    p = str(path or DB_PATH)
    init_db(path)
    with _lock:
        with sqlite3.connect(p) as conn:
            cur = conn.execute(
                "UPDATE projects SET deleted_at = '', deleted_by = '' "
                "WHERE id = ? AND COALESCE(deleted_at, '') != ''",
                (project_id,),
            )
            conn.commit()
            return cur.rowcount > 0


def purge_project(project_id: str, path: Path | None = None) -> None:
    """Permanently delete a project and its entire history. Irreversible."""
    p = str(path or DB_PATH)
    init_db(path)
    with _lock:
        with sqlite3.connect(p) as conn:
            conn.execute("DELETE FROM project_versions WHERE project_id = ?", (project_id,))
            conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            conn.commit()


def purge_expired_trash(days: int = TRASH_RETENTION_DAYS, path: Path | None = None) -> int:
    """Permanently remove projects trashed more than *days* ago. Returns the count."""
    p = str(path or DB_PATH)
    init_db(path)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with _lock:
        with sqlite3.connect(p) as conn:
            ids = [r[0] for r in conn.execute(
                "SELECT id FROM projects "
                "WHERE COALESCE(deleted_at, '') != '' AND deleted_at < ?",
                (cutoff,),
            ).fetchall()]
            for pid in ids:
                conn.execute("DELETE FROM project_versions WHERE project_id = ?", (pid,))
                conn.execute("DELETE FROM projects WHERE id = ?", (pid,))
            conn.commit()
    return len(ids)


# -- Projects: version history ------------------------------------------------

def create_version(
    project_id: str,
    kind: str = KIND_MANUAL,
    label: str = "",
    user: str = "",
    path: Path | None = None,
) -> str | None:
    """
    Snapshot a project's *current* state explicitly.

    Used when issuing a document, and before a restore.  Explicit snapshots are
    never pruned.  Returns the version id, or None if the project is gone.
    """
    p = str(path or DB_PATH)
    init_db(path)
    with _lock:
        with sqlite3.connect(p) as conn:
            row = conn.execute(
                "SELECT data, rev FROM projects WHERE id = ?", (project_id,)
            ).fetchone()
            if not row:
                return None
            vid = _insert_version(
                conn, project_id, row[0], row[1] or 1, kind, label, user
            )
            conn.commit()
    return vid


def list_versions(project_id: str, path: Path | None = None) -> list[dict]:
    """
    Return the version history for a project, newest first.

    The JSON blob is *not* included — history lists are rendered from the
    metadata alone, and the blobs can be megabytes each.
    """
    p = str(path or DB_PATH)
    init_db(path)
    with sqlite3.connect(p) as conn:
        rows = conn.execute("""
            SELECT id, rev, kind, label, created_at, created_by, LENGTH(data)
            FROM project_versions
            WHERE project_id = ?
            ORDER BY created_at DESC
        """, (project_id,)).fetchall()
    return [
        {
            "id":         r[0],
            "rev":        r[1],
            "kind":       r[2],
            "label":      r[3] or "",
            "created_at": r[4],
            "created_by": r[5] or "",
            "size_bytes": r[6] or 0,
        }
        for r in rows
    ]


def load_version(
    project_id: str,
    version_id: str,
    path: Path | None = None,
) -> dict | None:
    """Load the full project snapshot stored in one version row."""
    p = str(path or DB_PATH)
    init_db(path)
    with sqlite3.connect(p) as conn:
        row = conn.execute(
            "SELECT data FROM project_versions WHERE id = ? AND project_id = ?",
            (version_id, project_id),
        ).fetchone()
    if not row:
        return None
    try:
        return json.loads(row[0])
    except Exception:
        return None


def restore_version(
    project_id: str,
    version_id: str,
    user: str = "",
    path: Path | None = None,
) -> dict | None:
    """
    Restore a project to an earlier snapshot.

    The state being replaced is snapshotted first (kind='pre-restore'), so a
    restore is itself undoable.  Returns the restored project, or None if the
    version does not exist.
    """
    snapshot = load_version(project_id, version_id, path)
    if snapshot is None:
        return None
    create_version(
        project_id, KIND_PRE_RESTORE, "Før gendannelse", user, path
    )
    # Identity fields always come from the live row, never from the snapshot —
    # ownership and visibility must not travel back in time.
    live = load_project(project_id, path, include_deleted=True) or {}
    snapshot["id"]         = project_id
    snapshot["owner_id"]   = live.get("owner_id", snapshot.get("owner_id", ""))
    snapshot["visibility"] = live.get("visibility", snapshot.get("visibility", "personal"))
    save_project(snapshot, user=user, path=path)
    return snapshot


# -- Calc library: read -------------------------------------------------------

def load_template(template_id: str, path: Path | None = None) -> dict | None:
    """Load a single template by id, or None if not found."""
    p = str(path or DB_PATH)
    init_db(path)
    with sqlite3.connect(p) as conn:
        row = conn.execute("""
            SELECT id, name, description, blocks, parameters, code, created_by,
                   created_at, items, owner_id, visibility
            FROM calc_library
            WHERE id = ?
        """, (template_id,)).fetchone()
    if not row:
        return None
    try:
        return {
            "id":          row[0],
            "name":        row[1],
            "description": row[2],
            "blocks":      json.loads(row[3] or "[]"),
            "parameters":  json.loads(row[4] or "[]"),
            "code":        row[5] or "",
            "created_by":  row[6],
            "created_at":  row[7],
            "items":       json.loads(row[8] or "[]"),
            "owner_id":    row[9] or "",
            "visibility":  row[10] or "team",
        }
    except Exception:
        return None


def load_all_templates(user_id: str = "", path: Path | None = None) -> list[dict]:
    """Return calc templates visible to user_id (own + team), newest first."""
    p = str(path or DB_PATH)
    init_db(path)
    with sqlite3.connect(p) as conn:
        if user_id:
            rows = conn.execute("""
                SELECT id, name, description, blocks, parameters, code, created_by,
                       created_at, items, owner_id, visibility
                FROM calc_library
                WHERE owner_id = ? OR visibility = 'team'
                ORDER BY created_at DESC
            """, (user_id,)).fetchall()
        else:
            rows = conn.execute("""
                SELECT id, name, description, blocks, parameters, code, created_by,
                       created_at, items, owner_id, visibility
                FROM calc_library ORDER BY created_at DESC
            """).fetchall()
    templates = []
    for row in rows:
        try:
            templates.append({
                "id":          row[0],
                "name":        row[1],
                "description": row[2],
                "blocks":      json.loads(row[3] or "[]"),
                "parameters":  json.loads(row[4] or "[]"),
                "code":        row[5] or "",
                "created_by":  row[6],
                "created_at":  row[7],
                "items":       json.loads(row[8] or "[]"),
                "owner_id":    row[9] or "",
                "visibility":  row[10] or "team",
            })
        except Exception:
            pass
    return templates


# -- Calc library: write ------------------------------------------------------

def save_template(
    name: str,
    description: str = "",
    blocks: list | None = None,
    parameters: list | None = None,
    code: str = "",
    items: list | None = None,
    owner_id: str = "",
    visibility: str = "team",
    user: str = "",
    path: Path | None = None,
) -> str:
    """Save a new calc template. Returns the new template id."""
    import uuid
    p = str(path or DB_PATH)
    init_db(path)
    now = datetime.now(timezone.utc).isoformat()
    tid = uuid.uuid4().hex[:8]
    with _lock:
        with sqlite3.connect(p) as conn:
            conn.execute("""
                INSERT INTO calc_library
                    (id, name, description, blocks, parameters, code, created_by, created_at, items, owner_id, visibility)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                tid, name, description,
                json.dumps(blocks or [], ensure_ascii=False),
                json.dumps(parameters or [], ensure_ascii=False),
                code or "",
                user, now,
                json.dumps(items or [], ensure_ascii=False),
                owner_id, visibility,
            ))
            conn.commit()
    return tid


def update_template(
    template_id: str,
    name: str,
    description: str = "",
    parameters: list | None = None,
    code: str = "",
    items: list | None = None,
    visibility: str = "team",
    path: Path | None = None,
) -> None:
    """Update an existing calc template."""
    p = str(path or DB_PATH)
    init_db(path)
    with _lock:
        with sqlite3.connect(p) as conn:
            conn.execute("""
                UPDATE calc_library
                SET name=?, description=?, parameters=?, code=?, items=?, visibility=?
                WHERE id=?
            """, (
                name, description,
                json.dumps(parameters or [], ensure_ascii=False),
                code or "",
                json.dumps(items or [], ensure_ascii=False),
                visibility,
                template_id,
            ))
            conn.commit()


def delete_template(template_id: str, path: Path | None = None) -> None:
    """Delete a calc template."""
    p = str(path or DB_PATH)
    init_db(path)
    with _lock:
        with sqlite3.connect(p) as conn:
            conn.execute("DELETE FROM calc_library WHERE id = ?", (template_id,))
            conn.commit()


# -- Backups ------------------------------------------------------------------
# Version history protects against a bad *save*; it does not protect against a
# corrupted or lost database file.  These write a consistent copy of the whole
# database (sqlite3's online backup API — safe while the server is running).

BACKUP_KEEP_DAYS = int(_os.environ.get("BACKUP_KEEP_DAYS", "7"))


def backup_dir(path: Path | None = None) -> Path:
    """Directory holding the rotating daily database copies."""
    return Path(path or DB_PATH).parent / "backups"


def backup_database(
    path: Path | None = None,
    keep: int = BACKUP_KEEP_DAYS,
    force: bool = False,
) -> Path | None:
    """
    Write today's database backup, rotating out anything older than *keep* days.

    One backup per calendar day: returns the existing file untouched if today's
    is already there (unless *force*).  Returns None if the database does not
    exist yet, or if the volume is too full to hold another copy safely.
    """
    src = Path(path or DB_PATH)
    if not src.exists():
        return None

    dest_dir = backup_dir(path)
    # A full disk takes the whole app down — a missed backup does not.  Bail out
    # rather than write the copy that fills the volume.  (Projects carry base64
    # images, so the database grows faster than the 1 GB Render disk suggests.)
    try:
        dest_dir.mkdir(parents=True, exist_ok=True)
        free = _shutil.disk_usage(str(dest_dir)).free
        needed = src.stat().st_size * 2      # the new copy + headroom
        if free < needed:
            print(
                f"[db] skipping backup: {free // 1_048_576} MB free, "
                f"needs ~{needed // 1_048_576} MB. Lower BACKUP_KEEP_DAYS or "
                f"grow the disk."
            )
            return None
    except OSError as exc:
        print(f"[db] could not check free space: {exc}")

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    dest = dest_dir / f"projects-{stamp}.db"

    if dest.exists() and not force:
        return dest

    # The temp file carries the pid: the server runs several uvicorn workers,
    # each with its own maintenance thread, and two of them writing the same
    # scratch file would produce a truncated "backup".  With a per-process name
    # the worst case is two identical copies and one atomic rename winning.
    tmp = dest.with_suffix(f".db.part{_os.getpid()}")
    with _lock:
        source = sqlite3.connect(str(src))
        target = sqlite3.connect(str(tmp))
        try:
            source.backup(target)
        finally:
            target.close()
            source.close()
    tmp.replace(dest)   # atomic — a partial file is never mistaken for a backup

    # Rotate: keep the newest *keep* files, delete the rest.  The glob is
    # anchored on ".db" so a concurrent worker's ".db.part<pid>" is never
    # mistaken for a finished backup and deleted out from under it.
    backups = sorted(
        (f for f in dest_dir.glob("projects-*.db") if f.suffix == ".db"),
        reverse=True,
    )
    for old in backups[keep:]:
        try:
            old.unlink()
        except OSError:
            pass
    return dest


def start_backup_scheduler(
    path: Path | None = None,
    interval_hours: int = 6,
) -> threading.Thread:
    """
    Start a daemon thread that keeps the daily backup and the trash fresh.

    Runs every *interval_hours* (not once a day) so a server that restarts
    often still gets a backup, and one that runs for weeks still expires trash.
    """
    def _loop() -> None:
        while True:
            try:
                backup_database(path)
                purge_expired_trash(path=path)
            except Exception as exc:                      # never kill the thread
                print(f"[db] scheduled maintenance failed: {exc}")
            _stop.wait(interval_hours * 3600)

    _stop = threading.Event()
    thread = threading.Thread(target=_loop, name="db-maintenance", daemon=True)
    thread.start()
    return thread


# -- Helpers ------------------------------------------------------------------

def project_count(path: Path | None = None) -> int:
    p = str(path or DB_PATH)
    init_db(path)
    with sqlite3.connect(p) as conn:
        return conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0]


def fmt_updated(iso: str) -> str:
    """Format an ISO timestamp as a human-readable relative string."""
    try:
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        delta = datetime.now(timezone.utc) - dt
        s = int(delta.total_seconds())
        if s < 60:
            return "just now"
        if s < 3600:
            return f"{s // 60} min ago"
        if s < 86400:
            return f"{s // 3600} h ago"
        return f"{s // 86400} d ago"
    except Exception:
        return iso[:10]
