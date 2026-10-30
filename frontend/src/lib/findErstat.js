/**
 * findErstat.js — søgning i dokumentets tekst og overskrifter (components/editor/FindErstat.jsx).
 *
 * Der søges i den gemte tekst (med **fed** osv.), uden regulære udtryk: det,
 * man skriver, er det, der findes.
 */
const SOEGBAR = new Set(['text', 'heading'])
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function moenster(q, storeSmaa) {
  return q ? new RegExp(escRe(q), storeSmaa ? 'g' : 'gi') : null
}

/** Alle forekomster: [{ blockId, k }] i dokumentets rækkefølge. */
export function findAlle(blocks, q, storeSmaa) {
  const re = moenster(q, storeSmaa); if (!re) return []
  const ud = []
  for (const b of blocks) {
    if (!SOEGBAR.has(b.type)) continue
    const n = (String(b.data?.text ?? '').match(re) || []).length
    for (let k = 0; k < n; k++) ud.push({ blockId: b.id, k })
  }
  return ud
}

/** Erstat den k'te forekomst (k = null: alle) i en tekst. */
export function erstatI(tekst, q, med, storeSmaa, k = null) {
  const re = moenster(q, storeSmaa)
  let i = -1
  return tekst.replace(re, (m) => (k === null || ++i === k ? med : m))
}

