"""
Structural Calc v2 — FastAPI backend
=====================================

This file is the Python server. It exposes the calculation modules and the
database as a REST API so the React frontend can talk to them.

Every route returns plain JSON — no HTML, no Streamlit, just data.

Run with:
    python main.py
    # or:
    uvicorn main:app --reload

Interactive API docs are at: http://localhost:8000/docs
"""

import sys
import os
import uuid

# Load .env file if present (for local development)
try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass  # python-dotenv not installed — env vars must be set manually
import tempfile
import math
import builtins as _builtins
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Body, APIRouter, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from auth import get_current_user

# ── Import the existing calculation modules ───────────────────────────────────
# These are copied unchanged from the Streamlit deploy app.
# If a module isn't copied yet, the route that needs it will raise an ImportError.
# ── forallpeople — inject SI units into this module's globals ─────────────────
# All calc modules (steel.py, concrete.py, etc.) do the same at their top level.
# After this call, kN, m, mm, MPa, N etc. are available as globals here too.
import forallpeople as si
si.environment("structural", top_level=True)

# ── Unit namespace for custom calc eval ───────────────────────────────────────
# si.environment() injects unit names (kN, m, mm, MPa …) into builtins.
# We snapshot only the unit/quantity objects (those are the forallpeople objects,
# not standard builtins like exec/open/eval).
# __builtins__ is explicitly set to {} so eval() cannot access exec, open,
# __import__, or any other dangerous builtin — only what we put here explicitly.
# Whitelist of safe builtins for structural calc expressions.
# We deliberately do NOT include list/range/dict/str/bytes/etc. because
# those can be used for memory-exhaustion DoS (e.g. list(range(10**9))).
# forallpeople unit names (kN, m, mm, MPa …) are captured below.
_SAFE_BUILTINS = {"abs", "min", "max", "round", "pow", "sum",
                  "bool", "int", "float", "len"}

_UNIT_NS: dict = {
    # forallpeople unit objects injected by si.environment() —
    # these are NOT standard builtins so they won't appear in a fresh
    # Python session; si.environment() creates them at import time.
    k: v for k, v in vars(_builtins).items()
    if not k.startswith("_")
    and k in _SAFE_BUILTINS  # only whitelisted safe builtins …
    or (
        not k.startswith("_")  # … plus all forallpeople units
        and k not in dir(__import__("builtins"))  # (not a standard builtin)
    )
}
_UNIT_NS.update({
    "pi": math.pi, "e": math.e,
    "sqrt": math.sqrt, "sin": math.sin, "cos": math.cos,
    "tan": math.tan, "asin": math.asin, "acos": math.acos,
    "atan": math.atan, "atan2": math.atan2,
    "log": math.log, "log10": math.log10, "exp": math.exp,
    "floor": math.floor, "ceil": math.ceil,
    "abs": abs, "min": min, "max": max, "round": round,
    # Lock down builtins — prevents exec/open/__import__/compile etc.
    "__builtins__": {},
})


def _safe_eval(expr: str, ns: dict, timeout: float = 3.0):
    """
    Evaluate *expr* in namespace *ns* with a wall-clock timeout.

    Runs eval() in a daemon thread; raises TimeoutError if it doesn't
    finish within *timeout* seconds.  This prevents CPU/memory DoS
    from expressions like  sum(range(10**12))  or  list(range(10**9)).
    """
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(eval, expr, ns)
        try:
            return future.result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            raise TimeoutError(
                f"Expression took longer than {timeout} s to evaluate. "
                "Simplify the formula."
            )


def _preprocess_expr(expr: str) -> str:
    """Convert natural engineering notation to Python syntax before eval.

    Handles:
      ^   → **   (power: x^2  becomes  x**2)
      ×   → *    (multiplication symbol)
      ·   → *    (middle dot multiplication)
      ≤   → <=   (less-than-or-equal, used in conditions)
      ≥   → >=   (greater-than-or-equal, used in conditions)
      ≠   → !=   (not-equal, used in conditions)
    """
    return (expr
        .replace('^',  '**')
        .replace('×',  '*')
        .replace('·',  '*')
        .replace('≤',  '<=')
        .replace('≥',  '>=')
        .replace('≠',  '!=')
    )

try:
    import db as _db
except ImportError:
    raise SystemExit(
        "db.py not found in backend/. Copy it from structural_calc_deploy/."
    )

# ── App setup ────────────────────────────────────────────────────────────────

from contextlib import asynccontextmanager


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    """
    Start the daily database backup + trash expiry thread.

    Disable with DB_MAINTENANCE=off (tests, one-off scripts).
    """
    if _os.environ.get("DB_MAINTENANCE", "").lower() not in {"off", "0", "false"}:
        try:
            _db.start_backup_scheduler()
        except Exception as exc:
            print(f"[startup] could not start db maintenance: {exc}")
    yield


app = FastAPI(
    title="Structural Calc API",
    version="2.0",
    description="REST API for the Structural Calc document / report tool.",
    lifespan=_lifespan,
)

# CORS — allowed origins.
# In dev: localhost Vite dev server.
# In production: add your Vercel URL via the ALLOWED_ORIGINS env variable
#   e.g.  ALLOWED_ORIGINS=https://structuralcalc.vercel.app,https://yourdomain.com
import os as _os
_extra_origins = [o.strip() for o in _os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
_origins = ["http://localhost:5173", "http://localhost:3000"] + _extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Danish structural documentation categories (BR18 / DS 1140) — see doc_defs.py
from doc_defs import DOC_DEFS

VALID_VISIBILITIES = {"personal", "team"}

# ── Global user allowlist ─────────────────────────────────────────────────────
# Set ALLOWED_EMAILS=you@firm.com,colleague@firm.com in your .env / server env.
# If the variable is not set, every valid Clerk account can access the API.
# When set, users not on the list get HTTP 403 — even with a valid Clerk token.
_ALLOWED_EMAILS: frozenset[str] = frozenset(
    e.strip().lower()
    for e in _os.environ.get("ALLOWED_EMAILS", "").split(",")
    if e.strip()
)


def get_authorized_user(user: dict = Depends(get_current_user)) -> dict:
    """
    Clerk token verified (get_current_user) AND user is on the ALLOWED_EMAILS
    allowlist (if configured).  Returns the user dict on success.
    Raises HTTP 403 if the caller's email is not permitted.
    """
    if _ALLOWED_EMAILS:
        email = (user.get("email") or "").strip().lower()
        if email not in _ALLOWED_EMAILS:
            raise HTTPException(
                status_code=403,
                detail="Access denied. Your account is not authorised to use this API.",
            )
    return user


def _clean_visibility(value: str | None) -> str:
    return value if value in VALID_VISIBILITIES else "personal"


def _is_visible(item: dict, user: dict) -> bool:
    vis = item.get("visibility", "personal")
    return vis == "team" or item.get("owner_id") == user["id"]


def _visible_project(project_id: str, user: dict, include_deleted: bool = False) -> dict:
    project = _db.load_project(project_id, include_deleted=include_deleted)
    if not project or not _is_visible(project, user):
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _visible_template(template_id: str, user: dict) -> dict:
    template = _db.load_template(template_id)
    if not template or not _is_visible(template, user):
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")
    return template


# ── Health check (unprotected) ────────────────────────────────────────────────

@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
def health():
    """Quick check that the server is running."""
    return {"status": "ok", "version": "2.0"}


# ── Protected router ──────────────────────────────────────────────────────────
# All routes below require:
#   1. A valid Clerk Bearer token (get_current_user)
#   2. The caller's email to be in ALLOWED_EMAILS, if that env var is set
#      (get_authorized_user — wraps get_current_user)

protected = APIRouter(dependencies=[Depends(get_authorized_user)])


# ── Auth — current user (convenient endpoint) ─────────────────────────────────

@protected.get("/auth/me", tags=["Auth"])
def me(user: dict = Depends(get_current_user)):
    """Return the currently authenticated user's profile (from the Clerk token)."""
    return user


# ── Projects ──────────────────────────────────────────────────────────────────

@protected.get("/projects", tags=["Projects"])
def list_projects(user: dict = Depends(get_current_user)):
    """Return team projects plus the current user's personal projects (excludes templates)."""
    all_projects = _db.load_all_projects(user_id=user["id"])
    return [p for p in all_projects if not p.get("_is_template")]


@protected.get("/project-templates", tags=["Projects"])
def list_project_templates(user: dict = Depends(get_current_user)):
    """Return all project templates visible to this user."""
    all_projects = _db.load_all_projects(user_id=user["id"])
    return [p for p in all_projects if p.get("_is_template")]


@protected.post("/projects/{project_id}/save-as-template", tags=["Projects"])
def save_project_as_template(
    project_id: str,
    body: dict = Body(default={}),
    user: dict = Depends(get_current_user),
):
    """
    Duplicate a project as a reusable template.

    The original project is kept unchanged. A new project entry is created
    with _is_template=True and a _template_name / _template_description.
    Returns the newly created template.
    """
    import copy as _copy
    source = _visible_project(project_id, user)
    template = _copy.deepcopy(source)
    template["id"]                    = uuid.uuid4().hex[:8]
    template["_is_template"]          = True
    template["_template_name"]        = (
        body.get("name") or source["metadata"].get("project_name") or "Untitled template"
    )
    template["_template_description"] = body.get("description", "")
    template["owner_id"]              = user["id"]
    template["owner_email"]           = user.get("email", "")
    template["visibility"]            = _clean_visibility(body.get("visibility", "personal"))
    _db.save_project(template, user=user["id"])
    return template


@protected.post("/project-templates/{template_id}/use", tags=["Projects"])
def create_project_from_template(
    template_id: str,
    name: str = "New Project",
    ref: str = "",
    visibility: str = "personal",
    user: dict = Depends(get_current_user),
):
    """
    Create a new project by cloning the document structures from a template.

    All document blocks and sub-documents are copied.
    Project metadata (name, ref, client, date, cover image…) is reset so the
    user fills in the project-specific details; firm info is carried over.
    """
    import copy as _copy
    template = _visible_project(template_id, user)
    if not template.get("_is_template"):
        raise HTTPException(status_code=400, detail="Not a template")

    project = {
        "id":          uuid.uuid4().hex[:8],
        "owner_id":    user["id"],
        "owner_email": user.get("email", ""),
        "visibility":  _clean_visibility(visibility),
        "metadata": {
            # Project-specific — blank for user to fill in
            "project_name":     name,
            "project_ref":      ref,
            "client":           "",
            "address":          "",
            "standard":         "",
            "engineer":         "",
            "checker":          "",
            "approver":         "",
            "date":             "",
            "revision":         "A",
            "revision_desc":    "",
            "cover_image_b64":  "",
            # Firm info — same across projects, carry from template
            "firm_name":    template["metadata"].get("firm_name", ""),
            "firm_address": template["metadata"].get("firm_address", ""),
            "phone":        template["metadata"].get("phone", ""),
            "email":        template["metadata"].get("email", ""),
            "cvr":          template["metadata"].get("cvr", ""),
            "logo_b64":     template["metadata"].get("logo_b64", ""),
        },
        # Copy document structures (blocks + subdocs) verbatim
        "documents": _copy.deepcopy(template.get("documents", {})),
        "created": str(date.today()),
    }
    _db.save_project(project, user=user["id"])
    return project


@protected.post("/projects", tags=["Projects"])
def create_project(
    name: str = "New Project",
    ref: str = "",
    visibility: str = "personal",
    user: dict = Depends(get_current_user),
):
    """
    Create a new empty project.

    Returns the full project dict (same shape used everywhere in the app).
    """
    project = {
        "id": uuid.uuid4().hex[:8],
        "owner_id": user["id"],
        "owner_email": user.get("email", ""),
        "visibility": _clean_visibility(visibility),
        "metadata": {
            "project_name": name,
            "project_ref":  ref,
            "client":       "",
            "address":      "",
            "engineer":     "",   # calculated by
            "checker":      "",   # checked by
            "revision":     "A",
        },
        # One empty document per category
        "documents": {
            doc_id: {"title": title, "blocks": [], "subdocs": []}
            for doc_id, title in DOC_DEFS.items()
        },
        "created": str(date.today()),
    }
    _db.save_project(project, user=user["id"])
    return project


@protected.get("/projects/{project_id}", tags=["Projects"])
def get_project(project_id: str, user: dict = Depends(get_current_user)):
    """Get a single visible project by ID."""
    return _visible_project(project_id, user)


@protected.put("/projects/{project_id}", tags=["Projects"])
def save_project(project_id: str, project: dict, user: dict = Depends(get_current_user)):
    """
    Save (overwrite) a complete project.

    The frontend sends the full project dict after any change -
    blocks added/removed, metadata updated, etc.

    Concurrency: if the payload carries the `_rev` the client last saw, the save
    is rejected with HTTP 409 when the stored project has moved on since — a
    second tab or a colleague saved in between.  Clients that send no `_rev`
    keep the old last-write-wins behaviour.
    """
    if project.get("id") != project_id:
        raise HTTPException(status_code=400, detail="Project ID mismatch")

    existing = _visible_project(project_id, user)
    project.pop("_user", "")
    project["owner_id"] = existing.get("owner_id") or user["id"]
    project["owner_email"] = existing.get("owner_email", project.get("owner_email", ""))
    project["visibility"] = _clean_visibility(project.get("visibility", existing.get("visibility")))

    expected_rev = project.pop("_rev", None)
    if not isinstance(expected_rev, int):
        expected_rev = None

    try:
        new_rev = _db.save_project(project, user=user["id"], expected_rev=expected_rev)
    except _db.ConflictError as conflict:
        raise HTTPException(
            status_code=409,
            detail={
                "message":     "Projektet er ændret af en anden siden du åbnede det.",
                "current_rev": conflict.current_rev,
                "updated_at":  conflict.updated_at,
                "updated_by":  conflict.updated_by,
            },
        )
    return {"status": "saved", "_rev": new_rev, "_updated_at": project.get("_updated_at", "")}


@protected.delete("/projects/{project_id}", tags=["Projects"])
def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    """Move a visible project to the trash (recoverable for 30 days)."""
    _visible_project(project_id, user)
    _db.delete_project(project_id, user=user["id"])
    return {"status": "deleted", "recoverable": True}


# ── Trash ─────────────────────────────────────────────────────────────────────

@protected.get("/trash", tags=["Projects"])
def list_trash(user: dict = Depends(get_current_user)):
    """Return this user's soft-deleted projects, newest deletion first."""
    return _db.load_deleted_projects(user_id=user["id"])


@protected.post("/trash/{project_id}/restore", tags=["Projects"])
def restore_from_trash(project_id: str, user: dict = Depends(get_current_user)):
    """Bring a project back out of the trash."""
    _visible_project(project_id, user, include_deleted=True)
    if not _db.restore_deleted_project(project_id):
        raise HTTPException(status_code=404, detail="Project is not in the trash")
    return _db.load_project(project_id)


@protected.delete("/trash/{project_id}", tags=["Projects"])
def purge_from_trash(project_id: str, user: dict = Depends(get_current_user)):
    """Permanently delete a trashed project and its history. Irreversible."""
    project = _visible_project(project_id, user, include_deleted=True)
    if not project.get("_deleted_at"):
        raise HTTPException(
            status_code=400,
            detail="Project must be moved to the trash before it can be purged",
        )
    _db.purge_project(project_id)
    return {"status": "purged"}


# ── Issuing documents ─────────────────────────────────────────────────────────

@protected.post("/projects/{project_id}/issue/{doc_id}", tags=["Versions"])
def issue_document(
    project_id: str,
    doc_id: str,
    body: dict = Body(default={}),
    user: dict = Depends(get_current_user),
):
    """
    Record that a document was issued at a given revision.

    Appends a row to that document's revision history — the table printed on
    the PDF cover page — and takes a permanent snapshot of the whole project.
    Together those give the traceability a checking engineer asks for: every
    line in the revision table can be resolved back to the exact project state
    that produced it.

    Revisions are per document (A2 rev B is unrelated to B1 rev A), matching
    how the documents are delivered and revised in practice.

    Body: { revision, description, override_reason? }
    """
    project = _visible_project(project_id, user)

    doc = (project.get("documents") or {}).get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    revision = (body.get("revision") or "").strip()[:8]
    if not revision:
        raise HTTPException(status_code=400, detail="Revision is required")
    description = (body.get("description") or "").strip()[:200]
    if not description:
        raise HTTPException(status_code=400, detail="Revision description is required")
    override_reason = (body.get("override_reason") or "").strip()[:200]

    meta  = project.get("metadata") or {}
    today = str(date.today())
    entry = {
        "rev":         revision,
        "date":        today,
        "description": description,
        "by":          meta.get("engineer", ""),
        "checked":     meta.get("checker",  ""),
        # Provenance — not printed in the table, but part of the record
        "issued_at":   datetime.now(timezone.utc).isoformat(),
        "issued_by":   user.get("email") or user["id"],
    }
    if override_reason:
        entry["override_reason"] = override_reason

    revisions = list(doc.get("revisions") or [])
    # Re-issuing the same revision replaces its row rather than duplicating it:
    # a revision letter identifies one issue, and two rows for "B" would make
    # the table lie about which one the reader is holding.
    revisions = [r for r in revisions if r.get("rev") != revision]
    revisions.append(entry)
    doc["revisions"] = revisions

    _db.save_project(project, user=user["id"])

    label = f"{doc_id} rev {revision} — {description}"
    version_id = _db.create_version(
        project_id, kind=_db.KIND_ISSUE, label=label[:120], user=user["id"]
    )

    return {"status": "issued", "revision": entry, "version_id": version_id}


# ── Version history ───────────────────────────────────────────────────────────

@protected.get("/projects/{project_id}/versions", tags=["Versions"])
def list_project_versions(project_id: str, user: dict = Depends(get_current_user)):
    """Version history for a project, newest first (metadata only, no blobs)."""
    _visible_project(project_id, user, include_deleted=True)
    return _db.list_versions(project_id)


@protected.post("/projects/{project_id}/versions", tags=["Versions"])
def create_project_version(
    project_id: str,
    body: dict = Body(default={}),
    user: dict = Depends(get_current_user),
):
    """
    Snapshot the project's current state under a label.

    Used by "Gem version" and, automatically, when a document is issued.
    Explicit snapshots are never pruned.
    """
    _visible_project(project_id, user)
    kind  = body.get("kind") or _db.KIND_MANUAL
    if kind not in {_db.KIND_MANUAL, _db.KIND_ISSUE}:
        kind = _db.KIND_MANUAL
    label = (body.get("label") or "").strip()[:120]
    vid = _db.create_version(project_id, kind=kind, label=label, user=user["id"])
    if vid is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "created", "version_id": vid}


