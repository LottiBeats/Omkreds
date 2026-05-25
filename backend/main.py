"""
Structural Calc v2 â€” FastAPI backend
=====================================

This file is the Python server. It exposes the calculation modules and the
database as a REST API so the React frontend can talk to them.

Every route returns plain JSON â€” no HTML, no Streamlit, just data.

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
    pass  # python-dotenv not installed â€” env vars must be set manually
import tempfile
import math
import builtins as _builtins
from datetime import date
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Body, APIRouter, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from auth import get_current_user

# â”€â”€ Import the existing calculation modules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# These are copied unchanged from the Streamlit deploy app.
# If a module isn't copied yet, the route that needs it will raise an ImportError.
# â”€â”€ forallpeople â€” inject SI units into this module's globals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# All calc modules (steel.py, concrete.py, etc.) do the same at their top level.
# After this call, kN, m, mm, MPa, N etc. are available as globals here too.
import forallpeople as si
si.environment("structural", top_level=True)

# â”€â”€ Unit namespace for custom calc eval â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# si.environment() injects unit names (kN, m, mm, MPa â€¦) into builtins.
# We snapshot only the unit/quantity objects (those are the forallpeople objects,
# not standard builtins like exec/open/eval).
# __builtins__ is explicitly set to {} so eval() cannot access exec, open,
# __import__, or any other dangerous builtin â€” only what we put here explicitly.
# Whitelist of safe builtins for structural calc expressions.
# We deliberately do NOT include list/range/dict/str/bytes/etc. because
# those can be used for memory-exhaustion DoS (e.g. list(range(10**9))).
# forallpeople unit names (kN, m, mm, MPa â€¦) are captured below.
_SAFE_BUILTINS = {"abs", "min", "max", "round", "pow", "sum",
                  "bool", "int", "float", "len"}

_UNIT_NS: dict = {
    # forallpeople unit objects injected by si.environment() â€”
    # these are NOT standard builtins so they won't appear in a fresh
    # Python session; si.environment() creates them at import time.
    k: v for k, v in vars(_builtins).items()
    if not k.startswith("_")
    and k in _SAFE_BUILTINS  # only whitelisted safe builtins â€¦
    or (
        not k.startswith("_")  # â€¦ plus all forallpeople units
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
    # Lock down builtins â€” prevents exec/open/__import__/compile etc.
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
      ^   â†’ **   (power: x^2  becomes  x**2)
      Ã—   â†’ *    (multiplication symbol)
      Â·   â†’ *    (middle dot multiplication)
      â‰¤   â†’ <=   (less-than-or-equal, used in conditions)
      â‰¥   â†’ >=   (greater-than-or-equal, used in conditions)
      â‰    â†’ !=   (not-equal, used in conditions)
    """
    return (expr
        .replace('^',  '**')
        .replace('Ã—',  '*')
        .replace('Â·',  '*')
        .replace('â‰¤',  '<=')
        .replace('â‰¥',  '>=')
        .replace('â‰ ',  '!=')
    )

try:
    import db as _db
except ImportError:
    raise SystemExit(
        "db.py not found in backend/. Copy it from structural_calc_deploy/."
    )

# â”€â”€ App setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app = FastAPI(
    title="Structural Calc API",
    version="2.0",
    description="REST API for the Structural Calc document / report tool.",
)

# CORS â€” allowed origins.
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

# Danish structural documentation categories (DS/EN 1990 DK NA)
DOC_DEFS = {
    "A1": "Projektgrundlag",
    "A2": "Statiske beregninger",
    "A3": "Konstruktionstegninger og modeller",
    "A4": "Konstruktionsaendringer",
    "B1": "Statisk projekteringsrapport",
    "B2": "Statisk kontrolrapport",
    "B3": "Statisk tilsynsrapport",
}


# â”€â”€ Health check (unprotected) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
def health():
    """Quick check that the server is running."""
    return {"status": "ok", "version": "2.0"}


# â”€â”€ Protected router (all routes below require a valid Clerk Bearer token) â”€â”€â”€â”€
# Auth is handled by Clerk (clerk.com) â€” no login/logout endpoints here.
# Users are managed in the Clerk dashboard at dashboard.clerk.com.

