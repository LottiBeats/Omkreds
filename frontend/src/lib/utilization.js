/**
 * utilization.js — the governing utilisation ratio (η) of a calc result.
 * Kept free of KaTeX so the document list can use it cheaply.
 */

/**
 * Governing (maximum) utilisation ratio across all check blocks in a result.
 * Prefers the numeric `ratio` field (new backend results); falls back to
 * parsing the leading number from the `value` string ("0.873 < 1.0   OK")
 * for results stored before the ratio field existed.  Returns null if the
 * result has no ratio-style checks.
 */
export function maxUtilization(result) {
  if (!Array.isArray(result)) return null
  let max = null
  for (const b of result) {
    if (b?.type !== 'check') continue
    let r = typeof b.ratio === 'number' ? b.ratio : parseFloat(b.value)
    if (Number.isFinite(r) && r < 900 && (max === null || r > max)) max = r
  }
  return max
}

/** Traffic-light colour for a utilisation ratio. */
export function utilColor(r) {
  return r > 1.0 ? '#dc2626' : r > 0.9 ? '#d97706' : '#16a34a'
}
