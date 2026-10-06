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

// ── Elementer fra rammeberegningen ─────────────────────────────────────────
//
// I en rammekonstruktion er elementerne stængerne i modellen. Snitkræfterne
// kommer fra rammeberegningen, og den eftervisner selv hver stang -- også som
// søjle, med knæklængden og N og M fra samme kombination. Et element, der er
// koblet til en stang, læser den eftervisning; bjælker og spær får derudover
// en træ- eller stålbjælke, der henter stangens snitkræfter, så eftervisningen
// står fuldt ud i rapporten.

const FEM = 'general_frame_fem'

/** Træ angives som "45x145" i rammen; bjælkeblokken vil have b og h. */
export function traeTvaersnit(section) {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*$/.exec(section ?? '')
  if (!m) return null
  const a = parseFloat(m[1].replace(',', '.')), c = parseFloat(m[2].replace(',', '.'))
  return { b: Math.min(a, c), h: Math.max(a, c) }
}

/**
 * Stængerne i dokumentets rammeberegninger: hver gruppe (member) er én stang,
 * og et element uden gruppe er sin egen. exportId er det id, rammen giver
 * stangens snitkræfter -- 1000 + gruppe, eller elementets eget -- og det er
 * fast, så koblingen holder, også før rammen er kørt.
 */
export function rammeStaenger(blocks) {
  const ud = []
  for (const fem of blocks ?? []) {
    if (fem.type !== FEM) continue
    const d = fem.data ?? {}
    const knude = Object.fromEntries((d.nodes ?? []).map(n => [n.id, n]))
    const grupper = new Map()
    for (const e of d.elements ?? []) {
      const k = e.member_id != null ? `m${e.member_id}` : `e${e.id}`
      if (!grupper.has(k)) grupper.set(k, [])
      grupper.get(k).push(e)
    }
    for (const [k, els] of grupper) {
      const e0 = els[0]
      const memberId = k[0] === 'm' ? e0.member_id : null
      const L = els.reduce((s, e) => {
        const a = knude[e.ni], b = knude[e.nj]
        return s + (a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0)
      }, 0)
      let dx = 0, dy = 0
      for (const e of els) {
        const a = knude[e.ni], b = knude[e.nj]
        if (a && b) { dx += Math.abs(b.x - a.x); dy += Math.abs(b.y - a.y) }
      }
      ud.push({
        key: `${fem.id}:${k}`, femId: fem.id,
        memberId, elemId: memberId == null ? e0.id : null,
        exportId: memberId != null ? 1000 + memberId : e0.id,
        navn: memberId != null ? `stang ${memberId}` : `element ${e0.id}`,
        material: e0.material, section: e0.section, grade: e0.grade,
        L, retning: dx < 0.1 * dy ? 'lodret' : dy < 0.1 * dx ? 'vandret' : 'skraa',
        kunNormalkraft: els.every(e => e.release === 'both' || e.type === 'truss'),
      })
    }
  }
  return ud
}

const sammeStang = (kilde, st) => kilde && st &&
  kilde.fem_block_id === st.femId &&
  (st.memberId != null ? kilde.member_id === st.memberId : kilde.elem_id === st.elemId)

/** Hvad en stang nok er -- et forslag, som tilføj-formularen viser og man kan rette. */
export function forslagFor(st) {
  const materiale = st.material === 'steel' ? 'staal' : 'trae'
  let art = 'bjaelke'
  if (st.retning === 'lodret') art = 'soejle'
  else if (st.kunNormalkraft && materiale === 'trae') art = 'hanebaand'
  else if (st.retning === 'skraa' && materiale === 'trae') art = 'spaer'
  const tv = st.section ? ` ${st.section}${st.grade ? ' ' + st.grade : ''}` : ''
  return { art, materiale, navn: `${artLabel(art)}${tv}` }
}

/** Stænger, der endnu ikke har et element. */
export function ledigeStaenger(blocks) {
  const koblet = (blocks ?? []).filter(b => b.type === 'element' && b.data?.kilde).map(b => b.data.kilde)
  return rammeStaenger(blocks).filter(st => !koblet.some(k => sammeStang(k, st)))
}

