/**
 * SidePapir.jsx — sidevisning: dokumentet på et A4-ark, som i PDF'en.
 *
 * Målene er PDF'ens (backend/holst_layout.py) i rigtige millimeter:
 *
 *   ┌ 10 mm ┬──────────────── sidehoved 22 mm ───────────────┬ 10 mm ┐  8 mm fra toppen
 *   │       │ logo │ Sag                        │ Sagsnr      │       │
 *   │       │      │ Afsnit                     │ Side        │       │
 *   │       │      │ Beregnet af │ Dato │ Kontrolleret af │ … │       │
 *   │       ├───────────────────────────────────────────────┤       │  3 mm luft
 *   │       │  tekstboks med 4 mm luft: dokumentets blokke  │       │
 *   │       └───────────────────────────────────────────────┘       │
 *   │       ─────────────── sidefod: firmaets oplysninger ─────────  │  11 mm fra bunden
 *
 * Dokumentet flyder i én lang tekstboks; hvor en side i PDF'en ville slutte
 * (hver 244 mm indhold), står en stiplet linje med sidetallet. Skrift og
 * linjeafstand er skærmens, så sideskiftene er omtrentlige -- PDF'en er facit.
 */
import React, { useEffect, useRef, useState } from 'react'
import './SidePapir.css'

// Indholdets højde pr. side: 297 − 8 (top) − 22 (hoved) − 3 (luft) − 12 (fod) − 2·4 (luft i boksen).
export const INDHOLD_MM = 244

function Felt({ label, children, className = '' }) {
  return (
    <div className={'sp-felt ' + className}>
      <span className="sp-lbl">{label}</span>
      <span className="sp-val">{children}</span>
    </div>
  )
}

export default function SidePapir({ metadata = {}, docId, afsnit, revision = {}, children }) {
  const indhold = useRef(null)
  const mmRef = useRef(null)
  const [sider, setSider] = useState(1)

  // Hvor mange sider fylder indholdet? Måles mod en lineal på 100 mm i samme
  // koordinater, så zoom (båndets eller browserens) ikke flytter sideskiftene.
  useEffect(() => {
    const el = indhold.current
    if (!el) return
    const maal = () => {
      const px = mmRef.current?.getBoundingClientRect().width / 100 || 96 / 25.4
      setSider(Math.max(1, Math.ceil(el.getBoundingClientRect().height / (INDHOLD_MM * px) - 0.02)))
    }
    maal()
    const ro = new ResizeObserver(maal)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const m = metadata
  const dato = revision.date || m.date || ''
  const fod = [m.firm_name, m.firm_address, m.phone, m.email, m.cvr && `CVR ${m.cvr}`].filter(Boolean)

  return (
    <div className="sp-papir">
      <div ref={mmRef} className="sp-mmlineal" aria-hidden="true" />
      <header className="sp-hoved" aria-label="Sidehoved">
        <div className="sp-logo">
          {m.logo_b64 ? <img src={m.logo_b64} alt="" /> : <span>{m.firm_name}</span>}
        </div>
        <div className="sp-info">
          <div className="sp-raekke">
            <Felt label="Sag" className="sp-sag">{m.project_name}</Felt>
            <Felt label="Sagsnr" className="sp-smal">{m.project_ref}</Felt>
          </div>
          <div className="sp-raekke">
            <Felt label="Afsnit" className="sp-sag">{[docId, afsnit].filter(Boolean).join('  –  ')}</Felt>
            <Felt label="Side" className="sp-smal">1 af {sider}</Felt>
          </div>
          <div className="sp-raekke sp-seks">
            <Felt label="Beregnet af">{m.engineer}</Felt>
            <Felt label="Dato">{dato}</Felt>
            <Felt label="Kontrolleret af">{m.checker}</Felt>
            <Felt label="Dato">{dato}</Felt>
            <Felt label="Godkendt af">{m.approver || m.checker}</Felt>
            <Felt label="Dato">{dato}</Felt>
          </div>
        </div>
      </header>

      <div className="sp-boks">
        <div ref={indhold} className="sp-indhold">
          {children}
          {Array.from({ length: sider - 1 }, (_, i) => (
            <div key={i} className="sp-skift" style={{ top: `${(i + 1) * INDHOLD_MM}mm` }} aria-hidden="true">
              <span>Side {i + 2}</span>
            </div>
          ))}
        </div>
      </div>

      <footer className="sp-fod">{fod.join('  ·  ')}</footer>
    </div>
  )
}
