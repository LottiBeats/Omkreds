/**
 * RapportModuler.jsx — Egenvægt og Sne i Rapport-visningen.
 *
 * Små beregninger, der regner, mens man skriver. Hver ændring gemmer også
 * rapportrækkerne (data._result), så PDF'en altid viser det, der står på
 * skærmen. Regningen ligger i lib/rapportModuler.js.
 */
import React from 'react'
import {
  MATERIALER, SK_DK, dk, tal, lagLast, egenvaegt, egenvaegtRapport, sne, sneRapport,
} from '../../lib/rapportModuler.js'

function gem(block, onChange, data, rapport) {
  onChange({ ...block, data: { ...data, _result: rapport(data) } })
}

export function EgenvaegtModul({ block, onChange }) {
  const d = block.data
  const r = egenvaegt(d)
  const saet = (patch) => gem(block, onChange, { ...d, ...patch }, egenvaegtRapport)
  const saetLag = (i, patch) => {
    const lag = d.lag.map((l, j) => {
      if (j !== i) return l
      const nyt = { ...l, ...patch }
      // Et kendt materiale udfylder rumvægten, når navnet vælges fra listen.
      if ('navn' in patch) {
        const m = MATERIALER.find(x => x.navn === patch.navn)
        if (m) nyt.rho = dk(m.rho, 1)
      }
      return nyt
    })
    saet({ lag })
  }
  const listeId = `mat-${block.id}`

  return (
    <div className="rm">
      <div className="rm-top">
        <span className="rm-ikon rm-ikon-g">G</span>
        <input className="rm-titel" value={d.title ?? ''} placeholder="Egenvægt"
               onChange={e => saet({ title: e.target.value })} aria-label="Titel" />
      </div>
      <datalist id={listeId}>
        {MATERIALER.map(m => <option key={m.navn} value={m.navn}>{dk(m.rho, 1)} kN/m³</option>)}
      </datalist>
      <table className="rm-tabel">
        <thead>
          <tr><th>Lag</th><th className="num">t [mm]</th><th className="num">γ [kN/m³]</th><th className="num">g [kN/m²]</th><th /></tr>
        </thead>
        <tbody>
          {d.lag.map((l, i) => (
            <tr key={i}>
              <td><input list={listeId} value={l.navn} placeholder="Materiale"
                         onChange={e => saetLag(i, { navn: e.target.value })} /></td>
              <td><input className="num" value={l.t_mm} inputMode="decimal"
                         onChange={e => saetLag(i, { t_mm: e.target.value })} /></td>
              <td><input className="num" value={l.rho} inputMode="decimal"
                         onChange={e => saetLag(i, { rho: e.target.value })} /></td>
              <td className="num rm-res">{dk(lagLast(l), 3)}</td>
              <td><button type="button" className="rm-x" title="Fjern laget"
                          onClick={() => saet({ lag: d.lag.filter((_, j) => j !== i) })}>✕</button></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td><button type="button" className="rm-plus"
                        onClick={() => saet({ lag: [...d.lag, { navn: '', t_mm: '', rho: '' }] })}>+ Lag</button></td>
            <td colSpan={2} className="num rm-sumtxt">g<sub>k</sub> = Σ t · γ</td>
            <td className="num rm-sum">{dk(r.sum, 2)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {r.mangler > 0 && <div className="rm-adv">{r.mangler} lag mangler tykkelse eller rumvægt og er ikke regnet med.</div>}
    </div>
  )
}

const CE = [
  { v: '0,8', l: '0,8 — vindblæst' },
  { v: '1,0', l: '1,0 — normal' },
  { v: '1,2', l: '1,2 — i læ' },
]

export function SneModul({ block, onChange }) {
  const d = block.data
  const r = sne(d)
  const saet = (patch) => gem(block, onChange, { ...d, ...patch }, sneRapport)
  const ceKendt = CE.some(c => tal(c.v) === tal(d.ce))

  return (
    <div className="rm">
      <div className="rm-top">
        <span className="rm-ikon rm-ikon-s">S</span>
        <input className="rm-titel" value={d.title ?? ''} placeholder="Snelast"
               onChange={e => saet({ title: e.target.value })} aria-label="Titel" />
      </div>
      <div className="rm-felter">
        <label><span>Taghældning α [°]</span>
          <input className="num" value={d.alfa} inputMode="decimal" onChange={e => saet({ alfa: e.target.value })} />
        </label>
        <label><span>C<sub>e</sub></span>
          <select value={ceKendt ? CE.find(c => tal(c.v) === tal(d.ce)).v : d.ce}
                  onChange={e => saet({ ce: e.target.value })}>
            {CE.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
            {!ceKendt && <option value={d.ce}>{d.ce}</option>}
          </select>
        </label>
        <label><span>C<sub>t</sub></span>
          <input className="num" value={d.ct} inputMode="decimal" onChange={e => saet({ ct: e.target.value })} />
        </label>
        <label><span>s<sub>k</sub> [kN/m²]</span>
          <input className="num" value={dk(SK_DK, 1)} readOnly title="DS/EN 1991-1-3 DK NA" />
        </label>
      </div>
      <div className="rm-linje">
        μ<sub>1</sub> = <b>{dk(r.mu1, 2)}</b>
        <span className="rm-sep">·</span>
        s = μ<sub>1</sub> · C<sub>e</sub> · C<sub>t</sub> · s<sub>k</sub> = {dk(r.mu1, 2)} · {dk(r.ce, 1)} · {dk(r.ct, 1)} · {dk(SK_DK, 1)} =
        <b className="rm-sum"> {dk(r.s, 2)} kN/m²</b>
      </div>
      {!Number.isFinite(r.s) && <div className="rm-adv">Taghældning, C<sub>e</sub> eller C<sub>t</sub> mangler.</div>}
    </div>
  )
}
