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
 * On 401 the user is redirected to /sign-in.
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

  // Token expired / revoked → send back to sign-in
  if (response.status === 401) {
    if (!window.location.pathname.startsWith('/sign-in')) {
      window.location.href = '/sign-in'
    }
    throw new Error('Session expired — please sign in again')
  }

  if (!response.ok) {
    // Try to get the error message from FastAPI's JSON response
    let detail = `HTTP ${response.status}`
    try {
      const err = await response.json()
      detail = err.detail || detail
    } catch (_) {}
    throw new Error(detail)
  }

  // PDF endpoints return binary, not JSON
  if (response.headers.get('Content-Type')?.includes('application/pdf')) {
    return response.blob()
  }

  return response.json()
}


// ── Projects ──────────────────────────────────────────────────────────────────

/** Fetch all projects from the database. */
export const getProjects = () =>
  request('GET', '/projects')

/** Create a new empty project. Returns the created project. */
export function createProject(name, ref = '', visibility = 'team') {
  const params = new URLSearchParams({ name, ref, visibility })
  return request('POST', `/projects?${params}`)
}

/** Fetch one project by ID. */
export const getProject = (projectId) =>
  request('GET', `/projects/${projectId}`)

/**
 * Save the full project (overwrite).
 * Call this whenever blocks change, metadata changes, etc.
 */
export const saveProject = (project, user = '') =>
  request('PUT', `/projects/${project.id}`, { ...project, _user: user })

/** Delete a project permanently. */
export const deleteProject = (projectId) =>
  request('DELETE', `/projects/${projectId}`)


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
