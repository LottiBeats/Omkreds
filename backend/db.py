"""
db.py — SQLite persistence layer for OMKREDS Structural Calc.

Tables:
  projects      — one row per project (full JSON blob)
  calc_library  — shared office calculation templates

All writes are protected by a threading.Lock so concurrent sessions
on the same server never corrupt the WAL.

Authentication is handled by Clerk (clerk.com) — no user table needed here.
"""

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

import os as _os
# On Render: set DATABASE_PATH=/var/data/projects.db (persistent disk)
# Locally: defaults to ./projects.db next to this file
DB_PATH = Path(_os.environ.get("DATABASE_PATH", "") or
               (Path(__file__).resolve().parent / "projects.db"))

_lock = threading.Lock()


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
        # Add columns to existing databases (idempotent migrations).
        for table, col_def in [
            ("calc_library", "parameters TEXT DEFAULT '[]'"),
            ("calc_library", "code       TEXT DEFAULT ''"),
            ("calc_library", "items      TEXT DEFAULT '[]'"),
            ("projects",     "owner_id   TEXT DEFAULT ''"),
            ("projects",     "visibility TEXT DEFAULT 'team'"),
            ("calc_library", "owner_id   TEXT DEFAULT ''"),
            ("calc_library", "visibility TEXT DEFAULT 'team'"),
        ]:
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col_def}")
            except sqlite3.OperationalError:
                pass   # column already exists
        conn.commit()


# -- Projects: read -----------------------------------------------------------

def load_all_projects(user_id: str = "", path: Path | None = None) -> list[dict]:
    """Return projects visible to user_id, newest first."""
    p = str(path or DB_PATH)
    init_db(path)
    with sqlite3.connect(p) as conn:
        if user_id:
            rows = conn.execute(
                "SELECT data FROM projects "
                "WHERE owner_id = ? OR visibility = 'team' "
                "ORDER BY updated_at DESC",
                (user_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT data FROM projects ORDER BY updated_at DESC"
            ).fetchall()
    projects = []
    for (data_str,) in rows:
        try:
            projects.append(json.loads(data_str))
        except Exception:
            pass
    return projects


def load_project(project_id: str, path: Path | None = None) -> dict | None:
    """Load a single project by id, or None if not found."""
    p = str(path or DB_PATH)
    init_db(path)
    with sqlite3.connect(p) as conn:
        row = conn.execute(
            "SELECT data FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
    if row:
        try:
            return json.loads(row[0])
        except Exception:
            return None
    return None


# -- Projects: write ----------------------------------------------------------

def save_project(project: dict, user: str = "", path: Path | None = None) -> None:
    """Upsert a project. Stamps _updated_at / _updated_by into the dict."""
    p = str(path or DB_PATH)
    init_db(path)
    now = datetime.now(timezone.utc).isoformat()
    project["_updated_at"] = now
    project["_updated_by"] = user
    data_str = json.dumps(project, ensure_ascii=False)
    owner_id   = project.get("owner_id",   "")
    visibility = project.get("visibility", "team")
    with _lock:
        with sqlite3.connect(p) as conn:
            conn.execute("""
                INSERT INTO projects (id, data, updated_at, updated_by, owner_id, visibility)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    data       = excluded.data,
                    updated_at = excluded.updated_at,
                    updated_by = excluded.updated_by,
                    owner_id   = excluded.owner_id,
                    visibility = excluded.visibility
            """, (project["id"], data_str, now, user, owner_id, visibility))
            conn.commit()


def delete_project(project_id: str, path: Path | None = None) -> None:
    """Permanently delete a project."""
    p = str(path or DB_PATH)
    init_db(path)
    with _lock:
        with sqlite3.connect(p) as conn:
            conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            conn.commit()


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
