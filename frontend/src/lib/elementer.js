/**
 * elementer.js — konstruktionsafsnittene i A2.2: bjælker, søjler, samlinger …
 *
 * De statiske beregninger, der faktisk afleveres, er bygget ens, uanset om
 * sagen er en vægnedrivning på 25 sider eller et typehus på 170: A2.2 er en
 * liste af elementer (B.1, S.1, F.1 …), hvert med sin eftervisning. Det er
 * listen, der gør en sag lille eller stor, ikke opbygningen.
 *
 * Et element er en blok af typen 'element' -- en overskrift med nummer, navn,
 * art og materiale -- og de blokke, der står under den, hører til elementet.
 * Elementerne ligger altså i dokumentets egen blokliste og ikke for sig:
 * beregningerne finder deres laster blandt søsterblokkene (lastkombinationer,
 * rammeberegning), og den forbindelse må et element ikke skære over.
 *
 * Alt her er afledt af bloklisten. Intet gemmes ved siden af den, så listen
 * kan ikke komme ud af trit med dokumentet.
 */
import { maxUtilization } from './utilization.js'
import { hasCalcResult, isStaleResult } from './calcState.js'

export const ARTER = [
  { key: 'bjaelke',   label: 'Bjælke',    prefix: 'B'  },
  { key: 'spaer',     label: 'Spær',      prefix: 'SP' },
  { key: 'hanebaand', label: 'Hanebånd',  prefix: 'HB' },
  { key: 'soejle',    label: 'Søjle',     prefix: 'S'  },
  { key: 'vaeg',      label: 'Væg',       prefix: 'V'  },
  { key: 'daek',      label: 'Dæk',       prefix: 'D'  },
  { key: 'samling',   label: 'Samling',   prefix: 'SA' },
  { key: 'fundament', label: 'Fundament', prefix: 'F'  },
  { key: 'andet',     label: 'Andet',     prefix: 'E'  },
]

export const MATERIALER = [
  { key: 'trae',     label: 'Træ'     },
  { key: 'staal',    label: 'Stål'    },
  { key: 'beton',    label: 'Beton'   },
  { key: 'murvaerk', label: 'Murværk' },
]

const ART = Object.fromEntries(ARTER.map(a => [a.key, a]))
const MAT = Object.fromEntries(MATERIALER.map(m => [m.key, m]))

export const artLabel = (k) => ART[k]?.label ?? 'Element'
export const materialeLabel = (k) => MAT[k]?.label ?? ''

/**
 * Hvilken beregning et nyt element starter med.
 *
 * Kun moduler, der er efterregnet og står i paletten. Et element, der ikke
 * har et, får en tom Egen beregning -- ikke et modul, der kan give grønne tal
 * på et forkert grundlag. Murværk, beton, samlinger og fundamenter ender dér,
 * indtil de har en beregning, der er gået igennem samme kontrol.
 */
const BEREGNING = {
  'bjaelke:trae':   'timber_beam',
  'spaer:trae':     'timber_beam',
  'hanebaand:trae': 'timber_beam',
  'soejle:trae':    'timber_column',
  'bjaelke:staal':  'steel_beam',
  'soejle:staal':   'steel_column',
}

export function beregningFor(art, materiale) {
  return BEREGNING[`${art}:${materiale}`] ?? 'custom_calc'
}

/** Tallet efter punktummet i et elementnummer: SP.12 → 12. */
function loebenr(nr, prefix) {
  const m = String(nr ?? '').trim().match(/^([A-ZÆØÅ]+)\.(\d+)$/i)
  return m && m[1].toUpperCase() === prefix ? Number(m[2]) : 0
}

/**
 * Næste ledige nummer for en art. Numre gives én gang og flyttes ikke:
 * de står på tegningerne (A3) og i kontrolplanen, så et element, der skifter
 * nummer, fordi et andet blev slettet, peger pludselig på noget andet.
 */
