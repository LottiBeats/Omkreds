/**
 * api/client.js — all communication with the Python backend
 *
 * Every fetch() call in the app goes through this file.
 * If the backend URL ever changes, you only change it in one place.
 *
 * Authentication
 * ──────────────
 * Auth is handled by Clerk (clerk.com).  The token is obtained from the
 * current Clerk session via clerkToken.js and sent as a Bearer header.
 * On 401 an error is thrown so the calling component can display it inline.
 *
 * Each function:
 *   - sends a request to the FastAPI backend
 *   - returns parsed JSON (or throws an error with a readable message)
 */
import { getAuthToken } from './clerkToken.js'

// In development Vite proxies /api/* → localhost:8000.
// In production set VITE_API_URL to your backend URL, e.g.:
//   https://yourdomain.com   (Nginx then forwards /api/ → port 8000)
const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api'

// ── Errors ────────────────────────────────────────────────────────────────────

/**
 * An error carrying the HTTP status and the backend's `detail` payload.
 *
 * Callers that only show err.message keep working; callers that need to react
 * to a specific status (409 save conflict) can read err.status / err.detail.
 */
export class ApiError extends Error {
  constructor(message, status, detail = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }

  /** True when the project was saved by somebody else since we loaded it. */
  get isConflict() {
    return this.status === 409
  }
}

// ── Internal fetch helper ─────────────────────────────────────────────────────

/**
 * Internal helper — makes a fetch() call and handles errors consistently.
 * You don't call this directly; use the named functions below.
 */
async function request(method, path, body = null) {
  const token = await getAuthToken()

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }
  if (body !== null) {
    options.body = JSON.stringify(body)
  }

  const response = await fetch(`${BASE}${path}`, options)

  // Token expired / revoked — throw so the calling component shows the error
  // inline.  Do NOT navigate: /sign-in is not a defined route and would just
  // bounce the user to / (ProjectsPage) via the catch-all * route.
  if (response.status === 401) {
    throw new ApiError(
      'Din session er udløbet — genindlæs siden og log ind igen.', 401
    )
  }

  if (!response.ok) {
    // 413 means the request body (project JSON) is too large for the server.
    // This typically happens when very large images are embedded as base64.
    if (response.status === 413) {
      throw new ApiError(
        'Projektet er for stort til at gemme (HTTP 413). ' +
        'Det skyldes typisk store indlejrede billeder — prøv med mindre filer.',
        413
      )
    }
    // Try to get the error message from FastAPI's JSON response.  `detail` is
    // a string for most errors, but an object for the 409 save conflict.
    let detail = null
    let message = `HTTP ${response.status}`
    try {
      const err = await response.json()
      detail = err.detail ?? null
      if (typeof detail === 'string') message = detail
      else if (detail && detail.message) message = detail.message
    } catch (_) {}
    throw new ApiError(message, response.status, detail)
  }

  // Binary endpoints (PDF, ZIP) return a Blob, not JSON
  const ct = response.headers.get('Content-Type') ?? ''
  if (ct.includes('application/pdf') || ct.includes('application/zip')) {
    return response.blob()
  }

  return response.json()
}


// ── Projects ──────────────────────────────────────────────────────────────────

/** Fetch all projects from the database (excludes templates). */
export const getProjects = () =>
  request('GET', '/projects')

/** Fetch all project templates. */
export const getProjectTemplates = () =>
  request('GET', '/project-templates')

/** Create a new empty project. Returns the created project. */
export function createProject(name, ref = '', visibility = 'personal') {
  const params = new URLSearchParams({ name, ref, visibility })
  return request('POST', `/projects?${params}`)
}

/**
 * Duplicate a project as a reusable template.
 * The original project is kept unchanged.
 * @param {string} projectId  — the project to copy
 * @param {{ name, description, visibility }} opts
 */
export function saveProjectAsTemplate(projectId, { name = '', description = '', visibility = 'personal' } = {}) {
  return request('POST', `/projects/${projectId}/save-as-template`, { name, description, visibility })
}

/**
 * Create a new project from a template (copies document structures).
 * Firm info is carried over; project metadata (name, client, date…) is reset.
 */
export function createProjectFromTemplate(templateId, name, ref = '', visibility = 'personal') {
  const params = new URLSearchParams({ name, ref, visibility })
  return request('POST', `/project-templates/${templateId}/use?${params}`)
}

/** Delete a project template permanently. */
export const deleteProjectTemplate = (templateId) =>
  request('DELETE', `/projects/${templateId}`)

/** Fetch one project by ID. */
export const getProject = (projectId) =>
  request('GET', `/projects/${projectId}`)

