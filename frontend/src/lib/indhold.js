/**
 * indhold.js — dokumentets overskrifter som indholdsfortegnelse.
 *
 * Bruges af navigationen i venstremenuen og af BlockList's overskriftsnumre,
 * så de to altid viser det samme nummer. Reglen er eksportens
 * (pdf_builder._number_headings): en overskrift, der selv starter med et
 * nummer ("4.5 Robusthed"), tæller ikke med og beholder sit eget.
 */
import { blockPlaceholders } from './placeholders.js'

const EGET_NUMMER = /^(\d+(?:\.\d+)*)\.?\s+(.*)$/

/** Overskriftsnumre som i eksporten: Map(block.id → "4.5"). */
export function overskriftsnumre(blocks) {
  const m = new Map(); const c = [0, 0, 0]
  for (const b of blocks) {
    if (b.type !== 'heading') continue
    const lvl = Math.min(3, Math.max(1, b.data?.level ?? 1)), t = (b.data?.text ?? '').trim()
    if (EGET_NUMMER.test(t)) continue
    c[lvl - 1]++; for (let j = lvl; j < 3; j++) c[j] = 0
    m.set(b.id, c.slice(0, lvl).join('.'))
  }
  return m
}

/**
 * Overskrifterne i rækkefølge: { id, level, nr, titel, huller, forælder }.
 *
 * `huller` er antallet af tomme felter ([adresse], …) i afsnittet frem til
 * næste overskrift, uanset niveau. `forælder` er id'et på nærmeste overskrift
 * med lavere niveau, så navigationen kan folde underafsnit ind.
 */
export function indholdsfortegnelse(blocks) {
  const numre = overskriftsnumre(blocks)
  const ud = []
  const stak = []                       // åbne overskrifter, laveste niveau først
  for (const b of blocks) {
    if (b.type !== 'heading') {
      if (ud.length) ud[ud.length - 1].huller += blockPlaceholders(b).length
      continue
    }
    const level = Math.min(3, Math.max(1, b.data?.level ?? 1))
    const tekst = (b.data?.text ?? '').trim()
    const eget = tekst.match(EGET_NUMMER)
    while (stak.length && stak[stak.length - 1].level >= level) stak.pop()
    const punkt = {
      id: b.id,
      level,
      nr: eget ? eget[1] : (numre.get(b.id) ?? ''),
      titel: eget ? eget[2] : (tekst || 'Uden titel'),
      huller: blockPlaceholders(b).length,
      forælder: stak.length ? stak[stak.length - 1].id : null,
    }
    ud.push(punkt)
    stak.push(punkt)
  }
  return ud
}

/** Id'erne på overskriften og alle dens forældre — det, der skal være foldet ud. */
export function sti(punkter, id) {
  const efterId = new Map(punkter.map(p => [p.id, p]))
  const ud = new Set()
  for (let p = efterId.get(id); p; p = efterId.get(p.forælder)) ud.add(p.id)
  return ud
}

/**
 * Afsnittets brødtekst: indeks [fra, til) for blokkene under overskriften,
 * frem til næste overskrift på samme eller højere niveau. Underafsnit hører
 * med. null, hvis overskriften ikke findes.
 */
export function afsnitsBlokke(blocks, overskriftId) {
  const i = blocks.findIndex(b => b.id === overskriftId)
  if (i < 0 || blocks[i].type !== 'heading') return null
  const niveau = blocks[i].data?.level ?? 1
  let j = i + 1
  while (j < blocks.length && !(blocks[j].type === 'heading' && (blocks[j].data?.level ?? 1) <= niveau)) j++
  return { fra: i + 1, til: j }
}
