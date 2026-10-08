/**
 * a1Afsnit — afsnit i A1, som hjælperen kan skrive.
 *
 * Et afsnit er en definition med spørgsmål og varianter (se robusthed.js).
 * Skabelonen (makeA1Template) og hjælperen kalder den samme `skriv`, så et
 * nyt A1 og en tekst fra hjælperen ikke kan komme til at afvige.
 *
 * Overskriften genkendes på nøglen, skabelonen sætter (data.afsnit), eller i
 * ældre sager på titlen uden nummer ("4.5 Robusthed" → "robusthed").
 */
import robusthed from './robusthed.js'
import { DEFAULT_OPTIONS, suggestCC, baerendeSystem } from '../a1.js'

export const AFSNIT = [robusthed]

const efterNoegle = new Map(AFSNIT.map(a => [a.key, a]))
const efterTitel  = new Map(AFSNIT.map(a => [a.titel.toLowerCase(), a]))

/** Afsnittet, en overskriftsblok indleder — eller null. */
export function findAfsnit(block) {
  if (block?.type !== 'heading') return null
  const d = block.data ?? {}
  if (d.afsnit && efterNoegle.has(d.afsnit)) return efterNoegle.get(d.afsnit)
  const titel = (d.text ?? '').trim().replace(/^\d+(?:\.\d+)*\.?\s+/, '').toLowerCase()
  return efterTitel.get(titel) ?? null
}

/**
 * Det, varianterne skriver ud fra: projektbeskrivelsen med det afledte
 * (konsekvensklasse, bærende dele, stabilisering) regnet ud én gang.
 * `kendt` er false, når projektet ikke har en beskrivelse endnu.
 */
export function kontekst(options) {
  const kendt = !!options
  const o = { ...DEFAULT_OPTIONS, ...(options ?? {}),
              materialer: { ...DEFAULT_OPTIONS.materialer, ...(options?.materialer ?? {}) },
              stabilisering: { ...DEFAULT_OPTIONS.stabilisering, ...(options?.stabilisering ?? {}) } }
  const { cc } = suggestCC(o)
  const { dele, stab } = baerendeSystem(o)
  return { ...o, cc: o.ccValgt ?? cc, dele, stab, kendt }
}

/** Varianterne med den anbefalede først. */
export function varianterFor(afsnit, ktx) {
  const anbefalet = afsnit.varianter.filter(v => v.passer(ktx))
  return [...anbefalet.map(v => ({ ...v, anbefalet: true })),
          ...afsnit.varianter.filter(v => !anbefalet.includes(v)).map(v => ({ ...v, anbefalet: false }))]
}

/** En variants blokke, med id'er der ikke støder sammen med dokumentets. */
export function skrivVariant(variant, ktx, svar, naesteId = Date.now()) {
  let id = naesteId
  return variant.skriv(ktx, svar).map(b => ({ id: id++, ...b }))
}

/**
 * Fingeraftryk af et afsnits indhold, så hjælperen kan se, om det er rettet
 * siden sidst, den skrev det. Kun type og data tæller, ikke id'er.
 */
export function fingeraftryk(blokke) {
  const s = JSON.stringify(blokke.map(b => [b.type, b.data]))
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
