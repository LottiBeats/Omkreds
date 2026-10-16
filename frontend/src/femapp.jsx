/**
 * femapp.jsx — Omkreds FEM, det selvstændige program
 *
 * Kun modelvinduet fra omkreds.dk (FemWorkspace), fyldt ud over hele skærmen:
 * tegn rammen, læg laster på, regn og se snitkræfter og udnyttelse på
 * modellen. Ingen projekter, intet login — en model er en fil på computeren
 * (lib/femFile.js), og PDF'en laves af den samme pdf_builder som på omkreds.dk
 * (backend/desktop_app.py). Filen har samme form som et dokument (en liste af
 * blokke), så den senere kan importeres i et projekt på omkreds.dk.
 *
 * Tre visninger: FEM (modelvinduet), Rapport (components/rapport: en side
 * med overskrifter, simpel tekst og egne beregninger, hvor rammeberegningen
 * står som et kort) og de to side om side med en skillelinje, man kan trække
 * i. PDF'en er rapporten i den rækkefølge.
 *
 * Kører i skrivebordsprogrammet (Tauri) og, under udvikling, i en almindelig
 * browser mod `python backend/desktop_app.py` eller Vite + en lokal backend.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import { AppProviders } from './App.jsx'
import { Button } from './ui/index.js'
import { TYPE_MAP } from './components/blocks/BlockList.jsx'
import GeneralFrameFemBlock from './components/blocks/GeneralFrameFemBlock.jsx'
import { desktopPdf } from './api/client.js'
import { lavModel, gem, aabn, gemPdf, gemTekst } from './lib/femFile.js'
import { resultaterSomCsv } from './lib/femCsv.js'
import { hashCalcInputs, calcRevision, isStaleResult, hasCalcResult } from './lib/calcState.js'
import useBlockUndo from './hooks/useBlockUndo.js'
import RapportView from './components/rapport/RapportView.jsx'
import { pdfBlokke, femIRapport, medBog } from './lib/rapport.js'
import { udgange } from './lib/regnearksbog.js'
import { opdaterLinks, anvendPaaBlokke, udgangsMap } from './lib/koblinger.js'
import { KoblingKontekst } from './components/bog/KoblingKontekst.js'

const VISNINGER = [['fem', 'FEM'], ['begge', 'Side om side'], ['rapport', 'Rapport']]

// Visning og delingen side om side huskes til næste gang, programmet åbnes.
function husket(noegle, standard) {
  try { return JSON.parse(localStorage.getItem(noegle)) ?? standard } catch { return standard }
}
function husk(noegle, v) {
  try { localStorage.setItem(noegle, JSON.stringify(v)) } catch { /* privat vindue o.l. */ }
}

const TOM_META = { project_name: '', project_ref: '', engineer: '', checker: '', client: '' }

function isTextTarget(el) {
  const tag = el?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable
}

function nyeBlokke() {
  return [{ id: Date.now(), type: 'general_frame_fem',
            data: { ...TYPE_MAP.general_frame_fem.default, title: 'Rammeberegning' } }]
}

// Modellen er den første rammeberegning i filen. En fil fra omkreds.dk med
// flere blokke kan åbnes; de andre blokke gemmes uændret med igen.
const femIndeks = (blocks) => Math.max(0, blocks.findIndex(b => b.type === 'general_frame_fem'))

