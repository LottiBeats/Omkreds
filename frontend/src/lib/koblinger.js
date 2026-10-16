/**
 * koblinger.js — værdier fra regnearksbogen i beregningsblokkene.
 *
 * En navngiven celle i bogen (en udgang, fx w_kip_V4) kan kobles til et
 * talfelt i en hvilken som helst beregningsblok: skriv "=" i feltet og vælg
 * navnet. Blokken husker koblingen i data._links = { "loads.0.w_kNm": "w_kip_V4" }
 * (stien til feltet i blokkens data → navnet), og værdien sættes igen, hver
 * gang bogen ændres. Da værdien er en del af blokkens input, står en
 * beregning, der er regnet med den gamle værdi, som "kør igen".
 *
 * Stien findes uden at blokken ved noget om det: NumericInput siger "nu
 * kommer værdien v fra navnet n", blokken ændrer sine data som altid, og
 * forskellen mellem før og efter viser, hvilket felt det var. Skriver man
 * senere selv et tal i feltet, er koblingen væk.
 *
 * Egen beregning: en linje kan hente en udgang med [navn], fx
 *   q_d = [w_kip_V4]          → q_d = 7,39 kN/m  | fra regnearket: Lastnedføring!P14
 *
 * Funktionerne er rene (ingen React), så de kan testes for sig.
 */
import { evaluate, toReportBlocks } from './calcEngine.js'
import { bogAf, udgange } from './regnearksbog.js'

// ── Stier i blokkens data ───────────────────────────────────────────────────

export const stiTekst = (sti) => sti.join('.')
export const laesSti = (tekst) => String(tekst).split('.').map(x => (/^\d+$/.test(x) ? Number(x) : x))

export function hent(obj, sti) {
  let o = obj
  for (const k of sti) { if (o === null || o === undefined) return undefined; o = o[k] }
  return o
}

/** obj med værdien v på stien (kopier hele vejen ned; resten deles). */
export function saet(obj, sti, v) {
  if (!sti.length) return v
  const [k, ...rest] = sti
  const kopi = Array.isArray(obj) ? [...obj] : { ...(obj ?? {}) }
  kopi[k] = saet(obj?.[k], rest, v)
  return kopi
}

const ensTal = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a))

/** Stierne til tal i ny, der er ændret i forhold til gl. Interne felter (_result …) springes over. */
export function aendredeTal(gl, ny, sti = []) {
  const ud = []
  if (typeof ny === 'number') {
    if (!ensTal(gl, ny)) ud.push(sti)
    return ud
  }
  if (ny && typeof ny === 'object') {
    for (const k of Object.keys(ny)) {
      if (typeof k === 'string' && k.startsWith('_')) continue
      const glK = gl && typeof gl === 'object' ? gl[k] : undefined
      if (glK === ny[k]) continue
      ud.push(...aendredeTal(glK, ny[k], [...sti, Array.isArray(ny) ? Number(k) : k]))
    }
  }
  return ud
}

/**
 * Blokkens nye data med _links ajour efter en ændring:
 *   ventende = { navn, vaerdi }: felterne, der netop har fået værdien, kobles til navnet.
 *   Et koblet felt, der har fået en anden værdi end udgangens, er rettet i hånden: koblingen fjernes.
 */
export function opdaterLinks(glData, nyData, ventende = null, udgMap = new Map()) {
  const links = { ...(nyData?._links ?? glData?._links ?? {}) }
  const aendret = aendredeTal(glData, nyData)
  let rettet = false
  for (const sti of aendret) {
    const s = stiTekst(sti)
    const v = hent(nyData, sti)
    if (ventende && ensTal(v, ventende.vaerdi)) { links[s] = ventende.navn; rettet = true; continue }
    if (links[s]) {
      const u = udgMap.get(links[s])
      if (!u || !ensTal(u.vaerdi, v)) { delete links[s]; rettet = true }
    }
  }
  // Et felt, der ikke findes mere (fx en slettet last), har ingen kobling.
  for (const s of Object.keys(links)) {
    if (typeof hent(nyData, laesSti(s)) !== 'number') { delete links[s]; rettet = true }
  }
  if (!rettet && JSON.stringify(links) === JSON.stringify(nyData?._links ?? {})) return nyData
  const { _links, ...rest } = nyData
  return Object.keys(links).length ? { ...rest, _links: links } : rest
}

// ── Udgange ─────────────────────────────────────────────────────────────────

/** Bogens udgange som Map navn → udgang. */
export const udgangsMap = (bog) => new Map(udgange(bog).map(u => [u.navn, u]))

/** Et tal som Egen beregning læser det, med dansk komma. */
const talTekst = (v) => String(Number(v.toPrecision(10))).replace('.', ',')

/** Enheden som Egen beregning skriver den (tom, "-" og "—" = ingen). */
const enhedTekst = (e) => {
  const t = String(e ?? '').trim()
  return !t || t === '-' || t === '—' ? '' : t
}

/**
 * Linjerne med [navn] erstattet af udgangens værdi og enhed. Står navnet
 * alene på højre side, er linjen et input; ellers sættes det i parentes.
 * Linjen får kilden som beskrivelse. Returnerer { lines, fejl: Map(i → tekst) }.
 */