export function naesteNr(blocks, art) {
  const prefix = ART[art]?.prefix ?? 'E'
  let max = 0
  for (const b of blocks ?? []) {
    if (b.type === 'element') max = Math.max(max, loebenr(b.data?.nr, prefix))
  }
  return `${prefix}.${max + 1}`
}

/**
 * Hvor et element slutter: ved det næste element, eller ved en overskrift på
 * samme eller et højere niveau. "4. Konklusion" efter sidste spær hører ikke
 * til spæret.
 */
function slutAf(blocks, i) {
  const niveau = blocks[i].data?.level ?? 2
  for (let j = i + 1; j < blocks.length; j++) {
    const b = blocks[j]
    if (b.type === 'element') return j
    if (b.type === 'heading' && (b.data?.level ?? 1) <= niveau) return j
  }
  return blocks.length
}

const erBeregning = (b) => !!b?.data && '_result' in b.data

/**
 * Hvor langt et element er, ud fra beregningerne under det. Samme rækkefølge
 * som dokumentstatus: fejler → forældet → ikke kørt → eftervist.
 */
function elementStatus(beregninger) {
  if (beregninger.length === 0) return { tone: 'idle', tekst: 'ingen beregning', eta: null }
  let eta = null, forael = 0, ikkeKoert = 0
  for (const b of beregninger) {
    if (isStaleResult(b)) forael++
    else if (!hasCalcResult(b)) ikkeKoert++
    const r = maxUtilization(b.data?._result)
    if (r !== null && (eta === null || r > eta)) eta = r
  }
  const fejler = beregninger.some(b => Array.isArray(b.data?._result) &&
    b.data._result.some(x => x?.type === 'check' && x.passes === false))
  if (fejler || (eta !== null && eta > 1)) return { tone: 'fail', tekst: 'ikke OK', eta }
  if (forael) return { tone: 'warn', tekst: 'forældet', eta }
  if (ikkeKoert) return { tone: 'warn', tekst: 'ikke kørt', eta }
  if (eta === null) return { tone: 'idle', tekst: 'ingen eftervisning', eta }
  return { tone: 'ok', tekst: 'OK', eta }
}

/** Elementerne i en blokliste, i dokumentets rækkefølge, med deres status. */
export function elementerI(blocks) {
  const ud = []
  const list = blocks ?? []
  list.forEach((b, i) => {
    if (b.type !== 'element') return
    const slut = slutAf(list, i)
    const medlemmer = list.slice(i + 1, slut)
    const beregninger = medlemmer.filter(erBeregning)
    ud.push({ block: b, index: i, slut, beregninger, status: elementStatus(beregninger) })
  })
  return ud
}

/**
 * Hvor et nyt element skal stå: lige efter det sidste elements blokke, så
 * listen holder sammen. Uden elementer: nederst i dokumentet.
 */
export function indsaetPlads(blocks) {
  const el = elementerI(blocks)
  return el.length ? el[el.length - 1].slut : (blocks?.length ?? 0)
}

/**
 * Blokkene til et nyt element: overskriften og dens beregning, uden id'er
 * og uden de felter, bloktypen selv har som standard -- dem lægger
 * BlockList på, så et element og en blok fra paletten starter ens.
 */
export function nytElement(blocks, { art, materiale, navn, level = 2 }) {
  const nr = naesteNr(blocks, art)
  const titel = navn?.trim() || artLabel(art)
  const type = beregningFor(art, materiale)
  const beregning = type === 'custom_calc'
    // Ingen eksempeltal: et talstykke, man skal huske at slette, ligner ikke
    // en fejl, når det står i en udstedt rapport.
    ? { title: titel, version: 2, subst: true, lines: ['# Forudsætninger', '', '# Eftervisning', ''], _result: null }
    : { title: titel, label: nr }
  return [
    { type: 'element', data: { nr, navn: titel, art, materiale, beskrivelse: '', level } },
    { type, data: beregning },
  ]
}