function FemApp() {
  const [meta, setMeta] = useState(TOM_META)
  const [blocks, setBlocks] = useState(nyeBlokke)
  // Regnearksbogen (lib/regnearksbog.js): ark, som rapportens "Regneark"-blokke viser.
  const [bog, setBog] = useState(() => ({ ark: [] }))
  const [fil, setFil] = useState({ handle: null, navn: null })
  const [aendret, setAendret] = useState(false)
  const [besked, setBesked] = useState(null)
  const [travl, setTravl] = useState(false)
  const [visSag, setVisSag] = useState(false)
  const [visning, setVisningRaa] = useState(() => {
    const v = husket('omkreds.visning', 'fem')
    return VISNINGER.some(([k]) => k === v) ? v : 'fem'
  })
  const setVisning = (v) => { setVisningRaa(v); husk('omkreds.visning', v) }
  // FEM-rudens andel af bredden side om side.
  const [deling, setDeling] = useState(() => Math.min(0.8, Math.max(0.3, Number(husket('omkreds.deling', 0.58)) || 0.58)))
  const delRef = useRef(null)

  const traek = (e) => {
    e.preventDefault()
    const boks = delRef.current?.getBoundingClientRect()
    if (!boks) return
    let sidst = deling
    const flyt = (ev) => {
      sidst = Math.min(0.8, Math.max(0.3, (ev.clientX - boks.left) / boks.width))
      setDeling(sidst)
    }
    const slip = () => {
      window.removeEventListener('pointermove', flyt); window.removeEventListener('pointerup', slip)
      document.body.style.cursor = ''; document.body.style.userSelect = ''
      husk('omkreds.deling', sidst)
    }
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', flyt); window.addEventListener('pointerup', slip)
  }
  // Editoren husker valgt blok m.m.; en ny eller åbnet model skal starte forfra.
  const [noegle, setNoegle] = useState(0)

  const state = useRef({ meta, blocks, fil, aendret, bog })
  state.current = { meta, blocks, fil, aendret, bog }
  // Koblinger til regnearket (lib/koblinger.js): "=" i et talfelt melder,
  // hvilket navn den næste værdi kommer fra; ændringen af blokken gemmer det.
  const udgListe = useMemo(() => udgange(bog), [bog])
  const ventende = useRef(null)
  const kobling = useMemo(() => ({
    udgange: udgListe,
    forvent: (navn, vaerdi) => { ventende.current = { navn, vaerdi, t: Date.now() } },
  }), [udgListe])
  const medLinks = (gamle, nye) => {
    const v = ventende.current && Date.now() - ventende.current.t < 5000 ? ventende.current : null
    const map = new Map(udgListe.map(u => [u.navn, u]))
    let brugt = false
    const ud = nye.map(b => {
      const gl = gamle.find(x => x.id === b.id)
      if (!gl || gl === b) return b
      const d = opdaterLinks(gl.data, b.data, v, map)
      if (v && d?._links && Object.values(d._links).includes(v.navn)) brugt = true
      return d === b.data ? b : { ...b, data: d }
    })
    if (brugt) ventende.current = null
    return ud
  }
  const medLinksRef = useRef(medLinks)
  medLinksRef.current = medLinks
  const onBog = useCallback((nb) => {
    state.current.bog = nb; setBog(nb); setAendret(true)
    // Felter og Egen beregning, der er koblet til bogens navne, følger med.
    const bs = anvendPaaBlokke(state.current.blocks, udgangsMap(nb))
    if (bs !== state.current.blocks) { state.current.blocks = bs; setBlocks(bs) }
  }, [])

  const { record: undoRecord, undo: undoStep, redo: redoStep, clearAll: undoClear } = useBlockUndo('fem')

  const vis = (tekst, fejl = false) => {
    setBesked({ tekst, fejl })
    if (!fejl) setTimeout(() => setBesked(b => (b?.tekst === tekst ? null : b)), 3000)
  }

  const onMeta = (k, v) => { setMeta(m => ({ ...m, [k]: v })); setAendret(true) }

  const forkastOk = () =>
    !state.current.aendret || window.confirm('Filen er ændret og ikke gemt. Fortsæt alligevel?')

  const forslag = () => {
    const { meta, fil } = state.current
    if (fil.navn) return fil.navn.replace(/\.[^.]+$/, '')
    return [meta.project_ref, meta.project_name].filter(Boolean).join(' ') || 'Rammeberegning'
  }

  const ny = () => {
    if (!forkastOk()) return
    setMeta(TOM_META); setBlocks(nyeBlokke()); setBog({ ark: [] }); setFil({ handle: null, navn: null }); undoClear()
    setAendret(false); setNoegle(k => k + 1)
  }

  const aabnFil = async () => {
    if (!forkastOk()) return
    try {
      const r = await aabn()
      if (!r) return
      // En fil fra før regnearksbogen: regnearkene flyttes ind i bogen.
      const m = medBog(r.model.blocks, r.model.bog)
      setMeta({ ...TOM_META, ...r.model.metadata }); setBlocks(m.blocks); setBog(m.bog); undoClear()
      setFil({ handle: r.handle, navn: r.navn }); setAendret(m.antal > 0); setNoegle(k => k + 1)
      vis(m.antal ? `Åbnede ${r.navn} — ${m.antal} regneark er flyttet ind i regnearksbogen. Gem for at beholde det.` : `Åbnede ${r.navn}`)
    } catch (e) {
      vis(e.message, true)
    }
  }

  const gemFil = async (som = false) => {
    const { meta, blocks, fil, bog } = state.current
    try {
      const r = await gem(lavModel(meta, blocks, bog), som ? null : fil.handle, forslag())
      if (!r) return
      setFil(r); setAendret(false)
      vis(`Gemt som ${r.navn}`)
    } catch (e) {
      vis(`Kunne ikke gemme: ${e.message}`, true)
    }
  }

  // Resultattabellerne til Excel. Samme krav som PDF'en: et regnet, aktuelt
  // resultat — ellers er tallene for en anden model end den på skærmen.
  const lavCsv = async () => {
    const { meta, blocks } = state.current
    const fem = blocks.find(b => b.type === 'general_frame_fem')
    if (!fem || !hasCalcResult(fem)) { vis('Regn modellen (F5), før tabellerne eksporteres.', true); return }
    if (isStaleResult(fem)) { vis('Modellen er ændret siden sidste beregning — regn igen (F5) først.', true); return }
    try {
      const sti = await gemTekst(resultaterSomCsv(fem.data, meta), forslag())
      if (sti) vis(`Tabeller gemt: ${String(sti).split(/[\\/]/).pop()}`)
    } catch (e) {
      vis(`Tabellerne kunne ikke gemmes: ${e.message}`, true)
    }
  }

  const lavPdf = async () => {
    const { meta, blocks: alle, bog } = state.current
    // PDF'en er rapporten. Rammeberegningen er med, når den har en model og
    // ikke er valgt fra i Rapport-visningen.
    const { blocks, tom } = pdfBlokke(alle, bog)
    if (tom) { vis('Der er ikke noget at lave PDF af endnu: tegn en model i FEM eller skriv i Rapport.', true); return }
    // En PDF er en dokumentation af et bestemt regnet resultat. Er modellen
    // ændret siden, eller er den ikke regnet, ville rapporten vise tal for en
    // anden konstruktion end den, der står på skærmen — uden at sige det.
    const fem = alle.find(b => b.type === 'general_frame_fem')
    if (femIRapport(fem) && !hasCalcResult(fem)) { vis('Regn modellen (F5), før der laves en PDF — eller fravælg den i Rapport.', true); return }
    if (femIRapport(fem) && isStaleResult(fem)) { vis('Modellen er ændret siden sidste beregning — regn igen (F5), før der laves en PDF.', true); return }
    setTravl(true)
    try {
      const blob = await desktopPdf(meta, blocks, bog)
      const sti = await gemPdf(blob, forslag())
      if (sti) vis(`PDF gemt: ${String(sti).split(/[\\/]/).pop()}`)
    } catch (e) {
      vis(`PDF'en kunne ikke laves: ${e.message}`, true)
    } finally {
      setTravl(false)
    }
  }

  // Ctrl+S / Ctrl+Shift+S / Ctrl+O / Ctrl+Alt+N / Ctrl+Z / Ctrl+Y og advarsel ved lukning.
  useEffect(() => {
    const tast = e => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 's') { e.preventDefault(); gemFil(e.shiftKey) }
      // I et tekstfelt vinder feltets egen fortryd, som i editoren på omkreds.dk.
      else if (isTextTarget(e.target) && (k === 'z' || k === 'y')) return
      else if (k === 'z' && !e.shiftKey) { e.preventDefault(); fortryd(false) }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); fortryd(true) }
      else if (k === 'o') { e.preventDefault(); aabnFil() }
      else if (k === 'n' && e.altKey) { e.preventDefault(); ny() }
    }
    const luk = e => { if (state.current.aendret) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('keydown', tast)
    window.addEventListener('beforeunload', luk)
    return () => { window.removeEventListener('keydown', tast); window.removeEventListener('beforeunload', luk) }
  })

  // I skrivebordsprogrammet lukkes vinduet af Tauri, og beforeunload bliver
  // ikke spurgt. Spørg selv, og luk kun, når modellen er gemt eller opgivet.
  useEffect(() => {
    const w = window.__TAURI__?.window?.getCurrentWindow?.()
    if (!w) return
    let fjern = null
    w.onCloseRequested(async (e) => {
      if (!state.current.aendret) return
      e.preventDefault()
      if (window.confirm('Filen er ændret og ikke gemt. Luk alligevel?')) await w.destroy()
    }).then(f => { fjern = f })
    return () => { if (fjern) fjern() }
  }, [])

  useEffect(() => {
    document.title = `${aendret ? '• ' : ''}${fil.navn ?? 'Ny fil'} — Omkreds`
  }, [fil.navn, aendret])

  // En fil uden rammeberegning (fx et dokument fra omkreds.dk) får en.
  const idx = femIndeks(blocks)
  const blok = blocks[idx]?.type === 'general_frame_fem' ? blocks[idx] : null
  useEffect(() => {
    if (!blok) setBlocks(b => [...b, ...nyeBlokke()])
  }, [blok])
  const onBlok = useCallback(nb => {
    // Fra state.current og ikke inde i en setBlocks-updater: fortrydelsen skal
    // registreres præcis én gang pr. ændring (StrictMode kalder updaters to gange).
    const bs = state.current.blocks
    const i = femIndeks(bs)
    // Samme stempel som BlockList.stampBlock: et nyt resultat får hashen af
    // de inddata, det er regnet af, og beregningens revision. Uden det står
    // modellen som "ændret — regn igen" lige efter beregningen.
    const gl = bs[i]?.data ?? {}
    const d = nb.data ?? {}
    const nyt = (d._result && d._result !== gl._result) || (d._summary && d._summary !== gl._summary)
    const { _run_hash, ...dRest } = d
    const b = nyt ? { ...nb, data: { ...dRest, _input_hash: _run_hash ?? hashCalcInputs(dRest), _calc_rev: calcRevision(nb.type) } } : nb
    const nyeBs = medLinksRef.current(bs, bs.map((x, j) => (j === i ? b : x)))
    // Kun ændringer af modellen kan fortrydes — et resultat, der kommer ind
    // efter "Regn", er ikke et skridt, man vil tilbage over.
    if (hashCalcInputs(d) !== hashCalcInputs(gl)) undoRecord(bs)
    state.current.blocks = nyeBs
    setBlocks(nyeBs)
    setAendret(true)
  }, [undoRecord])

  // Rapport-visningen. Flyt, indsæt og slet kan fortrydes med Ctrl+Z; det,
  // man skriver, fortrydes i feltet selv.
  const onRapport = useCallback((nyeBsRaa, struktur) => {
    const nyeBs = medLinksRef.current(state.current.blocks, nyeBsRaa)
    if (struktur) undoRecord(state.current.blocks)
    state.current.blocks = nyeBs
    setBlocks(nyeBs)
    setAendret(true)
  }, [undoRecord])

  const fortryd = useCallback((frem) => {
    const cur = state.current.blocks
    const til = frem ? redoStep(cur) : undoStep(cur)
    if (!til) return
    state.current.blocks = til
    setBlocks(til)
    setAendret(true)
  }, [undoStep, redoStep])

  const knapper = (
    <div style={s.knapper}>
      <span style={s.brand}>Omkreds</span>
      <div style={s.visninger} role="tablist" aria-label="Visning">
        {VISNINGER.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={visning === k}
                  style={{ ...s.visKnap, ...(visning === k ? s.visKnapPaa : null) }}
                  onClick={() => setVisning(k)}>{l}</button>
        ))}
      </div>
      <Button size="sm" onClick={ny} title="Ny model (Ctrl+Alt+N)">Ny</Button>
      <Button size="sm" onClick={aabnFil} title="Åbn (Ctrl+O)">Åbn…</Button>
      <Button size="sm" onClick={() => gemFil(false)} title="Gem (Ctrl+S)">Gem</Button>
      <Button size="sm" onClick={() => gemFil(true)} title="Gem som (Ctrl+Shift+S)">Gem som…</Button>
      <Button size="sm" onClick={() => setVisSag(v => !v)}>Sag…</Button>
      <Button size="sm" onClick={lavPdf} disabled={travl}>{travl ? 'Laver PDF…' : 'PDF'}</Button>
      <Button size="sm" onClick={lavCsv} title="Resultattabellerne som CSV til Excel">CSV</Button>
      <span style={s.fil} title={fil.navn ?? 'Ny model'}>{fil.navn ?? 'Ny model'}{aendret ? ' •' : ''}</span>
      <span style={s.skille} />
    </div>
  )

  return (
    <KoblingKontekst.Provider value={kobling}>
      {/* Modelvinduet er kun monteret i FEM-visningen: dets tastatur (Delete,
          værktøjstaster) må ikke ramme en markering, mens man skriver rapport. */}
      {visning === 'fem' && blok && (
        <GeneralFrameFemBlock key={noegle} block={blok} onChange={onBlok} blocks={blocks}
          standalone={{ actions: knapper }} />
      )}
      {visning === 'begge' && (
        <div style={s.rapport}>
         <div style={s.rapportTop}>{knapper}</div>
         <div style={s.begge} ref={delRef}>
          <div style={{ ...s.rude, flexBasis: `${deling * 100}%` }}>
            {blok && (
              <GeneralFrameFemBlock key={noegle} block={blok} onChange={onBlok} blocks={blocks}
                standalone={{ actions: null, indlejret: true }} />
            )}
          </div>
          <div style={s.deler} onPointerDown={traek} onDoubleClick={() => { setDeling(0.58); husk('omkreds.deling', 0.58) }}
               role="separator" aria-orientation="vertical" title="Træk for at ændre bredden (dobbeltklik: standard)" />
          {/* tabIndex: et klik i rapporten flytter fokus hertil, så modellens
              taster (Delete, værktøjer) ikke rammer en markering i FEM. */}
          <div style={{ ...s.rude, flex: 1 }} tabIndex={-1} data-fem-ignorer-taster="">
            <RapportView key={noegle} blocks={blocks} onChange={onRapport} smal bog={bog} onBog={onBog} />
          </div>
         </div>
        </div>
      )}
      {visning === 'rapport' && (
        <div style={s.rapport}>
          <div style={s.rapportTop}>{knapper}</div>
          <div style={s.rapportKrop}>
            <RapportView key={noegle} blocks={blocks} onChange={onRapport} onVisFem={() => setVisning('fem')} bog={bog} onBog={onBog} />
          </div>
        </div>
      )}

      {visSag && (
        <div style={s.sag} role="dialog" aria-label="Sagsoplysninger">
          <div style={s.sagTitel}>Sagsoplysninger — til PDF'ens sidehoved</div>
          {[['project_name', 'Sag'], ['project_ref', 'Sagsnr.'], ['client', 'Bygherre'],
            ['engineer', 'Beregnet af'], ['checker', 'Kontrolleret af']].map(([k, l]) => (
            <label key={k} style={s.felt}>
              <span style={s.lbl}>{l}</span>
              <input style={s.inp} value={meta[k] ?? ''} onChange={e => onMeta(k, e.target.value)} />
            </label>
          ))}
          <Button size="sm" onClick={() => setVisSag(false)}>Luk</Button>
        </div>
      )}

      {besked && (
        <div style={{ ...s.besked, ...(besked.fejl ? s.fejl : null) }} onClick={() => setBesked(null)}>
          {besked.tekst}
        </div>
      )}
    </KoblingKontekst.Provider>
  )
}