@protected.get("/projects/{project_id}/versions/{version_id}", tags=["Versions"])
def get_project_version(
    project_id: str,
    version_id: str,
    user: dict = Depends(get_current_user),
):
    """Load one snapshot in full — for previewing before restoring."""
    _visible_project(project_id, user, include_deleted=True)
    snapshot = _db.load_version(project_id, version_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return snapshot


@protected.post("/projects/{project_id}/versions/{version_id}/restore", tags=["Versions"])
def restore_project_version(
    project_id: str,
    version_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Roll the project back to an earlier snapshot.

    The state being replaced is snapshotted first, so a restore is itself
    undoable.  Returns the restored project.
    """
    _visible_project(project_id, user)
    restored = _db.restore_version(project_id, version_id, user=user["id"])
    if restored is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return restored


# ── PDF generation ────────────────────────────────────────────────────────────

@protected.post("/projects/{project_id}/pdf/{doc_id}", tags=["PDF"])
def generate_pdf(project_id: str, doc_id: str, user: dict = Depends(get_current_user)):
    """
    Generate a PDF for one document within a project.

    Returns the PDF file as a binary download (application/pdf).
    The frontend triggers a browser download when it receives this response.
    """
    project = _visible_project(project_id, user)

    # Find the document
    doc = project["documents"].get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    try:
        from pdf_builder import build_pdf

        # If the document has sub-documents, combine all their blocks in order.
        # Sub-document names become H1 section headers in the combined PDF.
        subdocs = doc.get("subdocs", [])
        if subdocs:
            combined: list = []
            for i, sd in enumerate(subdocs):
                sd_name = sd.get("name") or f"Sub-document {i + 1}"
                # Insert a heading block so each sub-doc starts a named section
                combined.append({
                    "type": "heading",
                    "data": {"level": 1, "text": f"{doc_id}.{i + 1}  {sd_name}"},
                })
                combined.extend(sd.get("blocks", []))
            blocks = combined
        else:
            blocks = doc.get("blocks", [])

        pdf_bytes = build_pdf(project, blocks, doc_id=doc_id)

        filename = f"{project['metadata'].get('project_ref', project_id)}_{doc_id}.pdf"
        filename = filename.replace(" ", "_").replace("/", "-")

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@protected.post("/projects/{project_id}/pdf-zip/{doc_id}", tags=["PDF"])
def generate_pdf_zip(project_id: str, doc_id: str, user: dict = Depends(get_current_user)):
    """
    Generate one PDF per sub-document and return them bundled in a ZIP archive.

    Each sub-document becomes its own .pdf file inside the ZIP, named:
      <project_ref>_<doc_id>.<n>_<subdoc_name>.pdf

    Falls back to a single-PDF ZIP when the document has no sub-documents.
    """
    import zipfile
    import io as _io

    project = _visible_project(project_id, user)
    doc = project["documents"].get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    try:
        from pdf_builder import build_pdf

        ref     = (project["metadata"].get("project_ref") or project_id)
        subdocs = doc.get("subdocs", [])

        zip_buf = _io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            if subdocs:
                for i, sd in enumerate(subdocs):
                    sd_name = sd.get("name") or f"Sub-document {i + 1}"
                    # Prepend the subdoc name as a heading so each PDF is self-labelled
                    blocks = [
                        {"type": "heading", "data": {"level": 1, "text": sd_name}},
                        *sd.get("blocks", []),
                    ]
                    pdf_bytes = build_pdf(project, blocks, doc_id=doc_id)
                    safe_name = (sd_name
                                 .replace(" ", "_")
                                 .replace("/", "-")
                                 .replace("\\", "-"))
                    fname = f"{ref}_{doc_id}.{i + 1}_{safe_name}.pdf"
                    fname = fname.replace(" ", "_")
                    zf.writestr(fname, pdf_bytes)
            else:
                # No sub-documents — put the single PDF in the archive anyway
                blocks    = doc.get("blocks", [])
                pdf_bytes = build_pdf(project, blocks, doc_id=doc_id)
                fname     = f"{ref}_{doc_id}.pdf".replace(" ", "_")
                zf.writestr(fname, pdf_bytes)

        zip_filename = f"{ref}_{doc_id}_separate.zip".replace(" ", "_").replace("/", "-")
        return Response(
            content=zip_buf.getvalue(),
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# -- Word generation -------------------------------------------------------

@protected.post("/projects/{project_id}/word/{doc_id}", tags=["Word"])
def generate_word(project_id: str, doc_id: str, user: dict = Depends(get_current_user)):
    """
    Generate a Word (.docx) document for one document within a project.

    Returns the .docx file as a binary download
    (application/vnd.openxmlformats-officedocument.wordprocessingml.document).
    """
    project = _visible_project(project_id, user)

    doc = project["documents"].get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    try:
        from word_builder import build_word

        # Combine sub-documents (same logic as PDF)
        subdocs = doc.get("subdocs", [])
        if subdocs:
            combined: list = []
            for i, sd in enumerate(subdocs):
                sd_name = sd.get("name") or f"Sub-document {i + 1}"
                combined.append({
                    "type": "heading",
                    "data": {"level": 1, "text": f"{doc_id}.{i + 1}  {sd_name}"},
                })
                combined.extend(sd.get("blocks", []))
            blocks = combined
        else:
            blocks = doc.get("blocks", [])

        docx_bytes = build_word(project, blocks, doc_id=doc_id)

        ref      = project["metadata"].get("project_ref", project_id)
        filename = f"{ref}_{doc_id}.docx".replace(" ", "_").replace("/", "-")

        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))



# ── Timber k_mod helper ────────────────────────────────────────────────────────

# EN 1995-1-1 Table 3.1 — k_mod per service class and load-duration class
_KMOD = {
    1: {'permanent': 0.60, 'long': 0.70, 'medium': 0.80, 'short': 0.90, 'instant': 1.10},
    2: {'permanent': 0.60, 'long': 0.70, 'medium': 0.80, 'short': 0.90, 'instant': 1.10},
    3: {'permanent': 0.50, 'long': 0.55, 'medium': 0.65, 'short': 0.70, 'instant': 0.90},
}

def _timber_governing_combo(uls_combinations: list, service_class: int) -> dict:
    """
    From a list of ULS combos [{name, E_d, duration}, ...] find the one
    that governs timber design: max(E_d / k_mod).

    A smaller load with a lower k_mod (e.g. long-duration storage) can produce
    a higher utilisation than a larger load with high k_mod (e.g. instantaneous wind).
    This follows EN 1995-1-1 §2.2.3 — k_mod must correspond to the action with
    the shortest duration in the combination.
    """
    kmod_table = _KMOD.get(service_class, _KMOD[1])
    def ratio(c):
        k = kmod_table.get(c['duration'], 0.80)
        return c['E_d'] / k if k > 0 else 0.0
    return max(uls_combinations, key=ratio)


# ── Calculation routes ─────────────────────────────────────────────────────────
#
# Each route accepts a block's "data" dict as the request body,
# runs the calculation, and returns the result as JSON.
#
# The frontend sends these requests when the user clicks "Run" on a calc block.
# Results are displayed inline without a page reload.


# ── EN 1993-1-1 — Steel beam ──────────────────────────────────────────────────

class SteelBeamInput(BaseModel):
    label:              str   = "S1"
    section:            str   = "IPE300"
    grade:              str   = "S355"       # S235 / S275 / S355 / S420 / S460
    span_m:             float = 5.0
    # Load type: how g_k / q_k are interpreted
    #   'udl'   → kN/m  — full-span uniformly distributed load
    #   'point' → kN    — single concentrated load at midspan
    #   'area'  → kN/m² — area load, multiplied by trib_width_m to get kN/m
    load_type:          str   = "udl"        # udl | point | area
    trib_width_m:       float = 1.0          # tributary width for 'area' load type [m]
    g_k_kNm:            float = 5.0          # permanent load  (kN/m, kN, or kN/m² per load_type)
    q_k_kNm:            float = 3.0          # variable load   (kN/m, kN, or kN/m² per load_type)
    # Load source: when provided, overrides g_k/q_k
    w_Ed_kNm:           float | None = None  # governing ULS load from load_combo block
    combo_label:        str   | None = None  # label of the source combo block (for display)
    # FEM source: when provided, M_Ed and V_Ed come directly from FEM analysis
    M_Ed_kNm_direct:    float | None = None  # max moment from Beam FEM block
    V_Ed_kN_direct:     float | None = None  # max shear from Beam FEM block
    fem_label:          str   | None = None  # title of the source FEM block (for display)
    gamma_M0:           float = 1.0
    gamma_M1:           float = 1.0
    ltb_restrained:     bool  = False
    ltb_length_m:       float | None = None  # effective LTB length → enables cl. 6.3.2.2 check
    buck_y_restrained:  bool  = False
    buck_x_restrained:  bool  = False
    deflection_limit:   int   = 200          # L/n SLS limit (200 = final, 350 = net, 500 = finish)
    # Manual section properties — kept for API backward-compatibility
    manual_Wply_cm3:      float | None = None
    manual_Wely_cm3:      float | None = None
    manual_Iy_cm4:        float | None = None
    manual_h_mm:          float | None = None
    manual_tw_mm:         float | None = None
    use_elastic_modulus:  bool          = False


@protected.post("/calc/steel-beam", tags=["Calculations"])
def calc_steel_beam(data: SteelBeamInput):
    """
    EN 1993-1-1 steel beam check.
    Returns a list of calc blocks (section, text, handcalc, check, …)
    that the React frontend's CalcResultView renders directly.
    """
    try:
        from section_catalog import load_steel_profiles
        from steel import steel_beam_ipe

        # Grade → f_y
        fy_map = {"S235": 235, "S275": 275, "S355": 355, "S420": 420, "S460": 460}
        f_y = fy_map.get(data.grade.upper(), 355) * MPa

        span_fp = data.span_m * m

        # ── Section properties ────────────────────────────────────────────────
        # Manual mode: user supplies W_pl,y / W_el,y / I_y from a published
        # table (EN 10056, SBI tables, etc.).  Cross-section classification is
        # skipped; the user selects which modulus applies explicitly.
        manual_mode = (
            data.manual_Wply_cm3 is not None or
            data.manual_Wely_cm3 is not None
        )

        if manual_mode:
            Wpl_cm3   = data.manual_Wply_cm3 or data.manual_Wely_cm3
            Wel_cm3   = data.manual_Wely_cm3 or data.manual_Wply_cm3
            # Choose which modulus to use for bending resistance
            W_eff_cm3 = Wel_cm3 if data.use_elastic_modulus else Wpl_cm3
            W_ply = W_eff_cm3 * 1e-6 * m**3
            h     = (data.manual_h_mm  * 1e-3 * m) if data.manual_h_mm  else None
            t_w   = (data.manual_tw_mm * 1e-3 * m) if data.manual_tw_mm else None
            Iy    = (data.manual_Iy_cm4 * 1e-8 * m**4) if data.manual_Iy_cm4 else None
            b     = None   # no flange width → cross-section classification skipped
            t_f   = None
        else:
            # Catalog lookup — accepts any key from steel_profiles.csv
            db = load_steel_profiles()
            key = data.section.strip().upper().replace(" ", "")
            if key not in db:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Section '{data.section}' not found in catalog. "
                        "L-profiles: use e.g. L100X100X10. "
                        "Or switch to 'Manual' mode and enter W_pl / W_el / I_y directly."
                    )
                )
            sec = db[key]
            W_ply = sec["Wply_cm3"] * 1e-6 * m**3
            h     = sec["h_mm"]     * 1e-3 * m
            t_w   = sec["tw_mm"]    * 1e-3 * m
            b     = sec["b_mm"]     * 1e-3 * m
            t_f   = sec["tf_mm"]    * 1e-3 * m
            Iy    = sec["Iy_cm4"]   * 1e-8 * m**4

        kwargs_sb: dict = dict(
            label         = data.label,
            section       = data.section,
            span          = span_fp,
            g_k           = data.g_k_kNm  * kN / m,
            q_k           = data.q_k_kNm  * kN / m,
            W_ply         = W_ply,
            h             = h,
            t_w           = t_w,
            b             = b,
            t_f           = t_f,
            Iy            = Iy,
            f_y           = f_y,
            gamma_M0      = data.gamma_M0,
            gamma_M1      = data.gamma_M1,
            ltb_restrained     = data.ltb_restrained,
            buck_y_restrained  = data.buck_y_restrained,
            buck_x_restrained  = data.buck_x_restrained,
            deflection_limit   = data.deflection_limit,
            manual_mode        = manual_mode,
            use_elastic        = data.use_elastic_modulus if manual_mode else False,
        )
        if data.ltb_length_m is not None and not data.ltb_restrained:
            kwargs_sb["l_cr_ltb"] = data.ltb_length_m * m

        # Load source override priority: FEM > combo > direct
        if data.M_Ed_kNm_direct is not None and data.V_Ed_kN_direct is not None:
            # FEM results: use actual M_Ed and V_Ed from FEM analysis
            kwargs_sb["beam_results"] = {
                "source":    f"FEM: {data.fem_label or 'Beam FEM Analysis'}",
                "case_name": data.fem_label or "FEM",
                "M_Ed":      data.M_Ed_kNm_direct * kN * m,
                "V_Ed":      data.V_Ed_kN_direct  * kN,
            }
        elif data.w_Ed_kNm is not None:
            # Combo: compute M_Ed = w·L²/8
            w_Ed_fp = data.w_Ed_kNm * kN / m
            kwargs_sb["beam_results"] = {
                "source":    f"Load combination {data.combo_label or ''}".strip(),
                "case_name": data.combo_label or "",
                "M_Ed":      w_Ed_fp * span_fp ** 2 / 8,
                "V_Ed":      w_Ed_fp * span_fp / 2,
            }
        elif data.load_type == "area":
            # Area load → multiply by tributary width → UDL
            tw = max(data.trib_width_m or 1.0, 0.001)
            kwargs_sb["g_k"] = data.g_k_kNm * tw * kN / m
            kwargs_sb["q_k"] = data.q_k_kNm * tw * kN / m
            # beam_results stays None → steel_beam_ipe uses UDL formula
        elif data.load_type == "point":
            # Concentrated load at midspan
            G_k = data.g_k_kNm * kN        # g_k_kNm field stores the kN value here
            Q_k = data.q_k_kNm * kN
            w_uls = 1.35 * G_k + 1.5 * Q_k
            kwargs_sb["beam_results"] = {
                "source":    "Point load at midspan",
                "case_name": f"G_k = {data.g_k_kNm:.2f} kN  ·  Q_k = {data.q_k_kNm:.2f} kN",
                "M_Ed":      w_uls * span_fp / 4,
                "V_Ed":      w_uls / 2,
            }

        blocks = steel_beam_ipe(**kwargs_sb)
        return blocks

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── EN 1992-1-1 — RC beam ─────────────────────────────────────────────────────

class RcBeamInput(BaseModel):
    label:       str   = "B1"
    span_m:      float = 5.0
    b_mm:        float = 300.0
    h_mm:        float = 500.0
    d_mm:        float = 450.0
    g_k_kNm:     float = 10.0
    q_k_kNm:     float = 6.0
    f_ck_MPa:    float = 30.0
    f_yk_MPa:    float = 500.0
    As_prov_mm2: float | None = None
    gamma_C:     float = 1.5
    gamma_S:     float = 1.15


@protected.post("/calc/rc-beam", tags=["Calculations"])
def calc_rc_beam(data: RcBeamInput):
    """EN 1992-1-1 RC beam bending check."""
    try:
        from concrete import rc_beam_bending

        kwargs: dict = dict(
            label    = data.label,
            span     = data.span_m   * m,
            g_k      = data.g_k_kNm  * kN / m,
            q_k      = data.q_k_kNm  * kN / m,
            b        = data.b_mm     * mm,
            h        = data.h_mm     * mm,
            d        = data.d_mm     * mm,
            f_ck     = data.f_ck_MPa * MPa,
            f_yk     = data.f_yk_MPa * MPa,
            gamma_C  = data.gamma_C,
            gamma_S  = data.gamma_S,
        )
        if data.As_prov_mm2 is not None:
            kwargs["As_prov"] = data.As_prov_mm2 * mm**2

        blocks = rc_beam_bending(**kwargs)
        return blocks

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── EN 1995-1-1 — Timber beam ─────────────────────────────────────────────────

class TimberBeamInput(BaseModel):
    label:          str   = "T1"
    span_m:         float = 4.0
    b_mm:           float = 90.0
    h_mm:           float = 220.0
    g_k_kNm:        float = 3.0
    q_k_kNm:        float = 2.0
    # Load source: when provided, overrides g_k/q_k
    w_Ed_kNm:         float | None = None  # governing ULS load from load_combo block
    combo_label:      str   | None = None  # label of the source combo block (for display)
    uls_combinations: list  | None = None  # all ULS combos [{name,E_d,duration}] — used to find
                                           # timber-governing combo via max(E_d/k_mod)
    # FEM source: when provided, M_Ed and V_Ed come directly from FEM analysis
    M_Ed_kNm_direct:  float | None = None  # max moment from Beam FEM block
    V_Ed_kN_direct:   float | None = None  # max shear from Beam FEM block
    fem_label:        str   | None = None  # title of the source FEM block (for display)
    timber_grade:   str   = "C24"
    service_class:  int   = 1
    load_duration:  str   = "medium"
    gamma_M:        float = 1.3
    compression_edge_restrained:     bool = True
    torsional_restraint_at_supports: bool = True
    support_length_mm: float | None = None   # bearing length at each support → enables ⊥ grain check


@protected.post("/calc/timber-beam", tags=["Calculations"])
def calc_timber_beam(data: TimberBeamInput):
    """EN 1995-1-1 timber beam check (bending, shear, lateral buckling)."""
    try:
        from timber import timber_beam

        span_fp = data.span_m * m

        kwargs_tb: dict = dict(
            label         = data.label,
            span          = span_fp,
            g_k           = data.g_k_kNm * kN / m,
            q_k           = data.q_k_kNm * kN / m,
            b             = data.b_mm    * mm,
            h             = data.h_mm    * mm,
            timber_grade  = data.timber_grade,
            service_class = data.service_class,
            load_duration = data.load_duration,
            gamma_M       = data.gamma_M,
            compression_edge_restrained     = data.compression_edge_restrained,
            torsional_restraint_at_supports = data.torsional_restraint_at_supports,
        )
        if data.support_length_mm is not None:
            kwargs_tb["support_length"] = data.support_length_mm * mm

        # Load source override priority: FEM > combo > direct g_k/q_k
        if data.M_Ed_kNm_direct is not None and data.V_Ed_kN_direct is not None:
            # FEM results: use actual M_Ed and V_Ed from FEM analysis.
            # load_duration is set manually by the user (FEM has no duration info).
            kwargs_tb["beam_results"] = {
                "source":    f"FEM: {data.fem_label or 'Beam FEM Analysis'}",
                "case_name": data.fem_label or "FEM",
                "M_Ed":      data.M_Ed_kNm_direct * kN * m,
                "V_Ed":      data.V_Ed_kN_direct  * kN,
            }
            # load_duration already set from data.load_duration above

        elif data.w_Ed_kNm is not None:
            # Combo: find the truly governing combination via max(E_d/k_mod).
            if data.uls_combinations:
                gov = _timber_governing_combo(data.uls_combinations, data.service_class)
                w_Ed_val      = gov['E_d']
                gov_duration  = gov['duration']
                gov_name      = gov['name']
            else:
                w_Ed_val     = data.w_Ed_kNm
                gov_duration = data.load_duration
                gov_name     = data.combo_label or ''

            w_Ed_fp = w_Ed_val * kN / m
            kwargs_tb["beam_results"] = {
                "source":    f"Load combination {data.combo_label or ''}  —  governing: {gov_name}".strip(),
                "case_name": gov_name,
                "M_Ed":      w_Ed_fp * span_fp ** 2 / 8,
                "V_Ed":      w_Ed_fp * span_fp / 2,
            }
            kwargs_tb["load_duration"] = gov_duration

        blocks = timber_beam(**kwargs_tb)
        return blocks

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── EN 1995-1-1 — Timber column ───────────────────────────────────────────────

class TimberColumnInput(BaseModel):
    label:                   str   = "C1"
    length_m:                float = 3.0
    N_Ed_kN:                 float = 50.0
    M_Ed_kNm:                float = 0.0
    b_mm:                    float = 120.0
    h_mm:                    float = 120.0
    # Load source: when combo is used, frontend overrides N_Ed_kN directly
    combo_label:      str  | None = None  # label of the source combo block (for display)
    uls_combinations: list | None = None  # all ULS combos [{name,E_d,duration}] — used to find
                                          # timber-governing combo via max(E_d/k_mod)
    timber_grade:            str   = "C24"
    service_class:           int   = 1
    load_duration:           str   = "medium"
    gamma_M:                 float = 1.3
    effective_length_factor: float = 1.0
    l_ef_ltb_m:              float | None = None


@protected.post("/calc/timber-column", tags=["Calculations"])
def calc_timber_column(data: TimberColumnInput):
    """EN 1995-1-1 timber column check (axial + bending + buckling)."""
    try:
        from timber_column import timber_column_bending_and_axial

        # If all ULS combinations are available, find the one that truly governs
        # timber design: max(E_d / k_mod) — not simply max(E_d).
        if data.uls_combinations:
            gov           = _timber_governing_combo(data.uls_combinations, data.service_class)
            N_Ed_val      = gov['E_d']
            load_duration = gov['duration']
        else:
            N_Ed_val      = data.N_Ed_kN
            load_duration = data.load_duration

        kwargs: dict = dict(
            label                   = data.label,
            length                  = data.length_m  * m,
            N_Ed                    = N_Ed_val * kN,
            M_Ed                    = data.M_Ed_kNm  * kN * m,
            b                       = data.b_mm      * mm,
            h                       = data.h_mm      * mm,
            timber_grade            = data.timber_grade,
            service_class           = data.service_class,
            load_duration           = load_duration,
            gamma_M                 = data.gamma_M,
            effective_length_factor = data.effective_length_factor,
        )
        if data.l_ef_ltb_m is not None:
            kwargs["l_ef_ltb"] = data.l_ef_ltb_m * m

        blocks = timber_column_bending_and_axial(**kwargs)
        return blocks

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── EN 1996-1-1 — Masonry wall ────────────────────────────────────────────────

class MasonryWallInput(BaseModel):
    calc_type:    str   = "vertical"   # vertical | ritter | bearing | multi_ritter | plan_dist
    label:        str   = "W1"

    # ── Shared material (all types except plan_dist) ──────────────
    f_b_MPa:      float = 10.0
    f_m_MPa:      float = 6.0
    K:            float = 0.55
    gamma_M:      float = 2.5

    # ── Simple vertical check ─────────────────────────────────────
    height_m:     float = 3.0
    thickness_mm: float = 228.0
    length_m:     float = 5.0
    N_k_kN:       float = 100.0
    alpha:        float = 0.7
    beta:         float = 0.3

    # ── Ritter — single wall ──────────────────────────────────────
    b_m:          float | None = None   # tributary width [m]
    t_ef_mm:      float | None = None   # effective thickness [mm]
    h_ef_m:       float | None = None   # effective height [m]
    e_m_mm:       float        = 0.0    # midheight eccentricity [mm]
    N_Ed_kN:      float | None = None   # design axial force [kN]
    K1:           float        = 0.9    # long-term factor

    # ── Bearing under beam ────────────────────────────────────────
    N_Ed_bear_kN: float | None = None   # bearing reaction [kN]
    a_plate_mm:   float | None = None   # plate length along span [mm]
    b_plate_mm:   float | None = None   # plate width across wall [mm]
    t_leaf_mm:    float | None = None   # leaf thickness [mm]

    # ── Multi-storey Ritter ───────────────────────────────────────
    floor_names:      list[str]   = []
    heights_m:        list[float] = []
    wall_width_m:     float | None = None
    unit_weight_kNm2: float | None = None   # kN/m² wall self-weight
    axial_loads_kN:   list[float]  = []
    shear_forces_kN:  list[float]  = []
    top_moment_kNm:   float        = 0.0
    Kt:               float        = 0.9

    # ── Plan lateral distribution ─────────────────────────────────
    # elements = [[d_N, b_N, x, y], ...] all in metres
    elements:       list[list[float]] = []
    x_max_m:        float | None = None
    y_max_m:        float | None = None
    floor_height_m: float | None = None
    D_x:            float = 0.0
    E_x:            float = 0.0
    D_y:            float = 0.0
    E_y:            float = 0.0


@protected.post("/calc/masonry-wall", tags=["Calculations"])
def calc_masonry_wall(data: MasonryWallInput):
    """EN 1996-1-1 unreinforced masonry wall checks (5 types)."""
    try:
        if data.calc_type == "vertical":
            from masonry import masonry_wall_vertical
            blocks = masonry_wall_vertical(
                label     = data.label,
                height    = data.height_m     * m,
                thickness = data.thickness_mm * mm,
                length    = data.length_m     * m,
                N_k       = data.N_k_kN       * kN,
                f_b       = data.f_b_MPa      * MPa,
                f_m       = data.f_m_MPa      * MPa,
                gamma_M   = data.gamma_M,
                K         = data.K,
                alpha     = data.alpha,
                beta      = data.beta,
            )

        elif data.calc_type == "ritter":
            from masonry import masonry_wall_ritter
            blocks = masonry_wall_ritter(
                label   = data.label,
                b       = (data.b_m   or 1.0)            * m,
                t_ef    = (data.t_ef_mm or data.thickness_mm) * mm,
                h_ef    = (data.h_ef_m  or data.height_m)    * m,
                e_m     = data.e_m_mm * mm,
                N_Ed    = (data.N_Ed_kN or data.N_k_kN * 1.35) * kN,
                f_b     = data.f_b_MPa * MPa,
                f_m     = data.f_m_MPa * MPa,
                K       = data.K,
                gamma_M = data.gamma_M,
                K1      = data.K1,
            )

        elif data.calc_type == "bearing":
            from masonry import masonry_bearing_under_beam
            blocks = masonry_bearing_under_beam(
                label   = data.label,
                N_Ed    = (data.N_Ed_bear_kN or 50.0)     * kN,
                a_plate = (data.a_plate_mm   or 150.0)    * mm,
                b_plate = (data.b_plate_mm   or 200.0)    * mm,
                t_leaf  = (data.t_leaf_mm or data.thickness_mm) * mm,
                f_b     = data.f_b_MPa * MPa,
                f_m     = data.f_m_MPa * MPa,
                K       = data.K,
                gamma_M = data.gamma_M,
            )

        elif data.calc_type == "multi_ritter":
            from masonry import masonry_wall_multi_storey_ritter
            f_k = data.K * data.f_b_MPa**0.70 * data.f_m_MPa**0.30
            f_d = f_k / data.gamma_M
            floors  = data.floor_names or ["Story 1"]
            heights = data.heights_m   or [data.height_m]
            axials  = data.axial_loads_kN  or [data.N_k_kN * 1.35]
            shears  = data.shear_forces_kN or [0.0]
            blocks = masonry_wall_multi_storey_ritter(
                label                = data.label,
                floor_names          = floors,
                heights              = heights,
                wall_width           = data.wall_width_m or data.length_m,
                thickness            = data.thickness_mm,
                compressive_strength = round(f_k, 4),
                design_strength      = round(f_d, 4),
                unit_weight          = data.unit_weight_kNm2 or 5.0,
                axial_loads          = axials,
                shear_forces         = shears,
                top_moment           = data.top_moment_kNm,
                Kt                   = data.Kt,
            )

        elif data.calc_type == "plan_dist":
            from masonry import masonry_wall_plan_lateral_distribution
            elems = data.elements or [[0.228, 5.0, 2.5, 0.114]]
            blocks = masonry_wall_plan_lateral_distribution(
                label        = data.label,
                elements     = elems,
                x_max        = data.x_max_m       or 10.0,
                y_max        = data.y_max_m        or 10.0,
                floor_height = data.floor_height_m or data.height_m,
                D_x          = data.D_x,
                E_x          = data.E_x,
                D_y          = data.D_y,
                E_y          = data.E_y,
            )

        else:
            raise HTTPException(status_code=422,
                                detail=f"Unknown calc_type: {data.calc_type!r}")

        return blocks

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── Custom calc (variables + formulas + checks) ───────────────────────────────

class CustomCalcInput(BaseModel):
    title: str  = "Custom Calculation"
    items: list = []


def _parse_qty(value: float, unit_str: str):
    """Convert float + unit string to a forallpeople quantity (or plain float)."""
    if unit_str == "-" or not unit_str:
        return float(value)
    try:
        unit = eval(unit_str, _UNIT_NS, {})
        return float(value) * unit
    except Exception:
        return float(value)


def _fmt_qty(qty, result_unit: str = "-") -> str:
    """Format a scalar (forallpeople quantity or plain float) for display.

    If result_unit is given (e.g. 'kN*m'), the value is expressed in that unit
    by dividing out the unit quantity; the plain number is shown with the unit label.
    Falls back gracefully if the conversion fails (wrong dimensions or plain float).

    Numbers are always limited to 5 significant figures.
    """
    import re as _re

    # ── Try unit conversion if a result unit is requested ──────────────────
    if result_unit and result_unit not in ("-", ""):
        try:
            unit_qty  = eval(result_unit, _UNIT_NS, {})    # e.g. kN*m quantity
            converted = float(qty / unit_qty)               # dimensionless scalar
            unit_disp = (result_unit
                         .replace("**2", "²").replace("**3", "³").replace("**4", "⁴")
                         .replace("*", "·"))
            return f"{converted:.5g} {unit_disp}"
        except Exception:
            pass  # fall through to plain formatting below

    # ── Plain formatting (auto units from forallpeople or bare float) ───────
    try:
        s = str(qty)
        # forallpeople str looks like "5.432 kN·m"; plain float like "5.432"
        m = _re.match(r'^([+\-]?\d[\d.eE+\-]*)(.*)', s.strip())
        if m:
            num_str = m.group(1)
            rest    = m.group(2).strip()
            val     = float(num_str)
            num_fmt = f"{val:.5g}"
            return f"{num_fmt} {rest}".strip() if rest else num_fmt
        return s
    except Exception:
        return repr(qty)


@protected.post("/calc/custom-calc", tags=["Calculations"])
def calc_custom(data: CustomCalcInput):
    """
    Evaluate a sequence of items (var / formula / text / check) with full
    unit support and return a list of calc_core blocks for CalcResultView.
    """
    try:
        from calc_core import S, T, N, CALC_ROW, CheckContext

        blocks = [S(data.title)]
        ns:  dict = {}          # grows as we process each item
        chk = CheckContext()

        for item in data.items:
            itype = item.get("type", "")

            if itype == "text":
                content = item.get("content", "").strip()
                if content:
                    blocks.append(T(content))

            elif itype == "heading":
                # Section heading — breaks a long calculation into named sections
                content = item.get("content", "").strip()
                if content:
                    blocks.append(S(content))

            elif itype == "var":
                name = item.get("name", "").strip()
                if not name:
                    continue
                try:
                    unit_str = item.get("unit", "-")
                    qty      = _parse_qty(float(item.get("value", 0.0)), unit_str)
                    ns[name] = qty
                    unit_disp = (unit_str
                                 .replace("**2", "²").replace("**3", "³").replace("**4", "⁴")
                                 .replace("*", "·"))
                    val_str  = (f"{item['value']:.5g}" if unit_str == "-"
                                else f"{item['value']:.5g} {unit_disp}")
                    desc = item.get("description", "").strip()
                    blocks.append(CALC_ROW(name, desc, val_str))
                except Exception as exc:
                    blocks.append(N(f"Variable '{name}': {exc}"))

            elif itype == "formula":
                raw = item.get("expr", "").strip()
                if not raw or "=" not in raw:
                    continue
                lhs, rhs = raw.split("=", 1)
                lhs = lhs.strip()
                rhs = rhs.strip()
                try:
                    # Pre-process: ^ → **, × → *, · → * for eval
                    result_unit  = item.get("unit", "-") or "-"
                    result       = _safe_eval(_preprocess_expr(rhs), {**_UNIT_NS, **ns})
                    ns[lhs]      = result
                    result_str   = _fmt_qty(result, result_unit)
                    # Display: normalise to ^ and × notation (fmtCalcText handles the rest)
                    formula_disp = (rhs
                        .replace("**", "^")
                        .replace("×", "×").replace("·", "·")   # keep explicit symbols
                        .replace("*", " × ")
                        .replace("/", " / "))
                    blocks.append(CALC_ROW(lhs, formula_disp, result_str))
                except Exception as exc:
                    blocks.append(N(f"Formula '{raw}': {exc}"))

            elif itype == "check":
                label   = item.get("label", "Check")
                d_expr  = item.get("demand", "").strip()
                cap_raw = item.get("capacity", 1.0)
                cap_unt = item.get("unit", "-")
                if not d_expr:
                    continue
                try:
                    demand = _safe_eval(_preprocess_expr(d_expr), {**_UNIT_NS, **ns})
                    # Capacity can be a number (with unit) or an expression string
                    try:
                        capacity = _parse_qty(float(cap_raw), cap_unt)
                    except (ValueError, TypeError):
                        # Not a plain number — evaluate as an expression
                        capacity = _safe_eval(_preprocess_expr(str(cap_raw).strip()), {**_UNIT_NS, **ns})
                    blocks.append(chk.check(label, demand, capacity))
                except Exception as exc:
                    blocks.append(N(f"Check error in '{label}': {exc}"))

            elif itype == "conditional":
                name       = item.get("name", "").strip()
                cond_raw   = item.get("condition", "").strip()
                true_raw   = item.get("true_expr", "0").strip()
                false_raw  = item.get("false_expr", "0").strip()
                unit_str   = item.get("unit", "-")
                if not cond_raw:
                    continue
                try:
                    cond_result  = bool(_safe_eval(_preprocess_expr(cond_raw), {**_UNIT_NS, **ns}))
                    chosen_raw   = true_raw  if cond_result else false_raw
                    result       = _safe_eval(_preprocess_expr(chosen_raw), {**_UNIT_NS, **ns})
                    if name:
                        ns[name] = _parse_qty(float(result), unit_str) if unit_str != "-" else result
                    result_str   = _fmt_qty(ns[name]) if name else _fmt_qty(result)
                    branch_sym   = "✓" if cond_result else "✗"
                    chosen_disp  = (chosen_raw
                        .replace("**", "^").replace("*", "×").replace("/", " / "))
                    formula_disp = f"= {chosen_disp}  [{cond_raw} {branch_sym}]"
                    if name:
                        blocks.append(CALC_ROW(name, formula_disp, result_str))
                except Exception as exc:
                    blocks.append(N(f"Conditional '{name}': {exc}"))

        return blocks

    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


class PythonScriptInput(BaseModel):
    """Input for the free-form Python script block."""
    code: str


@protected.post("/calc/python-script", tags=["Calculations"])
def run_python_script(data: PythonScriptInput, user: dict = Depends(get_current_user)):
    """
    Execute arbitrary Python code and return stdout + base64-encoded figures.

    ⚠ SECURITY: exec() cannot be safely sandboxed at the Python level.
    Access is restricted to an explicit allow-list of trusted email addresses.
    Set the PYTHON_SCRIPT_ALLOWED_EMAILS env var (comma-separated) to control access.
    If the env var is not set, only the ADMIN_EMAIL is allowed.
    """
    import os as _os

    # ── Access control ────────────────────────────────────────────────────────
    # Python script runs exec() — it cannot be safely sandboxed.
    # Build the allowlist from (in order of priority):
    #   1. PYTHON_SCRIPT_ALLOWED_EMAILS  (comma-separated, Python-specific)
    #   2. ADMIN_EMAIL                   (single owner email)
    #   3. ALLOWED_EMAILS                (global app allowlist)
    # If none of these are set, deny everyone — fail closed, not open.
    raw_py   = _os.environ.get("PYTHON_SCRIPT_ALLOWED_EMAILS", "").strip()
    raw_adm  = _os.environ.get("ADMIN_EMAIL", "").strip()
    allowed: set[str] = {e.strip().lower() for e in raw_py.split(",") if e.strip()}
    if raw_adm:
        allowed.add(raw_adm.lower())
    if not allowed:
        # Fall back to global ALLOWED_EMAILS
        allowed = {e for e in _ALLOWED_EMAILS}   # already lower-cased
    if not allowed:
        # Nothing configured — deny everyone rather than allow everyone
        raise HTTPException(
            status_code=403,
            detail="Python Script execution is disabled: set ADMIN_EMAIL or "
                   "PYTHON_SCRIPT_ALLOWED_EMAILS in the server environment.",
        )

    caller = (user.get("email") or "").strip().lower()
    if caller not in allowed:
        raise HTTPException(
            status_code=403,
            detail="Python Script blocks are restricted to authorised users. "
                   "Contact the system administrator.",
        )

    import io
    import contextlib
    import traceback
    import base64
    import importlib

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.close("all")

    # Build a namespace with the standard engineering libraries pre-imported
    namespace: dict = {}
    for alias, mod_name in [
        ("np",     "numpy"),
        ("numpy",  "numpy"),
        ("pd",     "pandas"),
        ("pandas", "pandas"),
        ("scipy",  "scipy"),
    ]:
        try:
            namespace[alias] = importlib.import_module(mod_name)
        except ImportError:
            pass
    namespace["plt"] = plt
    namespace["matplotlib"] = matplotlib

    stdout_buf = io.StringIO()
    error = ""

    try:
        with contextlib.redirect_stdout(stdout_buf):
            exec(compile(data.code, "<python_script>", "exec"), namespace)
    except Exception:
        error = traceback.format_exc()

    # Capture every matplotlib figure as a base64 PNG
    figures_b64 = []
    for fig_num in plt.get_fignums():
        fig = plt.figure(fig_num)
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
        buf.seek(0)
        figures_b64.append(base64.b64encode(buf.read()).decode())
    plt.close("all")

    return {
        "output":  stdout_buf.getvalue(),
        "figures": figures_b64,          # list of base64 PNG strings
        "error":   error,
    }


# ── Euler-Bernoulli beam FEM ──────────────────────────────────────────────────

class SupportItem(BaseModel):
    x:    float = 0.0
    type: str   = "pin"    # "pin" | "roller" | "fixed"

class LoadItem(BaseModel):
    type:    str   = "udl"    # "udl" | "point" | "moment" | "trapezoidal"
    # UDL / trapezoidal
    w_kNm:  float | None = None   # UDL intensity (kN/m)
    w1_kNm: float | None = None   # trapezoidal left  (kN/m)
    w2_kNm: float | None = None   # trapezoidal right (kN/m)
    x1:     float | None = None   # start x (m)
    x2:     float | None = None   # end x   (m)
    # Point load / moment
    P_kN:   float | None = None   # point load (kN)
    M_kNm:  float | None = None   # moment (kNm)
    x:      float | None = None   # position (m)

class BeamFemInput(BaseModel):
    title:    str         = "Beam FEM Analysis"
    L:        float       = 6.0        # span [m]
    E_GPa:    float       = 210.0      # Young's modulus [GPa]
    I_cm4:    float       = 3000.0     # second moment of area [cmâ´]
    supports: list[SupportItem] = []
    loads:    list[LoadItem]    = []


@protected.post("/calc/beam-fem", tags=["Calculations"])
def calc_beam_fem(data: BeamFemInput):
    """
    Euler-Bernoulli beam FEM solver.
    Returns:
      _fig_b64 : base64 PNG of the 4-panel plot (layout · displacement · M · V)
      _summary : key results (M_Ed, V_Ed, delta_max, reactions)
      _result  : list of calc_core blocks ready for PDF export
    """
    import io, base64
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from calc_core import S, T, N, TBL

    try:
        from beam_fem import BeamFEM, summarise_beam_actions

        E   = data.E_GPa * 1e9          # Pa
        I   = data.I_cm4 * 1e-8         # mâ´  (1 cmâ´ = 1e-8 mâ´)
        L   = data.L

        beam = BeamFEM(length=L, E=E, I=I)

        # Default supports when none are given
        supports = data.supports or [
            SupportItem(x=0.0, type="pin"),
            SupportItem(x=L,   type="roller"),
        ]
        for sup in supports:
            beam.add_support(sup.x, sup.type)

        # Loads
        for load in (data.loads or []):
            lt = load.type
            if lt == "udl":
                x1 = load.x1 if load.x1 is not None else 0.0
                x2 = load.x2 if load.x2 is not None else L
                w  = (load.w_kNm or 0.0) * 1e3
                beam.add_udl(w, x1, x2)
            elif lt == "trapezoidal":
                x1 = load.x1 if load.x1 is not None else 0.0
                x2 = load.x2 if load.x2 is not None else L
                beam.add_trapezoidal_load(
                    (load.w1_kNm or 0.0) * 1e3,
                    (load.w2_kNm or 0.0) * 1e3,
                    x1, x2,
                )
            elif lt == "point":
                x_pos = load.x if load.x is not None else 0.0
                beam.add_point_load(x_pos, (load.P_kN or 0.0) * 1e3)
            elif lt == "moment":
                x_pos = load.x if load.x is not None else 0.0
                beam.add_point_moment(x_pos, (load.M_kNm or 0.0) * 1e3)

        beam.solve()

        # ── Figure ──────────────────────────────────────────────────────────
        # Build the 4-panel figure using the BeamFEM plotting internals but
        # without calling plt.show() (Agg backend makes it a no-op anyway).
        fig = beam.plot(title=data.title, save_as=None)
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=120, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        fig_b64 = base64.b64encode(buf.read()).decode()

        # ── Summary ──────────────────────────────────────────────────────────
        sm = summarise_beam_actions(beam, data.title)
        reactions_out = {}
        for x_pos, r in beam.reactions.items():
            reactions_out[f"{x_pos:.3f}"] = {
                k: round(v * 1e-3, 4) for k, v in r.items()
            }

        summary = {
            "M_Ed_kNm":     round(sm["M_Ed_Nm"]    / 1e3, 4),
            "x_M_Ed_m":     round(sm["x_M_Ed_m"],        4),
            "V_Ed_kN":      round(sm["V_Ed_N"]      / 1e3, 4),
            "x_V_Ed_m":     round(sm["x_V_Ed_m"],        4),
            "delta_max_mm": round(sm["delta_max_m"] * 1e3, 4),
            "x_delta_m":    round(sm["x_delta_max_m"],   4),
            "reactions":    reactions_out,
        }

        # ── calc_core blocks for PDF export ──────────────────────────────────
        result_blocks = [
            S(data.title),
            T(f"Span L = {L:.2f} m  |  E = {data.E_GPa:.0f} GPa  |  I = {data.I_cm4:.1f} cmâ´"),
        ]
        # Supports and loads summary
        sup_lines = [f"x={s.x:.2f} m ({s.type})" for s in supports]
        result_blocks.append(T("Supports: " + ",  ".join(sup_lines)))

        load_lines = []
        for ld in (data.loads or []):
            if ld.type == "udl":
                load_lines.append(f"UDL {ld.w_kNm:.1f} kN/m  [x={ld.x1:.2f}..{ld.x2:.2f} m]")
            elif ld.type == "trapezoidal":
                load_lines.append(f"Trapezoidal {ld.w1_kNm:.1f}→{ld.w2_kNm:.1f} kN/m  [x={ld.x1:.2f}..{ld.x2:.2f} m]")
            elif ld.type == "point":
                load_lines.append(f"Point {ld.P_kN:.1f} kN  @  x={ld.x:.2f} m")
            elif ld.type == "moment":
                load_lines.append(f"Moment {ld.M_kNm:.1f} kNm  @  x={ld.x:.2f} m")
        if load_lines:
            result_blocks.append(T("Loads: " + ",  ".join(load_lines)))

        # Results table
        result_blocks.append(TBL(
            ["Result", "Value", "Location"],
            [
                ["Max moment M_Ed",     f"{summary['M_Ed_kNm']:.3f} kNm", f"x = {summary['x_M_Ed_m']:.2f} m"],
                ["Max shear V_Ed",      f"{summary['V_Ed_kN']:.3f} kN",   f"x = {summary['x_V_Ed_m']:.2f} m"],
                ["Max deflection δ",    f"{summary['delta_max_mm']:.3f} mm", f"x = {summary['x_delta_m']:.2f} m"],
            ],
        ))
        # Reactions
        for x_str, r in reactions_out.items():
            parts = []
            if "V" in r:
                parts.append(f"R_v = {r['V']:+.3f} kN")
            if "M" in r:
                parts.append(f"R_M = {r['M']:+.3f} kNm")
            result_blocks.append(T(f"Reaction at x={x_str} m: " + ",  ".join(parts)))

        return {
            "_fig_b64": fig_b64,
            "_summary": summary,
            "_result":  result_blocks,
        }

    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── 2D Frame FEM (OpenSeesPy) ─────────────────────────────────────────────────

class FrameNodeIn(BaseModel):
    id:  int
    x:   float
    y:   float

class FrameElemIn(BaseModel):
    id:       int
    ni:       int
    nj:       int
    type:     str   = "beam"   # "beam" | "truss"
    releases: str   = "none"   # "none" | "both" | "start" | "end"
    E_GPa:    float = 210.0
    A_cm2:    float = 28.5
    I_cm4:    float = 1943.0
    preset:   str   = ""       # UI label, ignored by solver

class FrameSupportIn(BaseModel):
    node_id: int
    ux:      bool = False
    uy:      bool = False
    rz:      bool = False

class FrameLoadIn(BaseModel):
    type:     str        # "nodal" | "udl"
    node_id:  int | None = None
    elem_id:  int | None = None
    Fx_kN:    float = 0.0
    Fy_kN:    float = 0.0
    Mz_kNm:   float = 0.0
    wy_kNm:   float = 0.0   # UDL vertical (positive = downward)
    wx_kNm:   float = 0.0   # UDL horizontal (positive = rightward)

class FrameFemInput(BaseModel):
    title:    str                    = "2D Frame Analysis"
    nodes:    list[FrameNodeIn]      = []
    elements: list[FrameElemIn]      = []
    supports: list[FrameSupportIn]   = []
    loads:    list[FrameLoadIn]      = []


@protected.post("/calc/frame-fem", tags=["Calculations"])
def calc_frame_fem(data: FrameFemInput):
    """
    2D Frame / Truss FEM using OpenSeesPy.
    Returns a figure (base64 PNG), node displacements, reactions,
    and element section forces (N, V, M along each element).
    """
    try:
        from frame_fem import solve_and_plot

        nodes    = [n.model_dump()  for n in data.nodes]
        elements = [e.model_dump()  for e in data.elements]
        supports = [s.model_dump()  for s in data.supports]
        loads    = [ld.model_dump() for ld in data.loads]

        res = solve_and_plot(nodes, elements, supports, loads, title=data.title)
        return res

    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="openseespy is not installed on this server. "
                   "Run: pip install openseespy",
        )
    except Exception as exc:
        import traceback
        raise HTTPException(status_code=422, detail=str(exc) + "\n" + traceback.format_exc())


# ── Portal Frame FEM (OpenSeesPy) ─────────────────────────────────────────────

class PortalRafterLoad(BaseModel):
    rafter_idx: int   = 0      # 0-based rafter index
    wy_kNm:     float = -10.0  # kN/m, negative = downward

class PortalLateralLoad(BaseModel):
    col_idx: int   = 0    # 0-based column index
    Fx_kN:   float = 0.0  # horizontal force at eave [kN]

class PortalFrameFemInput(BaseModel):
    title:          str   = "Portal Frame FEM"
    n_bays:         int   = 1
    h_bay_m:        float = 5.0
    w_bay_m:        float = 10.0
    E_GPa:          float = 200.0
    A_cm2:          float = 300.0    # cross-section area [cm²]
    Iz_cm4:         float = 30000.0  # second moment of area [cm⁴]
    rafter_loads:   list[PortalRafterLoad]   = []
    lateral_loads:  list[PortalLateralLoad]  = []


@protected.post("/calc/portal-frame-fem", tags=["Calculations"])
def calc_portal_frame_fem(data: PortalFrameFemInput):
    """
    2D elastic portal frame FEM using OpenSeesPy + OpsVis.
    Returns three matplotlib figures (deformed shape, M, V) as base64 PNGs,
    a summary dict, and calc_core blocks for PDF export.
    """
    import io
    import base64
    import traceback
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    try:
        from portal_frame_fem import PortalFrameFEM
        import opsvis as opsv
        from calc_core import S, T, TBL

        A  = data.A_cm2  * 1e-4   # cm² → m²
        Iz = data.Iz_cm4 * 1e-8   # cm⁴ → m⁴
        E  = data.E_GPa  * 1e9    # GPa → Pa

        frame = PortalFrameFEM(
            n_bays = data.n_bays,
            h_bay  = data.h_bay_m,
            w_bay  = data.w_bay_m,
            E=E, A=A, Iz=Iz,
        )

        for rl in data.rafter_loads:
            frame.add_rafter_udl(rl.rafter_idx, rl.wy_kNm * 1e3)

        for ll in data.lateral_loads:
            frame.add_lateral_load(ll.col_idx, ll.Fx_kN * 1e3)

        frame.solve()

        def _fig_to_b64(fig):
            buf = io.BytesIO()
            fig.savefig(buf, format="png", dpi=130, bbox_inches="tight")
            buf.seek(0)
            return base64.b64encode(buf.read()).decode()

        # Auto scale factors — target max diagram ≈ 25% of bay width
        ref_size = data.w_bay_m * data.n_bays * 0.25
        max_M = max((max(abs(f[2]), abs(f[5])) for f in frame.ele_forces.values()), default=1.0)
        max_V = max((max(abs(f[1]), abs(f[4])) for f in frame.ele_forces.values()), default=1.0)
        mFac = ref_size / max_M if max_M > 0 else 5e-6
        vFac = ref_size / max_V if max_V > 0 else 15e-6

        figs_b64 = []

        # Figure 1 — deformed shape
        plt.close("all")
        opsv.plot_defo(
            fig_wi_he=(12, 6),
            fmt_defo={'color': 'red', 'linestyle': (0, (4, 5)), 'linewidth': 1.5},
            fmt_undefo={'color': '#555', 'linestyle': 'solid', 'linewidth': 1.5},
        )
        plt.title(f"{data.title} — Deflection")
        plt.xlabel("x [m]"); plt.ylabel("y [m]"); plt.grid(True); plt.tight_layout()
        figs_b64.append(_fig_to_b64(plt.gcf()))
        plt.close("all")

        # Figure 2 — bending moment
        opsv.section_force_diagram_2d('M', mFac, fig_wi_he=(12, 6),
                                      fmt_secforce1={'color': 'green'},
                                      fmt_secforce2={'color': 'green'})
        plt.title(f"{data.title} — Bending Moment")
        plt.xlabel("x [m]"); plt.ylabel("y [m]"); plt.grid(True); plt.tight_layout()
        figs_b64.append(_fig_to_b64(plt.gcf()))
        plt.close("all")

        # Figure 3 — shear force
        opsv.section_force_diagram_2d('V', vFac, fig_wi_he=(12, 6),
                                      fmt_secforce1={'color': 'steelblue'},
                                      fmt_secforce2={'color': 'steelblue'})
        plt.title(f"{data.title} — Shear Force")
        plt.xlabel("x [m]"); plt.ylabel("y [m]"); plt.grid(True); plt.tight_layout()
        figs_b64.append(_fig_to_b64(plt.gcf()))
        plt.close("all")

        # Summary
        ux, ux_node = frame.max_lateral_disp()
        uy, uy_node = frame.max_vertical_disp()
        M_max, M_ele = frame.max_moment()

        reactions_out = {}
        for i in range(frame.n_cols):
            tag = frame.base_node(i)
            R = frame.node_reactions[tag]
            reactions_out[f"col{i}"] = {
                "Fx_kN": round(R[0] * 1e-3, 3),
                "Fy_kN": round(R[1] * 1e-3, 3),
                "Mz_kNm": round(R[2] * 1e-3, 3),
            }

        summary = {
            "max_lateral_disp_mm":    round(ux * 1e3, 3),
            "max_lateral_disp_node":  ux_node,
            "max_vertical_disp_mm":   round(uy * 1e3, 3),
            "max_vertical_disp_node": uy_node,
            "max_moment_kNm":         round(M_max * 1e-3, 3),
            "max_moment_ele":         M_ele,
            "reactions":              reactions_out,
        }

        # calc_core blocks for PDF
        result_blocks = [
            S(data.title),
            T(f"Portal frame  {data.n_bays} bay(s) × {data.w_bay_m:.1f} m wide, "
              f"height {data.h_bay_m:.1f} m. "
              f"E = {data.E_GPa:.0f} GPa  A = {data.A_cm2:.1f} cm²  Iz = {data.Iz_cm4:.0f} cm⁴"),
            TBL(
                ["Result", "Value", "Node / Element"],
                [
                    ["Max lateral disp. δ_x", f"{summary['max_lateral_disp_mm']:.2f} mm",
                     f"node {summary['max_lateral_disp_node']}"],
                    ["Max vertical disp. δ_y", f"{summary['max_vertical_disp_mm']:.2f} mm",
                     f"node {summary['max_vertical_disp_node']}"],
                    ["Max bending moment M", f"{summary['max_moment_kNm']:.2f} kNm",
                     f"element {summary['max_moment_ele']}"],
                ],
            ),
            T("Support reactions:"),
        ]
        for col_key, R in reactions_out.items():
            result_blocks.append(
                T(f"  {col_key}: Fx = {R['Fx_kN']:+.2f} kN  "
                  f"Fy = {R['Fy_kN']:+.2f} kN  "
                  f"Mz = {R['Mz_kNm']:+.2f} kNm")
            )

        return {
            "_figs_b64": figs_b64,
            "_summary":  summary,
            "_result":   result_blocks,
        }

    except ImportError as exc:
        raise HTTPException(
            status_code=501,
            detail=f"Missing dependency: {exc}. "
                   "Run: pip install openseespy opsvis",
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc) + "\n" + traceback.format_exc())


# ── Frame Load Cases (EN 1990) ────────────────────────────────────────────────

class FrameLoadIn(BaseModel):
    load_type:  str         # 'udl' | 'nodal'
    # UDL
    elem_id:    int | None  = None
    member_id:  int | None  = None   # member group → expanded to elem_ids by frontend
    value_kNm:  float       = 0.0
    direction:  str         = 'vertical'   # 'vertical' | 'projected' | 'horizontal'
    # Nodal
    node_id:    int | None  = None
    Fx_kN:      float       = 0.0
    Fy_kN:      float       = 0.0
    Mz_kNm:     float       = 0.0

class FrameCaseIn(BaseModel):
    id:    str               # e.g. 'G', 'S', 'W'
    type:  str               # 'permanent' | 'snow' | 'wind' | 'imposed'
    loads: list[FrameLoadIn] = []

class FrameLoadCasesInput(BaseModel):
    title:              str              = "Frame Load Cases"
    consequence_class:  str              = "CC2"
    method:             str              = "6.10ab"
    cases:              list[FrameCaseIn] = []


@protected.post("/calc/frame-load-cases", tags=["Calculations"])
def calc_frame_load_cases(data: FrameLoadCasesInput):
    """
    Generate EN 1990 ULS load combinations from named load cases.
    Returns combination table (for display) and _exports for use by FEM block.
    """
    try:
        from frame_load_cases import generate_combinations, combinations_to_calc_blocks

        cases = [c.model_dump() for c in data.cases]
        combos = generate_combinations(cases, data.method, data.consequence_class)

        result_blocks = combinations_to_calc_blocks(
            cases, combos, data.consequence_class, data.method
        )

        return {
            "_exports": {"combinations": combos},
            "_result":  result_blocks,
        }

    except Exception as exc:
        import traceback
        raise HTTPException(status_code=422,
                            detail=str(exc) + "\n" + traceback.format_exc())


# ── General 2D Frame FEM (OpenSeesPy + OpsVis) ────────────────────────────────

class GenFrameNodeIn(BaseModel):
    id:  int
    x:   float
    y:   float

class GenFrameElemIn(BaseModel):
    id:       int
    ni:       int
    nj:       int
    type:     str   = "beam"   # "beam" | "truss"
    release:  str   = "none"   # "none" | "start" | "end" | "both"
    E_GPa:    float = 210.0
    A_cm2:    float = 39.1
    Iz_cm4:   float = 3892.0
    # Section reference. When given, E/A/I are derived from it so the analysis
    # and the member check below it cannot describe different sections.
    # Left empty, the raw values above are used unchanged.
    material: str | None = None   # "steel" | "timber"
    section:  str | None = None   # "IPE300" or "140x360" (mm)
    grade:    str | None = None   # "S355" / "GL24c" / "C24"

class GenFrameSupportIn(BaseModel):
    node_id: int
    ux:      bool = False
    uy:      bool = False
    rz:      bool = False

class GenFrameLoadIn(BaseModel):
    type:       str         # "nodal" | "udl"
    node_id:    int | None = None
    elem_id:    int | None = None
    Fx_kN:      float = 0.0
    Fy_kN:      float = 0.0
    Mz_kNm:     float = 0.0
    wy_kNm:     float = 0.0   # legacy: positive = downward, local y
    wx_kNm:     float = 0.0
    direction:  str | None = None   # 'vertical' | 'projected' | 'horizontal' | 'perpendicular'
    value_kNm:  float = 0.0         # magnitude for direction-based loads
    target:     str | None = None   # 'elem' | 'member' (expanded client-side before sending)

class FrameComboLoadIn(BaseModel):
    """One load inside a combination (from Frame Load Cases block)."""
    load_type:  str
    elem_id:    int | None = None
    member_id:  int | None = None   # preserved for completeness (expanded client-side)
    value_kNm:  float      = 0.0
    direction:  str        = 'vertical'
    node_id:    int | None = None
    Fx_kN:      float      = 0.0
    Fy_kN:      float      = 0.0
    Mz_kNm:     float      = 0.0

class FrameComboIn(BaseModel):
    name:               str
    loads:              list[FrameComboLoadIn] = []
    governing_duration: str = 'short'   # EN 1995-1-1 §2.2.3: shortest-duration variable load

class GenFrameEqualDOFIn(BaseModel):
    r_node: int            # retained node
    c_node: int            # constrained node
    dofs:   list[int] = [1, 2]  # DOFs to tie: 1=ux, 2=uy, 3=rz

class GenFrameFemInput(BaseModel):
    title:        str                       = "2D Frame FEM"
    nodes:        list[GenFrameNodeIn]      = []
    elements:     list[GenFrameElemIn]      = []
    supports:     list[GenFrameSupportIn]   = []
    loads:        list[GenFrameLoadIn]      = []
    combinations: list[FrameComboIn]       = []
    equal_dofs:   list[GenFrameEqualDOFIn] = []  # pin joints between co-located nodes
    # Ordinate scaling on the section-force diagrams. 1.0 = automatic, which
    # sizes the largest ordinate to a fixed share of the model. A frame whose
    # curves crowd its own columns wants it smaller; a nearly straight
    # diagram wants it larger. It changes the drawing, never the numbers.
    diagram_scale: float = 1.0


@protected.post("/calc/general-frame-fem/preview", tags=["Calculations"])
def preview_general_frame_fem(data: GenFrameFemInput):
    """
    Draw the static structural model (geometry, supports, releases, loads).
    No FEM analysis — pure matplotlib. Returns { _model_b64 }.
    """
    import traceback
    try:
        from general_frame_fem import plot_model
        import math

        nodes    = [n.model_dump() for n in data.nodes]
        elements = [e.model_dump() for e in data.elements]
        supports = [s.model_dump() for s in data.supports]
        loads    = [l.model_dump() for l in data.loads]

        xs = [n['x'] for n in nodes]; ys = [n['y'] for n in nodes]
        ref_size = max(max(xs) - min(xs), max(ys) - min(ys), 1.0)

        b64 = plot_model(data.title, nodes, elements, supports, loads, ref_size)
        return { "_model_b64": b64 }

    except Exception as exc:
        raise HTTPException(status_code=422,
                            detail=str(exc) + "\n" + traceback.format_exc())


class GenFrameRedrawInput(BaseModel):
    """
    Everything the diagrams need and nothing the solver needs.

    The section forces come from a run that already happened. Redrawing does
    not re-solve — it cannot, there is no load here — so the scale slider can
    never quietly change a design action, only how tall the curve is drawn.
    """
    nodes:      list[GenFrameNodeIn]     = []
    elements:   list[GenFrameElemIn]     = []
    supports:   list[GenFrameSupportIn]  = []
    ele_forces: dict[str, list[float]]   = {}   # {elem_id: [Ni,Vi,Mi,Nj,Vj,Mj]}
    ele_udl:    dict[str, list[float]]   = {}   # {elem_id: [wy, wx]} as eleLoad
    node_disps: dict[str, list[float]]   = {}   # {node_id: [ux, uy, rz]}
    scale:      float                    = 1.0


@protected.post("/calc/general-frame-fem/diagrams", tags=["Calculations"])
def redraw_general_frame_fem(data: GenFrameRedrawInput):
    """
    Redraw the four result figures at a different ordinate scale.
    Pure matplotlib — no OpenSeesPy. Returns { _figs_b64 }.
    """
    import traceback
    try:
        from fem_diagrams import render_all
        from section_resolver import apply_sections

        nodes    = [n.model_dump() for n in data.nodes]
        elements = apply_sections([e.model_dump() for e in data.elements])
        supports = [s.model_dump() for s in data.supports]
        if not nodes or not elements:
            raise ValueError("Ingen model at tegne.")

        ele_forces = {int(k): list(v) for k, v in data.ele_forces.items()}
        ele_udl    = {int(k): (float(v[0]), float(v[1]))
                      for k, v in data.ele_udl.items() if len(v) >= 2}
        node_disps = {int(k): list(v) for k, v in data.node_disps.items()}

        xs = [n['x'] for n in nodes]; ys = [n['y'] for n in nodes]
        ref_size = max(max(xs) - min(xs), max(ys) - min(ys), 1.0)
        scale = max(0.2, min(float(data.scale or 1.0), 4.0))

        return {"_figs_b64": render_all(nodes, elements, supports, ele_forces,
                                        ele_udl, node_disps, ref_size,
                                        scale=scale)}
    except Exception as exc:
        raise HTTPException(status_code=422,
                            detail=str(exc) + "\n" + traceback.format_exc())


@protected.post("/calc/general-frame-fem", tags=["Calculations"])
def calc_general_frame_fem(data: GenFrameFemInput):
    """
    General 2D frame / truss FEM using OpenSeesPy.
    When combinations are supplied (from a Frame Load Cases block) the solver
    runs once per combination and returns envelope M/V/N per element.
    Otherwise runs with the flat loads list (simple mode).
    """
    import traceback
    try:
        from general_frame_fem import (ModelError, solve, solve_combinations,
                                       make_figures, summarise, plot_model,
                                       compute_buckling_lengths, compute_alpha_cr)
        from section_resolver import apply_sections
        from calc_core import S, T, TBL
        import math

        nodes    = [n.model_dump() for n in data.nodes]
        # Derive E/A/I from each element's section reference where it has one,
        # so the analysis and the member check read the same section.
        elements = apply_sections([e.model_dump() for e in data.elements])
        supports = [s.model_dump() for s in data.supports]
        loads    = [l.model_dump() for l in data.loads]
        combos      = [c.model_dump() for c in data.combinations]
        equal_dofs  = [e.model_dump() for e in data.equal_dofs]

        xs = [n['x'] for n in nodes]; ys = [n['y'] for n in nodes]
        ref_size = max(max(xs) - min(xs), max(ys) - min(ys), 1.0)

        model_fig = plot_model(data.title, nodes, elements, supports,
                               loads or [], ref_size)

        def _diagram_state(r):
            """
            What it takes to draw the curves again without solving again.
            Small next to the PNGs it replaces, and it is what lets the
            ordinate scale be a slider instead of another full run.
            """
            return {
                'ele_forces': {str(k): [float(x) for x in v]
                               for k, v in r['ele_forces'].items()},
                'ele_udl':    {str(k): [float(v[0]), float(v[1])]
                               for k, v in (r.get('ele_udl') or {}).items()},
                'node_disps': {str(k): [float(x) for x in v]
                               for k, v in r['node_disps'].items()},
            }

        # ── Combination mode ──────────────────────────────────────────────────
        if combos:
            scale = max(0.2, min(float(data.diagram_scale or 1.0), 4.0))
            envelope, timber_envelope, all_results = solve_combinations(
                nodes, elements, supports, combos, equal_dofs,
                make_figs=True, ref_size=ref_size, diagram_scale=scale,
            )

            combo_figs = [{'name': r['name'], 'figs': r.get('figs', []),
                           'state': _diagram_state(r)}
                          for r in all_results]

            # _figs_b64 = static model + governing combo (backward compat)
            best_combo_name = max(envelope.values(), key=lambda v: v['M_max_kNm'],
                                  default={}).get('M_combo', combos[0]['name'])
            best_res = next((r for r in all_results if r['name'] == best_combo_name),
                             all_results[0])
            best_figs = next((c['figs'] for c in combo_figs if c['name'] == best_combo_name),
                              combo_figs[0]['figs'])

            # Buckling lengths from the governing combination
            buck_lengths = compute_buckling_lengths(nodes, elements, supports,
                                                    best_res['ele_forces'],
                                                    best_res.get('ele_extremes'))

            figs_b64 = [model_fig] + best_figs

            # Build envelope summary for frontend
            summary = summarise(nodes, elements,
                                best_res['node_disps'], best_res['node_reactions'],
                                best_res['ele_forces'], supports, [],
                                best_res.get('ele_extremes'))
            summary['envelope']          = envelope
            summary['timber_envelope']   = timber_envelope   # {eid: {sc: {M_Ed, V_Ed, duration, combo}}}
            summary['combinations']      = [r['name'] for r in all_results]
            summary['combo_figs']        = combo_figs   # [{name, figs:[defo,M,V,N], state}]
            summary['buckling_lengths']  = buck_lengths
            summary['diagram_scale']     = scale
            summary['diagram_state']     = _diagram_state(best_res)
            # compute_alpha_cr re-solves the model. That used to have to happen
            # after the figures, which opsvis read off the live OpenSeesPy
            # state; the diagrams are drawn from section forces now, so the
            # order is free.
            summary['alpha_cr'] = compute_alpha_cr(
                nodes, elements, supports, best_res['ele_forces'],
                best_res['node_reactions'], equal_dofs,
            )

            result_blocks = [S(data.title), T(f'{len(combos)} load combinations analysed')]
            result_blocks.append(TBL(
                ['Element', 'M_max (kNm)', 'Governing combo (M)',
                 'V_max (kN)', 'N_max (kN)'],
                [[str(eid),
                  f"{v['M_max_kNm']:.2f}", v['M_combo'],
                  f"{v['V_max_kN']:.2f}", f"{v['N_max_kN']:.2f}"]
                 for eid, v in envelope.items()],
            ))

        # ── Simple mode (flat loads) ──────────────────────────────────────────
        else:
            scale = max(0.2, min(float(data.diagram_scale or 1.0), 4.0))
            res = solve(nodes, elements, supports, loads, equal_dofs)
            buck_lengths = compute_buckling_lengths(nodes, elements, supports,
                                                    res['ele_forces'],
                                                    res.get('ele_extremes'))
            figs_b64 = [model_fig] + make_figures(
                data.title, nodes, elements, supports, loads,
                res['ele_forces'], res['node_disps'], ref_size,
                ele_udl=res.get('ele_udl', {}), scale=scale,
            )
            summary = summarise(nodes, elements,
                                res['node_disps'], res['node_reactions'],
                                res['ele_forces'], supports, loads,
                                res.get('ele_extremes'))
            summary['buckling_lengths'] = buck_lengths
            summary['diagram_scale']    = scale
            summary['diagram_state']    = _diagram_state(res)
            summary['alpha_cr'] = compute_alpha_cr(
                nodes, elements, supports, res['ele_forces'],
                res['node_reactions'], equal_dofs,
            )
            result_blocks = [
                S(data.title),
                T(f"{len(nodes)} nodes · {len(elements)} elements"),
                TBL(["Result", "Value", "Location"], [
                    ["Max δ_x", f"{summary['max_ux_mm']:.2f} mm",
                     f"node {summary['max_ux_node']}"],
                    ["Max δ_y", f"{summary['max_uy_mm']:.2f} mm",
                     f"node {summary['max_uy_node']}"],
                    ["Max M",   f"{summary['max_moment_kNm']:.2f} kNm",
                     f"element {summary['max_moment_ele']}"],
                ]),
            ]
            for nid, R in summary['reactions'].items():
                result_blocks.append(
                    T(f"  Node {nid}: Fx={R['Fx_kN']:+.2f} kN  "
                      f"Fy={R['Fy_kN']:+.2f} kN  Mz={R['Mz_kNm']:+.2f} kNm")
                )

        return {"_figs_b64": figs_b64, "_summary": summary, "_result": result_blocks}

    # ImportError is handled first on purpose: ModelError is imported inside the
    # try block, so it is only a bound name once that import has succeeded.
    except ImportError as exc:
        raise HTTPException(status_code=501,
                            detail=f"Missing dependency: {exc}. pip install openseespy")
    except ModelError as exc:
        # The model itself is the problem, and the message says how — send it
        # through as-is. A traceback here would only bury the explanation.
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422,
                            detail=str(exc) + "\n" + traceback.format_exc())


class RcColumnInput(BaseModel):
    label:      str   = "C1"
    h_mm:       float = 300.0
    b_mm:       float = 300.0
    c_mm:       float = 40.0
    Ls_mm:      float = 3500.0
    beta_eff:   float = 1.0
    fck_mpa:    float = 30.0
    fyk_mpa:    float = 500.0
    gamma_c:    float = 1.5
    gamma_s:    float = 1.15
    da_c_mm:    float = 16.0
    n_c:        int   = 2
    da_t_mm:    float = 16.0
    n_t:        int   = 2
    load_cases: list  = []   # [{"label":"LC1","NEd_kN":400,"M0Ed_kNm":20}, ...]


@protected.post("/calc/rc-column", tags=["Calculations"])
def calc_rc_column(data: RcColumnInput):
    """EN 1992-1-1 RC column check (bending + axial + slenderness)."""
    try:
        from concrete_column import concrete_column_rect

        load_cases_fmt = [
            {"label": lc.get("label", "LC"), "NEd_kN": lc.get("NEd_kN", 0.0),
             "M0Ed_kNm": lc.get("M0Ed_kNm", 0.0)}
            for lc in (data.load_cases or [])
        ] or None

        blocks = concrete_column_rect(
            label    = data.label,
            h_mm     = data.h_mm,
            b_mm     = data.b_mm,
            c_mm     = data.c_mm,
            da_c_mm  = data.da_c_mm,
            n_c      = data.n_c,
            da_t_mm  = data.da_t_mm,
            n_t      = data.n_t,
            fck_mpa  = data.fck_mpa,
            fyk_mpa  = data.fyk_mpa,
            gamma_c  = data.gamma_c,
            gamma_s  = data.gamma_s,
            Ls_mm    = data.Ls_mm,
            beta_eff = data.beta_eff,
            load_cases = load_cases_fmt,
        )
        return blocks

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── EN 1992-1-1 — RC one-way slab ─────────────────────────────────────────────

class RcSlabInput(BaseModel):
    label:         str   = "D1"
    span_m:        float = 5.0
    h_mm:          float = 200.0
    d_mm:          float = 165.0
    g_k_kNm2:      float = 3.5
    q_k_kNm2:      float = 2.5
    fck_MPa:       float = 30.0
    fyk_MPa:       float = 500.0
    As_prov_mm2m:  float | None = None
    gamma_C:       float = 1.5
    gamma_S:       float = 1.15
    cover_mm:      float = 35.0


@protected.post("/calc/rc-slab", tags=["Calculations"])
def calc_rc_slab(data: RcSlabInput):
    """EN 1992-1-1 one-way simply supported RC slab check."""
    try:
        from rc_slab import rc_slab_oneway

        blocks = rc_slab_oneway(
            label         = data.label,
            span_m        = data.span_m,
            h_mm          = data.h_mm,
            d_mm          = data.d_mm,
            g_k_kNm2      = data.g_k_kNm2,
            q_k_kNm2      = data.q_k_kNm2,
            fck_MPa       = data.fck_MPa,
            fyk_MPa       = data.fyk_MPa,
            As_prov_mm2m  = data.As_prov_mm2m,
            gamma_C       = data.gamma_C,
            gamma_S       = data.gamma_S,
            cover_mm      = data.cover_mm,
        )
        return blocks

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── EN 1991-1-4 — Wind load ───────────────────────────────────────────────────

class WindLoadInput(BaseModel):
    label:             str   = "W1"
    terrain_category:  str   = "II"
    v_b0_ms:           float = 24.0
    z_ref_m:           float = 8.0
    h_m:               float = 8.0
    b_m:               float = 10.0
    d_m:               float = 12.0
    c_dir:             float = 1.0
    c_season:          float = 1.0
    c_pe_windward:     float = 0.8
    c_pe_leeward:      float = -0.5
    c_pi:              float = 0.2
    rho_air:           float = 1.25


@protected.post("/calc/wind-load", tags=["Calculations"])
def calc_wind_load(data: WindLoadInput):
    """EN 1991-1-4 + DK NA wind load calculation."""
    try:
        from wind_load import wind_load

        blocks = wind_load(
            label            = data.label,
            terrain_category = data.terrain_category,
            v_b0_ms          = data.v_b0_ms,
            z_ref_m          = data.z_ref_m,
            h_m              = data.h_m,
            b_m              = data.b_m,
            d_m              = data.d_m,
            c_dir            = data.c_dir,
            c_season         = data.c_season,
            c_pe_windward    = data.c_pe_windward,
            c_pe_leeward     = data.c_pe_leeward,
            c_pi             = data.c_pi,
            rho_air          = data.rho_air,
        )
        return blocks

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── EN 1991-1-3 — Snow load ───────────────────────────────────────────────────

class SnowLoadInput(BaseModel):
    label:         str   = "SN1"
    roof_type:     str   = "pitched"
    alpha_deg:     float = 20.0
    s_k_kNm2:      float = 1.0
    dk_zone:       str   = "1"
    C_e:           float = 1.0
    C_t:           float = 1.0
    roof_span_m:   float = 8.0
    eave_height_m: float = 3.0
    gamma_s:       float = 1.5
    a_m:           float = 0.0   # rafter spacing — if > 0, show per-rafter load


@protected.post("/calc/snow-load", tags=["Calculations"])
def calc_snow_load(data: SnowLoadInput):
    """EN 1991-1-3 + DK NA snow load on roof."""
    try:
        from snow_load import snow_load

        blocks = snow_load(
            label         = data.label,
            roof_type     = data.roof_type,
            alpha_deg     = data.alpha_deg,
            s_k_kNm2      = data.s_k_kNm2,
            dk_zone       = data.dk_zone,
            C_e           = data.C_e,
            C_t           = data.C_t,
            roof_span_m   = data.roof_span_m,
            eave_height_m = data.eave_height_m,
            gamma_s       = data.gamma_s,
            a_m           = data.a_m,
        )
        return blocks

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── Roof dead load (EN 1991-1-1) ─────────────────────────────────────────────

class RoofLayerIn(BaseModel):
    description: str   = ""
    g_kNm2:      float = 0.0   # load per m² of roof surface [kN/m²]

class RoofDeadLoadInput(BaseModel):
    title:      str              = "Roof Dead Load"
    label:      str              = "G1"
    alpha_deg:  float            = 30.0   # roof pitch [°]
    a_m:        float            = 1.0    # rafter spacing / tributary width [m]
    layers:     list[RoofLayerIn] = []
    b_mm:       float            = 45.0   # rafter width  [mm]
    h_mm:       float            = 145.0  # rafter height [mm]
    rho_kgm3:   float            = 380.0  # timber density [kg/m³]

@protected.post("/calc/roof-dead-load", tags=["Calculations"])
def calc_roof_dead_load(data: RoofDeadLoadInput):
    """Roof permanent load: cladding layers + rafter self-weight → g_k per rafter [kN/m, horizontal]."""
    try:
        import math
        from calc_core import S, T, N, TBL, CALC_ROW, MH

        cos_a = math.cos(math.radians(data.alpha_deg))

        # ── Cladding layers ───────────────────────────────────────────────────
        g_tag = sum(l.g_kNm2 for l in data.layers)
        # Convert kN/m² (roof surface) → kN/m (horizontal projection, per rafter)
        g_cladding = g_tag / cos_a * data.a_m

        # ── Rafter self-weight ────────────────────────────────────────────────
        rho_kNm3    = data.rho_kgm3 * 9.81 / 1000           # kN/m³
        g_rafter    = (data.b_mm/1000) * (data.h_mm/1000) * rho_kNm3 / cos_a  # kN/m horiz.

        g_k = round(g_cladding + g_rafter, 3)

        blocks = []
        blocks.append(MH(
            f"{data.label} — Roof Dead Load  (EN 1991-1-1)",
            f"α = {data.alpha_deg:.1f}°  ·  cos α = {cos_a:.4f}  ·  a = {data.a_m:.2f} m",
            "general",
        ))

        # Layer table
        blocks.append(S("Tagopbygning — karakteristiske værdier per m² tagflade"))
        headers = ["Lag", "g_k  [kN/m²]"]
        rows    = [[l.description, f"{l.g_kNm2:.3f}"] for l in data.layers]
        rows.append(["Total  g_tag", f"{g_tag:.3f}"])
        blocks.append(TBL(headers, rows))

        # Conversion to horizontal projection, per rafter
        blocks.append(S("Omregning til vandret projektion per spær"))
        blocks += [
            CALC_ROW("cos α",      f"cos({data.alpha_deg:.1f}°)",                   f"{cos_a:.4f}"),
            CALC_ROW("a",          "Spærafstand (tværafstand)",                      f"{data.a_m:.2f} m"),
            CALC_ROW("g_tag,proj", "= g_tag / cos α × a",                           f"{g_cladding:.3f} kN/m"),
        ]

        # Rafter self-weight
        blocks.append(S("Spær egenlast"))
        blocks += [
            CALC_ROW("b × h",      f"{data.b_mm:.0f} × {data.h_mm:.0f} mm",         f"{data.b_mm/1000*data.h_mm/1000*1e6:.0f} mm²"),
            CALC_ROW("ρ",          "Rumvægt",                                        f"{data.rho_kgm3:.0f} kg/m³  =  {rho_kNm3:.4f} kN/m³"),
            CALC_ROW("g_spær",     "= b · h · ρ / cos α  (vandret projektion)",     f"{g_rafter:.3f} kN/m"),
        ]

        # Total
        blocks.append(S("Samlet egenlast per spær"))
        blocks += [
            CALC_ROW("g_k", "= g_tag,proj + g_spær", f"{g_k:.3f} kN/m  (vandret projektion)"),
        ]

        return {"_result": blocks}

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── EN 1997-1 — Foundation bearing ───────────────────────────────────────────

class FoundationInput(BaseModel):
    label:         str   = "F1"
    B_m:           float = 1.5
    L_m:           float = 2.0
    D_m:           float = 0.8
    c_kPa:         float = 5.0
    phi_deg:       float = 30.0
    gamma_kNm3:    float = 18.0
    gamma_b_kNm3:  float = 10.0
    water_table:   bool  = False
    V_Ed_kN:       float = 300.0
    H_Ed_kN:       float = 0.0
    M_Ed_kNm:      float = 0.0
    gamma_phi:     float = 1.0
    gamma_c:       float = 1.0
    gamma_Rv:      float = 1.4


@protected.post("/calc/foundation", tags=["Calculations"])
def calc_foundation(data: FoundationInput):
    """EN 1997-1 Annex D spread footing bearing capacity."""
    try:
        from foundation_ec7 import foundation_bearing

        # Basic input validation
        if data.B_m <= 0 or data.L_m <= 0:
            raise ValueError("Footing dimensions B and L must be positive.")
        if data.L_m < data.B_m:
            raise ValueError(f"L ({data.L_m} m) should be ≥ B ({data.B_m} m).")
        if data.D_m < 0:
            raise ValueError("Embedment depth D cannot be negative.")
        if not (0 < data.phi_deg < 55):
            raise ValueError(f"Friction angle φ' = {data.phi_deg}° is outside the range 0–55°.")
        if data.V_Ed_kN <= 0:
            raise ValueError("Design vertical load V_Ed must be greater than zero.")

        blocks = foundation_bearing(
            label        = data.label,
            B_m          = data.B_m,
            L_m          = data.L_m,
            D_m          = data.D_m,
            c_kPa        = data.c_kPa,
            phi_deg      = data.phi_deg,
            gamma_kNm3   = data.gamma_kNm3,
            gamma_b_kNm3 = data.gamma_b_kNm3,
            water_table  = data.water_table,
            V_Ed_kN      = data.V_Ed_kN,
            H_Ed_kN      = data.H_Ed_kN,
            M_Ed_kNm     = data.M_Ed_kNm,
            gamma_phi    = data.gamma_phi,
            gamma_c      = data.gamma_c,
            gamma_Rv     = data.gamma_Rv,
        )
        return blocks

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── EN 1990 Load combinations ─────────────────────────────────────────────────

class LoadComboInput(BaseModel):
    label:             str   = "LC1"
    unit:              str   = "kN/m"
    G_k:               float = 5.0
    G_fav:             bool  = False
    loads:             list  = []       # [{'label', 'Q_k', 'category'}, ...]
    method:            str   = "6.10ab"
    consequence_class: str   = "CC2"   # CC1 / CC2 / CC3  → K_FI factor
    A_d:               float = 0.0     # Accidental design action (γ=1.0); 0 = skip ALS
    accidental_type:   str   = "none"  # 'none' | 'fire' | 'other'

@protected.post("/calc/load-combo", tags=["Calculations"])
def calc_load_combo(data: LoadComboInput):
    """EN 1990 ULS/SLS/ALS load combinations (DS/EN 1990 DK NA:2019).
    Returns a flat list of calc blocks.  The first element is always a
    synthetic {'type': '_exports', 'exports': {...}} block that the
    renderer silently skips but LoadComboBlock stores as _exports so
    downstream element blocks (steel/timber beam) can read E_d_uls and
    governing_duration without a separate API call.
    """
    try:
        from load_combo import load_combos
        blocks, exports = load_combos(
            label=data.label, unit=data.unit,
            G_k=data.G_k, loads=data.loads,
            method=data.method, G_fav=data.G_fav,
            consequence_class=data.consequence_class,
            A_d=data.A_d,
            accidental_type=data.accidental_type,
        )
        # Embed exports as an invisible sentinel block (unknown type → renderer drops it).
        return [{'type': '_exports', 'exports': exports}] + blocks
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── EC3 §6.3.3 Beam-column interaction ────────────────────────────────────────

_GRADE_FY = {'S235': 235.0, 'S275': 275.0, 'S355': 355.0, 'S420': 420.0, 'S460': 460.0}

class BeamColumnInput(BaseModel):
    label:    str   = "BC1"
    section:  str   = "HEB200"
    grade:    str   = "S355"
    N_Ed_kN:    float = 200.0
    My_Ed_kNm:  float = 50.0
    Mz_Ed_kNm:  float = 0.0
    # Load source: when combo is used, frontend overrides N_Ed_kN directly
    combo_label: str | None = None  # label of the source combo block (for display)
    L_y_m:   float = 4.0
    L_z_m:   float = 4.0
    L_LTB_m: float = 4.0
    k_y:  float = 1.0
    k_z:  float = 1.0
    C_my: float = 1.0
    C_mz: float = 1.0
    C_mLT: float = 1.0
    ltb_restrained: bool  = False
    gamma_M0: float = 1.0
    gamma_M1: float = 1.0

@protected.post("/calc/beam-column", tags=["Calculations"])
def calc_beam_column(data: BeamColumnInput):
    """EC3 §6.3.3 Method 2 beam-column interaction check."""
    try:
        from steel_beam_column import steel_beam_column_check
        from section_catalog import load_steel_profiles

        db  = load_steel_profiles()
        key = data.section.strip().upper().replace(' ', '')
        sec = db.get(key)
        if not sec:
            raise ValueError(f"Section '{data.section}' not in catalog.")

        h_mm     = sec['h_mm'];  b_mm = sec['b_mm']
        tw_mm    = sec['tw_mm']; tf_mm = sec['tf_mm']
        Iy_cm4   = sec['Iy_cm4']
        Wply_cm3 = sec['Wply_cm3']
        f_y_MPa  = _GRADE_FY.get(data.grade.strip().upper(), 355.0)

        return steel_beam_column_check(
            label=data.label, section=data.section, grade=data.grade,
            h_mm=h_mm, b_mm=b_mm, tw_mm=tw_mm, tf_mm=tf_mm,
            Iy_cm4=Iy_cm4, Wply_cm3=Wply_cm3,
            N_Ed_kN=data.N_Ed_kN, My_Ed_kNm=data.My_Ed_kNm, Mz_Ed_kNm=data.Mz_Ed_kNm,
            L_y_m=data.L_y_m, L_z_m=data.L_z_m, L_LTB_m=data.L_LTB_m,
            k_y=data.k_y, k_z=data.k_z,
            C_my=data.C_my, C_mz=data.C_mz, C_mLT=data.C_mLT,
            ltb_restrained=data.ltb_restrained,
            f_y_MPa=f_y_MPa, gamma_M0=data.gamma_M0, gamma_M1=data.gamma_M1,
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── EC3 §6.5–6.6 Bolt group + fillet weld ────────────────────────────────────

class BoltGroupInput(BaseModel):
    label:          str   = "BG1"
    n_bolts:        int   = 4
    bolt_class:     str   = "8.8"
    d_mm:           float = 20.0
    shear_plane:    str   = "thread"   # 'thread' or 'shank'
    n_shear_planes: int   = 1
    t_plate_mm:     float = 10.0
    f_u_plate_MPa:  float = 510.0
    e1_mm:          float = 40.0
    e2_mm:          float = 40.0
    p1_mm:          float = 60.0
    V_Ed_kN:        float = 100.0
    gamma_M2:       float = 1.25

class WeldInput(BaseModel):
    label:       str   = "W1"
    a_mm:        float = 6.0
    L_mm:        float = 200.0
    F_Ed_kN:     float = 80.0
    steel_grade: str   = "S355"
    f_u_MPa:     float | None = None
    gamma_M2:    float = 1.25

@protected.post("/calc/bolt-group", tags=["Calculations"])
def calc_bolt_group(data: BoltGroupInput):
    """EC3-1-8 §3 bolt shear + bearing group check."""
    try:
        from bolt_connection import bolt_group_shear
        return bolt_group_shear(
            label=data.label, n_bolts=data.n_bolts,
            bolt_class=data.bolt_class, d_mm=data.d_mm,
            shear_plane=data.shear_plane, n_shear_planes=data.n_shear_planes,
            t_plate_mm=data.t_plate_mm, f_u_plate_MPa=data.f_u_plate_MPa,
            e1_mm=data.e1_mm, e2_mm=data.e2_mm, p1_mm=data.p1_mm,
            V_Ed_kN=data.V_Ed_kN, gamma_M2=data.gamma_M2,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

@protected.post("/calc/fillet-weld", tags=["Calculations"])
def calc_fillet_weld(data: WeldInput):
    """EC3-1-8 §4 fillet weld check (simplified directional method)."""
    try:
        from bolt_connection import fillet_weld_check
        return fillet_weld_check(
            label=data.label, a_mm=data.a_mm, L_mm=data.L_mm,
            F_Ed_kN=data.F_Ed_kN, steel_grade=data.steel_grade,
            f_u_MPa=data.f_u_MPa, gamma_M2=data.gamma_M2,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── EN 1993-1-1 / EN 1993-1-5 — Plate girder ────────────────────────────────

class PlateGirderInput(BaseModel):
    label:          str   = "PG1"
    title:          str   = ""
    # Web
    h_w_mm:         float = 1200.0
    t_w_mm:         float = 12.0
    # Flanges (symmetric top & bottom)
    b_f_mm:         float = 400.0
    t_f_mm:         float = 25.0
    # Panel length (stiffener spacing)
    a_mm:           float = 2000.0
    # Material
    grade:          str   = "S355"
    gamma_M0:       float = 1.0
    gamma_M1:       float = 1.0
    # Actions
    V_Ed_kN:        float = 0.0
    M_Ed_kNm:       float = 0.0
    # Shear buckling options
    eta:            float = 1.0
    rigid_end_post: bool  = True


@protected.post("/calc/plate-girder", tags=["Calculations"])
def calc_plate_girder(data: PlateGirderInput):
    """EN 1993-1-1 / EN 1993-1-5 plate girder check (bending, shear buckling, M+V interaction)."""
    try:
        from plate_girder import plate_girder_check
        return plate_girder_check(
            label=data.label,
            title=data.title,
            h_w_mm=data.h_w_mm,
            t_w_mm=data.t_w_mm,
            b_f_mm=data.b_f_mm,
            t_f_mm=data.t_f_mm,
            a_mm=data.a_mm,
            grade=data.grade,
            gamma_M0=data.gamma_M0,
            gamma_M1=data.gamma_M1,
            V_Ed_kN=data.V_Ed_kN,
            M_Ed_kNm=data.M_Ed_kNm,
            eta=data.eta,
            rigid_end_post=data.rigid_end_post,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ── User-defined calculation templates ───────────────────────────────────────
#
# Each template has:
#   parameters  — [{name, label, unit, type, default, min, max, step, options}]
#   code        — Python that sets `blocks = [...]`

class CalcTemplateInput(BaseModel):
    name:        str  = "My Calculation"
    description: str  = ""
    parameters:  list = []
    code:        str  = ""
    items:       list = []
    visibility:  str  = "personal"   # 'personal' | 'team'


@protected.get("/calc-templates", tags=["Templates"])
def list_calc_templates(user: dict = Depends(get_current_user)):
    return _db.load_all_templates(user_id=user["id"])


@protected.post("/calc-templates", tags=["Templates"])
def create_calc_template(data: CalcTemplateInput, user: dict = Depends(get_current_user)):
    tid = _db.save_template(
        name=data.name, description=data.description,
        parameters=data.parameters, code=data.code, items=data.items,
        owner_id=user["id"], visibility=_clean_visibility(data.visibility), user=user["id"],
    )
    return _db.load_template(tid)


@protected.get("/calc-templates/{template_id}", tags=["Templates"])
def get_calc_template(template_id: str, user: dict = Depends(get_current_user)):
    return _visible_template(template_id, user)


@protected.put("/calc-templates/{template_id}", tags=["Templates"])
def update_calc_template(template_id: str, data: CalcTemplateInput, user: dict = Depends(get_current_user)):
    _visible_template(template_id, user)
    _db.update_template(
        template_id=template_id, name=data.name, description=data.description,
        parameters=data.parameters, code=data.code, items=data.items,
        visibility=_clean_visibility(data.visibility),
    )
    return _db.load_template(template_id)


@protected.delete("/calc-templates/{template_id}", tags=["Templates"])
def delete_calc_template(template_id: str, user: dict = Depends(get_current_user)):
    _visible_template(template_id, user)
    _db.delete_template(template_id)
    return {"status": "deleted"}


@protected.post("/calc-templates/{template_id}/run", tags=["Templates"])
def run_calc_template(
    template_id: str,
    params: dict = Body(default={}),
    user: dict = Depends(get_current_user),
):
    """
    Execute a user-defined calc template.

    Two modes:
      items — template was saved from a Custom Calc block (no Python needed).
              Param values are substituted into the variable items and the
              custom-calc eval loop runs.
      code  — legacy: Python code that sets blocks = [...]
    """
    import traceback as _tb

    tmpl = _visible_template(template_id, user)

    # ── Items mode (saved from Custom Calc "Save as module") ─────────────────
    items = tmpl.get("items") or []
    if items:
        try:
            from calc_core import S, T, N, CALC_ROW, CheckContext

            # Substitute incoming param values into the variable items
            merged = []
            for item in items:
                if item.get("type") == "var":
                    name_key = item.get("name", "")
                    if name_key in params:
                        item = {**item, "value": params[name_key]}
                merged.append(item)

            # Re-use the same eval loop as /calc/custom-calc
            title  = tmpl.get("name", "Calculation")
            blocks_out = []
            blocks_out.append(S(title))
            ns:  dict = {}
            chk = CheckContext()

            for item in merged:
                itype = item.get("type", "")

                if itype == "text":
                    content = item.get("content", "").strip()
                    if content:
                        blocks_out.append(T(content))

                elif itype == "heading":
                    content = item.get("content", "").strip()
                    if content:
                        blocks_out.append(S(content))

                elif itype == "var":
                    name = item.get("name", "").strip()
                    if not name:
                        continue
                    try:
                        unit_str = item.get("unit", "-")
                        qty      = _parse_qty(float(item.get("value", 0.0)), unit_str)
                        ns[name] = qty
                        val_str  = (f"{item['value']:g}" if unit_str == "-"
                                    else f"{item['value']:g} {unit_str.replace('**','').replace('*','·')}")
                        desc = item.get("description", "").strip()
                        blocks_out.append(CALC_ROW(name, desc, val_str))
                    except Exception as exc:
                        blocks_out.append(N(f"Variable '{name}': {exc}"))

                elif itype == "formula":
                    raw = item.get("expr", "").strip()
                    if not raw or "=" not in raw:
                        continue
                    lhs, rhs = raw.split("=", 1)
                    lhs = lhs.strip()
                    rhs = rhs.strip()
                    try:
                        result     = _safe_eval(_preprocess_expr(rhs), {**_UNIT_NS, **ns})
                        ns[lhs]    = result
                        result_str = _fmt_qty(result)
                        formula_disp = (rhs
                            .replace("**", "^").replace("*", " × ").replace("/", " / "))
                        blocks_out.append(CALC_ROW(lhs, formula_disp, result_str))
                    except Exception as exc:
                        blocks_out.append(N(f"Formula '{raw}': {exc}"))

                elif itype == "check":
                    label   = item.get("label", "Check")
                    d_expr  = item.get("demand", "").strip()
                    cap_raw = item.get("capacity", 1.0)
                    cap_unt = item.get("unit", "-")
                    if not d_expr:
                        continue
                    try:
                        demand = _safe_eval(_preprocess_expr(d_expr), {**_UNIT_NS, **ns})
                        try:
                            capacity = _parse_qty(float(cap_raw), cap_unt)
                        except (ValueError, TypeError):
                            capacity = _safe_eval(_preprocess_expr(str(cap_raw).strip()), {**_UNIT_NS, **ns})
                        blocks_out.append(chk.check(label, demand, capacity))
                    except Exception as exc:
                        blocks_out.append(N(f"Check error in '{label}': {exc}"))

                elif itype == "conditional":
                    name       = item.get("name", "").strip()
                    cond_raw   = item.get("condition", "").strip()
                    true_raw   = item.get("true_expr", "0").strip()
                    false_raw  = item.get("false_expr", "0").strip()
                    unit_str   = item.get("unit", "-")
                    if not cond_raw:
                        continue
                    try:
                        cond_result  = bool(_safe_eval(_preprocess_expr(cond_raw), {**_UNIT_NS, **ns}))
                        chosen_raw   = true_raw  if cond_result else false_raw
                        result       = _safe_eval(_preprocess_expr(chosen_raw), {**_UNIT_NS, **ns})
                        if name:
                            ns[name] = _parse_qty(float(result), unit_str) if unit_str != "-" else result
                        result_str   = _fmt_qty(ns[name]) if name else _fmt_qty(result)
                        branch_sym   = "✓" if cond_result else "✗"
                        chosen_disp  = (chosen_raw
                            .replace("**", "^").replace("*", "×").replace("/", " / "))
                        formula_disp = f"= {chosen_disp}  [{cond_raw} {branch_sym}]"
                        if name:
                            blocks_out.append(CALC_ROW(name, formula_disp, result_str))
                    except Exception as exc:
                        blocks_out.append(N(f"Conditional '{name}': {exc}"))

            return blocks_out

        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc))

    # ── Code mode (Python template) ───────────────────────────────────────────
    code = (tmpl.get("code") or "").strip()
    if not code:
        raise HTTPException(status_code=422, detail="Template has no code yet — open the template editor and add some Python.")

    try:
        from calc_core import S, T, N, TBL, CALC_ROW, MH, CheckContext

        ns: dict = {
            "__builtins__": __builtins__,
            "S": S, "T": T, "N": N, "TBL": TBL,
            "CALC_ROW": CALC_ROW, "MH": MH, "CheckContext": CheckContext,
            "math": math, "pi": math.pi,
            "sqrt": math.sqrt, "sin": math.sin, "cos": math.cos, "tan": math.tan,
            "asin": math.asin, "acos": math.acos, "atan": math.atan,
            "floor": math.floor, "ceil": math.ceil, "log": math.log, "exp": math.exp,
            "abs": abs, "min": min, "max": max, "round": round,
        }
        try:
            import numpy as _np
            ns["np"] = _np
        except ImportError:
            pass

        for param in (tmpl.get("parameters") or []):
            pname = param.get("name", "").strip()
            if not pname:
                continue
            raw = params.get(pname, param.get("default", 0))
            if param.get("type", "number") == "number":
                try:
                    raw = float(raw)
                except (TypeError, ValueError):
                    raw = float(param.get("default") or 0)
            ns[pname] = raw

        exec(compile(code, "<template>", "exec"), ns)

        blocks = ns.get("blocks", [])
        if not isinstance(blocks, list):
            blocks = []

        flat = []
        for item in blocks:
            if isinstance(item, list):
                flat.extend(item)
            else:
                flat.append(item)
        return flat

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=422, detail=_tb.format_exc())


# ── Register protected router ─────────────────────────────────────────────────
# All routes defined on `protected` require a valid Bearer token.
# The health check and /auth/login /auth/setup routes above are unprotected.

app.include_router(protected)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print("Starting Structural Calc API...")
    print("Docs: http://localhost:8000/docs")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