/**
 * Save the full project (overwrite).
 * Call this whenever blocks change, metadata changes, etc.
 *
 * The `_rev` carried on the project object is the revision we last saw.  The
 * backend rejects the save with 409 (ApiError.isConflict) if the stored project
 * has moved on since — somebody else, or another tab, saved in between.
 *
 * Resolves to { status, _rev, _updated_at }; keep the returned `_rev` on your
 * local copy so the next save is checked against the right revision.
 */
export const saveProject = (project, user = '') =>
  request('PUT', `/projects/${project.id}`, { ...project, _user: user })

/** Move a project to the trash. Recoverable via restoreProject(). */
export const deleteProject = (projectId) =>
  request('DELETE', `/projects/${projectId}`)


// ── Trash ─────────────────────────────────────────────────────────────────────

/** List soft-deleted projects (newest deletion first). */
export const getTrash = () =>
  request('GET', '/trash')

/** Bring a project back out of the trash. Returns the restored project. */
export const restoreProject = (projectId) =>
  request('POST', `/trash/${projectId}/restore`)

/** Permanently delete a trashed project and its history. Irreversible. */
export const purgeProject = (projectId) =>
  request('DELETE', `/trash/${projectId}`)


// ── Version history ───────────────────────────────────────────────────────────

/** List a project's saved versions, newest first (metadata only). */
export const getVersions = (projectId) =>
  request('GET', `/projects/${projectId}/versions`)

/**
 * Snapshot the project's current state under a label.
 * @param {string} kind — 'manual' (default) or 'issue' (document issued)
 */
export const createVersion = (projectId, label = '', kind = 'manual') =>
  request('POST', `/projects/${projectId}/versions`, { label, kind })

/** Load one full snapshot — for previewing before restoring. */
export const getVersion = (projectId, versionId) =>
  request('GET', `/projects/${projectId}/versions/${versionId}`)

/** Roll the project back to a snapshot. Returns the restored project. */
export const restoreVersion = (projectId, versionId) =>
  request('POST', `/projects/${projectId}/versions/${versionId}/restore`)


// ── Issuing documents ─────────────────────────────────────────────────────────

/**
 * Record that a document was issued at a given revision.
 *
 * Appends a row to that document's revision history — the table printed on the
 * PDF cover page — and takes a permanent snapshot of the project, so every line
 * in the table can be resolved back to the state that produced it.
 *
 * @param {{revision, description, override_reason?}} entry
 */
export const issueDocument = (projectId, docId, entry) =>
  request('POST', `/projects/${projectId}/issue/${docId}`, entry)


// ── PDF ───────────────────────────────────────────────────────────────────────

/**
 * Generate a PDF for one document.
 * Returns a Blob — the caller triggers a browser download.
 *
 * Usage:
 *   const blob = await generatePdf(projectId, 'A2')
 *   const url  = URL.createObjectURL(blob)
 *   window.open(url)
 */
export const generatePdf = (projectId, docId) =>
  request('POST', `/projects/${projectId}/pdf/${docId}`)

/**
 * Generate a Word (.docx) document for one document.
 * Returns a Blob — the caller triggers a browser download.
 */
export const generateWord = (projectId, docId) =>
  request('POST', `/projects/${projectId}/word/${docId}`)

/**
 * Generate one PDF per sub-document and return them as a ZIP archive.
 * Returns a Blob — the caller triggers a browser download.
 */
export const generatePdfZip = (projectId, docId) =>
  request('POST', `/projects/${projectId}/pdf-zip/${docId}`)


// ── Calculations ──────────────────────────────────────────────────────────────

/**
 * Run an EN 1993-1-1 steel beam check.
 * Returns a list of calc blocks (section, text, handcalc, check, …)
 * that CalcResultView can render directly.
 */
export const calcSteelBeam = (data) =>
  request('POST', '/calc/steel-beam', data)

/**
 * Run an EN 1992-1-1 RC beam bending check.
 */
export const calcRcBeam = (data) =>
  request('POST', '/calc/rc-beam', data)

/**
 * Run an EN 1995-1-1 timber beam check (bending + shear + LTB).
 */
export const calcTimberBeam = (data) =>
  request('POST', '/calc/timber-beam', data)

/**
 * Run an EN 1995-1-1 timber column check (axial + bending + buckling).
 */
export const calcTimberColumn = (data) =>
  request('POST', '/calc/timber-column', data)

/**
 * Run an EN 1996-1-1 masonry wall check.
 */
export const calcMasonryWall = (data) =>
  request('POST', '/calc/masonry-wall', data)

/**
 * Run a custom calculation (variables + formulas + checks).
 * Returns a list of calc_core blocks ready for CalcResultView.
 */
export const calcCustomCalc = (data) =>
  request('POST', '/calc/custom-calc', data)

/**
 * Execute a Python script block.
 * Returns { output: string, figures: string[], error: string }
 */
export const runPythonScript = (code) =>
  request('POST', '/calc/python-script', { code })

