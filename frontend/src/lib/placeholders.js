/**
 * placeholders.js — the holes a template leaves for the engineer to fill.
 *
 * The document templates write things like "beliggende [adresse], matr.
 * [matrikelnummer]" and "Primær bærende retning: …". Those are fine in a
 * draft and embarrassing in an issued document, so the editor marks them and
 * the status counts them.
 *
 * What counts:
 *   [adresse] [Firma] [fx loftsrum] [ref.] […]   words in square brackets
 *   …                                             a lone ellipsis
 * What doesn't:
 *   [MPa] [kN/m³] [mm] [m]     units in brackets
 *   [1] [DS/EN 1990] [CC2]     references and codes (no lowercase words)
 *   og så videre…              an ellipsis glued to a word is prose
 */

const BRACKET = /\[([^\]\n]{1,400})\]/g
const LONE_ELLIPSIS = /(^|[\s:(|])(…|\.\.\.)(?=$|[\s|),.;])/gm

export function isPlaceholderLabel(inner) {
  const c = inner.trim()
  if (!c) return false
  if (c === '…' || c === '...') return true
  if (!/[a-zæøå]/.test(c)) return false                 // codes, numbers, CC2, DS/EN 1990
  return /\s|…/.test(c) || /[a-zæøå]{3,}/.test(c) || /^[A-ZÆØÅ][a-zæøå]/.test(c)
}

/** Every placeholder in a string, as { from, to, label }. */
export function findPlaceholders(text) {
  const out = []
  if (!text) return out
  for (const m of text.matchAll(BRACKET)) {
    if (isPlaceholderLabel(m[1])) out.push({ from: m.index, to: m.index + m[0].length, label: m[0] })
  }
  for (const m of text.matchAll(LONE_ELLIPSIS)) {
    const from = m.index + m[1].length
    const inBracket = out.some(p => from >= p.from && from < p.to)
    if (!inBracket) out.push({ from, to: from + m[2].length, label: '…' })
  }
  return out.sort((a, b) => a.from - b.from)
}

/** The placeholders in one block, for the block types that carry text. */
export function blockPlaceholders(block) {
  const d = block?.data ?? {}
  switch (block?.type) {
    case 'text':
    case 'heading':
      return findPlaceholders(d.text)
    case 'table':
      return (d.rows ?? []).flatMap(row => (row ?? []).flatMap(cell => findPlaceholders(String(cell ?? ''))))
    default:
      return []
  }
}
