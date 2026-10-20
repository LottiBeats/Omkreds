/**
 * lastnedfoering.js — elementerne i standardbogens "Lodret lastnedføring".
 *
 * Arket er blokke oppefra og ned (scripts/lav_standardbog.py):
 *
 *   ID-række     A: ID · B: art · C/D: x_A/x_B (x₁/x₂) · E: ovenover · U: =$A{r}
 *   underoverskrift
 *   lastrækker   A: kilde · B: del · C/D: x₁/x₂ · E: faktor — den sidste er tom
 *   resultater   R_A/R_B, N, M, x_start, x_slut, q — U: =$A{r}&"/del"
 *
 * og nederst en oversigt med en række pr. nøgle (ID/del). Funktionerne her
 * sætter et nyt element ind, kopierer et, fjerner et og giver et element en
 * ny lastrække — som almindelige rækker og formler, så arket stadig er et
 * regneark, man kan rette og hente som Excel. Nye blokke bygges af
 * prototyperne i standardbogen og flyttes ned til den række, de sættes ind i.
 *
 * Rene funktioner uden React (tests/lastnedfoering.test.mjs).
 */
import standard from '../templates/bog/standard.js'
import { forskydFormel, laesAdresse, adresse } from './regneark.js'
import { aendrGitter, medArk } from './regnearksbog.js'

const K = { A: 0, B: 1, C: 2, D: 3, E: 4, H: 7, U: 20, AH: 33 }
const P = standard.lastnedfoering

/** Arterne i "+ Element": navn, ID-bogstav og hvad elementet giver. */
export const ARTER = [
  { art: 'Spær', bogstav: 'T', giver: 'R_A og R_B pr. m', noter: 'to understøtninger x_A, x_B' },
  { art: 'Dæk', bogstav: 'D', giver: 'R_A og R_B pr. m', noter: 'to understøtninger x_A, x_B' },
  { art: 'Bjælke', bogstav: 'B', giver: 'R_A og R_B i kN', noter: 'to understøtninger x_A, x_B' },
  { art: 'Væg', bogstav: 'V', giver: 'N, M og linjelasten q', noter: 'linjeunderstøttet x₁–x₂' },
  { art: 'Fundament', bogstav: 'F', giver: 'N, M og linjelasten q', noter: 'linjeunderstøttet x₁–x₂' },
  { art: 'Søjle', bogstav: 'S', giver: 'N', noter: 'punkt i x₁' },
  { art: 'Punktfundament', bogstav: 'F', giver: 'N', noter: 'punkt i x₁' },
]
const tilstand = (art) => (['Væg', 'Fundament'].includes(art) ? 2 : ['Søjle', 'Punktfundament'].includes(art) ? 3 : 1)

/** Nøglerne, et element får i oversigten, med enhed. */
export function oversigtNoegler(art) {
  const t = tilstand(art)
  if (t === 1) { const e = art === 'Bjælke' ? 'kN' : 'kN/m'; return [['A', e], ['B', e]] }
  return t === 2 ? [['N', 'kN'], ['q', 'kN/m']] : [['N', 'kN']]
}

/** Rækkerne i en ny blok af arten (uden skillerækken). */
export const antalRaekker = (art) => P.prototyper[art]?.celler.length ?? 0

export const erLastnedfoering = (ark) =>
  ark?.celler?.[0]?.[K.A] === 'ID / kilde' && ark.celler[0][K.U] === 'Nøgle'

const tekst = (v) => String(v ?? '').trim()
const tom = (raek) => !raek || raek.every(c => tekst(c) === '')

/** Elementerne i arket: { id, art, r, slut, laster, ledig, resultater: [{ del, r }] } (rækker 0-baseret). */
export function elementer(ark) {
  const c = ark?.celler ?? []
  const ud = []
  for (let r = 0; r < c.length; r++) {
    if (tekst(c[r]?.[K.U]) !== `=$A${r + 1}`) continue
    const resultater = [], laster = []
    let slut = r + 1
    for (let i = r + 2; i < c.length; i++) {
      const m = /^=\$A(\d+)&"\/(\w+)"$/.exec(tekst(c[i]?.[K.U]))
      if (m && Number(m[1]) === r + 1) { resultater.push({ del: m[2], r: i }); slut = i; continue }
      if (resultater.length || tekst(c[i]?.[K.U]) === `=$A${i + 1}`) break
      laster.push(i)
    }
    ud.push({ id: tekst(c[r][K.A]), art: tekst(c[r][K.B]), r, slut, laster, ledig: laster.at(-1) ?? null, resultater })
  }
  return ud
}

