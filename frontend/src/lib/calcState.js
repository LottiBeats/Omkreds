/**
 * calcState.js — what state a calculation block is in.
 *
 * Pure functions over block data, shared by the block list (badges), the
 * editor rail (document status) and the export/issue checks.
 */

// A stored _result corresponds to the inputs the calc was run with.  When a
// fresh result arrives, updateBlock() stamps a hash of those inputs on the
// block (_input_hash).  If the inputs later change, the result is stale and
// must not silently end up in an exported report.

// Inputs are not the only thing a result depends on — the calculation itself
// changes too. Bump the number here when a fix changes what a block computes
// from unchanged inputs, and every stored result from before the fix is flagged
// stale so it cannot be exported without being re-run.
//
//   general_frame_fem  2 — 2026-08-13: UDL directions were applied with the
//                          sign reversed (a downward load acted upwards).
//   general_frame_fem  3 — 2026-08-14: the section-force diagrams were drawn
//                          by opsvis, which integrated its own distribution —
//                          the moment curve could peak somewhere the table did
//                          not. The figure captions in the PDF were also shifted
//                          one place, so the moment curve was printed under the
//                          heading "Deformeret form". A stored result carries
//                          those figures with it, so it has to be re-run.
const CALC_REVISION = {
  general_frame_fem: 4,
  // 2: den lukkede form regnede 1,35·g + 1,5·q med den varighed brugeren
  // valgte. 1,35 findes ikke i DK NA, og én fast kombination kan ikke være
  // dimensionsgivende for både et let og et tungt tag — k_mod afgør hvilken
  // (EN 1995-1-1 §2.2.3). Gemte resultater er regnet på det gamle og skal
  // markeres forældet, selv om inddata ikke har flyttet sig.
  timber_beam: 4,
  // 2 (søjle) / 4 (bjælke) / 4 (ramme) — 2026-09-26: γ_M efter DK NA (1,35
  // konstruktionstræ, 1,30 limtræ) i stedet for 1,3 for alt; forskydning med
  // k_cr = 0,67; limtræ efter EN 14080; β_n og k_fi efter materialet ved brand.
  timber_column: 2,
  // 2 — 2026-09-26: γ_M0 = 1,10 og γ_M1 = 1,20 efter DK NA; kipning med
  // tabel 6.5's kurver i den modificerede metode; udrundingsradius i
  // klassifikationen; klasse 3 med W_el; bjælken med 6.10a/b og K_FI og
  // lastens angrebshøjde i M_cr.
  steel_beam: 2,
  steel_column: 2,
  // 3: med snitkræfter fra en rammeberegning blev det største moment brugt med
  // varigheden fra netop den kombination -- ikke kombinationen med størst
  // M/k_mod, som FEM-kørslen allerede havde fundet (timber-indhyldningen).
  // 2 — læsidens vægtryk blev regnet som (c_pe + c_pi)·q_p i stedet for
  // (c_pe − c_pi)·q_p, så sugningen var for lille ved indvendigt overtryk.
  wind_load: 2,
}

export function calcRevision(type) {
  return CALC_REVISION[type] ?? 1
}

// Results are hashed on every render of the sidebar and the page, and a FEM
// block's data can be large. Block data is replaced, never mutated, on edit —
// so the hash of a given data object never changes and can be cached on it.
const _hashCache = new WeakMap()

export function hashCalcInputs(data) {
  if (data && typeof data === 'object') {
    const hit = _hashCache.get(data)
    if (hit !== undefined) return hit
    const h = _hashInputs(data)
    _hashCache.set(data, h)
    return h
  }
  return _hashInputs(data)
}

function _hashInputs(data) {
  const entries = Object.entries(data || {})
    .filter(([k]) => !k.startsWith('_') && k !== 'title')
    .sort(([a], [b]) => a.localeCompare(b))
  const str = JSON.stringify(entries)
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return String(h)
}

export function hasCalcResult(block) {
  const d = block?.data || {}
  return !!(d._result || d._summary || d._output_text)
}

export function isStaleResult(block) {
  const d = block?.data || {}
  if (!hasCalcResult(block)) return false
  // Computed by a superseded version of the calculation — stale whether or not
  // the inputs have moved, and whether or not it predates the input hash.
  if ((d._calc_rev ?? 1) !== calcRevision(block?.type)) return true
  if (!d._input_hash) return false
  return d._input_hash !== hashCalcInputs(d)
}

/** Why a result is stale — the two causes need different wording. */
export function staleReason(block) {
  const d = block?.data || {}
  if (!hasCalcResult(block)) return null
  if ((d._calc_rev ?? 1) !== calcRevision(block?.type))
    return 'Beregningen er rettet siden resultatet blev regnet — kør den igen.'
  if (d._input_hash && d._input_hash !== hashCalcInputs(d))
    return 'Input er ændret siden sidste kørsel — kør beregningen igen.'
  return null
}

