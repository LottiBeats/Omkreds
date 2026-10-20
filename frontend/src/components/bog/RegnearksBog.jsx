/**
 * RegnearksBog.jsx — projektets regnearksbog i fuld skærm, som i Excel.
 *
 * Faner i bunden (dobbeltklik omdøber, træk flytter, højreklik giver
 * menuen), formellinje og navnefelt øverst (skriv fx Fundament!B17 og
 * Enter for at gå dertil). Mens man skriver en formel, kan man klikke over
 * i en anden fane og pege på en celle dér — henvisningen med arknavn
 * sættes ind, og Enter gemmer i den celle, man startede i.
 *
 * Tastatur: som regnearksblokken (piletaster, Enter/Tab, F2, Delete,
 * Ctrl+C/X/V, Ctrl+D, Ctrl+R, Ctrl+B, Ctrl+Z/Y) og Ctrl+PgUp/PgDn skifter fane,
 * Esc lukker (når man ikke er ved at rette en celle).
 *
 * "Spor" viser, hvad den aktive celle bygger på, og hvor den bruges — til
 * kontrollen. Fejl i bogen tælles i bunden; et klik går til den næste.
 *
 * "Excel" henter bogen som .xlsx (formlerne virker i Excel) og læser en
 * .xlsx-fil ind som nye ark ved siden af de andre (backend/regneark_xlsx.py).
 *
 * "Navngiv" giver den aktive celle et navn (en udgang, fx w_kip_V4). Navnet
 * kan bruges i formler (=w_kip_V4*2), i navnefeltet og i beregningsblokkene:
 * "=" i et talfelt eller [w_kip_V4] i Egen beregning (lib/koblinger.js).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  regnBog, formatVaerdi, erFejl, kolNavn, adresse, laesAdresse, laesTsv, skrivTsv, udvid, forskydFormel,
  FUNKTIONER, oversaet, arkPrefiks, erNul,
} from '../../lib/regneark.js'
import {
  medArk, medEtArk, nytArk, omdoebArk, sletArk, dupliker, flytArk, arkDerBruger,
  navneOpslag, navngiv, fjernNavn, navneFor, udgange, indsaetSkabelon, aendrGitter as aendrGitterBog,
} from '../../lib/regnearksbog.js'
import { SKABELONER } from '../../lib/regnearkSkabeloner.js'
import { BOG_SKABELONER } from '../../lib/bogSkabeloner.js'
import { forklar, brugtAf } from '../../lib/forklar.js'
import { FYLD, fmtStil } from '../../lib/regnearkFormat.js'
import { raekkeTyper, celleArt } from '../../lib/regnearksbog.js'
import { bogTilXlsx, bogFraXlsx } from '../../api/client.js'
import {
  ARTER, erLastnedfoering, elementer, elementVed, nytElement, kopierElement, fjernElement, nyLast, brugere,
  ledigtId, tjekId, oversigtNoegler, antalRaekker,
} from '../../lib/lastnedfoering.js'
import '../blocks/Regneark.css'

const STD_BREDDE = 92
let INTERN = null   // { tekst, celler, r, k } — det, der sidst blev kopieret herfra

/** Fjern tomme rækker og kolonner i slutningen (men behold mindst én celle). */
function trim(c) {
  const ud = c.map(r => [...r])
  while (ud.length > 1 && ud.at(-1).every(x => x === '' || x == null)) ud.pop()
  let bredde = 1
  for (const r of ud) for (let k = r.length - 1; k >= 0; k--) if (r[k] !== '' && r[k] != null) { bredde = Math.max(bredde, k + 1); break }
  return ud.map(r => { const x = r.slice(0, bredde); while (x.length < bredde) x.push(''); return x })
}

/** "Fundament!B17", "'Stabilitet V1'!A1:C4" eller "B17" → { ark, r0, k0, r1, k1 }. */
function laesGaaTil(tekst) {
  const m = /^\s*(?:'((?:[^']|'')+)'|([^!]+))?!?\s*(\$?[A-Za-z]{1,2}\$?\d+)(?::(\$?[A-Za-z]{1,2}\$?\d+))?\s*$/.exec(tekst)
  if (!m) return null
  const ark = m[1] ? m[1].replace(/''/g, "'") : (m[2] && tekst.includes('!') ? m[2].trim() : null)
  const a = laesAdresse(m[3].replace(/\$/g, '')), b = m[4] ? laesAdresse(m[4].replace(/\$/g, '')) : a
  if (!a || !b) return null
  return { ark, r0: a.r, k0: a.k, r1: b.r, k1: b.k }
}

/** Felterne for et nyt element af arten: x_A/x_B (spænd), x₁/x₂ (væg) eller x₁ (søjle). */
function tilstandTekst(art) {
  if (['Væg', 'Fundament'].includes(art)) return { a: 'x₁', b: 'x₂', ovenover: true }
  if (['Søjle', 'Punktfundament'].includes(art)) return { a: 'x₁', b: null, ovenover: true }
  return { a: 'x_A', b: 'x_B', ovenover: false }
}