export function udfoldUdgange(lines, udgMap) {
  const fejl = new Map()
  const ud = (lines ?? []).map((raw, i) => {
    const t = String(raw ?? '')
    if (!t.includes('[')) return t
    const kilder = []
    const [krop, ...beskr] = t.split('|')
    const alene = /^\s*[^=]+=\s*\[[^\]]+\]\s*(→.*)?$/.test(krop)
    const ny = krop.replace(/\[\s*([A-Za-zÆØÅæøå_][\wÆØÅæøå]*)\s*\]/g, (hel, navn) => {
      const u = udgMap.get(navn) ?? [...udgMap.values()].find(x => x.navn.toLowerCase() === navn.toLowerCase())
      if (!u) { fejl.set(i, `Regnearket har ingen celle, der hedder ${navn}.`); return hel }
      if (u.fejl) { fejl.set(i, `${navn} i regnearket: ${u.fejl}.`); return hel }
      kilder.push(`${u.arkNavn}!${u.celle}`)
      const e = enhedTekst(u.enhed)
      const q = `${talTekst(u.vaerdi)}${e ? ' ' + e : ''}`
      return alene || !e ? q : `(${q})`
    })
    if (!kilder.length) return ny
    const kilde = `fra regnearket: ${kilder.join(', ')}`
    const b = beskr.join('|').trim()
    return `${ny.trimEnd()} | ${b ? `${b} (${kilde})` : kilde}`
  })
  return { lines: ud, fejl }
}

/** evaluate() med udgangene foldet ud; en ukendt udgang er en fejl på linjen. */
export function evaluerMedUdgange(lines, udgMap) {
  const { lines: ud, fejl } = udfoldUdgange(lines, udgMap)
  const rows = evaluate(ud)
  return rows.map((r, i) => (fejl.has(i) ? { ...r, error: fejl.get(i) } : r))
}

const harUdgangslinjer = (d) => (d?.lines ?? []).some(l => /\[\s*[A-Za-zÆØÅæøå_][\wÆØÅæøå]*\s*\]/.test(String(l)))

// ── Når bogen ændres ────────────────────────────────────────────────────────

/** Blokken med koblede værdier og evt. Egen beregnings rapport ajour (samme objekt, hvis intet er ændret). */
export function anvendPaaBlok(blok, udgMap) {
  const d = blok?.data
  if (!d) return blok
  let ny = d
  for (const [s, navn] of Object.entries(d._links ?? {})) {
    const u = udgMap.get(navn)
    if (!u || u.vaerdi === null) continue
    const sti = laesSti(s)
    if (!ensTal(hent(ny, sti), u.vaerdi)) ny = saet(ny, sti, u.vaerdi)
  }
  if (blok.type === 'custom_calc' && harUdgangslinjer(d)) {
    const res = toReportBlocks(d.title, evaluerMedUdgange(d.lines, udgMap), { subst: d.subst ?? true })
    if (JSON.stringify(res) !== JSON.stringify(d._result ?? null)) ny = { ...ny, _result: res }
  }
  return ny === d ? blok : { ...blok, data: ny }
}

export function anvendPaaBlokke(blocks, udgMap) {
  let aendret = false
  const ud = (blocks ?? []).map(b => { const n = anvendPaaBlok(b, udgMap); if (n !== b) aendret = true; return n })
  return aendret ? ud : blocks
}

/** Projektet med alle koblinger ajour efter bogen. */
export function anvendKoblinger(project) {
  const udgMap = udgangsMap(bogAf(project))
  let aendret = false
  const documents = {}
  for (const [id, doc] of Object.entries(project?.documents ?? {})) {
    const blocks = anvendPaaBlokke(doc?.blocks ?? [], udgMap)
    const subdocs = (doc?.subdocs ?? []).map(sd => {
      const b = anvendPaaBlokke(sd.blocks ?? [], udgMap)
      return b === sd.blocks ? sd : { ...sd, blocks: b }
    })
    const docAendret = blocks !== (doc?.blocks ?? []) || subdocs.some((sd, i) => sd !== doc?.subdocs?.[i])
    if (docAendret) aendret = true
    documents[id] = docAendret ? { ...doc, blocks, subdocs } : doc
  }
  return aendret ? { ...project, documents } : project
}

/** Koblingerne i projektet til navnet (til "bruges af" i bogen): [{ doc, sub, blok, sti }]. */
export function koblingerTil(project, navn) {
  const ud = []
  for (const [doc, d] of Object.entries(project?.documents ?? {})) {
    const se = (blocks, sub) => (blocks ?? []).forEach(blok => {
      for (const [sti, n] of Object.entries(blok.data?._links ?? {})) if (n === navn) ud.push({ doc, sub, blok, sti })
      if (blok.type === 'custom_calc' && (blok.data?.lines ?? []).some(l => String(l).includes(`[${navn}]`))) ud.push({ doc, sub, blok, sti: 'lines' })
    })
    se(d?.blocks, null)
    ;(d?.subdocs ?? []).forEach((sd, i) => se(sd.blocks, i))
  }
  return ud
}