/** Elementet, rækken r ligger i (eller null). */
export const elementVed = (ark, r) => elementer(ark).find(e => r >= e.r && r <= e.slut) ?? null

/** Oversigtens rækker: { hoved, raekker: [{ r, noegle }] }, eller null. */
export function oversigt(ark) {
  const c = ark?.celler ?? []
  const sidste = elementer(ark).at(-1)
  const hoved = c.findIndex((raek, r) => r > (sidste?.slut ?? 0) && tekst(raek?.[K.A]) === 'Nøgle')
  if (hoved < 0) return null
  const raekker = []
  for (let r = hoved + 1; r < c.length && /SAMMENLIGN/.test(tekst(c[r]?.[K.AH])); r++) raekker.push({ r, noegle: tekst(c[r][K.A]) })
  return { hoved, raekker }
}

/** Rækken (0-baseret) til et nyt sidste element: den tomme række, oversigtens områder slutter i. */
function slutRaekke(ark) {
  const o = oversigt(ark)
  const f = o && tekst(ark.celler[o.raekker[0]?.r]?.[K.AH])
  const m = f && /\$U\$\d+:\$U\$(\d+)/.exec(f)
  if (m) return Number(m[1]) - 1
  const sidste = elementer(ark).at(-1)
  return sidste ? sidste.slut + 1 : (ark.celler?.length ?? 0)
}

/** Opbygningernes ID'er (kolonne A i det ark, lastrækkerne slår op i). */
function opbygningsIder(bog, ark) {
  const ref = opbygningsRef(ark)
  const navn = ref.navn.replace(/^'|'$/g, '').replace(/''/g, "'")
  const op = bog.ark.find(a => a.navn.trim().toLowerCase() === navn.trim().toLowerCase())
  return new Set((op?.celler ?? []).slice(1).map(r => tekst(r?.[0])).filter(Boolean))
}

