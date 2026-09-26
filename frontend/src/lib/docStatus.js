/**
 * docStatus.js — where a document stands.
 *
 * Everything here is derived from what is already stored (block results and
 * the document's revision rows); nothing new is saved. The rail, the export
 * check and the issue dialog all read the same answer, so they cannot disagree.
 *
 * Results are cached per document object. Edits replace the objects they touch
 * and leave the rest alone, so typing in A2 does not recount A1 or B2.
 */
import { hasCalcResult, isStaleResult, staleReason } from './calcState.js'
import { blockPlaceholders } from './placeholders.js'

/** Every block in a document, including its sub-documents, with where it lives. */
export function allBlocks(doc) {
  const out = []
  for (const b of doc?.blocks ?? []) out.push({ block: b, sub: null })
  ;(doc?.subdocs ?? []).forEach((sd, i) => {
    for (const b of sd?.blocks ?? []) out.push({ block: b, sub: i })
  })
  return out
}

function isCalc(block) {
  return !!block?.data && '_result' in block.data
}

function hasFailingCheck(block) {
  const r = block?.data?._result
  return Array.isArray(r) && r.some(x => x?.type === 'check' && x.passes === false)
}

const _countCache = new WeakMap()

/**
 * Counts for one document:
 *   blocks  — all blocks
 *   calcs   — calculation blocks
 *   stale   — results computed from inputs (or a calculation version) that have since changed
 *   unrun   — calculations with no result
 *   fail    — calculations with at least one failing check
 *   missing — unfilled template placeholders ([adresse], …) in text, headings and tables
 */
export function docCounts(doc) {
  if (doc && _countCache.has(doc)) return _countCache.get(doc)
  let blocks = 0, calcs = 0, stale = 0, unrun = 0, fail = 0, missing = 0
  for (const { block } of allBlocks(doc)) {
    blocks++
    missing += blockPlaceholders(block).length
    if (!isCalc(block)) continue
    calcs++
    if (isStaleResult(block)) stale++
    else if (!hasCalcResult(block)) unrun++
    if (hasFailingCheck(block)) fail++
  }
  const res = { blocks, calcs, stale, unrun, fail, missing }
  if (doc) _countCache.set(doc, res)
  return res
}

/** Same counts for one sub-document (or the parent's own blocks when sub is null). */
export function subdocCounts(doc, sub) {
  const blocks = sub === null ? (doc?.blocks ?? []) : (doc?.subdocs?.[sub]?.blocks ?? [])
  return docCounts({ blocks })
}

export function latestRevision(doc) {
  const revs = doc?.revisions ?? []
  return revs.length ? revs[revs.length - 1] : null
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * One status for a document, most urgent first:
 *   fejler → forældet → ikke kørt → mangler udfyldning → udstedt (Rev X) → klar → udkast → ikke startet
 *
 * "Klar" needs calculations to prove it: a document of only text can't be
 * judged ready by the app, so it stays "Udkast" until it is issued.
 */
export function documentStatus(doc) {
  const c = docCounts(doc)
  const rev = latestRevision(doc)
  if (c.blocks === 0 && !rev) return { tone: 'idle', label: 'Ikke startet', short: 'Tom', key: 'empty', title: 'Ikke startet' }
  if (c.fail)  return { tone: 'fail', label: plural(c.fail, 'fejler', 'fejler'), key: 'fail',
                        title: plural(c.fail, 'beregning har', 'beregninger har') + ' eftervisninger, der ikke er opfyldt' }
  if (c.stale) return { tone: 'warn', label: plural(c.stale, 'forældet', 'forældede'), key: 'stale',
                        title: plural(c.stale, 'beregning skal', 'beregninger skal') + ' køres igen' }
  if (c.unrun) return { tone: 'warn', label: `${c.unrun} ikke kørt`, key: 'unrun',
                        title: plural(c.unrun, 'beregning er', 'beregninger er') + ' ikke kørt endnu' }
  if (c.missing) return { tone: 'warn', label: `${c.missing} mangler`, key: 'missing',
                          title: plural(c.missing, 'felt skal', 'felter skal') + ' udfyldes, fx [adresse] eller …' }
  if (rev)     return { tone: 'rev',  label: `Rev ${rev.rev}`, key: 'issued',
                        title: `Udstedt ${rev.date ?? ''}${rev.description ? ' — ' + rev.description : ''}` }
  if (c.calcs) return { tone: 'ok',   label: 'Klar', key: 'ready', title: 'Alle beregninger er kørt og opdaterede' }
  return { tone: 'draft', label: 'Udkast', key: 'draft' }
}

/**
 * What stands between a document and a trustworthy report — calculations
 * that are stale or not run, and text with unfilled placeholders — by name,
 * so the export and issue dialogs can list them and link to them.
 */
export function docProblems(doc, labelFor = (b) => b.type) {
  const out = []
  for (const { block, sub } of allBlocks(doc)) {
    const holes = blockPlaceholders(block)
    if (holes.length) {
      const shown = [...new Set(holes.map(h => h.label))].slice(0, 3).join(', ')
      out.push({ id: block.id, sub, name: textName(block), kind: 'missing',
                 reason: `Udfyld ${shown}${holes.length > 3 ? ` og ${holes.length - 3} mere` : ''}.` })
    }
    if (!isCalc(block)) continue
    const name = block.data?.title || block.data?.label || labelFor(block)
    if (isStaleResult(block)) {
      out.push({ id: block.id, sub, name, kind: 'stale', reason: staleReason(block) })
    } else if (!hasCalcResult(block)) {
      out.push({ id: block.id, sub, name, kind: 'unrun', reason: 'Beregningen er ikke kørt.' })
    }
  }
  return out
}

/** A short name for a text-bearing block: its first words. */
function textName(block) {
  const d = block.data ?? {}
  if (block.type === 'table') return d.caption || 'Tabel'
  const t = String(d.text ?? '').replace(/[*•]/g, '').replace(/\s+/g, ' ').trim()
  const kind = block.type === 'heading' ? 'Overskrift' : 'Tekst'
  return t ? `${kind}: ${t.length > 48 ? t.slice(0, 46) + '…' : t}` : kind
}
