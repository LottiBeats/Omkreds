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
 * Kører i skrivebordsprogrammet (Tauri) og, under udvikling, i en almindelig
 * browser mod `python backend/desktop_app.py` eller Vite + en lokal backend.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import { AppProviders } from './App.jsx'
import { Button } from './ui/index.js'
import { TYPE_MAP } from './components/blocks/BlockList.jsx'
import GeneralFrameFemBlock from './components/blocks/GeneralFrameFemBlock.jsx'
import { desktopPdf } from './api/client.js'
import { lavModel, gem, aabn, gemPdf } from './lib/femFile.js'
import { hashCalcInputs, calcRevision } from './lib/calcState.js'

const TOM_META = { project_name: '', project_ref: '', engineer: '', checker: '', client: '' }

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
  const [fil, setFil] = useState({ handle: null, navn: null })
  const [aendret, setAendret] = useState(false)
  const [besked, setBesked] = useState(null)
  const [travl, setTravl] = useState(false)
  const [visSag, setVisSag] = useState(false)
  // Editoren husker valgt blok m.m.; en ny eller åbnet model skal starte forfra.
  const [noegle, setNoegle] = useState(0)

  const state = useRef({ meta, blocks, fil, aendret })
  state.current = { meta, blocks, fil, aendret }

  const vis = (tekst, fejl = false) => {
    setBesked({ tekst, fejl })
    if (!fejl) setTimeout(() => setBesked(b => (b?.tekst === tekst ? null : b)), 3000)
  }

  const onMeta = (k, v) => { setMeta(m => ({ ...m, [k]: v })); setAendret(true) }

  const forkastOk = () =>
    !state.current.aendret || window.confirm('Modellen er ændret og ikke gemt. Fortsæt alligevel?')

  const forslag = () => {
    const { meta, fil } = state.current
    if (fil.navn) return fil.navn.replace(/\.[^.]+$/, '')
    return [meta.project_ref, meta.project_name].filter(Boolean).join(' ') || 'Rammeberegning'
  }

  const ny = () => {
    if (!forkastOk()) return
    setMeta(TOM_META); setBlocks(nyeBlokke()); setFil({ handle: null, navn: null })
    setAendret(false); setNoegle(k => k + 1)
  }

  const aabnFil = async () => {
    if (!forkastOk()) return
    try {
      const r = await aabn()
      if (!r) return
      setMeta({ ...TOM_META, ...r.model.metadata }); setBlocks(r.model.blocks)
      setFil({ handle: r.handle, navn: r.navn }); setAendret(false); setNoegle(k => k + 1)
      vis(`Åbnede ${r.navn}`)
    } catch (e) {
      vis(e.message, true)
    }
  }

  const gemFil = async (som = false) => {
    const { meta, blocks, fil } = state.current
    try {
      const r = await gem(lavModel(meta, blocks), som ? null : fil.handle, forslag())
      if (!r) return
      setFil(r); setAendret(false)
      vis(`Gemt som ${r.navn}`)
    } catch (e) {
      vis(`Kunne ikke gemme: ${e.message}`, true)
    }
  }

  const lavPdf = async () => {
    const { meta, blocks } = state.current
    setTravl(true)
    try {
      const blob = await desktopPdf(meta, blocks)
      const sti = await gemPdf(blob, forslag())
      if (sti) vis(`PDF gemt: ${String(sti).split(/[\\/]/).pop()}`)
    } catch (e) {
      vis(`PDF'en kunne ikke laves: ${e.message}`, true)
    } finally {
      setTravl(false)
    }
  }

  // Ctrl+S / Ctrl+Shift+S / Ctrl+O / Ctrl+N og advarsel ved lukning.
  useEffect(() => {
    const tast = e => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 's') { e.preventDefault(); gemFil(e.shiftKey) }
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
      if (window.confirm('Modellen er ændret og ikke gemt. Luk alligevel?')) await w.destroy()
    }).then(f => { fjern = f })
    return () => { if (fjern) fjern() }
  }, [])

  useEffect(() => {
    document.title = `${aendret ? '• ' : ''}${fil.navn ?? 'Ny model'} — Omkreds FEM`
  }, [fil.navn, aendret])

  // En fil uden rammeberegning (fx et dokument fra omkreds.dk) får en.
  const idx = femIndeks(blocks)
  const blok = blocks[idx]?.type === 'general_frame_fem' ? blocks[idx] : null
  useEffect(() => {
    if (!blok) setBlocks(b => [...b, ...nyeBlokke()])
  }, [blok])
  const onBlok = useCallback(nb => {
    setBlocks(bs => {
      const i = femIndeks(bs)
      // Samme stempel som BlockList.stampBlock: et nyt resultat får hashen af
      // de inddata, det er regnet af, og beregningens revision. Uden det står
      // modellen som "ændret — regn igen" lige efter beregningen.
      const gl = bs[i]?.data ?? {}
      const d = nb.data ?? {}
      const nyt = (d._result && d._result !== gl._result) || (d._summary && d._summary !== gl._summary)
      const b = nyt ? { ...nb, data: { ...d, _input_hash: hashCalcInputs(d), _calc_rev: calcRevision(nb.type) } } : nb
      return bs.map((x, j) => (j === i ? b : x))
    })
    setAendret(true)
  }, [])

  const knapper = (
    <div style={s.knapper}>
      <span style={s.brand}>Omkreds FEM</span>
      <Button size="sm" onClick={ny} title="Ny model (Ctrl+Alt+N)">Ny</Button>
      <Button size="sm" onClick={aabnFil} title="Åbn (Ctrl+O)">Åbn…</Button>
      <Button size="sm" onClick={() => gemFil(false)} title="Gem (Ctrl+S)">Gem</Button>
      <Button size="sm" onClick={() => gemFil(true)} title="Gem som (Ctrl+Shift+S)">Gem som…</Button>
      <Button size="sm" onClick={() => setVisSag(v => !v)}>Sag…</Button>
      <Button size="sm" onClick={lavPdf} disabled={travl}>{travl ? 'Laver PDF…' : 'PDF'}</Button>
      <span style={s.fil} title={fil.navn ?? 'Ny model'}>{fil.navn ?? 'Ny model'}{aendret ? ' •' : ''}</span>
      <span style={s.skille} />
    </div>
  )

  return (
    <>
      {blok && (
        <GeneralFrameFemBlock key={noegle} block={blok} onChange={onBlok} blocks={blocks}
          standalone={{ actions: knapper }} />
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
    </>
  )
}

const s = {
  knapper: { display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 },
  brand: { fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', marginRight: 4 },
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