/** Standard: hent filen i browseren. Skrivebordsprogrammet giver sin egen gem-dialog. */
function hentFil(blob, navn) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = navn
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function RegnearksBog({
  bog, onBog, startArk = null, startCelle = null, onLuk, visninger = () => [], koblinger = () => [],
  gemFil = hentFil, filnavn = 'Regneark',
}) {
  const [aktivId, setAktivId] = useState(() => startArk ?? bog.ark[0]?.id ?? null)
  const ark = bog.ark.find(a => a.id === aktivId) ?? bog.ark[0] ?? null
  const d = ark ?? { celler: [['']], dec: {}, fed: {} }
  const celler = d.celler ?? [['']]
  const dec = d.dec ?? {}
  const fed = d.fed ?? {}
  const fmt = d.fmt ?? {}   // { A1: { fyld, ramme: { t, b, l, r }, kursiv, just } }

  // Alle ark regnet (rå værdier, til tal/fejl-farver og sporing)
  const vaerdierAlle = useMemo(() => regnBog(bog.ark.map(a => ({ navn: a.navn, celler: a.celler ?? [] })), navneOpslag(bog)), [bog])
  const alleUdgange = useMemo(() => udgange(bog), [bog])
  const vaerdier = vaerdierAlle[d.navn] ?? []

  // ── Fortryd for hele bogen ──
  const hist = useRef({ fortid: [], fremtid: [] })
  const aendr = (nyBog) => {
    hist.current.fortid.push(bog)
    if (hist.current.fortid.length > 100) hist.current.fortid.shift()
    hist.current.fremtid = []
    onBog(nyBog)
  }
  const fortryd = (frem) => {
    const fra = frem ? hist.current.fremtid : hist.current.fortid
    const til = frem ? hist.current.fortid : hist.current.fremtid
    const ny = fra.pop()
    if (!ny) return
    til.push(bog)
    onBog(ny)
    if (!ny.ark.some(a => a.id === aktivId)) setAktivId(ny.ark[0]?.id ?? null)
  }
  const skift = (nyData) => aendr(medEtArk(bog, nyData))

  // ── Markering pr. ark ──
  const [mark, setMark] = useState(() => {
    const c = startCelle ? laesAdresse(startCelle) : null
    return startArk && c ? { [startArk]: { akt: c, anker: null } } : {}
  })
  const akt = mark[ark?.id]?.akt ?? { r: 0, k: 0 }
  const anker = mark[ark?.id]?.anker ?? null
  const setAkt = (fn) => setMark(m => {
    const cur = m[ark?.id] ?? { akt: { r: 0, k: 0 }, anker: null }
    const ny = typeof fn === 'function' ? fn(cur.akt) : fn
    return { ...m, [ark?.id]: { ...cur, akt: ny } }
  })
  const setAnker = (fn) => setMark(m => {
    const cur = m[ark?.id] ?? { akt: { r: 0, k: 0 }, anker: null }
    const ny = typeof fn === 'function' ? fn(cur.anker) : fn
    return { ...m, [ark?.id]: { ...cur, anker: ny } }
  })

  const [red, setRed] = useState(null)        // { arkId, r, k, tekst, tilstand: 'skriv' | 'ret' }
  const [traek, setTraek] = useState(null)    // 'mark' | 'fyld'
  const [fyldTil, setFyldTil] = useState(null)
  const [omdoeber, setOmdoeber] = useState(null)   // { id, navn, fejl }
  const [menu, setMenu] = useState(null)      // { id, x, y }
  const [gaaTil, setGaaTil] = useState(null)  // tekst i navnefeltet, mens man skriver
  const [spor, setSpor] = useState(true)   // "Forklar celle" står åben fra start
  const [visNavne, setVisNavne] = useState(false)
  const [navngiver, setNavngiver] = useState(null)   // { navn, enhed, fejl, celle }
  const [celleMenu, setCelleMenu] = useState(null)   // { x, y }
  const [excelTravl, setExcelTravl] = useState(false)
  const [elDlg, setElDlg] = useState(null)   // { slags: 'ny' | 'kopi', art, id, xa, xb, ovenover, beskrivelse, efter, fejl }
  const excelInput = useRef(null)

  async function hentExcel() {
    setExcelTravl(true)
    try {
      await gemFil(await bogTilXlsx(bog), `${filnavn}.xlsx`)
    } catch (e) {
      setBesked(`Excel-filen kunne ikke laves: ${e.message}`)
    } finally { setExcelTravl(false) }
  }
  async function laesExcel(e) {
    const fil = e.target.files?.[0]
    e.target.value = ''
    if (!fil) return
    setExcelTravl(true)
    try {
      const data = await new Promise((ok, fejl) => {
        const r = new FileReader()
        r.onload = () => ok(String(r.result))
        r.onerror = () => fejl(new Error('Filen kunne ikke læses.'))
        r.readAsDataURL(fil)
      })
      const svar = await bogFraXlsx(data)
      if (!svar.ark?.length) { setBesked('Filen har ingen ark.'); return }
      const { bog: ny, idFor } = indsaetSkabelon(bog, { ark: svar.ark, navne: svar.navne })
      aendr(ny)
      setAktivId([...idFor.values()][0] ?? aktivId)
      const n = svar.ark.length
      setBesked({ ok: !svar.advarsler?.length, tekst: `${n} ark fra ${fil.name} er lagt i bogen.` + (svar.advarsler?.length ? ' ' + svar.advarsler.join(' ') : '') })
    } catch (err) {
      setBesked(`Excel-filen kunne ikke læses: ${err.message}`)
    } finally { setExcelTravl(false) }
  }
  const [besked, setBesked] = useState(null)
  const rodRef = useRef(null)
  const inputRef = useRef(null)
  const linjeRef = useRef(null)
  const trukket = useRef(null)

  const omr = useMemo(() => {
    const a = anker ?? akt
    return { r0: Math.min(a.r, akt.r), r1: Math.max(a.r, akt.r), k0: Math.min(a.k, akt.k), k1: Math.max(a.k, akt.k) }
  }, [akt, anker])
  const iOmr = (r, k) => r >= omr.r0 && r <= omr.r1 && k >= omr.k0 && k <= omr.k1

  const antalR = Math.max(celler.length + 20, 40, akt.r + 2)
  const antalK = Math.max(...celler.map(r => r.length), 10, akt.k + 2) + 2
  // Skjulte kolonner (hjælpeformler) vises som en smal stribe, til man beder om dem.
  const [visSkjulte, setVisSkjulte] = useState(false)
  const skjulte = useMemo(() => new Set(d.skjulte ?? []), [d.skjulte])
  const erSkjult = (k) => skjulte.has(k) && !visSkjulte
  const bredde = (k) => (erSkjult(k) ? 6 : d.bredder?.[k] ?? (k === 0 ? 150 : STD_BREDDE))
  const raw = (r, k) => celler[r]?.[k] ?? ''
  const decFor = (r, k) => dec[adresse(r, k)] ?? dec[kolNavn(k)] ?? null

  // Den celle, der rettes, kan ligge i et andet ark end det, der vises (pegning på tværs).
  const redArk = red ? bog.ark.find(a => a.id === red.arkId) : null
  const rederHer = red && red.arkId === ark?.id

  useEffect(() => { rodRef.current?.focus() }, [aktivId])

  function saetCeller(aendringer, ekstra = {}, maal = d) {
    let maxR = 0, maxK = 0
    for (const [r, k] of aendringer) { maxR = Math.max(maxR, r + 1); maxK = Math.max(maxK, k + 1) }
    const ny = udvid(maal.celler ?? [['']], maxR, maxK)
    for (const [r, k, t] of aendringer) ny[r][k] = t
    skift({ ...maal, ...ekstra, celler: trim(ny) })
  }

  function flyt(dr, dk, udvidMark = false) {
    if (udvidMark) { if (!anker) setAnker(akt) } else setAnker(null)
    setAkt(a => ({ r: Math.max(0, a.r + dr), k: Math.max(0, a.k + dk) }))
  }

  function startRed(tekst, tilstand) {
    setRed({ arkId: ark.id, r: akt.r, k: akt.k, tekst, tilstand })
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n) }
    })
  }

  function gemRed(dr = 0, dk = 0) {
    if (!red) return
    const { arkId, r, k, tekst } = red
    setRed(null)
    const maal = bog.ark.find(a => a.id === arkId)
    if (maal && tekst !== (maal.celler?.[r]?.[k] ?? '')) saetCeller([[r, k, tekst]], {}, maal)
    if (arkId !== ark?.id) setAktivId(arkId)
    setMark(m => ({ ...m, [arkId]: { akt: { r: Math.max(0, r + dr), k: Math.max(0, k + dk) }, anker: null } }))
    rodRef.current?.focus()
  }

  function annullerRed() {
    if (!red) return
    const id = red.arkId
    setRed(null)
    if (id !== ark?.id) setAktivId(id)
    rodRef.current?.focus()
  }

  function ryd() {
    const a = []
    for (let r = omr.r0; r <= omr.r1; r++) for (let k = omr.k0; k <= omr.k1; k++) if (raw(r, k) !== '') a.push([r, k, ''])
    if (a.length) saetCeller(a)
  }

  function toggleFed() {
    const nyFed = { ...fed }
    let alle = true
    for (let r = omr.r0; r <= omr.r1; r++) for (let k = omr.k0; k <= omr.k1; k++) if (!fed[adresse(r, k)]) alle = false
    for (let r = omr.r0; r <= omr.r1; r++) for (let k = omr.k0; k <= omr.k1; k++) {
      if (alle) delete nyFed[adresse(r, k)]; else nyFed[adresse(r, k)] = true
    }
    skift({ ...d, fed: nyFed })
  }

  // ── Formatering af markeringen (fyld, rammer, kursiv, justering) ──
  function formater(fn) {
    const ny = { ...fmt }
    for (let r = omr.r0; r <= omr.r1; r++) for (let k = omr.k0; k <= omr.k1; k++) {
      const a = adresse(r, k)
      const f = fn({ ...(ny[a] ?? {}), ramme: { ...(ny[a]?.ramme ?? {}) } }, r, k)
      const tomRamme = !Object.values(f.ramme ?? {}).some(Boolean)
      if (tomRamme) delete f.ramme
      if (!f.fyld) delete f.fyld
      if (!f.kursiv) delete f.kursiv
      if (!f.just) delete f.just
      if (Object.keys(f).length) ny[a] = f; else delete ny[a]
    }
    skift({ ...d, fmt: ny })
  }
  const saetFyld = (farve) => formater(f => ({ ...f, fyld: farve || undefined }))
  const saetJust = (j) => formater(f => ({ ...f, just: j || undefined }))
  function saetKursiv() {
    let alle = true
    for (let r = omr.r0; r <= omr.r1; r++) for (let k = omr.k0; k <= omr.k1; k++) if (!fmt[adresse(r, k)]?.kursiv) alle = false
    formater(f => ({ ...f, kursiv: !alle || undefined }))
  }
  function saetRamme(type) {
    formater((f, r, k) => {
      const ra = { ...f.ramme }
      if (type === 'ingen') return { ...f, ramme: {} }
      if (type === 'under') ra.b = 1
      if (type === 'tyk_under') ra.b = 2
      if (type === 'over') ra.t = 1
      if (type === 'rundt') {
        if (r === omr.r0) ra.t = 1
        if (r === omr.r1) ra.b = 1
        if (k === omr.k0) ra.l = 1
        if (k === omr.k1) ra.r = 1
      }
      if (type === 'alle') { ra.t = ra.b = ra.l = ra.r = 1 }
      return { ...f, ramme: ra }
    })
  }

  function decimaler(delta) {
    const nyDec = { ...dec }
    for (let r = omr.r0; r <= omr.r1; r++) for (let k = omr.k0; k <= omr.k1; k++) {
      const v = vaerdier[r]?.[k]
      let cur = decFor(r, k)
      if (cur === undefined || cur === null) {
        const s = typeof v === 'number' ? formatVaerdi(v) : ''
        cur = s.includes(',') ? s.split(',')[1].length : 0
      }
      nyDec[adresse(r, k)] = Math.max(0, Math.min(6, cur + delta))
    }
    skift({ ...d, dec: nyDec })
  }

  /** Fyld området ud fra de øverste rækker (ned) eller venstre kolonner (højre), som Excel. */
  function fyld(kilde, til) {
    const a = []
    if (til.r1 > kilde.r1) {
      const h = kilde.r1 - kilde.r0 + 1
      for (let k = kilde.k0; k <= kilde.k1; k++) for (let r = kilde.r1 + 1; r <= til.r1; r++) {
        const src = kilde.r0 + ((r - kilde.r0) % h)
        a.push([r, k, forskydFormel(raw(src, k), r - src, 0)])
      }
    } else if (til.k1 > kilde.k1) {
      const b = kilde.k1 - kilde.k0 + 1
      for (let r = kilde.r0; r <= kilde.r1; r++) for (let k = kilde.k1 + 1; k <= til.k1; k++) {
        const src = kilde.k0 + ((k - kilde.k0) % b)
        a.push([r, k, forskydFormel(raw(r, src), 0, k - src)])
      }
    }
    if (a.length) saetCeller(a)
  }
  const fyldNed = () => { if (omr.r1 > omr.r0) fyld({ ...omr, r1: omr.r0 }, omr) }
  const fyldHoejre = () => { if (omr.k1 > omr.k0) fyld({ ...omr, k1: omr.k0 }, omr) }

  // Indsæt/slet rækker og kolonner. Henvisninger i alle ark flytter med.
  function aendrGitter(akse, fra, n) {
    const ny = aendrGitterBog(bog, d.id, akse, fra, n, false)
    aendr(medArk(ny, ny.ark.map(a => (a.id === d.id ? { ...a, celler: trim(a.celler) } : a))))
  }

  // ── Elementer i en lastnedføring (lib/lastnedfoering.js) ──
  const lnd = erLastnedfoering(d)
  const lnEls = useMemo(() => (lnd ? elementer(d) : []), [lnd, d])
  const aktEl = lnd ? elementVed(d, akt.r) : null
  const gaaTilRaekke = (r, besk) => {
    setAnker(null); setAkt({ r, k: 0 })
    setBesked(besk ? { ok: true, tekst: besk } : null)
    requestAnimationFrame(() => rodRef.current?.querySelector(`td[data-c="${r}-0"]`)?.scrollIntoView({ block: 'center' }))
    rodRef.current?.focus()
  }
  function startNytElement() {
    const art = aktEl?.art && ARTER.some(a => a.art === aktEl.art) ? aktEl.art : 'Væg'
    setElDlg({ slags: 'ny', art, id: ledigtId(bog, d.id, art), xa: '', xb: '', ovenover: '', beskrivelse: '',
      efter: aktEl?.id ?? lnEls.at(-1)?.id ?? '', fejl: null })
  }
  function startKopi() {
    if (!aktEl) return
    setElDlg({ slags: 'kopi', art: aktEl.art, id: ledigtId(bog, d.id, aktEl.art), fejl: null })
  }
  function gemElDlg() {
    if (!elDlg) return
    const r = elDlg.slags === 'ny'
      ? nytElement(bog, d.id, { ...elDlg, efter: elDlg.efter || null })
      : kopierElement(bog, d.id, aktEl?.id, elDlg.id)
    if (r.fejl) { setElDlg({ ...elDlg, fejl: r.fejl }); return }
    aendr(r.bog)
    const id = elDlg.id.trim()
    setElDlg(null)
    gaaTilRaekke(r.r, elDlg.slags === 'ny'
      ? `${id} er sat ind i række ${r.r + 1}. Skriv lasterne i den tomme række: kilden er et ID fra Opbygninger eller et element ovenfor (del A/B, N eller q). "+ Last" giver flere rækker.`
      : `${id} er en kopi af ${aktEl?.id} (række ${r.r + 1}). Ret mål, laster og "ovenover", så den passer.`)
  }
  function fjernAktEl() {
    if (!aktEl) return
    const b = brugere(bog, d.id, aktEl.id)
    const n = aktEl.slut - aktEl.r + 1
    const linjer = [`Fjern ${aktEl.id} (${aktEl.art}) — ${n} rækker?`]
    if (b.length) {
      linjer.push('Det bruges her:\n' + b.map(x => `• ${x}`).join('\n'))
      if (b.some(x => !x.startsWith('Oversigten'))) linjer.push(`Laster, der henter fra ${aktEl.id}, viser "? ukendt kilde" og en fejl, til de rettes eller fjernes.`)
    } else linjer.push('Ingen andre elementer eller ark bruger det.')
    if (!window.confirm(linjer.join('\n\n'))) return
    const r = fjernElement(bog, d.id, aktEl.id)
    if (r.fejl) { setBesked(r.fejl); return }
    aendr(r.bog)
    setBesked({ ok: true, tekst: `${aktEl.id} er fjernet. Fortryd med Ctrl+Z.` })
    rodRef.current?.focus()
  }
  function nyLastHer() {
    const r = nyLast(bog, d.id, akt.r)
    if (r.fejl) { setBesked(r.fejl); return }
    aendr(r.bog)
    gaaTilRaekke(r.r, `Ny lastrække i ${aktEl?.id}: skriv kilden i A, del i B og x₁/x₂ i C/D (x₂ tom = punktlast), faktor i E.`)
  }

  // ── Navngiv den aktive celle ──
  function startNavngiv() {
    setCelleMenu(null)
    const celle = adresse(akt.r, akt.k)
    const har = navneFor(bog, d.id, celle)[0]
    if (har) { setNavngiver({ navn: har, enhed: bog.navne[har]?.enhed ?? '', fejl: null, celle, gl: har }); return }
    // Forslag: rækkens tekst i kolonne A og (uden for kolonne B) kolonnens
    // overskrift: "Kipbjælke V4" + "G sup [kN/m]" → Kipbjaelke_V4_Gsup, kN/m.
    const rens = (t) => String(t ?? '').split(/[=(\[|:]/)[0].trim()
      .replace(/[ÆØÅæøå]/g, c => ({ Æ: 'AE', Ø: 'OE', Å: 'AA', æ: 'ae', ø: 'oe', å: 'aa' })[c])
      .replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 28)
    const raekke = rens(vaerdier[akt.r]?.[0])
    const hoved = d.overskrift !== false && akt.k > 1 ? String(vaerdier[0]?.[akt.k] ?? '') : ''
    const kol = rens(hoved).replace(/_/g, '')
    let forslag = [raekke, kol].filter(Boolean).join('_').replace(/^(\d)/, '_$1')
    if (forslag && !/^[A-Za-z_]/.test(forslag)) forslag = '_' + forslag
    const hoejre = String(vaerdier[akt.r]?.[akt.k + 1] ?? '').trim()
    const iHoved = hoved.match(/\[([^\]]+)\]/)?.[1] ?? ''
    const enhed = typeof vaerdier[akt.r]?.[akt.k + 1] === 'string' && hoejre.length <= 10 && !/\s/.test(hoejre) ? hoejre : iHoved
    setNavngiver({ navn: forslag, enhed, fejl: null, celle, gl: null })
  }
  function gemNavngiv() {
    if (!navngiver) return
    let b = bog
    if (navngiver.gl && navngiver.gl !== navngiver.navn.trim()) b = fjernNavn(b, navngiver.gl)
    const { bog: ny, fejl } = navngiv(b, navngiver.navn, d.id, navngiver.celle, navngiver.enhed)
    if (fejl) { setNavngiver({ ...navngiver, fejl }); return }
    aendr(ny)
    setNavngiver(null)
    rodRef.current?.focus()
  }

  // ── Kopiér / indsæt ──
  function kopier(e, klip = false) {
    if (red) return
    e.preventDefault()
    const raa = [], vist = []
    for (let r = omr.r0; r <= omr.r1; r++) {
      raa.push([]); vist.push([])
      for (let k = omr.k0; k <= omr.k1; k++) { raa.at(-1).push(raw(r, k)); vist.at(-1).push(formatVaerdi(vaerdier[r]?.[k], decFor(r, k))) }
    }
    const tekst = skrivTsv(vist)
    e.clipboardData.setData('text/plain', tekst)
    INTERN = { tekst, celler: raa, r: omr.r0, k: omr.k0 }
    if (klip) ryd()
  }

  function indsaet(e) {
    if (red) return
    e.preventDefault()
    const tekst = e.clipboardData.getData('text/plain')
    if (!tekst) return
    const a = []
    if (INTERN && INTERN.tekst === tekst) {
      INTERN.celler.forEach((raek, i) => raek.forEach((t, j) => a.push([akt.r + i, akt.k + j, forskydFormel(t, akt.r - INTERN.r, akt.k - INTERN.k)])))
    } else {
      laesTsv(tekst).forEach((raek, i) => raek.forEach((t, j) => a.push([akt.r + i, akt.k + j, t.trim()])))
    }
    saetCeller(a)
    setAnker({ r: akt.r, k: akt.k }); setAkt({ r: Math.max(...a.map(x => x[0])), k: Math.max(...a.map(x => x[1])) })
  }

  // ── Faner ──
  function vaelgArk(id) {
    if (id === ark?.id) return
    if (red && !red.tekst.startsWith('=')) gemRed()
    setAktivId(id)
    setMenu(null)
  }
  function nyeFraBogskabelon(key) {
    const s = BOG_SKABELONER.find(x => x.key === key)
    if (!s) return
    const { bog: ny, idFor } = indsaetSkabelon(bog, s.bog())
    aendr(ny)
    setAktivId([...idFor.values()][0] ?? aktivId)
    setBesked(null)
  }
  function nyFane(skabelon) {
    const s = SKABELONER.find(x => x.key === skabelon)
    const a = nytArk(bog, s?.navn ?? `Ark${bog.ark.length + 1}`)
    const medData = s ? { ...a, ...s.data(), id: a.id, navn: a.navn } : a
    aendr(medArk(bog, [...bog.ark, medData]))
    setAktivId(a.id)
  }
  function gemNavn() {
    if (!omdoeber) return
    const { bog: ny, fejl } = omdoebArk(bog, omdoeber.id, omdoeber.navn)
    if (fejl) { setOmdoeber({ ...omdoeber, fejl }); return }
    if (ny !== bog) aendr(ny)
    setOmdoeber(null)
  }
  function slet(id) {
    setMenu(null)
    const a = bog.ark.find(x => x.id === id)
    if (!a) return
    const brugere = arkDerBruger(bog, id)
    const vis = visninger(id)
    const linjer = [`Slet arket "${a.navn}"?`]
    if (brugere.length) linjer.push(`Formler i ${brugere.join(', ')} henviser til det og bliver #REF!.`)
    if (vis.length) linjer.push(`Det vises ${vis.length} sted${vis.length === 1 ? '' : 'er'} i rapporten; visningerne bliver tomme.`)
    if (!window.confirm(linjer.join('\n\n'))) return
    const i = bog.ark.findIndex(x => x.id === id)
    aendr(sletArk(bog, id))
    if (id === ark?.id) setAktivId(bog.ark[i + 1]?.id ?? bog.ark[i - 1]?.id ?? null)
  }

  // ── Gå til (navnefeltet) ──
  function gaaTilAdresse(tekst) {
    const n = Object.entries(bog.navne ?? {}).find(([x]) => x.toLowerCase() === String(tekst).trim().toLowerCase())
    if (n) {
      const a = bog.ark.find(x => x.id === n[1].ark)
      if (a && n[1].celle) tekst = `${arkPrefiks(a.navn)}${n[1].celle}`
    }
    const m = laesGaaTil(tekst)
    if (!m) { setBesked(`Kan ikke gå til "${tekst}" — skriv fx B17 eller Fundament!B17.`); return false }
    let id = ark?.id
    if (m.ark) {
      const a = bog.ark.find(x => x.navn.trim().toLowerCase() === m.ark.trim().toLowerCase())
      if (!a) { setBesked(`Der er intet ark, der hedder "${m.ark}".`); return false }
      id = a.id
    }
    setAktivId(id)
    setMark(mm => ({ ...mm, [id]: { akt: { r: m.r1, k: m.k1 }, anker: m.r0 !== m.r1 || m.k0 !== m.k1 ? { r: m.r0, k: m.k0 } : null } }))
    setBesked(null)
    requestAnimationFrame(() => {
      rodRef.current?.focus()
      rodRef.current?.querySelector(`[data-c="${m.r1}-${m.k1}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    return true
  }

  // ── Fejl i bogen ──
  const fejlListe = useMemo(() => {
    const ud = []
    for (const a of bog.ark) (vaerdierAlle[a.navn] ?? []).forEach((r, i) => r.forEach((v, k) => { if (erFejl(v)) ud.push({ id: a.id, navn: a.navn, r: i, k, kode: v.kode }) }))
    return ud
  }, [bog, vaerdierAlle])
  function naesteFejl() {
    if (!fejlListe.length) return
    const her = fejlListe.findIndex(f => f.id === ark?.id && (f.r > akt.r || (f.r === akt.r && f.k > akt.k)))
    const efter = her >= 0 ? fejlListe[her] : fejlListe.find(f => bog.ark.findIndex(a => a.id === f.id) > bog.ark.findIndex(a => a.id === ark?.id)) ?? fejlListe[0]
    gaaTilAdresse(`${arkPrefiks(efter.navn)}${adresse(efter.r, efter.k)}`)
  }

  // ── Spor: forgængere og efterfølgere for den aktive celle ──
  const sporing = useMemo(() => {
    if (!spor || !ark) return null
    const r0 = raw(akt.r, akt.k)
    const forg = String(r0).trim().startsWith('=')
      ? oversaet(String(r0).trim().slice(1)).refs.map(ref => ({
          ark: ref.ark ?? ark.navn,
          tekst: `${ref.ark ? arkPrefiks(ref.ark) : ''}${adresse(ref.fra.r, ref.fra.k)}${ref.til ? ':' + adresse(ref.til.r, ref.til.k) : ''}`,
          ref,
        }))
      : []
    const efterf = []
    for (const a of bog.ark) {
      (a.celler ?? []).forEach((raek, r) => raek.forEach((c, k) => {
        if (typeof c !== 'string' || !c.trim().startsWith('=')) return
        for (const ref of oversaet(c.trim().slice(1)).refs) {
          const maal = (ref.ark ?? a.navn).trim().toLowerCase()
          if (maal !== ark.navn.trim().toLowerCase()) continue
          const til = ref.til ?? ref.fra
          const rr = [Math.min(ref.fra.r, til.r), Math.max(ref.fra.r, til.r)]
          const kk = [Math.min(ref.fra.k, til.k), Math.max(ref.fra.k, til.k)]
          if (akt.r >= rr[0] && akt.r <= rr[1] && akt.k >= kk[0] && akt.k <= kk[1]) {
            efterf.push({ ark: a.navn, tekst: `${a.id === ark.id ? '' : arkPrefiks(a.navn)}${adresse(r, k)}` })
            break
          }
        }
      }))
    }
    return { forg, efterf }
  }, [spor, bog, ark, akt]) // eslint-disable-line react-hooks/exhaustive-deps
  const erForg = (r, k) => sporing?.forg.some(({ ref }) => (!ref.ark || ref.ark.trim().toLowerCase() === ark.navn.trim().toLowerCase())
    && r >= Math.min(ref.fra.r, (ref.til ?? ref.fra).r) && r <= Math.max(ref.fra.r, (ref.til ?? ref.fra).r)
    && k >= Math.min(ref.fra.k, (ref.til ?? ref.fra).k) && k <= Math.max(ref.fra.k, (ref.til ?? ref.fra).k))

  // ── Tastatur på gitteret ──
  function tast(e) {
    if (red) return
    const ctrl = e.ctrlKey || e.metaKey
    const k = e.key
    if (ctrl && k === 'PageUp') { e.preventDefault(); const i = bog.ark.findIndex(a => a.id === ark?.id); if (i > 0) vaelgArk(bog.ark[i - 1].id); return }
    if (ctrl && k === 'PageDown') { e.preventDefault(); const i = bog.ark.findIndex(a => a.id === ark?.id); if (i < bog.ark.length - 1) vaelgArk(bog.ark[i + 1].id); return }
    if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); e.stopPropagation(); fortryd(e.shiftKey); return }
    if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); e.stopPropagation(); fortryd(true); return }
    if (ctrl && (k === 'b' || k === 'B')) { e.preventDefault(); toggleFed(); return }
    if (ctrl && (k === 'i' || k === 'I')) { e.preventDefault(); saetKursiv(); return }
    if (ctrl && (k === 'd' || k === 'D')) { e.preventDefault(); fyldNed(); return }
    if (ctrl && (k === 'r' || k === 'R')) { e.preventDefault(); fyldHoejre(); return }
    if (ctrl && (k === 'a' || k === 'A')) { e.preventDefault(); setAnker({ r: 0, k: 0 }); setAkt({ r: celler.length - 1, k: Math.max(...celler.map(r => r.length)) - 1 }); return }
    if (ctrl) return
    const pil = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k]
    if (pil) { e.preventDefault(); flyt(pil[0], pil[1], e.shiftKey); return }
    if (k === 'Enter') { e.preventDefault(); flyt(e.shiftKey ? -1 : 1, 0); return }
    if (k === 'Tab') { e.preventDefault(); flyt(0, e.shiftKey ? -1 : 1); return }
    if (k === 'F2') { e.preventDefault(); startRed(raw(akt.r, akt.k), 'ret'); return }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); ryd(); return }
    if (k === 'Escape') { e.preventDefault(); if (anker) setAnker(null); else onLuk(); return }
    if (k.length === 1 && !e.altKey) { e.preventDefault(); setAnker(null); startRed(k, 'skriv') }
  }

  function tastRed(e) {
    const k = e.key
    if (k === 'Enter') { e.preventDefault(); e.stopPropagation(); gemRed(e.shiftKey ? -1 : 1, 0); return }
    if (k === 'Tab') { e.preventDefault(); e.stopPropagation(); gemRed(0, e.shiftKey ? -1 : 1); return }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); annullerRed(); return }
    if (red?.tilstand === 'skriv' && !red.tekst.startsWith('=')) {
      const pil = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k]
      if (pil) { e.preventDefault(); gemRed(pil[0], pil[1]) }
    }
    e.stopPropagation()
  }

  // Klik i en celle, mens man skriver en formel: sæt adressen ind (med arknavn fra en anden fane).
  function pegPaa(r, k, e) {
    if (!red || !red.tekst.startsWith('=')) return false
    if (rederHer && r === red.r && k === red.k) return false
    e.preventDefault()
    const el = rederHer && document.activeElement === inputRef.current ? inputRef.current : linjeRef.current
    const pos = el?.selectionStart ?? red.tekst.length
    const a = (rederHer ? '' : arkPrefiks(ark.navn)) + adresse(r, k)
    const ny = red.tekst.slice(0, pos) + a + red.tekst.slice(el?.selectionEnd ?? pos)
    setRed({ ...red, tekst: ny, tilstand: 'ret' })
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + a.length, pos + a.length) })
    return true
  }

  function musNed(r, k, e) {
    if (e.button !== 0) return
    if (pegPaa(r, k, e)) return
    if (red) gemRed()
    if (e.shiftKey) { if (!anker) setAnker(akt) } else setAnker(null)
    setAkt({ r, k })
    setTraek('mark')
    rodRef.current?.focus()
  }
  function musOver(r, k) {
    if (traek === 'mark') { setAnker(a => a ?? akt); setAkt({ r, k }) }
    if (traek === 'fyld') setFyldTil({ r, k })
  }
  useEffect(() => {
    const op = () => {
      if (traek === 'fyld' && fyldTil) {
        const dr = fyldTil.r - omr.r1, dk = fyldTil.k - omr.k1
        if (dr > 0 && dr >= dk) { fyld(omr, { ...omr, r1: fyldTil.r }); setAnker({ r: omr.r0, k: omr.k0 }); setAkt({ r: fyldTil.r, k: omr.k1 }) }
        else if (dk > 0) { fyld(omr, { ...omr, k1: fyldTil.k }); setAnker({ r: omr.r0, k: omr.k0 }); setAkt({ r: omr.r1, k: fyldTil.k }) }
      }
      setTraek(null); setFyldTil(null)
    }
    window.addEventListener('mouseup', op)
    return () => window.removeEventListener('mouseup', op)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // Kolonnebredde: træk i højre kant af kolonneoverskriften.
  function startBredde(k, e) {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX, b0 = bredde(k)
    let sidst = b0
    const mv = (ev) => {
      sidst = Math.max(36, Math.round(b0 + ev.clientX - x0))
      const el = rodRef.current?.querySelector(`col[data-k="${k}"]`)
      if (el) el.style.width = sidst + 'px'
    }
    const up = () => {
      window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up)
      const b = [...(d.bredder ?? [])]
      while (b.length <= k) b.push(b.length === 0 ? 150 : STD_BREDDE)
      b[k] = sidst
      skift({ ...d, bredder: b })
    }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }

  const iFyld = (r, k) => traek === 'fyld' && fyldTil && (
    (fyldTil.r - omr.r1 >= fyldTil.k - omr.k1 && fyldTil.r > omr.r1 && r > omr.r1 && r <= fyldTil.r && k >= omr.k0 && k <= omr.k1)
    || (fyldTil.k - omr.k1 > fyldTil.r - omr.r1 && fyldTil.k > omr.k1 && k > omr.k1 && k <= fyldTil.k && r >= omr.r0 && r <= omr.r1))

  // Rækkernes rolle (overskrift, sektion, Σ) — samme regler som i rapporten.
  const rkTyper = useMemo(() => {
    const vist = celler.map((rr, i) => rr.map((_, k) => formatVaerdi(vaerdier[i]?.[k], decFor(i, k))))
    return raekkeTyper(vist, celler.map((rr, i) => rr.map((_, k) => !!fed[adresse(i, k)])), celler.map(rr => rr.map(celleArt)), d.overskrift !== false)
  }, [d, vaerdier]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Forklar celle": hvad den aktive celle er og regner, og hvor den bruges.
  const forklaring = useMemo(() => {
    if (!spor || !ark) return null
    return { ...forklar(bog, ark, akt.r, akt.k, vaerdierAlle), brugtAf: brugtAf(bog, ark.navn, akt.r, akt.k, vaerdierAlle) }
  }, [spor, bog, ark, akt, vaerdierAlle])

  // Navngivne celler i det viste ark: adresse → "navn, navn"
  const celleNavne = useMemo(() => {
    const m = new Map()
    for (const [n, x] of Object.entries(bog.navne ?? {})) if (x.ark === ark?.id && x.celle) m.set(x.celle, m.has(x.celle) ? `${m.get(x.celle)}, ${n}` : n)
    return m
  }, [bog, ark])
  const aktRaw = red ? red.tekst : raw(akt.r, akt.k)
  const adrTekst = omr.r0 !== omr.r1 || omr.k0 !== omr.k1 ? `${adresse(omr.r0, omr.k0)}:${adresse(omr.r1, omr.k1)}` : adresse(akt.r, akt.k)
  const visTekst = (r, k) => {
    const v = vaerdier[r]?.[k]
    if (erSkjult(k)) return ''
    return d.nul && erNul(v, raw(r, k)) ? d.nul : formatVaerdi(v, decFor(r, k))
  }
  const tom = celler.every(r => r.every(c => !c))
  const vis = ark ? visninger(ark.id) : []

  const indhold = (
    <div className="rkb" role="dialog" aria-label="Regnearksbog" onClick={() => { setMenu(null); setCelleMenu(null) }}>
      <div className="rkb-top">
        <span className="rkb-logo">XL</span>
        <strong className="rkb-titel">Regnearksbog</strong>
        {ark && (
          <>
            <input className="rk-titel" value={d.titel ?? ''} placeholder="Tabeltekst i rapporten (valgfri)"
                   onChange={e => skift({ ...d, titel: e.target.value })} />
            <label className="rk-check"><input type="checkbox" checked={d.overskrift !== false}
                   onChange={e => skift({ ...d, overskrift: e.target.checked })} /> 1. række er overskrift</label>
          </>
        )}
        <span className="rkb-fyld" />
        <button type="button" className="rkb-luk" disabled={excelTravl || !bog.ark.length} onClick={hentExcel}
                title="Hent hele bogen som Excel-fil (.xlsx) — formler, navne og formater kommer med">Hent som Excel</button>
        <button type="button" className="rkb-luk" disabled={excelTravl} onClick={() => excelInput.current?.click()}
                title="Læs arkene fra en Excel-fil ind i bogen (ved siden af de ark, der er)">Importér Excel…</button>
        <input ref={excelInput} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={laesExcel} />
        <span className="rkb-brug" title="Hvor arket vises i rapporten">
          {ark && (vis.length ? `Vises i rapporten: ${[...new Set(vis.map(v => v.sted))].join(', ')}` : 'Vises ikke i rapporten')}
        </span>
        <button type="button" className="rkb-luk" onClick={onLuk} title="Luk (Esc)">Luk ✕</button>
      </div>

      {ark && (
        <div className="rk-bar">
          <button type="button" title="Fed (Ctrl+B)" onClick={toggleFed}><b>F</b></button>
          <button type="button" title="Kursiv (Ctrl+I)" onClick={saetKursiv}><i>K</i></button>
          <select className="rk-skabelon rkb-vaelg" value="" title="Fyldfarve" onChange={e => { saetFyld(e.target.value === 'ingen' ? '' : e.target.value); e.target.value = '' }}>
            <option value="">Fyld ▾</option>
            {FYLD.map(([f, t]) => <option key={f} value={f}>{t}</option>)}
          </select>
          <select className="rk-skabelon rkb-vaelg" value="" title="Rammer" onChange={e => { saetRamme(e.target.value); e.target.value = '' }}>
            <option value="">Ramme ▾</option>
            <option value="under">Streg under</option>
            <option value="tyk_under">Tyk streg under</option>
            <option value="over">Streg over</option>
            <option value="rundt">Ramme rundt om</option>
            <option value="alle">Alle kanter</option>
            <option value="ingen">Ingen rammer</option>
          </select>
          <select className="rk-skabelon rkb-vaelg" value="" title="Justering" onChange={e => { saetJust(e.target.value === 'auto' ? '' : e.target.value); e.target.value = '' }}>
            <option value="">Justér ▾</option>
            <option value="v">Venstre</option>
            <option value="c">Midte</option>
            <option value="h">Højre</option>
            <option value="auto">Automatisk</option>
          </select>
          <button type="button" title="Færre decimaler" onClick={() => decimaler(-1)}>,0←</button>
          <button type="button" title="Flere decimaler" onClick={() => decimaler(1)}>→,00</button>
          <span className="rk-sep" />
          <button type="button" title="Indsæt række over" onClick={() => aendrGitter('r', omr.r0, 1)}>+ Række</button>
          <button type="button" title="Slet de markerede rækker" onClick={() => aendrGitter('r', omr.r0, -(omr.r1 - omr.r0 + 1))}>− Række</button>
          <button type="button" title="Indsæt kolonne til venstre" onClick={() => aendrGitter('k', omr.k0, 1)}>+ Kolonne</button>
          <button type="button" title="Slet de markerede kolonner" onClick={() => aendrGitter('k', omr.k0, -(omr.k1 - omr.k0 + 1))}>− Kolonne</button>
          <span className="rk-sep" />
          <button type="button" title="Fyld nedad (Ctrl+D)" onClick={fyldNed}>Fyld ↓</button>
          <button type="button" title="Fyld til højre (Ctrl+R)" onClick={fyldHoejre}>Fyld →</button>
          <span className="rk-sep" />
          <button type="button" className={spor ? 'rkb-on' : ''} title="Forklar den markerede celle: hvad den er, hvad den regner med tal, og hvor den bruges"
                  onClick={() => { setSpor(s => !s); setVisNavne(false) }}>Forklar celle</button>
          <button type="button" title="Giv cellen et navn, der kan bruges i formler og i beregningsblokkene" onClick={startNavngiv}>Navngiv celle</button>
          <button type="button" className={visNavne ? 'rkb-on' : ''} title="Bogens navngivne celler"
                  onClick={() => { setVisNavne(v => !v); setSpor(false) }}>Navne ({alleUdgange.length})</button>
          {skjulte.size > 0 && (
            <button type="button" className={visSkjulte ? 'rkb-on' : ''} title="Vis eller skjul arkets hjælpekolonner (formler, der finder elementer og opbygninger)"
                    onClick={() => setVisSkjulte(v => !v)}>{visSkjulte ? 'Skjul hjælpekolonner' : 'Vis hjælpekolonner'}</button>
          )}
          <button type="button" title="Fortryd (Ctrl+Z)" onClick={() => fortryd(false)}>↶</button>
          <button type="button" title="Gentag (Ctrl+Y)" onClick={() => fortryd(true)}>↷</button>
          {tom && (
            <select className="rk-skabelon" value="" onChange={e => {
              const s = SKABELONER.find(x => x.key === e.target.value)
              if (s) skift({ ...d, ...s.data(), id: d.id, navn: d.navn })
            }}>
              <option value="">Start fra skabelon…</option>
              {SKABELONER.map(s => <option key={s.key} value={s.key}>{s.titel}</option>)}
            </select>
          )}
        </div>
      )}

      {lnd && (
        <div className="rkb-ln">
          <strong>Lastnedføring</strong>
          <span className="rkb-ln-el" title="Elementet, markøren står i">
            {aktEl ? <>Element <b>{aktEl.id}</b> · {aktEl.art} · række {aktEl.r + 1}–{aktEl.slut + 1}</> : `${lnEls.length} elementer — markér et for at kopiere, fjerne eller give det en last`}
          </span>
          <button type="button" onClick={startNytElement} title="Sæt et nyt element ind: ID-række, en tom lastrække og resultaterne, og en række i oversigten">+ Element…</button>
          <button type="button" disabled={!aktEl} onClick={nyLastHer} title="En ny lastrække i elementet (nederst, over den tomme række)">+ Last</button>
          <button type="button" disabled={!aktEl} onClick={startKopi} title="Kopiér elementet med alle laster til et nyt ID lige under">Kopiér element…</button>
          <button type="button" disabled={!aktEl} className="rkb-slet" onClick={fjernAktEl} title="Fjern elementet — du ser først, hvem der bruger det">Fjern element…</button>
          <span className="rkb-fyld" />
          <select className="rk-skabelon" value="" title="Gå til et element" onChange={e => { const x = lnEls.find(y => y.id === e.target.value); if (x) gaaTilRaekke(x.r) }}>
            <option value="">Gå til element…</option>
            {lnEls.map(x => <option key={x.id + x.r} value={x.id}>{x.id} · {x.art}</option>)}
          </select>
        </div>
      )}
      {elDlg && (() => {
        const art = ARTER.find(a => a.art === elDlg.art)
        const noegler = oversigtNoegler(elDlg.art).map(([x]) => `${elDlg.id.trim() || '?'}/${x}`)
        const idFejl = elDlg.id.trim() ? tjekId(bog, d.id, elDlg.id) : null
        const efterEl = lnEls.find(x => x.id === elDlg.efter)
        const over = lnEls.filter(x => !efterEl || x.r <= efterEl.r)
        const t = tilstandTekst(elDlg.art)
        const forklaringNy = `Indsætter ${antalRaekker(elDlg.art) + 1} rækker ${efterEl ? `efter ${efterEl.id}` : 'sidst'}: ID-række, en tom lastrække og ${art?.giver}. Oversigten får ${noegler.join(' og ')}.`
        const forklaringKopi = aktEl && `Kopierer ${aktEl.id} med ${aktEl.laster.filter(r => String(celler[r]?.[0] ?? '').trim()).length} laster til ${elDlg.id.trim() || '?'} lige under ${aktEl.id}. Mål, laster og "ovenover" er de samme — ret dem bagefter. Oversigten får ${noegler.join(' og ')}.`
        return (
          <div className="rkb-navngiv rkb-eldlg" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setElDlg(null) } if (e.key === 'Enter') { e.preventDefault(); gemElDlg() } }}>
            <strong>{elDlg.slags === 'ny' ? 'Nyt element' : `Kopiér ${aktEl?.id}`}</strong>
            {elDlg.slags === 'ny' && (
              <label>Art <select value={elDlg.art} onChange={e => setElDlg({ ...elDlg, art: e.target.value, id: ledigtId(bog, d.id, e.target.value), fejl: null })}>
                {ARTER.map(a => <option key={a.art} value={a.art}>{a.art}</option>)}
              </select></label>
            )}
            <label>ID <input autoFocus value={elDlg.id} className="rkb-enhed" onChange={e => setElDlg({ ...elDlg, id: e.target.value, fejl: null })} /></label>
            {elDlg.slags === 'ny' && (
              <>
                <label>{t.a} <input className="rkb-enhed" value={elDlg.xa} placeholder="m" onChange={e => setElDlg({ ...elDlg, xa: e.target.value })} /></label>
                {t.b && <label>{t.b} <input className="rkb-enhed" value={elDlg.xb} placeholder="m" onChange={e => setElDlg({ ...elDlg, xb: e.target.value })} /></label>}
                {t.ovenover && (
                  <label title="Væggen eller søjlen ovenover, hvis N og M skal føres med ned">Ovenover <select value={elDlg.ovenover} onChange={e => setElDlg({ ...elDlg, ovenover: e.target.value, fejl: null })}>
                    <option value="">—</option>
                    {over.filter(x => ['Væg', 'Fundament', 'Søjle', 'Punktfundament'].includes(x.art)).map(x => <option key={x.id} value={x.id}>{x.id} · {x.art}</option>)}
                  </select></label>
                )}
                <label>Placering <select value={elDlg.efter} onChange={e => setElDlg({ ...elDlg, efter: e.target.value, fejl: null })}>
                  {lnEls.map(x => <option key={x.id + x.r} value={x.id}>efter {x.id}</option>)}
                  <option value="">sidst</option>
                </select></label>
                <label className="rkb-eldlg-b">Beskrivelse <input value={elDlg.beskrivelse} placeholder="fx Ydervæg nord, x = 0–12" onChange={e => setElDlg({ ...elDlg, beskrivelse: e.target.value })} /></label>
              </>
            )}
            <button type="button" className="rkb-ok" disabled={!!idFejl} onClick={gemElDlg}>{elDlg.slags === 'ny' ? 'Sæt ind' : 'Kopiér'}</button>
            <button type="button" onClick={() => setElDlg(null)}>Annullér</button>
            <span className="rkb-eldlg-tekst">{elDlg.slags === 'ny' ? forklaringNy : forklaringKopi}</span>
            {(idFejl || elDlg.fejl) && <span className="rkb-fejltekst">{idFejl || elDlg.fejl}</span>}
          </div>
        )
      })()}
      {ark && (
        <div className="rk-linje">
          <input className="rk-adr rkb-gaatil" value={gaaTil ?? (red && !rederHer ? `${redArk?.navn}!${adresse(red.r, red.k)}` : adrTekst)}
                 title="Navnefelt — skriv fx Fundament!B17 og tryk Enter"
                 onFocus={e => { setGaaTil(e.target.value); requestAnimationFrame(() => e.target.select()) }}
                 onChange={e => setGaaTil(e.target.value)}
                 onBlur={() => setGaaTil(null)}
                 onKeyDown={e => {
                   if (e.key === 'Enter') { e.preventDefault(); if (gaaTilAdresse(e.currentTarget.value)) setGaaTil(null) }
                   if (e.key === 'Escape') { e.preventDefault(); setGaaTil(null); rodRef.current?.focus() }
                 }} />
          <span className="rk-fx">fx</span>
          <input ref={linjeRef} className="rk-formel" value={aktRaw}
                 onFocus={() => { if (!red) setRed({ arkId: ark.id, r: akt.r, k: akt.k, tekst: raw(akt.r, akt.k), tilstand: 'ret' }) }}
                 onChange={e => setRed(r => ({ ...(r ?? { arkId: ark.id, r: akt.r, k: akt.k }), tekst: e.target.value, tilstand: 'ret' }))}
                 onKeyDown={tastRed} list="rkb-funktioner" />
          <datalist id="rkb-funktioner">
            {FUNKTIONER.map(f => <option key={f} value={`=${f}(`} />)}
            {alleUdgange.map(u => <option key={u.navn} value={`=${u.navn}`} />)}
          </datalist>
        </div>
      )}
      {red && !rederHer && (
        <div className="rkb-peg">Du skriver en formel i {redArk?.navn}!{adresse(red.r, red.k)} — klik på en celle for at henvise til den. Enter gemmer, Esc fortryder.</div>
      )}
      {besked && <div className={'rkb-besked' + (besked.ok ? ' rkb-besked-ok' : '')} onClick={() => setBesked(null)}>{besked.tekst ?? besked}</div>}
      {navngiver && (
        <div className="rkb-navngiv" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setNavngiver(null) } }}>
          <span>Navn på {d.navn}!{navngiver.celle}:</span>
          <input autoFocus value={navngiver.navn} placeholder="fx w_kip_V4"
                 onChange={e => setNavngiver({ ...navngiver, navn: e.target.value, fejl: null })}
                 onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); gemNavngiv() } }} />
          <span>Enhed:</span>
          <input className="rkb-enhed" value={navngiver.enhed} placeholder="kN/m"
                 onChange={e => setNavngiver({ ...navngiver, enhed: e.target.value })}
                 onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); gemNavngiv() } }} />
          <button type="button" className="rkb-ok" onClick={gemNavngiv}>Gem</button>
          {navngiver.gl && <button type="button" onClick={() => { aendr(fjernNavn(bog, navngiver.gl)); setNavngiver(null) }}>Fjern navnet</button>}
          <button type="button" onClick={() => setNavngiver(null)}>Annullér</button>
          {navngiver.fejl && <span className="rkb-fejltekst">{navngiver.fejl}</span>}
        </div>
      )}

      <div className="rkb-midt">
        {ark ? (
          <div className="rk-gitter rkb-gitter" ref={rodRef} tabIndex={0} onKeyDown={tast}
               onCopy={e => kopier(e)} onCut={e => kopier(e, true)} onPaste={indsaet}>
            {/* Fast bredde: table-layout: fixed virker kun med en bredde, og ellers
                trækker en lang tekst (fx en note i A1) kolonnen ud. */}
            <table style={{ width: 38 + Array.from({ length: antalK }, (_, k) => bredde(k)).reduce((x, y) => x + y, 0) }}>
              <colgroup>
                <col style={{ width: 38 }} />
                {Array.from({ length: antalK }, (_, k) => <col key={k} data-k={k} style={{ width: bredde(k) }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className="rk-hj" />
                  {Array.from({ length: antalK }, (_, k) => (
                    <th key={k} className={[k >= omr.k0 && k <= omr.k1 ? 'rk-on' : '', erSkjult(k) ? 'rk-skjult' : ''].join(' ')}
                        title={erSkjult(k) ? `Kolonne ${kolNavn(k)} er skjult (hjælpeformler) — "Vis hjælpekolonner" viser den` : undefined}
                        onMouseDown={e => { setAnker({ r: 0, k }); setAkt({ r: antalR - 1, k }); rodRef.current?.focus(); e.preventDefault() }}>
                      {erSkjult(k) ? '' : kolNavn(k)}
                      <span className="rk-traek" onMouseDown={e => startBredde(k, e)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: antalR }, (_, r) => (
                  <tr key={r} className={[r === 0 && d.overskrift !== false ? 'rk-hoved' : '', rkTyper[r] ? `rkb-t-${rkTyper[r]}` : '',
                    aktEl && r >= aktEl.r && r <= aktEl.slut ? 'rkb-el-akt' : ''].join(' ')}>
                    <th className={r >= omr.r0 && r <= omr.r1 ? 'rk-on' : ''}
                        onMouseDown={e => { setAnker({ r, k: 0 }); setAkt({ r, k: antalK - 1 }); rodRef.current?.focus(); e.preventDefault() }}>
                      {r + 1}
                    </th>
                    {Array.from({ length: antalK }, (_, k) => {
                      const v = vaerdier[r]?.[k]
                      const aktiv = r === akt.r && k === akt.k
                      const rettes = rederHer && r === red.r && k === red.k
                      const cls = [
                        iOmr(r, k) ? 'rk-mark' : '', aktiv ? 'rk-akt' : '', iFyld(r, k) ? 'rkb-fyldes' : '',
                        typeof v === 'number' ? 'rk-tal' : '', erFejl(v) ? 'rk-fejl' : '',
                        fed[adresse(r, k)] ? 'rk-fed' : '', String(raw(r, k)).startsWith('=') ? 'rk-f' : '',
                        erForg(r, k) ? 'rkb-forg' : '', celleNavne.has(adresse(r, k)) ? 'rkb-harnavn' : '', erSkjult(k) ? 'rk-skjult' : '',
                      ].join(' ')
                      return (
                        <td key={k} data-c={`${r}-${k}`} className={cls} style={fmtStil(fmt[adresse(r, k)])} onMouseDown={e => musNed(r, k, e)} onMouseEnter={() => musOver(r, k)}
                            onDoubleClick={() => startRed(raw(r, k), 'ret')}
                            onContextMenu={e => { e.preventDefault(); if (!iOmr(r, k)) { setAnker(null); setAkt({ r, k }) } setCelleMenu({ x: e.clientX, y: e.clientY }) }}
                            title={[celleNavne.get(adresse(r, k)), String(raw(r, k)).startsWith('=') ? raw(r, k) : null].filter(Boolean).join('  ·  ') || undefined}>
                          {rettes
                            ? <input ref={inputRef} className="rk-in" value={red.tekst}
                                     onChange={e => setRed({ ...red, tekst: e.target.value })}
                                     onKeyDown={tastRed}
                                     onBlur={() => { if (document.activeElement !== linjeRef.current && !red.tekst.startsWith('=')) gemRed() }} />
                            : (() => {
                                // Tekst løber ud over tomme celler til højre, som i Excel.
                                const t = visTekst(r, k)
                                if (!t || typeof v === 'number' || raw(r, k + 1) !== '') return t
                                let w = bredde(k)
                                for (let j = k + 1; j < antalK && j < k + 12 && raw(r, j) === ''; j++) w += bredde(j)
                                return <span className="rkb-ud" style={{ width: w - 10 }}>{t}</span>
                              })()}
                          {r === omr.r1 && k === omr.k1 && !red && (
                            <span className="rkb-haandtag" title="Træk for at fylde"
                                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setTraek('fyld'); setFyldTil({ r, k }) }} />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rkb-tom">
            <p>Bogen har ingen ark endnu.</p>
            <button type="button" className="rkb-tom-std" onClick={() => nyeFraBogskabelon(BOG_SKABELONER[0].key)}
                    title={BOG_SKABELONER[0].beskrivelse}>
              Start med standardbogen
            </button>
            <small>{BOG_SKABELONER[0].beskrivelse}</small>
            <button type="button" onClick={() => nyFane()}>+ Tomt ark</button>
          </div>
        )}
        {visNavne && (
          <aside className="rkb-spor rkb-navne">
            <h4>Navngivne celler</h4>
            {!alleUdgange.length && <em>Ingen endnu. Markér en celle og tryk "Navngiv celle" (eller højreklik).</em>}
            {alleUdgange.map(u => {
              const brug = koblinger(u.navn)
              return (
                <div key={u.navn} className="rkb-navn-r">
                  <button type="button" className="rkb-navn-n" onClick={() => gaaTilAdresse(u.navn)}>{u.navn}</button>
                  <span className="rkb-navn-v">{u.fejl ? <em className="rkb-fejltekst">{u.fejl}</em> : `${u.tekst} ${u.enhed}`}</span>
                  <span className="rkb-navn-s">{u.arkNavn}!{u.celle ?? '—'}{brug.length ? ` · bruges i ${[...new Set(brug.map(b => b.sted))].join(', ')}` : ''}</span>
                </div>
              )
            })}
          </aside>
        )}
        {spor && forklaring && (
          <aside className="rkb-spor rkb-forklar">
            <div className="rkb-fk-adr">{ark.navn}!{forklaring.adresse}{celleNavne.get(forklaring.adresse) ? ` · ${celleNavne.get(forklaring.adresse)}` : ''}</div>
            <h4>{forklaring.art === 'tom' ? 'Tom celle' : (forklaring.etiket || 'Celle')}</h4>
            {forklaring.art !== 'tom' && forklaring.art !== 'tekst' && (
              <div className={'rkb-fk-v' + (forklaring.fejl ? ' rkb-fejltekst' : '')}>{forklaring.vaerdi || '—'}</div>
            )}
            {forklaring.art === 'inddata' && <p className="rkb-fk-note">Indtastet værdi (inddata). Ret den her, så regnes alt, der bygger på den, om.</p>}
            {forklaring.art === 'formel' && (
              <>
                <div className="rkb-fk-del">
                  <span>Regnestykket</span>
                  <code className="rkb-fk-tal">{forklaring.medTal}</code>
                  <code className="rkb-fk-formel">{forklaring.formel}</code>
                </div>
                <div className="rkb-fk-del">
                  <span>Bygger på</span>
                  {forklaring.henvisninger.map((h, i) => (
                    <button key={i} type="button" className="rkb-fk-ref" onClick={() => gaaTilAdresse(h.tekst.includes('!') ? h.tekst : `${arkPrefiks(ark.navn)}${h.tekst}`)}>
                      <span className="rkb-fk-r">{h.tekst}</span>
                      <span className="rkb-fk-rv">{h.vaerdi}</span>
                      <span className="rkb-fk-re">{h.etiket || '—'}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="rkb-fk-del">
              <span>Bruges af</span>
              {forklaring.brugtAf.length ? forklaring.brugtAf.slice(0, 30).map((h, i) => (
                <button key={i} type="button" className="rkb-fk-ref" onClick={() => gaaTilAdresse(h.tekst.includes('!') ? h.tekst : `${arkPrefiks(ark.navn)}${h.tekst}`)}>
                  <span className="rkb-fk-r">{h.tekst}</span>
                  <span className="rkb-fk-rv">{h.vaerdi}</span>
                  <span className="rkb-fk-re">{h.etiket || '—'}</span>
                </button>
              )) : <em>ingen celler</em>}
            </div>
          </aside>
        )}
      </div>

      <div className="rkb-faner">
        {bog.ark.map((a, i) => (
          <div key={a.id} className={`rkb-fane ${a.id === ark?.id ? 'rkb-aktiv' : ''} ${red && red.arkId === a.id && !rederHer ? 'rkb-kilde' : ''}`}
               draggable={!omdoeber}
               onDragStart={() => { trukket.current = i }}
               onDragOver={e => e.preventDefault()}
               onDrop={() => { if (trukket.current !== null) aendr(flytArk(bog, trukket.current, i)); trukket.current = null }}
               onMouseDown={e => { if (e.button === 0 && red?.tekst.startsWith('=')) e.preventDefault() }}
               onClick={() => vaelgArk(a.id)}
               onDoubleClick={() => setOmdoeber({ id: a.id, navn: a.navn, fejl: null })}
               onContextMenu={e => { e.preventDefault(); setMenu({ id: a.id, x: e.clientX, y: e.clientY }) }}>
            {omdoeber?.id === a.id
              ? <input autoFocus className="rkb-fanenavn" value={omdoeber.navn}
                       onChange={e => setOmdoeber({ ...omdoeber, navn: e.target.value, fejl: null })}
                       onBlur={gemNavn}
                       onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); gemNavn() } if (e.key === 'Escape') { e.preventDefault(); setOmdoeber(null) } e.stopPropagation() }} />
              : a.navn}
          </div>
        ))}
        <button type="button" className="rkb-ny" title="Nyt ark" onClick={() => nyFane()}>+</button>
        <select className="rkb-nyskab" value="" title="Nyt ark fra skabelon" onChange={e => {
          const v = e.target.value
          if (v.startsWith('bog:')) nyeFraBogskabelon(v.slice(4)); else if (v) nyFane(v)
        }}>
          <option value="">Nyt fra skabelon…</option>
          <optgroup label="Ét ark">
            {SKABELONER.map(s => <option key={s.key} value={s.key}>{s.titel}</option>)}
          </optgroup>
          <optgroup label="Flere ark, der hænger sammen">
            {BOG_SKABELONER.map(s => <option key={s.key} value={`bog:${s.key}`} title={s.beskrivelse}>{s.titel}</option>)}
          </optgroup>
        </select>
        <span className="rkb-fyld" />
        {omdoeber?.fejl && <span className="rkb-fejltekst">{omdoeber.fejl}</span>}
        <button type="button" className={`rkb-fejlknap ${fejlListe.length ? 'rkb-harfejl' : ''}`} onClick={naesteFejl}
                title={fejlListe.length ? 'Gå til næste fejl' : 'Ingen fejl i bogen'}>
          {fejlListe.length ? `${fejlListe.length} fejl i bogen →` : 'Ingen fejl ✓'}
        </button>
      </div>

      {celleMenu && (
        <div className="rkb-menu" style={{ left: celleMenu.x, top: celleMenu.y }} onClick={e => e.stopPropagation()}>
          <button type="button" onClick={startNavngiv}>{celleNavne.has(adresse(akt.r, akt.k)) ? 'Ret navn…' : 'Navngiv celle…'}</button>
          <button type="button" onClick={() => { setCelleMenu(null); aendrGitter('r', omr.r0, 1) }}>Indsæt række over</button>
          <button type="button" onClick={() => { setCelleMenu(null); aendrGitter('r', omr.r0, -(omr.r1 - omr.r0 + 1)) }}>Slet række</button>
          <button type="button" onClick={() => { setCelleMenu(null); setSpor(true); setVisNavne(false) }}>Spor celle</button>
        </div>
      )}
      {menu && (
        <div className="rkb-menu" style={{ left: menu.x, top: menu.y - 150 }} onClick={e => e.stopPropagation()}>
          <button type="button" onClick={() => { setOmdoeber({ id: menu.id, navn: bog.ark.find(a => a.id === menu.id)?.navn ?? '', fejl: null }); setMenu(null) }}>Omdøb</button>
          <button type="button" onClick={() => { const r = dupliker(bog, menu.id); aendr(r.bog); setAktivId(r.id); setMenu(null) }}>Dupliker</button>
          <button type="button" onClick={() => { const i = bog.ark.findIndex(a => a.id === menu.id); aendr(flytArk(bog, i, i - 1)); setMenu(null) }}>Flyt til venstre</button>
          <button type="button" onClick={() => { const i = bog.ark.findIndex(a => a.id === menu.id); aendr(flytArk(bog, i, i + 1)); setMenu(null) }}>Flyt til højre</button>
          <button type="button" className="rkb-slet" onClick={() => slet(menu.id)}>Slet ark…</button>
        </div>
      )}
    </div>
  )
  return createPortal(indhold, document.body)
}
