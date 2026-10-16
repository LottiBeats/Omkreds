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
 * "Navngiv" giver den aktive celle et navn (en udgang, fx w_kip_V4). Navnet
 * kan bruges i formler (=w_kip_V4*2), i navnefeltet og i beregningsblokkene:
 * "=" i et talfelt eller [w_kip_V4] i Egen beregning (lib/koblinger.js).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  regnBog, formatVaerdi, erFejl, kolNavn, adresse, laesAdresse, laesTsv, skrivTsv, udvid, forskydFormel,
  flytHenvisninger, flytNoegler, FUNKTIONER, oversaet, arkPrefiks,
} from '../../lib/regneark.js'
import {
  medArk, medEtArk, nytArk, omdoebArk, sletArk, dupliker, flytArk, arkDerBruger,
  navneOpslag, navngiv, fjernNavn, navneFor, flytNavne, udgange, indsaetSkabelon,
} from '../../lib/regnearksbog.js'
import { SKABELONER } from '../../lib/regnearkSkabeloner.js'
import { BOG_SKABELONER } from '../../lib/bogSkabeloner.js'
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

export default function RegnearksBog({ bog, onBog, startArk = null, startCelle = null, onLuk, visninger = () => [], koblinger = () => [] }) {
  const [aktivId, setAktivId] = useState(() => startArk ?? bog.ark[0]?.id ?? null)
  const ark = bog.ark.find(a => a.id === aktivId) ?? bog.ark[0] ?? null
  const d = ark ?? { celler: [['']], dec: {}, fed: {} }
  const celler = d.celler ?? [['']]
  const dec = d.dec ?? {}
  const fed = d.fed ?? {}

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
  const [spor, setSpor] = useState(false)
  const [visNavne, setVisNavne] = useState(false)
  const [navngiver, setNavngiver] = useState(null)   // { navn, enhed, fejl, celle }
  const [celleMenu, setCelleMenu] = useState(null)   // { x, y }
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
  const bredde = (k) => d.bredder?.[k] ?? (k === 0 ? 150 : STD_BREDDE)
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
    const flytAlle = (a) => ({ ...a, celler: (a.celler ?? []).map(raek => raek.map(c => flytHenvisninger(c, a.navn, d.navn, akse, fra, n))) })
    const nyeArk = bog.ark.map(a => {
      if (a.id !== d.id) return flytAlle(a)
      let c = flytAlle(a).celler.map(r => [...r])
      if (akse === 'r') {
        if (n > 0) c.splice(fra, 0, ...Array.from({ length: n }, () => Array(c[0]?.length ?? 1).fill('')))
        else c.splice(fra, -n)
      } else {
        c = c.map(r => { const x = [...r]; if (n > 0) x.splice(fra, 0, ...Array(n).fill('')); else x.splice(fra, -n); return x })
      }
      const bredder = [...(a.bredder ?? [])]
      if (akse === 'k' && bredder.length > fra) { if (n > 0) bredder.splice(fra, 0, ...Array(n).fill(STD_BREDDE)); else bredder.splice(fra, -n) }
      return { ...a, celler: trim(c), bredder, dec: flytNoegler(dec, akse, fra, n), fed: flytNoegler(fed, akse, fra, n) }
    })
    aendr(medArk({ ...bog, navne: flytNavne(bog.navne, d.id, akse, fra, n) }, nyeArk))
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

  // Navngivne celler i det viste ark: adresse → "navn, navn"
  const celleNavne = useMemo(() => {
    const m = new Map()
    for (const [n, x] of Object.entries(bog.navne ?? {})) if (x.ark === ark?.id && x.celle) m.set(x.celle, m.has(x.celle) ? `${m.get(x.celle)}, ${n}` : n)
    return m
  }, [bog, ark])
  const aktRaw = red ? red.tekst : raw(akt.r, akt.k)
  const adrTekst = omr.r0 !== omr.r1 || omr.k0 !== omr.k1 ? `${adresse(omr.r0, omr.k0)}:${adresse(omr.r1, omr.k1)}` : adresse(akt.r, akt.k)
  const visTekst = (r, k) => formatVaerdi(vaerdier[r]?.[k], decFor(r, k))
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
        <span className="rkb-brug" title="Hvor arket vises i rapporten">
          {ark && (vis.length ? `Vises i rapporten: ${[...new Set(vis.map(v => v.sted))].join(', ')}` : 'Vises ikke i rapporten')}
        </span>
        <button type="button" className="rkb-luk" onClick={onLuk} title="Luk (Esc)">Luk ✕</button>
      </div>

      {ark && (
        <div className="rk-bar">
          <button type="button" title="Fed (Ctrl+B)" onClick={toggleFed}><b>F</b></button>
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
          <button type="button" className={spor ? 'rkb-on' : ''} title="Vis hvad cellen bygger på, og hvor den bruges"
                  onClick={() => { setSpor(s => !s); setVisNavne(false) }}>Spor celle</button>
          <button type="button" title="Giv cellen et navn, der kan bruges i formler og i beregningsblokkene" onClick={startNavngiv}>Navngiv celle</button>
          <button type="button" className={visNavne ? 'rkb-on' : ''} title="Bogens navngivne celler"
                  onClick={() => { setVisNavne(v => !v); setSpor(false) }}>Navne ({alleUdgange.length})</button>
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
      {besked && <div className="rkb-besked" onClick={() => setBesked(null)}>{besked}</div>}
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
            <table>
              <colgroup>
                <col style={{ width: 38 }} />
                {Array.from({ length: antalK }, (_, k) => <col key={k} data-k={k} style={{ width: bredde(k) }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className="rk-hj" />
                  {Array.from({ length: antalK }, (_, k) => (
                    <th key={k} className={k >= omr.k0 && k <= omr.k1 ? 'rk-on' : ''}
                        onMouseDown={e => { setAnker({ r: 0, k }); setAkt({ r: antalR - 1, k }); rodRef.current?.focus(); e.preventDefault() }}>
                      {kolNavn(k)}
                      <span className="rk-traek" onMouseDown={e => startBredde(k, e)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: antalR }, (_, r) => (
                  <tr key={r} className={r === 0 && d.overskrift !== false ? 'rk-hoved' : ''}>
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
                        erForg(r, k) ? 'rkb-forg' : '', celleNavne.has(adresse(r, k)) ? 'rkb-harnavn' : '',
                      ].join(' ')
                      return (
                        <td key={k} data-c={`${r}-${k}`} className={cls} onMouseDown={e => musNed(r, k, e)} onMouseEnter={() => musOver(r, k)}
                            onDoubleClick={() => startRed(raw(r, k), 'ret')}
                            onContextMenu={e => { e.preventDefault(); if (!iOmr(r, k)) { setAnker(null); setAkt({ r, k }) } setCelleMenu({ x: e.clientX, y: e.clientY }) }}
                            title={[celleNavne.get(adresse(r, k)), String(raw(r, k)).startsWith('=') ? raw(r, k) : null].filter(Boolean).join('  ·  ') || undefined}>
                          {rettes
                            ? <input ref={inputRef} className="rk-in" value={red.tekst}
                                     onChange={e => setRed({ ...red, tekst: e.target.value })}
                                     onKeyDown={tastRed}
                                     onBlur={() => { if (document.activeElement !== linjeRef.current && !red.tekst.startsWith('=')) gemRed() }} />
                            : visTekst(r, k)}
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
            <button type="button" onClick={() => nyFane()}>+ Nyt ark</button>
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
        {spor && sporing && (
          <aside className="rkb-spor">
            <h4>{ark.navn}!{adresse(akt.r, akt.k)}</h4>
            <div className="rkb-spor-del">
              <span>Bygger på</span>
              {sporing.forg.length ? sporing.forg.map((f, i) => (
                <button key={i} type="button" onClick={() => gaaTilAdresse(f.ref.ark ? f.tekst : `${arkPrefiks(ark.navn)}${f.tekst}`)}>{f.tekst}</button>
              )) : <em>ingen henvisninger</em>}
            </div>
            <div className="rkb-spor-del">
              <span>Bruges af</span>
              {sporing.efterf.length ? sporing.efterf.map((f, i) => (
                <button key={i} type="button" onClick={() => gaaTilAdresse(f.tekst.includes('!') ? f.tekst : `${arkPrefiks(ark.navn)}${f.tekst}`)}>{f.tekst}</button>
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
