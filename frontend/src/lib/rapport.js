/**
 * rapport.js — rapporten i skrivebordsprogrammet.
 *
 * Filen er en liste af blokke (lib/femFile.js). FEM-visningen redigerer
 * rammeberegningen; Rapport-visningen redigerer resten: overskrifter,
 * tekstafsnit og egne beregninger, i den rækkefølge de står i rapporten.
 * Rammeberegningen ligger i samme liste og kan flyttes rundt i rapporten som
 * de andre blokke, men slettes ikke herfra -- den er modellen.
 *
 * Funktionerne her er rene (ingen React), så de kan testes for sig.
 */

// Det, man kan sætte ind i rapporten. Bevidst kort: simpel tekst og egen
// beregning. Resten af omkreds.dk's blokke hører til projekterne.
export const RAPPORT_TYPER = [
  { type: 'heading', label: 'Overskrift' },
  { type: 'text', label: 'Tekst' },
  { type: 'custom_calc', label: 'Egen beregning' },
]

const STANDARD = {
  heading: () => ({ level: 1, text: '' }),
  text: () => ({ text: '' }),
  custom_calc: () => ({
    title: 'Egen beregning', version: 2, subst: true,
    lines: ['# Forudsætninger', 'L = 4,0 m | spændvidde',
            'q_d = 5,0 kN/m | regningsmæssig linjelast', 'M_Ed = q_d·L²/8 → kNm'],
  }),
}

let _seq = 0
/** En ny blok af typen. Id'et er unikt, også for flere blokke i samme ms. */
export function nyBlok(type) {
  if (!STANDARD[type]) throw new Error(`Ukendt bloktype i rapporten: ${type}`)
  return { id: `r${Date.now().toString(36)}${(_seq++).toString(36)}`, type, data: STANDARD[type]() }
}

export const erFem = (b) => b?.type === 'general_frame_fem'

/** Blokken sat ind på plads i (0 = først). */
export function indsaet(blocks, i, blok) {
  const n = [...blocks]
  n.splice(Math.max(0, Math.min(i, n.length)), 0, blok)
  return n
}

/** Blokken på plads i flyttet én op (dir = -1) eller ned (dir = 1). */
export function flyt(blocks, i, dir) {
  const j = i + dir
  if (i < 0 || i >= blocks.length || j < 0 || j >= blocks.length) return blocks
  const n = [...blocks]
  ;[n[i], n[j]] = [n[j], n[i]]
  return n
}

/** Blokken på plads i fjernet. Rammeberegningen bliver. */
export function fjern(blocks, i) {
  if (erFem(blocks[i])) return blocks
  return blocks.filter((_, j) => j !== i)
}

/** Har rammeberegningen en model? En tom er ikke en del af rapporten. */
export const femHarModel = (b) => (b?.data?.elements?.length ?? 0) > 0

/** Er rammeberegningen med i rapporten (og PDF'en)? */
export const femIRapport = (b) => femHarModel(b) && b.iRapport !== false

/**
 * Blokkene, PDF'en laves af: rammeberegningen kun, når den har en model og
 * ikke er valgt fra. `tom` er sand, når der ikke er noget at skrive ud.
 */
export function pdfBlokke(blocks) {
  const ud = blocks.filter(b => (erFem(b) ? femIRapport(b) : true))
  const tom = !ud.some(b => (erFem(b)
    || (b.type === 'heading' && (b.data?.text ?? '').trim())
    || (b.type === 'text' && (b.data?.text ?? '').trim())
    || (b.type === 'custom_calc' && (b.data?._result?.length ?? 0) > 0)
    || !['heading', 'text', 'custom_calc'].includes(b.type)))
  return { blocks: ud, tom }
}
