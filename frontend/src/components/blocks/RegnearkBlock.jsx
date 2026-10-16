/**
 * RegnearkBlock.jsx — et regneark i dokumentet, der opfører sig som Excel.
 *
 * Celler med tal, tekst og formler (=B3*C3, =SUM(B2:B9), =Opbygning!G12).
 * Arkene i et dokument er én arbejdsbog: retter man en opbygning i ét ark,
 * regnes lastnedføringen i et andet om med det samme.
 *
 * Tastatur som i Excel:
 *   piletaster          flyt (Shift: udvid markeringen)
 *   Enter / Shift+Enter gem og gå ned / op        Tab / Shift+Tab  højre / venstre
 *   skriv               erstatter cellen          F2 / dobbeltklik  ret i cellen
 *   Delete / Backspace  ryd markeringen            Esc               fortryd rettelsen
 *   Ctrl+C / X / V      kopiér, klip, indsæt — også til og fra Excel
 *   Ctrl+D              fyld nedad (formler flytter med, $ låser)
 *   Ctrl+B              fed                        Ctrl+Z / Ctrl+Y   fortryd / gentag
 * Mens man skriver en formel, sætter et klik i en anden celle dens adresse ind.
 *
 * Regningen ligger i lib/regneark.js. De viste tekster gemmes i data._vist,
 * så PDF og Word viser det samme som skærmen.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  regnBog, formatVaerdi, erFejl, kolNavn, adresse, laesTsv, skrivTsv, udvid, forskydFormel,
  flytHenvisninger, flytNoegler, synkBog, erRegneark, ledigtNavn, FUNKTIONER,
} from '../../lib/regneark.js'
import { SKABELONER } from '../../lib/regnearkSkabeloner.js'
import './Regneark.css'

const STD_BREDDE = 92
let INTERN = null   // { tekst, celler, r, k } — det, der sidst blev kopieret herfra

export function nytRegneark(navn = 'Ark1') {
  return { navn, titel: '', overskrift: true, celler: Array.from({ length: 8 }, () => Array(6).fill('')),
           bredder: [], dec: {}, fed: {}, _vist: [] }
}

export default function RegnearkBlock({ block, onChange, blocks = [], onUpdateBlock }) {
  const d = block.data ?? {}
  const celler = d.celler ?? [[]]
  const dec = d.dec ?? {}
  const fed = d.fed ?? {}

  // ── Arbejdsbogen: alle regneark i dokumentet, med dette arks nyeste data ──
  const alleArk = useMemo(() => {
    const liste = blocks.filter(erRegneark)
    if (!liste.some(b => b.id === block.id)) liste.push(block)
    return liste.map(b => (b.id === block.id ? block : b))
  }, [blocks, block])
  const bog = useMemo(() => regnBog(alleArk.map(b => ({ navn: b.data.navn, celler: b.data.celler ?? [] }))), [alleArk])
  const vaerdier = bog[d.navn] ?? []

  // Gem: dette ark (og evt. andre ark, der er ændret med det) + friske _vist for hele bogen.
  const gem = useCallback((nyData, andre = new Map()) => {
    const ark = alleArk.map(b => ({ id: b.id, data: b.id === block.id ? nyData : (andre.get(b.id) ?? b.data) }))
    const { data, aendret } = synkBog(ark)
    const par = []
    for (const b of alleArk) {
      if (b.id === block.id || andre.has(b.id) || aendret.includes(b.id)) par.push([b.id, { ...b, data: data.get(b.id) }])
    }
    if (onUpdateBlock) onUpdateBlock(par)
    else onChange({ ...block, data: data.get(block.id) })
  }, [alleArk, block, onChange, onUpdateBlock])

  // Første ark i dokumentet holder _vist i hele bogen ajour (fx efter import),
  // så kun ét ark ad gangen skriver.
  const erFoerste = alleArk[0]?.id === block.id
  useEffect(() => {
    if (!erFoerste) return
    const { aendret } = synkBog(alleArk.map(b => ({ id: b.id, data: b.data })))
    if (aendret.length) gem(d)
  }, [erFoerste, alleArk]) // eslint-disable-line react-hooks/exhaustive-deps

  // Et navn, der allerede bruges af et andet ark, gør henvisningerne tvetydige.
  const dublet = alleArk.some(b => b.id !== block.id && String(b.data.navn).trim().toLowerCase() === String(d.navn).trim().toLowerCase())

  // ── Fortryd inden for arket ──
  const hist = useRef({ fortid: [], fremtid: [] })
  const skift = (ny, andre) => {
    hist.current.fortid.push(d)
    if (hist.current.fortid.length > 100) hist.current.fortid.shift()
    hist.current.fremtid = []
    gem(ny, andre)
  }
  const fortryd = (frem) => {
    const fra = frem ? hist.current.fremtid : hist.current.fortid
    const til = frem ? hist.current.fortid : hist.current.fremtid
    const ny = fra.pop()
    if (!ny) return
    til.push(d)
    gem(ny)
  }

  // ── Markering og redigering ──
  const [akt, setAkt] = useState({ r: 0, k: 0 })
  const [anker, setAnker] = useState(null)
  const [red, setRed] = useState(null)        // { tekst, tilstand: 'skriv' | 'ret' }
  const [traek, setTraek] = useState(false)
  const rodRef = useRef(null)
  const inputRef = useRef(null)
  const linjeRef = useRef(null)

  const omr = useMemo(() => {
    const a = anker ?? akt
    return { r0: Math.min(a.r, akt.r), r1: Math.max(a.r, akt.r), k0: Math.min(a.k, akt.k), k1: Math.max(a.k, akt.k) }
  }, [akt, anker])
  const iOmr = (r, k) => r >= omr.r0 && r <= omr.r1 && k >= omr.k0 && k <= omr.k1

  const antalR = Math.max(celler.length + 3, 12, akt.r + 2)
  const antalK = Math.max(...celler.map(r => r.length), 6, akt.k + 2) + 1
  const bredde = (k) => d.bredder?.[k] ?? (k === 0 ? 150 : STD_BREDDE)

  const raw = (r, k) => celler[r]?.[k] ?? ''
  // Decimaler pr. celle, ellers pr. kolonne (skabelonerne sætter fx "I": 2).
  const decFor = (r, k) => dec[adresse(r, k)] ?? dec[kolNavn(k)] ?? null

  function saetCeller(aendringer, ekstra = {}) {
    // aendringer: [[r, k, tekst]]
    let maxR = 0, maxK = 0
    for (const [r, k] of aendringer) { maxR = Math.max(maxR, r + 1); maxK = Math.max(maxK, k + 1) }
    const ny = udvid(celler, maxR, maxK)
    for (const [r, k, t] of aendringer) ny[r][k] = t
    skift({ ...d, ...ekstra, celler: trim(ny) })
  }

  function flyt(dr, dk, udvidMark = false) {
    setAkt(a => {
      const n = { r: Math.max(0, a.r + dr), k: Math.max(0, a.k + dk) }
      if (udvidMark) { if (!anker) setAnker(a) } else setAnker(null)
      return n
    })
  }

  function startRed(tekst, tilstand) {
    setRed({ tekst, tilstand })
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n) }
    })
  }

  function gemRed(dr = 0, dk = 0) {
    if (!red) return
    const t = red.tekst
    setRed(null)
    if (t !== raw(akt.r, akt.k)) saetCeller([[akt.r, akt.k, t]])
    setAnker(null)
    if (dr || dk) setAkt(a => ({ r: Math.max(0, a.r + dr), k: Math.max(0, a.k + dk) }))
    rodRef.current?.focus()
  }

  function ryd() {
    const aendr = []
    for (let r = omr.r0; r <= omr.r1; r++) for (let k = omr.k0; k <= omr.k1; k++) if (raw(r, k) !== '') aendr.push([r, k, ''])
    if (aendr.length) saetCeller(aendr)
  }

  function toggleFed() {
    const nyFed = { ...fed }
    const alleFed = (() => { for (let r = omr.r0; r <= omr.r1; r++) for (let k = omr.k0; k <= omr.k1; k++) if (!fed[adresse(r, k)]) return false; return true })()
    for (let r = omr.r0; r <= omr.r1; r++) for (let k = omr.k0; k <= omr.k1; k++) {
      if (alleFed) delete nyFed[adresse(r, k)]; else nyFed[adresse(r, k)] = true
    }
    skift({ ...d, fed: nyFed })
  }

  function decimaler(delta) {
    const nyDec = { ...dec }
    for (let r = omr.r0; r <= omr.r1; r++) for (let k = omr.k0; k <= omr.k1; k++) {
      const a = adresse(r, k)
      const v = vaerdier[r]?.[k]
      let cur = nyDec[a] ?? decFor(r, k)
      if (cur === undefined || cur === null) {
        const s = typeof v === 'number' ? formatVaerdi(v) : ''
        cur = s.includes(',') ? s.split(',')[1].length : 0
      }
      const n = Math.max(0, Math.min(6, cur + delta))
      nyDec[a] = n
    }
    skift({ ...d, dec: nyDec })
  }

  function fyldNed() {
    if (omr.r1 === omr.r0) return
    const aendr = []
    for (let k = omr.k0; k <= omr.k1; k++) {
      const top = raw(omr.r0, k)
      for (let r = omr.r0 + 1; r <= omr.r1; r++) aendr.push([r, k, forskydFormel(top, r - omr.r0, 0)])
    }
    saetCeller(aendr)
  }

  // Indsæt/slet rækker og kolonner. Henvisninger i alle ark flytter med.
  function aendrGitter(akse, fra, n) {
    const flytAlle = (data, egetNavn) => ({
      ...data,
      celler: (data.celler ?? []).map(raek => raek.map(c => flytHenvisninger(c, egetNavn, d.navn, akse, fra, n))),
    })
    let ny = flytAlle(d, d.navn)
    let c = ny.celler.map(r => [...r])
    if (akse === 'r') {
      if (n > 0) c.splice(fra, 0, ...Array.from({ length: n }, () => Array(c[0]?.length ?? 1).fill('')))
      else c.splice(fra, -n)
    } else {
      c = c.map(r => { const x = [...r]; if (n > 0) x.splice(fra, 0, ...Array(n).fill('')); else x.splice(fra, -n); return x })
    }
    const bredder = [...(d.bredder ?? [])]
    if (akse === 'k') { if (n > 0) bredder.splice(fra, 0, ...Array(n).fill(STD_BREDDE)); else bredder.splice(fra, -n) }
    ny = { ...ny, celler: trim(c), bredder, dec: flytNoegler(dec, akse, fra, n), fed: flytNoegler(fed, akse, fra, n) }
    const andre = new Map()
    for (const b of alleArk) if (b.id !== block.id) {
      const f = flytAlle(b.data, b.data.navn)
      if (JSON.stringify(f.celler) !== JSON.stringify(b.data.celler)) andre.set(b.id, f)
    }
    skift(ny, andre)
  }

  // ── Kopiér / indsæt ──
  function kopier(e, klip = false) {
    if (red) return
    e.preventDefault()
    const raa = [], vist = []
    for (let r = omr.r0; r <= omr.r1; r++) {
      raa.push([]); vist.push([])
      for (let k = omr.k0; k <= omr.k1; k++) {
        raa.at(-1).push(raw(r, k))
        vist.at(-1).push(formatVaerdi(vaerdier[r]?.[k], decFor(r, k)))
      }
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
    const aendr = []
    if (INTERN && INTERN.tekst === tekst) {
      INTERN.celler.forEach((raek, i) => raek.forEach((t, j) =>
        aendr.push([akt.r + i, akt.k + j, forskydFormel(t, akt.r - INTERN.r, akt.k - INTERN.k)])))
    } else {
      laesTsv(tekst).forEach((raek, i) => raek.forEach((t, j) => aendr.push([akt.r + i, akt.k + j, t.trim()])))
    }
    saetCeller(aendr)
    const nr = Math.max(...aendr.map(a => a[0])), nk = Math.max(...aendr.map(a => a[1]))
    setAnker({ r: akt.r, k: akt.k }); setAkt({ r: nr, k: nk })
  }

  // ── Tastatur på gitteret ──
  function tast(e) {
    if (red) return
    const ctrl = e.ctrlKey || e.metaKey
    const k = e.key
    if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); e.stopPropagation(); fortryd(e.shiftKey); return }
    if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); e.stopPropagation(); fortryd(true); return }
    if (ctrl && (k === 'b' || k === 'B')) { e.preventDefault(); toggleFed(); return }
    if (ctrl && (k === 'd' || k === 'D')) { e.preventDefault(); fyldNed(); return }
    if (ctrl && (k === 'a' || k === 'A')) { e.preventDefault(); setAnker({ r: 0, k: 0 }); setAkt({ r: celler.length - 1, k: Math.max(...celler.map(r => r.length)) - 1 }); return }
    if (ctrl) return
    const pil = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k]
    if (pil) { e.preventDefault(); flyt(pil[0], pil[1], e.shiftKey); return }
    if (k === 'Enter') { e.preventDefault(); flyt(e.shiftKey ? -1 : 1, 0); return }
    if (k === 'Tab') { e.preventDefault(); flyt(0, e.shiftKey ? -1 : 1); return }
    if (k === 'F2') { e.preventDefault(); startRed(raw(akt.r, akt.k), 'ret'); return }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); ryd(); return }
    if (k === 'Escape') { setAnker(null); return }
    if (k.length === 1 && !e.altKey) { e.preventDefault(); setAnker(null); startRed(k, 'skriv') }
  }

  // ── Tastatur i cellen ──
  function tastRed(e) {
    const k = e.key
    if (k === 'Enter') { e.preventDefault(); e.stopPropagation(); gemRed(e.shiftKey ? -1 : 1, 0); return }
    if (k === 'Tab') { e.preventDefault(); e.stopPropagation(); gemRed(0, e.shiftKey ? -1 : 1); return }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); setRed(null); rodRef.current?.focus(); return }
    if (red?.tilstand === 'skriv' && !red.tekst.startsWith('=')) {
      const pil = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k]
      if (pil) { e.preventDefault(); gemRed(pil[0], pil[1]) }
    }
    e.stopPropagation()
  }

  // Klik i en celle, mens man skriver en formel: sæt adressen ind.
  function pegPaa(r, k, e) {
    if (!red || !red.tekst.startsWith('=') || (r === akt.r && k === akt.k)) return false
    e.preventDefault()
    const el = document.activeElement === linjeRef.current ? linjeRef.current : inputRef.current
    const pos = el?.selectionStart ?? red.tekst.length
    const a = adresse(r, k)
    const ny = red.tekst.slice(0, pos) + a + red.tekst.slice(el?.selectionEnd ?? pos)
    setRed({ ...red, tekst: ny, tilstand: 'ret' })
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + a.length, pos + a.length) })
    return true
  }

  function musNed(r, k, e) {
    if (pegPaa(r, k, e)) return
    if (red) gemRed()
    if (e.shiftKey) { if (!anker) setAnker(akt) } else setAnker(null)
    setAkt({ r, k })
    setTraek(true)
    rodRef.current?.focus()
  }
  function musOver(r, k) {
    if (!traek) return
    setAnker(a => a ?? akt)
    setAkt({ r, k })
  }
  useEffect(() => {
    const op = () => setTraek(false)
    window.addEventListener('mouseup', op)
    return () => window.removeEventListener('mouseup', op)
  }, [])

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

  const visTekst = (r, k) => formatVaerdi(vaerdier[r]?.[k], decFor(r, k))
  const aktRaw = red ? red.tekst : raw(akt.r, akt.k)
  const tom = celler.every(r => r.every(c => !c))

  return (
    <div className="rk" onClick={e => e.stopPropagation()}>
      <div className="rk-top">
        <input className="rk-navn" value={d.navn ?? ''} title="Arkets navn — bruges i henvisninger fra andre ark, fx =Opbygning!G5"
               onChange={e => gem({ ...d, navn: e.target.value })} />
        {dublet && <span className="rk-adv" title="To ark med samme navn">Navnet bruges af et andet ark</span>}
        <input className="rk-titel" value={d.titel ?? ''} placeholder="Tabeltekst i rapporten (valgfri)"
               onChange={e => gem({ ...d, titel: e.target.value })} />
        <label className="rk-check"><input type="checkbox" checked={d.overskrift !== false}
               onChange={e => skift({ ...d, overskrift: e.target.checked })} /> 1. række er overskrift</label>
      </div>

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
        {tom && (
          <select className="rk-skabelon" value="" onChange={e => {
            const s = SKABELONER.find(x => x.key === e.target.value)
            if (!s) return
            const brugte = alleArk.filter(b => b.id !== block.id).map(b => b.data.navn)
            const navn = ledigtNavn(brugte, s.navn)
            skift({ ...d, ...s.data(), navn })
          }}>
            <option value="">Start fra skabelon…</option>
            {SKABELONER.map(s => <option key={s.key} value={s.key}>{s.titel}</option>)}
          </select>
        )}
      </div>

      <div className="rk-linje">
        <span className="rk-adr">{omr.r0 !== omr.r1 || omr.k0 !== omr.k1
          ? `${adresse(omr.r0, omr.k0)}:${adresse(omr.r1, omr.k1)}` : adresse(akt.r, akt.k)}</span>
        <span className="rk-fx">fx</span>
        <input ref={linjeRef} className="rk-formel" value={aktRaw}
               onFocus={() => { if (!red) setRed({ tekst: raw(akt.r, akt.k), tilstand: 'ret' }) }}
               onChange={e => setRed({ tekst: e.target.value, tilstand: 'ret' })}
               onKeyDown={tastRed} list="rk-funktioner" />
        <datalist id="rk-funktioner">{FUNKTIONER.map(f => <option key={f} value={`=${f}(`} />)}</datalist>
      </div>

      <div className="rk-gitter" ref={rodRef} tabIndex={0} onKeyDown={tast}
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
                  const cls = [
                    iOmr(r, k) ? 'rk-mark' : '', aktiv ? 'rk-akt' : '',
                    typeof v === 'number' ? 'rk-tal' : '', erFejl(v) ? 'rk-fejl' : '',
                    fed[adresse(r, k)] ? 'rk-fed' : '', String(raw(r, k)).startsWith('=') ? 'rk-f' : '',
                  ].join(' ')
                  return (
                    <td key={k} className={cls} onMouseDown={e => musNed(r, k, e)} onMouseEnter={() => musOver(r, k)}
                        onDoubleClick={() => startRed(raw(r, k), 'ret')}
                        title={String(raw(r, k)).startsWith('=') ? raw(r, k) : undefined}>
                      {aktiv && red
                        ? <input ref={inputRef} className="rk-in" value={red.tekst}
                                 onChange={e => setRed({ ...red, tekst: e.target.value })}
                                 onKeyDown={tastRed} onBlur={() => { if (document.activeElement !== linjeRef.current) gemRed() }} />
                        : visTekst(r, k)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Fjern tomme rækker og kolonner i slutningen (men behold mindst én celle). */
function trim(c) {
  const ud = c.map(r => [...r])
  while (ud.length > 1 && ud.at(-1).every(x => x === '' || x == null)) ud.pop()
  let bredde = 1
  for (const r of ud) for (let k = r.length - 1; k >= 0; k--) if (r[k] !== '' && r[k] != null) { bredde = Math.max(bredde, k + 1); break }
  return ud.map(r => { const x = r.slice(0, bredde); while (x.length < bredde) x.push(''); return x })
}