/** Hvor lastrækkerne slår opbygningerne op: { navn, fra, til } (1-baseret). */
function opbygningsRef(ark) {
  for (const raek of ark.celler ?? []) for (const c of raek ?? []) {
    const m = /SAMMENLIGN\(\$A\d+;((?:'(?:[^']|'')+')|[^;()!]+)!\$A\$(\d+):\$A\$(\d+);0\)/.exec(tekst(c))
    if (m) return { navn: m[1], fra: Number(m[2]), til: Number(m[3]) }
  }
  return { navn: P.opbygninger.navn, fra: P.opbygninger.fra, til: P.opbygninger.til }
}

/** Arkets første globale række S (1-baseret), som de lange områder starter i. */
function startRaekke(ark) {
  for (const raek of ark.celler ?? []) for (const c of raek ?? []) {
    const m = /SAMMENLIGN\(9E\+9;\$AA\$(\d+):/.exec(tekst(c))
    if (m) return Number(m[1])
  }
  return P.S
}

/** Prototypen for arten, flyttet ned, så ID-rækken står i rækken r0 (0-baseret), og tilpasset arket. */
function prototype(art, ark, r0) {
  const p = P.prototyper[art]
  const dr = r0 - (p.fra - 1)
  const S = startRaekke(ark), op = opbygningsRef(ark), o = P.opbygninger
  const tilpas = (c) => {
    let x = forskydFormel(c, dr, 0)
    if (typeof x !== 'string' || !x.startsWith('=')) return x
    if (S !== P.S) x = x.replace(new RegExp(`([A-Z]+)\\$${P.S}:`, 'g'), `$1$${S}:`)
    return x.replace(new RegExp(`${o.navn}!(\\$?[A-Z]+)\\$${o.fra}:(\\$?[A-Z]+)\\$${o.til}`, 'g'),
      (_h, a, b) => `${op.navn}!${a}$${op.fra}:${b}$${op.til}`)
  }
  const flyt = (obj) => Object.fromEntries(Object.entries(obj ?? {}).map(([k, v]) => {
    const a = laesAdresse(k)
    return [a ? adresse(a.r + dr, a.k) : k, v]
  }))
  return { celler: p.celler.map(raek => raek.map(tilpas)), fed: flyt(p.fed), dec: flyt(p.dec), fmt: flyt(p.fmt) }
}

/** Sæt rækker ind i arkets celler fra rækken r0 (rækkerne skal findes i forvejen). */
function skrivRaekker(a, r0, raekker, fmt = {}) {
  const celler = a.celler.map(r => [...r])
  raekker.forEach((raek, i) => {
    const ud = [...(celler[r0 + i] ?? [])]
    raek.forEach((v, k) => { while (ud.length <= k) ud.push(''); ud[k] = v })
    celler[r0 + i] = ud
  })
  return { ...a, celler, fed: { ...a.fed, ...fmt.fed }, dec: { ...a.dec, ...fmt.dec }, fmt: { ...a.fmt, ...fmt.fmt } }
}

const medEt = (bog, nyt) => ({ ...bog, ark: bog.ark.map(a => (a.id === nyt.id ? nyt : a)) })
const arkAf = (bog, id) => bog.ark.find(a => a.id === id)

/** Et ID, der ikke er brugt: V1, V2 … efter artens bogstav. */
export function ledigtId(bog, arkId, art) {
  const ark = arkAf(bog, arkId)
  const brugt = new Set([...elementer(ark).map(e => e.id), ...opbygningsIder(bog, ark)].map(x => x.toLowerCase()))
  const b = ARTER.find(x => x.art === art)?.bogstav ?? 'E'
  let i = 1
  while (brugt.has(`${b}${i}`.toLowerCase())) i++
  return `${b}${i}`
}

/** Er ID'et et gyldigt, ledigt ID? Fejltekst, eller null. */
export function tjekId(bog, arkId, id) {
  const t = tekst(id)
  if (!t) return 'Skriv et ID.'
  if (/[/"&;]/.test(t)) return 'Et ID må ikke indeholde / " & eller ;.'
  const ark = arkAf(bog, arkId)
  if (elementer(ark).some(e => e.id.toLowerCase() === t.toLowerCase())) return `${t} findes allerede i lastnedføringen.`
  if ([...opbygningsIder(bog, ark)].some(x => x.toLowerCase() === t.toLowerCase())) return `${t} er en opbygning — vælg et andet ID.`
  return null
}

/** Sæt oversigtsrækker ind for nøglerne [[del, enhed]] (efter den sidste udfyldte række). */
function tilOversigt(bog, arkId, id, noegler) {
  let b = bog
  for (const [del, enhed] of noegler) {
    const ark = arkAf(b, arkId)
    const o = oversigt(ark)
    if (!o?.raekker.length) return b
    const udfyldt = o.raekker.filter(x => x.noegle)
    const kilde = (udfyldt.at(-1) ?? o.raekker[0]).r
    const q = kilde + 1
    const raek = ark.celler[kilde].map(c => forskydFormel(c, q - kilde, 0))
    raek[K.A] = `${id}/${del}`
    raek[K.B] = enhed
    b = aendrGitter(b, arkId, 'r', q, 1, false)
    const a = arkAf(b, arkId)
    const fed = Object.fromEntries(Object.entries(ark.fed ?? {}).filter(([k]) => laesAdresse(k)?.r === kilde).map(([k, v]) => [adresse(q, laesAdresse(k).k), v]))
    const somKilde = (obj) => Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => laesAdresse(k)?.r === kilde).map(([k, v]) => [adresse(q, laesAdresse(k).k), v]))
    b = medEt(b, skrivRaekker(a, q, [raek], { fed, dec: somKilde(ark.dec), fmt: somKilde(ark.fmt) }))
  }
  return b
}

/**
 * Et nyt element efter elementet `efter` (eller sidst). opts: { art, id, xa, xb,
 * ovenover, beskrivelse, efter }. Giver { bog, r } (ID-rækken) eller { fejl }.
 */
export function nytElement(bog, arkId, { art, id, xa = '', xb = '', ovenover = '', beskrivelse = '', efter = null }) {
  const ark = arkAf(bog, arkId)
  if (!ark || !erLastnedfoering(ark)) return { fejl: 'Arket er ikke en lastnedføring.' }
  if (!P.prototyper[art]) return { fejl: `Ukendt art: ${art}.` }
  const fejl = tjekId(bog, arkId, id)
  if (fejl) return { fejl }
  const els = elementer(ark)
  const e = efter ? els.find(x => x.id === efter) : null
  if (efter && !e) return { fejl: `${efter} findes ikke.` }
  const p = e ? e.slut + 1 : slutRaekke(ark)
  if (tekst(ovenover) && !els.some(x => x.id.toLowerCase() === tekst(ovenover).toLowerCase() && x.slut < p)) {
    return { fejl: `"Ovenover" skal være et element, der står over det nye (${tekst(ovenover)} gør ikke).` }
  }
  const proto = P.prototyper[art].celler.length
  let b = aendrGitter(bog, arkId, 'r', p, proto + 1, false)   // rækken p bliver den tomme skillerække
  const pr = prototype(art, arkAf(b, arkId), p + 1)
  const hoved = [...pr.celler[0]]
  Object.assign(hoved, { [K.A]: tekst(id), [K.B]: art, [K.C]: tekst(xa), [K.D]: tekst(xb), [K.E]: tekst(ovenover), [K.H]: tekst(beskrivelse) })
  for (const k of [K.A, K.B, K.C, K.D, K.E, K.H]) if (hoved[k] !== '') pr.fed[adresse(p + 1, k)] = true   // ID-rækken med fed som de andre
  b = medEt(b, skrivRaekker(arkAf(b, arkId), p + 1, [hoved, ...pr.celler.slice(1)], pr))
  b = tilOversigt(b, arkId, tekst(id), oversigtNoegler(art))
  return { bog: medArk(b, b.ark), r: p + 1 }
}

/** En kopi af elementet id med ID'et nytId lige under det. Giver { bog, r } eller { fejl }. */
export function kopierElement(bog, arkId, id, nytId) {
  const ark = arkAf(bog, arkId)
  if (!ark) return { fejl: 'Arket findes ikke.' }
  const e = elementer(ark).find(x => x.id === id)
  if (!e) return { fejl: `${id} findes ikke.` }
  const fejl = tjekId(bog, arkId, nytId)
  if (fejl) return { fejl }
  const p = e.slut + 1, n = e.slut - e.r + 1, dr = p + 1 - e.r
  const raekker = ark.celler.slice(e.r, e.slut + 1).map(raek => raek.map(c => forskydFormel(c, dr, 0)))
  raekker[0] = [...raekker[0]]
  raekker[0][K.A] = tekst(nytId)
  const flyt = (obj) => Object.fromEntries(Object.entries(obj ?? {}).flatMap(([k, v]) => {
    const a = laesAdresse(k)
    return a && a.r >= e.r && a.r <= e.slut ? [[adresse(a.r + dr, a.k), v]] : []
  }))
  let b = aendrGitter(bog, arkId, 'r', p, n + 1, false)
  b = medEt(b, skrivRaekker(arkAf(b, arkId), p + 1, raekker, { fed: flyt(ark.fed), dec: flyt(ark.dec), fmt: flyt(ark.fmt) }))
  b = tilOversigt(b, arkId, tekst(nytId), oversigtNoegler(e.art))
  return { bog: medArk(b, b.ark), r: p + 1 }
}

/**
 * Hvor elementet id bruges: lastrækker i andre elementer, "ovenover", oversigten,
 * formler i andre ark (nøglen "id/…") og navngivne celler i blokken.
 * Giver en liste af tekster til bekræftelsen.
 */
export function brugere(bog, arkId, id) {
  const ark = arkAf(bog, arkId)
  if (!ark) return []
  const els = elementer(ark)
  const e = els.find(x => x.id === id)
  if (!e) return []
  const ud = []
  for (const andet of els) {
    if (andet === e) continue
    const raek = andet.laster.filter(r => tekst(ark.celler[r]?.[K.A]).toLowerCase() === id.toLowerCase())
    if (raek.length) ud.push(`${andet.id} har ${raek.length === 1 ? 'en last' : `${raek.length} laster`} fra ${id} (række ${raek.map(r => r + 1).join(', ')})`)
    if (tekst(ark.celler[andet.r]?.[K.E]).toLowerCase() === id.toLowerCase()) ud.push(`${andet.id} har ${id} som "ovenover"`)
  }
  const o = oversigt(ark)
  const ov = (o?.raekker ?? []).filter(x => x.noegle.toLowerCase().startsWith(`${id.toLowerCase()}/`))
  if (ov.length) ud.push(`Oversigten: ${ov.map(x => x.noegle).join(', ')} (fjernes med)`)
  const noegle = new RegExp(`"${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'i')
  for (const a of bog.ark) {
    if (a.id === arkId) continue
    const celler = []
    a.celler?.forEach((raek, r) => raek.forEach((c, k) => { if (noegle.test(tekst(c))) celler.push(adresse(r, k)) }))
    if (celler.length) ud.push(`${a.navn}: ${celler.join(', ')} henter fra ${id}`)
  }
  const rk = new Set([...Array.from({ length: e.slut - e.r + 1 }, (_, i) => e.r + i), ...ov.map(x => x.r)])
  const navne = Object.entries(bog.navne ?? {}).filter(([, x]) => x.ark === arkId && x.celle && rk.has(laesAdresse(x.celle)?.r)).map(([n]) => n)
  if (navne.length) ud.push(`Navngivne celler: ${navne.join(', ')} (mister deres celle)`)
  return ud
}

/** Fjern elementet id (blokken og dens rækker i oversigten). Giver { bog } eller { fejl }. */
export function fjernElement(bog, arkId, id) {
  const ark = arkAf(bog, arkId)
  if (!ark) return { fejl: 'Arket findes ikke.' }
  const e = elementer(ark).find(x => x.id === id)
  if (!e) return { fejl: `${id} findes ikke.` }
  let b = bog
  const ov = (oversigt(ark)?.raekker ?? []).filter(x => x.noegle.toLowerCase().startsWith(`${id.toLowerCase()}/`))
  for (const x of [...ov].sort((p, q) => q.r - p.r)) b = aendrGitter(b, arkId, 'r', x.r, -1, false)
  const fra = e.r > 0 && tom(ark.celler[e.r - 1]) ? e.r - 1 : e.r   // skillerækken før blokken går med
  b = aendrGitter(b, arkId, 'r', fra, -(e.slut - fra + 1), false)
  return { bog: medArk(b, b.ark) }
}

/**
 * En ny, tom lastrække i elementet, rækken r ligger i. Den sættes ind over den
 * sidste lastrække (så blokkens områder tager den med); er den sidste række
 * udfyldt, flyttes dens indhold op, så den tomme række altid står nederst.
 * Giver { bog, r } (den tomme række) eller { fejl }.
 */
export function nyLast(bog, arkId, r) {
  const ark = arkAf(bog, arkId)
  const e = ark && elementVed(ark, r)
  if (!e || e.ledig === null) return { fejl: 'Markér en celle i et element.' }
  const s = e.ledig
  const INPUT = [K.A, K.B, K.C, K.D, K.E]
  const udfyldt = INPUT.some(k => tekst(ark.celler[s]?.[k]))
  const ny = [...ark.celler[s]]            // den sidste lastrækkes formler passer til række s
  for (const k of INPUT) ny[k] = ''
  const dec = Object.fromEntries(Object.entries(ark.dec ?? {}).filter(([k]) => laesAdresse(k)?.r === s))
  let b = aendrGitter(bog, arkId, 'r', s, 1, false)
  let a = skrivRaekker(arkAf(b, arkId), s, [ny], { dec })
  if (udfyldt) {                           // byt indtastningerne, så den tomme række er nederst
    const celler = a.celler.map(x => [...x])
    for (const k of INPUT) { celler[s][k] = ark.celler[s]?.[k] ?? ''; celler[s + 1][k] = '' }
    a = { ...a, celler }
  }
  b = medEt(b, a)
  return { bog: medArk(b, b.ark), r: udfyldt ? s + 1 : s }
}
