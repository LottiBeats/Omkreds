/**
 * regnearksbog.js — projektets regnearksbog.
 *
 * Alle regneark i et projekt ligger i én bog: project.bog = { ark: [...] }.
 * Et ark er { id, navn, titel, overskrift, celler, bredder, dec, fed, _vist }.
 * Formler henviser til andre ark ved navn (=Laster!B12); rapporten viser et
 * ark eller et område med en "ark_visning"-blok, der peger på arkets id, så
 * en omdøbning ikke knækker rapporten.
 *
 * _vist er arkets viste tekster. De regnes om ved hver ændring af bogen og
 * gemmes, så PDF og Word kan skrive dem ud uden at regne formler.
 *
 * Navngivne celler (udgange) ligger i bog.navne = { w_kip_V4: { ark, celle,
 * enhed } } (ark = arkets id). De kan bruges i formler (=w_kip_V4*2) og
 * kobles til talfelter i beregningsblokkene (lib/koblinger.js).
 *
 * Funktionerne er rene (ingen React), så de kan testes for sig.
 */
import {
  regnBog, vistArk, ledigtNavn, omdoebHenvisninger, arkIFormel, laesAdresse, adresse, erRegneark,
  gyldigtCellenavn, erFejl, formatVaerdi, kolNavn,
} from './regneark.js'

export const erArkVisning = (b) => b?.type === 'ark_visning'

/** Projektets bog (en tom, hvis projektet ikke har nogen endnu). */
export function bogAf(project) {
  const ark = project?.bog?.ark
  return Array.isArray(ark) ? project.bog : { ark: [] }
}

