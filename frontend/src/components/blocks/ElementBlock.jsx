/**
 * ElementBlock.jsx — et konstruktionselement i A2.2: B.1, S.1, SA.2 …
 *
 * Overskriften for elementet i dokumentet. Beregningerne under den hører til
 * elementet; se lib/elementer.js. I rapporten bliver den til en overskrift
 * "B.1  Bjælke over dør" og en linje om art og materiale.
 */
import React from 'react'
import { ARTER, MATERIALER, artLabel, materialeLabel } from '../../lib/elementer.js'
import './Elementer.css'

/** Sådan står elementet på siden -- det samme, som kommer i rapporten. */
export function ElementPreview({ data }) {
  const d = data ?? {}
  const k = d.kilde
  const stang = k ? (k.member_id != null ? `stang ${k.member_id} i rammen` : `element ${k.elem_id} i rammen`) : null
  const meta = [artLabel(d.art), materialeLabel(d.materiale), stang].filter(Boolean).join(' · ')
  return (
    <div className={`elb elb-${d.level ?? 2}`}>
      <div className="elb-head">
        <span className="elb-nr">{d.nr || '—'}</span>
        <span className={'elb-navn' + (d.navn ? '' : ' is-tom')}>{d.navn || 'Unavngivet element'}</span>
      </div>
      <div className="elb-meta">{meta}{d.beskrivelse ? ` — ${d.beskrivelse}` : ''}</div>
    </div>
  )
}

export default function ElementBlock({ block, onChange }) {
  const d = block.data
  const set = (patch) => onChange({ ...block, data: { ...d, ...patch } })

  return (
    <div className="elb-form">
      <label className="elb-f elb-f--nr">
        <span>Nr.</span>
        <input value={d.nr ?? ''} onChange={e => set({ nr: e.target.value })}
               spellCheck={false} title="Står på tegningerne og i kontrolplanen. Ændres kun, hvis det er nødvendigt." />
      </label>
      <label className="elb-f elb-f--navn">
        <span>Navn</span>
        <input value={d.navn ?? ''} onChange={e => set({ navn: e.target.value })} placeholder="fx Bjælke over dør i køkken" />
      </label>
      <label className="elb-f">
        <span>Art</span>
        <select value={d.art ?? 'andet'} onChange={e => set({ art: e.target.value })}>
          {ARTER.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
      </label>
      <label className="elb-f">
        <span>Materiale</span>
        <select value={d.materiale ?? ''} onChange={e => set({ materiale: e.target.value })}>
          {MATERIALER.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </label>
      <label className="elb-f elb-f--fuld">
        <span>Placering og funktion</span>
        <input value={d.beskrivelse ?? ''} onChange={e => set({ beskrivelse: e.target.value })}
               placeholder="fx Bærer etagedæk over ny åbning, vederlag på murværk" />
      </label>
    </div>
  )
}