/**
 * Run the Euler-Bernoulli beam FEM solver.
 * Returns { _fig_b64, _summary, _result }
 */
export const calcBeamFem = (data) =>
  request('POST', '/calc/beam-fem', data)

/**
 * Run the portal frame FEM solver (OpenSeesPy).
 * Returns { _figs_b64, _summary, _result }
 */
export const calcPortalFrameFem = (data) =>
  request('POST', '/calc/portal-frame-fem', data)

/**
 * Run the general 2D frame/truss FEM solver (OpenSeesPy + OpsVis).
 * Returns { _figs_b64, _summary, _result }
 */
export const calcGeneralFrameFem = (data) =>
  request('POST', '/calc/general-frame-fem', data)

/** Draw static model (geometry, supports, releases, loads) — no FEM analysis. */
export const previewGeneralFrameFem = (data) =>
  request('POST', '/calc/general-frame-fem/preview', data)

/**
 * Redraw the section-force diagrams at a different ordinate scale.
 * Takes the section forces from a run that already happened, so it neither
 * re-solves nor can it change a number — it is the same analysis, drawn again.
 */
export const redrawGeneralFrameFemDiagrams = (data) =>
  request('POST', '/calc/general-frame-fem/diagrams', data)

/**
 * Generate EN 1990 load combinations from named load cases.
 * Returns { _exports: { combinations }, _result }
 */
export const calcFrameLoadCases = (data) =>
  request('POST', '/calc/frame-load-cases', data)

/**
 * Run an EN 1993-1-1 §6.3.1 steel column compression + buckling check.
 */
export const calcSteelColumn = (data) =>
  request('POST', '/calc/steel-column', data)

/**
 * Run an EN 1992-1-1 RC column check (axial + bending + slenderness).
 */
export const calcRcColumn = (data) =>
  request('POST', '/calc/rc-column', data)

/**
 * Run an EN 1992-1-1 one-way RC slab check (bending + deflection).
 */
export const calcRcSlab = (data) =>
  request('POST', '/calc/rc-slab', data)

/**
 * Run an EN 1991-1-4 + DK NA wind load calculation.
 */
export const calcWindLoad = (data) =>
  request('POST', '/calc/wind-load', data)

/**
 * Run an EN 1991-1-3 + DK NA snow load calculation.
 */
export const calcSnowLoad = (data) =>
  request('POST', '/calc/snow-load', data)

/**
 * Run a roof dead load calculation (cladding layers + rafter self-weight).
 */
export const calcRoofDeadLoad = (data) =>
  request('POST', '/calc/roof-dead-load', data)

/**
 * Run an EN 1997-1 Annex D spread footing bearing capacity check.
 */
export const calcFoundation = (data) =>
  request('POST', '/calc/foundation', data)


/**
 * Run an EN 1990 load combination calculation.
 */
export const calcLoadCombo = (data) =>
  request('POST', '/calc/load-combo', data)

/**
 * Run an EC3 §6.3.3 beam-column interaction check.
 */
export const calcBeamColumn = (data) =>
  request('POST', '/calc/beam-column', data)

/**
 * Run an EC3-1-8 §3 bolt group shear + bearing check.
 */
export const calcBoltGroup = (data) =>
  request('POST', '/calc/bolt-group', data)

/**
 * Run an EC3-1-8 §4 fillet weld check.
 */
export const calcFilletWeld = (data) =>
  request('POST', '/calc/fillet-weld', data)

/**
 * Run an EN 1993-1-1 / EN 1993-1-5 plate girder check.
 */
export const calcPlateGirder = (data) =>
  request('POST', '/calc/plate-girder', data)

/**
 * Run a 2D Frame / Truss FEM analysis (OpenSeesPy backend).
 * Returns { fig_b64, node_disps, reactions, element_results, summary }
 */
export const calcFrameFem = (data) =>
  request('POST', '/calc/frame-fem', data)


// ── User-defined calculation templates ───────────────────────────────────────

/** List all saved calculation templates. */
export const getCalcTemplates = () =>
  request('GET', '/calc-templates')

/** Create a new template. Returns the created template (with id). */
export const createCalcTemplate = (data) =>
  request('POST', '/calc-templates', data)

/** Get a single template by id. */
export const getCalcTemplate = (id) =>
  request('GET', `/calc-templates/${id}`)

/** Update an existing template. */
export const updateCalcTemplate = (id, data) =>
  request('PUT', `/calc-templates/${id}`, data)

/** Delete a template. */
export const deleteCalcTemplate = (id) =>
  request('DELETE', `/calc-templates/${id}`)

/**
 * Run a template with the given parameter values.
 * Returns a list of calc_core blocks (same as any other calc endpoint).
 */
export const runCalcTemplate = (id, params) =>
  request('POST', `/calc-templates/${id}/run`, params)