/** Rammens egen eftervisning af den stang, et element er koblet til. */
export function rammeEftervisning(blocks, kilde) {
  if (!kilde) return null
  const fem = (blocks ?? []).find(b => b.id === kilde.fem_block_id && b.type === FEM)
  if (!fem) return { mangler: true }
  const kort = fem.data?._member_checks
  return {
    fem,
    forael: isStaleResult(fem),
    koert: hasCalcResult(fem) && !!kort,
    check: kilde.member_id != null ? kort?.[kilde.member_id] ?? null : null,
  }
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
 * Hvor langt et element er: beregningerne under det og, for en stang i en
 * ramme, rammens egen eftervisning af stangen. Samme rækkefølge som
 * dokumentstatus: fejler → forældet → ikke kørt → eftervist.
 */
function elementStatus(beregninger, ramme) {
  if (beregninger.length === 0 && !ramme) return { tone: 'idle', tekst: 'ingen beregning', eta: null }
  let eta = null, forael = 0, ikkeKoert = 0, saerskilt = null
  const tag = (r) => { if (typeof r === 'number' && (eta === null || r > eta)) eta = r }
  for (const b of beregninger) {
    if (isStaleResult(b)) forael++
    else if (!hasCalcResult(b)) ikkeKoert++
    tag(maxUtilization(b.data?._result))
  }
  if (ramme) {
    if (ramme.mangler) return { tone: 'fail', tekst: 'ramme mangler', eta }
    if (ramme.forael) forael++
    else if (!ramme.koert) ikkeKoert++
    tag(ramme.check?.eta)
    if (ramme.check?.skipped) saerskilt = ramme.check.skipped
  }
  const fejler = beregninger.some(b => Array.isArray(b.data?._result) &&
    b.data._result.some(x => x?.type === 'check' && x.passes === false))
  if (fejler || (eta !== null && eta > 1)) return { tone: 'fail', tekst: 'ikke OK', eta }
  if (forael) return { tone: 'warn', tekst: 'forældet', eta }
  if (ikkeKoert) return { tone: 'warn', tekst: 'ikke kørt', eta }
  // Rammen sprang stangen over (fx et hanebånd i træk), og intet under
  // elementet har eftervist den: så er den ikke eftervist, uanset farven.
  if (saerskilt && beregninger.length === 0) return { tone: 'warn', tekst: 'eftervises særskilt', eta, note: saerskilt }
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
    const ramme = rammeEftervisning(list, b.data?.kilde)
    ud.push({ block: b, index: i, slut, beregninger, ramme, status: elementStatus(beregninger, ramme) })
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
 *
 * Med en stang fra rammen kobles elementet til den. En bjælke eller et spær
 * får en bjælkeblok, der henter stangens snitkræfter; en søjle får ingen
 * blok, for søjleblokkene kan ikke læse rammen -- dens eftervisning er
 * rammens egen (knæklængde og N, M fra samme kombination), og den skrives
 * under elementet i rapporten.
 */
export function nytElement(blocks, { art, materiale, navn, level = 2, stang = null }) {
  const nr = naesteNr(blocks, art)
  const titel = navn?.trim() || artLabel(art)
  const type = beregningFor(art, materiale)
  const kilde = stang
    ? { fem_block_id: stang.femId, member_id: stang.memberId, elem_id: stang.elemId }
    : undefined
  const element = { type: 'element', data: { nr, navn: titel, art, materiale, beskrivelse: '', level, ...(kilde ? { kilde } : {}) } }

  const fraRamme = stang ? {
    load_source: 'fem', fem_block_id: stang.femId, fem_elem_id: stang.exportId, fem_end: 'max',
    span_m: Number(stang.L.toFixed(3)),
  } : null

  // Et led med charnier i begge ender har kun normalkraft. En bjælkeblok
  // ville vise η ≈ 0 og "OK" for et hanebånd i træk, som ingen har eftervist.
  if (stang?.kunNormalkraft) {
    return [element, { type: 'custom_calc', data: { title: titel, version: 2, subst: true,
      lines: ['# Forudsætninger', '', '# Eftervisning', ''], _result: null } }]
  }
  if (type === 'timber_beam') {
    const tv = stang && traeTvaersnit(stang.section)
    return [element, { type, data: { title: titel, label: nr, ...(fraRamme ?? {}),
      ...(tv ? { b_mm: tv.b, h_mm: tv.h } : {}), ...(stang?.grade ? { timber_grade: stang.grade } : {}) } }]
  }
  if (type === 'steel_beam') {
    return [element, { type, data: { title: titel, label: nr, ...(fraRamme ?? {}),
      ...(stang?.section ? { section: stang.section } : {}), ...(stang?.grade ? { grade: stang.grade } : {}) } }]
  }
  // En søjle i en gruppe eftervises af rammen; der er intet at tilføje.
  if (stang && stang.memberId != null && (type === 'timber_column' || type === 'steel_column')) return [element]
  if (type === 'custom_calc' || stang) {
    // Ingen eksempeltal: et talstykke, man skal huske at slette, ligner ikke
    // en fejl, når det står i en udstedt rapport.
    return [element, { type: 'custom_calc', data: { title: titel, version: 2, subst: true,
      lines: ['# Forudsætninger', '', '# Eftervisning', ''], _result: null } }]
  }
  return [element, { type, data: { title: titel, label: nr } }]
}