let _seq = 0
export function nyArkId() {
  return `ark_${Date.now().toString(36)}${(_seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Et tomt ark med et navn, der ikke er brugt i bogen. */
export function nytArk(bog, onsket = 'Ark1') {
  const navn = ledigtNavn((bog?.ark ?? []).map(a => a.navn), onsket)
  return {
    id: nyArkId(), navn, titel: '', overskrift: true,
    celler: Array.from({ length: 20 }, () => Array(8).fill('')),
    bredder: [], dec: {}, fed: {}, _vist: [],
  }
}

/**
 * Bogen med friske _vist i alle ark. Ark, hvis visning ikke har ændret sig,
 * beholder deres objekt, så React kun tegner det, der er ændret.
 */
export function regnArk(ark, navne = {}) {
  const vaerdier = regnBog(ark.map(a => ({ navn: a.navn, celler: a.celler ?? [] })), navneOpslag({ ark, navne }))
  return ark.map(a => {
    const vist = vistArk(vaerdier[a.navn] ?? [], a.dec ?? {})
    return JSON.stringify(vist) === JSON.stringify(a._vist) ? a : { ...a, _vist: vist }
  })
}

/** Bogen med en ny liste af ark, regnet igennem. */
export const medArk = (bog, ark) => ({ ...(bog ?? {}), ark: regnArk(ark, bog?.navne) })

/** Bogen med ét ark erstattet. */
export const medEtArk = (bog, nyt) => medArk(bog, bog.ark.map(a => (a.id === nyt.id ? nyt : a)))

/**
 * Omdøb et ark. Henvisninger til det i alle ark skrives om, så formlerne
 * regner det samme som før. Returnerer { bog, fejl }.
 */
export function omdoebArk(bog, id, nytNavn) {
  const navn = String(nytNavn ?? '').trim()
  const ark = bog.ark.find(a => a.id === id)
  if (!ark) return { bog, fejl: 'Arket findes ikke.' }
  if (!navn) return { bog, fejl: 'Arket skal have et navn.' }
  if (/[!'\[\]:*?/\\]/.test(navn)) return { bog, fejl: 'Navnet må ikke indeholde ! \' [ ] : * ? / \\' }
  if (bog.ark.some(a => a.id !== id && a.navn.trim().toLowerCase() === navn.toLowerCase())) {
    return { bog, fejl: `Der er allerede et ark, der hedder "${navn}".` }
  }
  const gammel = ark.navn
  const ny = bog.ark.map(a => ({
    ...a,
    navn: a.id === id ? navn : a.navn,
    celler: (a.celler ?? []).map(r => r.map(c => omdoebHenvisninger(c, gammel, navn))),
  }))
  return { bog: medArk(bog, ny), fejl: null }
}

/** Arkene, der har formler, som henviser til arket `id` (deres navne). */
export function arkDerBruger(bog, id) {
  const ark = bog.ark.find(a => a.id === id)
  if (!ark) return []
  const n = ark.navn.trim().toLowerCase()
  return bog.ark.filter(a => a.id !== id && (a.celler ?? []).some(r => r.some(c => arkIFormel(c).includes(n)))).map(a => a.navn)
}

/** Alle blokke i projektet, med hvor de står: [{ doc, sub, blok }]. */
export function alleBlokke(project) {
  const ud = []
  for (const [doc, d] of Object.entries(project?.documents ?? {})) {
    for (const blok of d?.blocks ?? []) ud.push({ doc, sub: null, blok })
    ;(d?.subdocs ?? []).forEach((sd, i) => { for (const blok of sd?.blocks ?? []) ud.push({ doc, sub: i, blok }) })
  }
  return ud
}

/** Rapportens visninger af arket `id`: [{ doc, sub, blok }]. */
export const visningerAf = (project, id) => alleBlokke(project).filter(x => erArkVisning(x.blok) && x.blok.data?.ark === id)

/** Bogen uden arket `id`. Henvisninger til det bliver #REF!, som i Excel. */
export const sletArk = (bog, id) => medArk(bog, bog.ark.filter(a => a.id !== id))

/** En kopi af arket lige efter det, med et ledigt navn. */
export function dupliker(bog, id) {
  const i = bog.ark.findIndex(a => a.id === id)
  if (i < 0) return { bog, id: null }
  const kopi = { ...structuredClone(bog.ark[i]), id: nyArkId(), navn: ledigtNavn(bog.ark.map(a => a.navn), bog.ark[i].navn) }
  const ark = [...bog.ark]
  ark.splice(i + 1, 0, kopi)
  return { bog: medArk(bog, ark), id: kopi.id }
}

/** Flyt arket fra plads i til plads j. */
export function flytArk(bog, i, j) {
  if (i === j || i < 0 || j < 0 || i >= bog.ark.length || j >= bog.ark.length) return bog
  const ark = [...bog.ark]
  const [a] = ark.splice(i, 1)
  ark.splice(j, 0, a)
  return { ...bog, ark }
}

// ── Område og udsnit ────────────────────────────────────────────────────────

/** "A1:D34" → { r0, k0, r1, k1 } (0-baseret). Tomt eller ugyldigt → null (hele arket). */
export function laesOmraade(tekst) {
  const t = String(tekst ?? '').trim().replace(/\$/g, '').toUpperCase()
  if (!t) return null
  const [a, b] = t.split(':')
  const fra = laesAdresse(a), til = b ? laesAdresse(b) : fra
  if (!fra || !til) return null
  return { r0: Math.min(fra.r, til.r), k0: Math.min(fra.k, til.k), r1: Math.max(fra.r, til.r), k1: Math.max(fra.k, til.k) }
}

export const gyldigtOmraade = (tekst) => !String(tekst ?? '').trim() || laesOmraade(tekst) !== null

/**
 * Det, en visning viser af arket: rækkerne (viste tekster), kolonnebredder,
 * fede celler og om første række er overskrift. Hele arket beskæres til de
 * celler, der har indhold.
 */
export function udsnit(ark, omraadeTekst) {
  if (!ark) return null
  const vist = ark._vist ?? []
  let o = laesOmraade(omraadeTekst)
  if (!o) {
    let r1 = -1, k1 = -1
    vist.forEach((r, i) => r.forEach((c, k) => { if (String(c ?? '').trim()) { r1 = Math.max(r1, i); k1 = Math.max(k1, k) } }))
    o = { r0: 0, k0: 0, r1, k1 }
  }
  const raekker = []
  const fed = []
  for (let r = o.r0; r <= o.r1; r++) {
    const raek = [], f = []
    for (let k = o.k0; k <= o.k1; k++) { raek.push(String(vist[r]?.[k] ?? '')); f.push(!!ark.fed?.[adresse(r, k)]) }
    raekker.push(raek); fed.push(f)
  }
  const bredder = []
  for (let k = o.k0; k <= o.k1; k++) bredder.push(ark.bredder?.[k] ?? (k === 0 ? 150 : 92))
  return { raekker, fed, bredder, overskrift: o.r0 === 0 && ark.overskrift !== false, ...o }
}

// ── Fra regneark-blokke til bogen ───────────────────────────────────────────

/**
 * Flyt projektets regneark-blokke ind i bogen. Hver blok bliver en visning
 * af sit ark på samme plads. Blokke i samme (under)dokument var én
 * arbejdsbog; får et ark et nyt navn, fordi navnet allerede er brugt i
 * bogen, skrives henvisningerne i dets egen arbejdsbog om med.
 * Returnerer { project, antal }.
 */
export function flytRegnearkTilBog(project) {
  const bog = bogAf(project)
  const ark = [...bog.ark]
  let antal = 0
  const nyeDocs = {}

  const flytListe = (blocks) => {
    const regneark = (blocks ?? []).filter(erRegneark)
    if (!regneark.length) return blocks
    // Navne i denne arbejdsbog → navne i projektets bog
    const omdoeb = new Map()
    const brugte = ark.map(a => a.navn)
    for (const b of regneark) {
      const gl = String(b.data?.navn ?? 'Ark1').trim() || 'Ark1'
      const ny = ledigtNavn(brugte, gl)
      brugte.push(ny)
      omdoeb.set(b.id, { gl, ny })
    }
    const idFor = new Map()
    for (const b of regneark) {
      let celler = b.data?.celler ?? [['']]
      for (const { gl, ny } of omdoeb.values()) {
        if (gl.toLowerCase() !== ny.toLowerCase()) celler = celler.map(r => r.map(c => omdoebHenvisninger(c, gl, ny)))
      }
      const id = nyArkId()
      idFor.set(b.id, id)
      const { navn: _n, _vist, ...rest } = b.data ?? {}
      ark.push({ titel: '', overskrift: true, bredder: [], dec: {}, fed: {}, ...rest, id, navn: omdoeb.get(b.id).ny, celler, _vist: _vist ?? [] })
      antal++
    }
    return blocks.map(b => (erRegneark(b)
      ? { id: b.id, type: 'ark_visning', data: { ark: idFor.get(b.id), omraade: '', titel: b.data?.titel ?? '' } }
      : b))
  }

  for (const [docId, d] of Object.entries(project?.documents ?? {})) {
    const blocks = flytListe(d?.blocks ?? [])
    const subdocs = (d?.subdocs ?? []).map(sd => ({ ...sd, blocks: flytListe(sd?.blocks ?? []) }))
    nyeDocs[docId] = { ...d, blocks, subdocs }
  }
  if (!antal) return { project, antal: 0 }
  return { project: { ...project, documents: nyeDocs, bog: medArk(bog, ark) }, antal }
}

/** Har projektet regneark-blokke, der skal flyttes ind i bogen? */
export const harGamleRegneark = (project) => alleBlokke(project).some(x => erRegneark(x.blok))

// ── Navngivne celler (udgange) ──────────────────────────────────────────────

/** Navnene som regnBog vil have dem: { navn: { ark: arknavn, r, k } }. */
export function navneOpslag(bog) {
  const ud = {}
  for (const [navn, n] of Object.entries(bog?.navne ?? {})) {
    const a = (bog.ark ?? []).find(x => x.id === n.ark)
    const c = n.celle ? laesAdresse(n.celle) : null
    ud[navn] = { ark: a?.navn ?? null, r: c?.r ?? null, k: c?.k ?? null }
  }
  return ud
}

/**
 * Giv en celle et navn. Et navn bruges kun én gang i bogen; en celle kan
 * have flere navne. Returnerer { bog, fejl }.
 */
export function navngiv(bog, navn, arkId, celle, enhed = '') {
  const n = String(navn ?? '').trim()
  if (!gyldigtCellenavn(n)) {
    return { bog, fejl: 'Et navn skal begynde med et bogstav og kun have bogstaver, tal og _ (fx w_kip_V4). Det må ikke ligne en celle (B12) eller en funktion.' }
  }
  if (!bog.ark.some(a => a.id === arkId) || !laesAdresse(celle)) return { bog, fejl: 'Cellen findes ikke.' }
  const fra = Object.keys(bog.navne ?? {}).find(x => x.toLowerCase() === n.toLowerCase())
  if (fra && (bog.navne[fra].ark !== arkId || bog.navne[fra].celle !== celle)) {
    return { bog, fejl: `Navnet "${n}" bruges allerede af en anden celle.` }
  }
  const navne = { ...(bog.navne ?? {}) }
  if (fra) delete navne[fra]
  navne[n] = { ark: arkId, celle, enhed: String(enhed ?? '').trim() }
  return { bog: medArk({ ...bog, navne }, bog.ark), fejl: null }
}

export function fjernNavn(bog, navn) {
  const navne = { ...(bog.navne ?? {}) }
  delete navne[navn]
  return medArk({ ...bog, navne }, bog.ark)
}

/** Navnene på cellen (arkId, "B12"). */
export const navneFor = (bog, arkId, celle) =>
  Object.entries(bog?.navne ?? {}).filter(([, n]) => n.ark === arkId && n.celle === celle).map(([navn]) => navn)

/**
 * Navnene på arket arkId, når rækker eller kolonner indsættes eller slettes
 * (som flytHenvisninger). Et navn på en slettet celle mister sin celle og
 * giver #REF!, indtil det får en ny.
 */
export function flytNavne(navne, arkId, akse, fra, n) {
  const ud = {}
  for (const [navn, x] of Object.entries(navne ?? {})) {
    const c = x.ark === arkId && x.celle ? laesAdresse(x.celle) : null
    if (!c) { ud[navn] = x; continue }
    let { r, k } = c
    let slettet = false
    if (akse === 'r' && r >= fra) { if (n < 0 && r < fra - n) slettet = true; else r += n }
    if (akse === 'k' && k >= fra) { if (n < 0 && k < fra - n) slettet = true; else k += n }
    ud[navn] = { ...x, celle: slettet ? null : adresse(r, k) }
  }
  return ud
}

/**
 * Bogens udgange med deres værdier: [{ navn, vaerdi, tekst, enhed, arkId,
 * arkNavn, celle, fejl }]. vaerdi er et tal (eller null); fejl er en tekst,
 * når navnet ikke peger på et tal.
 */
export function udgange(bog) {
  const navne = bog?.navne ?? {}
  if (!Object.keys(navne).length) return []
  const vaerdier = regnBog((bog.ark ?? []).map(a => ({ navn: a.navn, celler: a.celler ?? [] })), navneOpslag(bog))
  return Object.entries(navne).map(([navn, n]) => {
    const a = (bog.ark ?? []).find(x => x.id === n.ark)
    const c = n.celle ? laesAdresse(n.celle) : null
    const v = a && c ? vaerdier[a.navn]?.[c.r]?.[c.k] : undefined
    const dec = a && c ? (a.dec?.[n.celle] ?? a.dec?.[kolNavn(c.k)] ?? null) : null
    let fejl = null
    if (!a) fejl = 'arket er slettet'
    else if (!c) fejl = 'cellen er slettet'
    else if (erFejl(v)) fejl = v.kode
    else if (typeof v !== 'number') fejl = 'cellen er ikke et tal'
    return {
      navn, enhed: n.enhed ?? '', arkId: n.ark, arkNavn: a?.navn ?? '?', celle: n.celle,
      vaerdi: fejl ? null : v, tekst: fejl ? '' : formatVaerdi(v, dec), fejl,
    }
  }).sort((x, y) => x.navn.localeCompare(y.navn, 'da'))
}