const s = {
  knapper: { display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 },
  brand: { fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', marginRight: 4 },
  visninger: { display: 'inline-flex', border: '1px solid var(--line-2, #d6cfc8)', borderRadius: 6, overflow: 'hidden', marginRight: 6 },
  visKnap: { border: 0, background: 'var(--surface, #fff)', padding: '4px 12px', fontSize: 12.5, cursor: 'pointer', color: 'var(--ink-2, #44403c)' },
  visKnapPaa: { background: 'var(--ink, #1c1917)', color: '#fff', fontWeight: 600 },
  rapport: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' },
  rapportTop: { display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--line, #e4dfda)', background: 'var(--surface, #fff)' },
  rapportKrop: { position: 'relative', flex: 1, minHeight: 0 },
  begge: { position: 'relative', flex: 1, minHeight: 0, display: 'flex' },
  rude: { position: 'relative', minWidth: 0, height: '100%', outline: 'none', flexShrink: 0 },
  deler: { width: 6, cursor: 'col-resize', background: 'var(--line, #e4dfda)', flexShrink: 0, zIndex: 1 },
  fil: {
    fontSize: 12, color: 'var(--muted, #666)', whiteSpace: 'nowrap', overflow: 'hidden',
    textOverflow: 'ellipsis', maxWidth: 200, marginLeft: 4,
  },
  skille: { width: 1, height: 20, background: 'var(--line, #ddd)', margin: '0 6px' },
  sag: {
    position: 'fixed', top: 52, left: 16, zIndex: 3000, width: 320, display: 'grid', gap: 8,
    padding: 14, background: 'var(--surface, #fff)', border: '1px solid var(--line, #ddd)',
    borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,.15)',
  },
  sagTitel: { fontSize: 12.5, fontWeight: 600 },
  felt: { display: 'grid', gap: 3 },
  lbl: { fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.04em' },
  inp: { border: '1px solid #ddd', borderRadius: 4, padding: '5px 8px', fontSize: 13, fontFamily: 'inherit' },
  besked: {
    position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 3000,
    background: '#1f2937', color: '#fff', padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
  },
  fejl: { background: '#991b1b' },
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProviders>
      <FemApp />
    </AppProviders>
  </React.StrictMode>
)