protected = APIRouter(dependencies=[Depends(get_current_user)])


# â”€â”€ Auth â€” current user (convenient endpoint) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@protected.get("/auth/me", tags=["Auth"])
def me(user: dict = Depends(get_current_user)):
    """Return the currently authenticated user's profile (from the Clerk token)."""
    return user


# â”€â”€ Projects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@protected.get("/projects", tags=["Projects"])
def list_projects():
    """Return all projects from the database."""
    return _db.load_all_projects()


@protected.post("/projects", tags=["Projects"])
def create_project(name: str = "New Project", ref: str = ""):
    """
    Create a new empty project.

    Returns the full project dict (same shape used everywhere in the app).
    """
    project = {
        "id": uuid.uuid4().hex[:8],
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
    _db.save_project(project, user="")
    return project


@protected.get("/projects/{project_id}", tags=["Projects"])
def get_project(project_id: str):
    """Get a single project by its ID."""
    projects = _db.load_all_projects()
    for p in projects:
        if p["id"] == project_id:
            return p
    raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")


@protected.put("/projects/{project_id}", tags=["Projects"])
def save_project(project_id: str, project: dict):
    """
    Save (overwrite) a complete project.

    The frontend sends the full project dict after any change â€”
    blocks added/removed, metadata updated, etc.
    """
    if project.get("id") != project_id:
        raise HTTPException(status_code=400, detail="Project ID mismatch")
    user = project.pop("_user", "")   # optional author field, not stored in the dict
    _db.save_project(project, user=user)
    return {"status": "saved"}


@protected.delete("/projects/{project_id}", tags=["Projects"])
def delete_project(project_id: str):
    """Permanently delete a project."""
    _db.delete_project(project_id)
    return {"status": "deleted"}


# â”€â”€ PDF generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@protected.post("/projects/{project_id}/pdf/{doc_id}", tags=["PDF"])
def generate_pdf(project_id: str, doc_id: str):
    """
    Generate a PDF for one document within a project.

    Returns the PDF file as a binary download (application/pdf).
    The frontend triggers a browser download when it receives this response.
    """
    # Find the project
    projects = _db.load_all_projects()
    project = next((p for p in projects if p["id"] == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

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


# â”€â”€ Calculation routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
#
# Each route accepts a block's "data" dict as the request body,
# runs the calculation, and returns the result as JSON.
#
# The frontend sends these requests when the user clicks "Run" on a calc block.
# Results are displayed inline without a page reload.


# â”€â”€ EN 1993-1-1 â€” Steel beam â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class SteelBeamInput(BaseModel):
    label:              str   = "S1"
    section:            str   = "IPE300"
    grade:              str   = "S355"       # S235 / S275 / S355 / S420 / S460
    span_m:             float = 5.0
    g_k_kNm:            float = 5.0
    q_k_kNm:            float = 3.0
    gamma_M0:           float = 1.0
    gamma_M1:           float = 1.0
    ltb_restrained:     bool  = False
    buck_y_restrained:  bool  = False
    buck_x_restrained:  bool  = False


@protected.post("/calc/steel-beam", tags=["Calculations"])
def calc_steel_beam(data: SteelBeamInput):
    """
    EN 1993-1-1 steel beam check.
    Returns a list of calc blocks (section, text, handcalc, check, â€¦)
    that the React frontend's CalcResultView renders directly.
    """
    try:
        from section_catalog import load_steel_profiles
        from steel import steel_beam_ipe

        # Grade â†’ f_y
        fy_map = {"S235": 235, "S275": 275, "S355": 355, "S420": 420, "S460": 460}
        f_y = fy_map.get(data.grade.upper(), 355) * MPa

        # Look up section properties from the catalog
        db = load_steel_profiles()
        key = data.section.strip().upper().replace(" ", "")
        if key not in db:
            raise HTTPException(status_code=422, detail=f"Section '{data.section}' not in catalog")
        sec = db[key]

        W_ply = sec["Wply_cm3"]  * 1e-6 * m**3   # cmÂ³ â†’ mÂ³
        h     = sec["h_mm"]      * 1e-3 * m
        t_w   = sec["tw_mm"]     * 1e-3 * m
        b     = sec["b_mm"]      * 1e-3 * m
        t_f   = sec["tf_mm"]     * 1e-3 * m
        Iy    = sec["Iy_cm4"]    * 1e-8 * m**4  # cmâ´ â†’ mâ´  (needed for W_el in Class 3)

        blocks = steel_beam_ipe(
            label         = data.label,
            section       = data.section,
            span          = data.span_m   * m,
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
        )
        return blocks

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# â”€â”€ EN 1992-1-1 â€” RC beam â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


# â”€â”€ EN 1995-1-1 â€” Timber beam â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class TimberBeamInput(BaseModel):
    label:          str   = "T1"
    span_m:         float = 4.0
    b_mm:           float = 90.0
    h_mm:           float = 220.0
    g_k_kNm:        float = 3.0
    q_k_kNm:        float = 2.0
    timber_grade:   str   = "C24"
    service_class:  int   = 1
    load_duration:  str   = "medium"
    gamma_M:        float = 1.3
    compression_edge_restrained:     bool = True
    torsional_restraint_at_supports: bool = True


@protected.post("/calc/timber-beam", tags=["Calculations"])
def calc_timber_beam(data: TimberBeamInput):
    """EN 1995-1-1 timber beam check (bending, shear, lateral buckling)."""
    try:
        from timber import timber_beam

        blocks = timber_beam(
            label         = data.label,
            span          = data.span_m  * m,
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
        return blocks

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# â”€â”€ EN 1995-1-1 â€” Timber column â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class TimberColumnInput(BaseModel):
    label:                   str   = "C1"
    length_m:                float = 3.0
    N_Ed_kN:                 float = 50.0
    M_Ed_kNm:                float = 0.0
    b_mm:                    float = 120.0
    h_mm:                    float = 120.0
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

        kwargs: dict = dict(
            label                   = data.label,
            length                  = data.length_m  * m,
            N_Ed                    = data.N_Ed_kN   * kN,
            M_Ed                    = data.M_Ed_kNm  * kN * m,
            b                       = data.b_mm      * mm,
            h                       = data.h_mm      * mm,
            timber_grade            = data.timber_grade,
            service_class           = data.service_class,
            load_duration           = data.load_duration,
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


# â”€â”€ EN 1996-1-1 â€” Masonry wall â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class MasonryWallInput(BaseModel):
    label:        str   = "W1"
    height_m:     float = 3.0
    thickness_mm: float = 228.0
    length_m:     float = 5.0
    N_k_kN:       float = 100.0
    f_b_MPa:      float = 10.0
    f_m_MPa:      float = 6.0
    gamma_M:      float = 2.5
    K:            float = 0.55
    alpha:        float = 0.7
    beta:         float = 0.3


@protected.post("/calc/masonry-wall", tags=["Calculations"])
def calc_masonry_wall(data: MasonryWallInput):
    """EN 1996-1-1 unreinforced masonry wall check."""
    try:
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
        return blocks

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# â”€â”€ Custom calc (variables + formulas + checks) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


def _fmt_qty(qty) -> str:
    try:
        return str(qty)
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
                # Section heading â€” breaks a long calculation into named sections
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
                    val_str  = (f"{item['value']:g}" if unit_str == "-"
                                else f"{item['value']:g} {unit_str.replace('**', '').replace('*', 'Â·')}")
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
                    # Pre-process: ^ â†’ **, Ã— â†’ *, Â· â†’ * for eval
                    result     = _safe_eval(_preprocess_expr(rhs), _UNIT_NS, ns)
                    ns[lhs]    = result
                    result_str = _fmt_qty(result)
                    # Display: normalise to ^ and Ã— notation (fmtCalcText handles the rest)
                    formula_disp = (rhs
                        .replace("**", "^")
                        .replace("Ã—", "Ã—").replace("Â·", "Â·")   # keep explicit symbols
                        .replace("*", " Ã— ")
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
                    demand = _safe_eval(_preprocess_expr(d_expr), _UNIT_NS, ns)
                    # Capacity can be a number (with unit) or an expression string
                    try:
                        capacity = _parse_qty(float(cap_raw), cap_unt)
                    except (ValueError, TypeError):
                        # Not a plain number â€” evaluate as an expression
                        capacity = _safe_eval(_preprocess_expr(str(cap_raw).strip()), _UNIT_NS, ns)
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
                    cond_result  = bool(_safe_eval(_preprocess_expr(cond_raw), _UNIT_NS, ns))
                    chosen_raw   = true_raw  if cond_result else false_raw
                    result       = _safe_eval(_preprocess_expr(chosen_raw), _UNIT_NS, ns)
                    if name:
                        ns[name] = _parse_qty(float(result), unit_str) if unit_str != "-" else result
                    result_str   = _fmt_qty(ns[name]) if name else _fmt_qty(result)
                    branch_sym   = "âœ“" if cond_result else "âœ—"
                    chosen_disp  = (chosen_raw
                        .replace("**", "^").replace("*", "Ã—").replace("/", " / "))
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

    âš  SECURITY: exec() cannot be safely sandboxed at the Python level.
    Access is restricted to an explicit allow-list of trusted email addresses.
    Set the PYTHON_SCRIPT_ALLOWED_EMAILS env var (comma-separated) to control access.
    If the env var is not set, only the ADMIN_EMAIL is allowed.
    """
    import os as _os

    # â”€â”€ Access control â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # PYTHON_SCRIPT_ALLOWED_EMAILS = "alice@firm.com,bob@firm.com"
    # If not set, falls back to ADMIN_EMAIL (the account owner).
    raw_allowed = _os.environ.get("PYTHON_SCRIPT_ALLOWED_EMAILS", "").strip()
    admin_email = _os.environ.get("ADMIN_EMAIL", "").strip()
    allowed = {e.strip().lower() for e in raw_allowed.split(",") if e.strip()}
    if admin_email:
        allowed.add(admin_email.lower())

    caller = (user.get("email") or "").strip().lower()
    if allowed and caller not in allowed:
        raise HTTPException(
            status_code=403,
            detail="Python Script blocks are restricted to admin users. "
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


# â”€â”€ Euler-Bernoulli beam FEM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      _fig_b64 : base64 PNG of the 4-panel plot (layout Â· displacement Â· M Â· V)
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

        # â”€â”€ Figure â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        # Build the 4-panel figure using the BeamFEM plotting internals but
        # without calling plt.show() (Agg backend makes it a no-op anyway).
        fig = beam.plot(title=data.title, save_as=None)
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=120, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        fig_b64 = base64.b64encode(buf.read()).decode()

        # â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        # â”€â”€ calc_core blocks for PDF export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                load_lines.append(f"Trapezoidal {ld.w1_kNm:.1f}â†’{ld.w2_kNm:.1f} kN/m  [x={ld.x1:.2f}..{ld.x2:.2f} m]")
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
                ["Max deflection Î´",    f"{summary['delta_max_mm']:.3f} mm", f"x = {summary['x_delta_m']:.2f} m"],
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


# â”€â”€ EN 1993-1-1 â€” Steel column â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class SteelColumnInput(BaseModel):
    label:    str   = "SC1"
    section:  str   = "HEB200"
    grade:    str   = "S355"
    length_m: float = 4.0
    N_Ed_kN:  float = 500.0
    k_y:      float = 1.0
    k_z:      float = 1.0
    gamma_M0: float = 1.0
    gamma_M1: float = 1.0


@protected.post("/calc/steel-column", tags=["Calculations"])
def calc_steel_column(data: SteelColumnInput):
    """EN 1993-1-1 Â§6.3.1 steel column compression + flexural buckling check."""
    try:
        from section_catalog import load_steel_profiles
        from steel_column import steel_column_check
        import math

        fy_map = {"S235": 235, "S275": 275, "S355": 355, "S420": 420, "S460": 460}
        f_y = fy_map.get(data.grade.upper(), 355)

        db = load_steel_profiles()
        key = data.section.strip().upper().replace(" ", "")
        if key not in db:
            raise HTTPException(status_code=422, detail=f"Section '{data.section}' not in catalog")
        sec = db[key]

        h_mm  = sec["h_mm"]
        b_mm  = sec["b_mm"]
        tf_mm = sec["tf_mm"]
        tw_mm = sec["tw_mm"]

        # Compute area and Iz from geometry (not stored in catalog)
        tf_cm = tf_mm / 10.0
        b_cm  = b_mm  / 10.0
        tw_cm = tw_mm / 10.0
        hw_cm = (h_mm - 2 * tf_mm) / 10.0

        A_cm2  = 2 * b_cm * tf_cm + hw_cm * tw_cm
        Iy_cm4 = sec["Iy_cm4"]
        Iz_cm4 = 2 * (tf_cm * b_cm**3 / 12.0) + hw_cm * (tw_cm**3 / 12.0)

        blocks = steel_column_check(
            label     = data.label,
            section   = data.section,
            grade     = data.grade,
            length_m  = data.length_m,
            N_Ed_kN   = data.N_Ed_kN,
            A_cm2     = A_cm2,
            Iy_cm4    = Iy_cm4,
            Iz_cm4    = Iz_cm4,
            h_mm      = h_mm,
            b_mm      = b_mm,
            tf_mm     = tf_mm,
            f_y_MPa   = f_y,
            gamma_M0  = data.gamma_M0,
            gamma_M1  = data.gamma_M1,
            k_y       = data.k_y,
            k_z       = data.k_z,
        )
        return blocks

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# â”€â”€ EN 1992-1-1 â€” RC column (concrete) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


# â”€â”€ EN 1992-1-1 â€” RC one-way slab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


# â”€â”€ EN 1991-1-4 â€” Wind load â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


# â”€â”€ EN 1991-1-3 â€” Snow load â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        )
        return blocks

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# â”€â”€ EN 1997-1 â€” Foundation bearing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
            raise ValueError(f"L ({data.L_m} m) should be â‰¥ B ({data.B_m} m).")
        if data.D_m < 0:
            raise ValueError("Embedment depth D cannot be negative.")
        if not (0 < data.phi_deg < 55):
            raise ValueError(f"Friction angle Ï†' = {data.phi_deg}Â° is outside the range 0â€“55Â°.")
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


# â”€â”€ EN 1990 Load combinations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class LoadComboInput(BaseModel):
    label:  str   = "LC1"
    unit:   str   = "kN/m"
    G_k:    float = 5.0
    G_fav:  bool  = False
    loads:  list  = []    # [{'label', 'Q_k', 'category'}, â€¦]
    method: str   = "6.10ab"

@protected.post("/calc/load-combo", tags=["Calculations"])
def calc_load_combo(data: LoadComboInput):
    """EN 1990 ULS/SLS load combinations (Danish NA)."""
    try:
        from load_combo import load_combos
        blocks, exports = load_combos(
            label=data.label, unit=data.unit,
            G_k=data.G_k, loads=data.loads,
            method=data.method, G_fav=data.G_fav,
        )
        return blocks
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# â”€â”€ EC3 Â§6.3.3 Beam-column interaction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

_GRADE_FY = {'S235': 235.0, 'S275': 275.0, 'S355': 355.0, 'S420': 420.0, 'S460': 460.0}

class BeamColumnInput(BaseModel):
    label:    str   = "BC1"
    section:  str   = "HEB200"
    grade:    str   = "S355"
    N_Ed_kN:    float = 200.0
    My_Ed_kNm:  float = 50.0
    Mz_Ed_kNm:  float = 0.0
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
    """EC3 Â§6.3.3 Method 2 beam-column interaction check."""
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


# â”€â”€ EC3 Â§6.5â€“6.6 Bolt group + fillet weld â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    """EC3-1-8 Â§3 bolt shear + bearing group check."""
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
    """EC3-1-8 Â§4 fillet weld check (simplified directional method)."""
    try:
        from bolt_connection import fillet_weld_check
        return fillet_weld_check(
            label=data.label, a_mm=data.a_mm, L_mm=data.L_mm,
            F_Ed_kN=data.F_Ed_kN, steel_grade=data.steel_grade,
            f_u_MPa=data.f_u_MPa, gamma_M2=data.gamma_M2,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# â”€â”€ EN 1993-1-1 / EN 1993-1-5 â€” Plate girder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


# â”€â”€ User-defined calculation templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
#
# Each template has:
#   parameters  â€” [{name, label, unit, type, default, min, max, step, options}]
#   code        â€” Python that sets `blocks = [...]`

class CalcTemplateInput(BaseModel):
    name:        str  = "My Calculation"
    description: str  = ""
    parameters:  list = []
    code:        str  = ""
    items:       list = []   # custom-calc items (alternative to code)


@protected.get("/calc-templates", tags=["Templates"])
def list_calc_templates():
    return _db.load_all_templates()


@protected.post("/calc-templates", tags=["Templates"])
def create_calc_template(data: CalcTemplateInput):
    tid = _db.save_template(
        name=data.name, description=data.description,
        parameters=data.parameters, code=data.code, items=data.items,
    )
    return _db.load_template(tid)


@protected.get("/calc-templates/{template_id}", tags=["Templates"])
def get_calc_template(template_id: str):
    tmpl = _db.load_template(template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")
    return tmpl


@protected.put("/calc-templates/{template_id}", tags=["Templates"])
def update_calc_template(template_id: str, data: CalcTemplateInput):
    tmpl = _db.load_template(template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")
    _db.update_template(
        template_id=template_id, name=data.name, description=data.description,
        parameters=data.parameters, code=data.code, items=data.items,
    )
    return _db.load_template(template_id)


@protected.delete("/calc-templates/{template_id}", tags=["Templates"])
def delete_calc_template(template_id: str):
    _db.delete_template(template_id)
    return {"status": "deleted"}


@protected.post("/calc-templates/{template_id}/run", tags=["Templates"])
def run_calc_template(template_id: str, params: dict = Body(default={})):
    """
    Execute a user-defined calc template.

    Two modes:
      items â€” template was saved from a Custom Calc block (no Python needed).
              Param values are substituted into the variable items and the
              custom-calc eval loop runs.
      code  â€” legacy: Python code that sets blocks = [...]
    """
    import traceback as _tb

    tmpl = _db.load_template(template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")

    # â”€â”€ Items mode (saved from Custom Calc "Save as module") â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                                    else f"{item['value']:g} {unit_str.replace('**','').replace('*','Â·')}")
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
                        result     = _safe_eval(_preprocess_expr(rhs), _UNIT_NS, ns)
                        ns[lhs]    = result
                        result_str = _fmt_qty(result)
                        formula_disp = (rhs
                            .replace("**", "^").replace("*", " Ã— ").replace("/", " / "))
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
                        demand = _safe_eval(_preprocess_expr(d_expr), _UNIT_NS, ns)
                        try:
                            capacity = _parse_qty(float(cap_raw), cap_unt)
                        except (ValueError, TypeError):
                            capacity = _safe_eval(_preprocess_expr(str(cap_raw).strip()), _UNIT_NS, ns)
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
                        cond_result  = bool(_safe_eval(_preprocess_expr(cond_raw), _UNIT_NS, ns))
                        chosen_raw   = true_raw  if cond_result else false_raw
                        result       = _safe_eval(_preprocess_expr(chosen_raw), _UNIT_NS, ns)
                        if name:
                            ns[name] = _parse_qty(float(result), unit_str) if unit_str != "-" else result
                        result_str   = _fmt_qty(ns[name]) if name else _fmt_qty(result)
                        branch_sym   = "âœ“" if cond_result else "âœ—"
                        chosen_disp  = (chosen_raw
                            .replace("**", "^").replace("*", "Ã—").replace("/", " / "))
                        formula_disp = f"= {chosen_disp}  [{cond_raw} {branch_sym}]"
                        if name:
                            blocks_out.append(CALC_ROW(name, formula_disp, result_str))
                    except Exception as exc:
                        blocks_out.append(N(f"Conditional '{name}': {exc}"))

            return blocks_out

        except Exception as exc:
            raise HTTPException(status_code=422, detail=str(exc))

    # â”€â”€ Code mode (Python template) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    code = (tmpl.get("code") or "").strip()
    if not code:
        raise HTTPException(status_code=422, detail="Template has no code yet â€” open the template editor and add some Python.")

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


# â”€â”€ Register protected router â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# All routes defined on `protected` require a valid Bearer token.
# The health check and /auth/login /auth/setup routes above are unprotected.

app.include_router(protected)


# â”€â”€ Entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

if __name__ == "__main__":
    import uvicorn
    print("Starting Structural Calc API...")
    print("Docs: http://localhost:8000/docs")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

