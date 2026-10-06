/**
 * ElementPanel.jsx — listen over konstruktionselementer øverst i A2.
 *
 * Det er A2.2 set som en liste: nummer, navn, beregning og status for hvert
 * element. Et klik går til elementet i dokumentet; "Tilføj element" sætter
 * overskriften og den rigtige beregning ind efter det sidste element.
 *
 * Panelet er ikke en del af rapporten. Det viser bloklisten fra en anden
 * vinkel og ændrer den kun gennem de samme handlinger som resten af editoren.
 */
import React, { useMemo, useState } from 'react'
import Button from '../../ui/Button.jsx'
import StatusPill from '../../ui/StatusPill.jsx'
import { ARTER, MATERIALER, elementerI } from '../../lib/elementer.js'
import './Elementer.css'

const komma = (x) => x.toFixed(2).replace('.', ',')

export default function ElementPanel({ blocks, typeLabel, onAdd, onGo }) {
  const elementer = useMemo(() => elementerI(blocks), [blocks])
  const [ny, setNy] = useState(null)   // { art, materiale, navn } mens der tilføjes

  const etaMaks = elementer.reduce((m, e) => (e.status.eta !== null && e.status.eta > m ? e.status.eta : m), -1)
  const ikkeOk = elementer.filter(e => e.status.tone === 'fail').length
  const venter = elementer.filter(e => e.status.tone === 'warn').length

  function tilfoej(e) {
    e.preventDefault()
    onAdd(ny)
    setNy(null)
  }

  return (
    <section className="elp" aria-label="Konstruktionselementer">
      <header className="elp-head">
        <span className="elp-titel">Konstruktionselementer</span>
        {elementer.length > 0 && (
          <span className="elp-sum">
            {elementer.length} element{elementer.length === 1 ? '' : 'er'}
            {etaMaks >= 0 && <> · η maks {komma(etaMaks)}</>}
            {ikkeOk > 0 && <> · <b className="is-fail">{ikkeOk} ikke OK</b></>}
            {venter > 0 && <> · <b className="is-warn">{venter} skal regnes</b></>}
          </span>
        )}
      </header>

      {elementer.length === 0 && !ny && (
        <p className="elp-tom">
          Hver bjælke, søjle eller samling, der eftervises for sig, er et element. De bliver
          til afsnittene i A2.2 med nummer, så de kan findes på tegningerne.
        </p>
      )}

      {elementer.length > 0 && (
        <ol className="elp-liste">
          {elementer.map(({ block, beregninger, status }) => (
            <li key={block.id}>
              <button type="button" className="elp-rk" onClick={() => onGo(block.id)}>
                <span className="elp-nr">{block.data?.nr || '—'}</span>
                <span className="elp-navn">{block.data?.navn || 'Unavngivet element'}</span>
                <span className="elp-beregning">
                  {beregninger.length === 0 ? '—'
                    : beregninger.length === 1 ? typeLabel(beregninger[0].type)
                    : `${beregninger.length} beregninger`}
                </span>
                <span className="elp-eta">{status.eta !== null ? komma(status.eta) : ''}</span>
                <StatusPill tone={status.tone}>{status.tekst}</StatusPill>
              </button>
            </li>
          ))}
        </ol>
      )}

      {ny ? (
        <form className="elp-ny" onSubmit={tilfoej}>
          <select value={ny.art} onChange={e => setNy({ ...ny, art: e.target.value })} aria-label="Art">
            {ARTER.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
          <select value={ny.materiale} onChange={e => setNy({ ...ny, materiale: e.target.value })} aria-label="Materiale">
            {MATERIALER.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <input autoFocus value={ny.navn} onChange={e => setNy({ ...ny, navn: e.target.value })}
                 placeholder="Navn, fx Bjælke over dør" aria-label="Navn" />
          <Button type="submit" variant="primary" size="sm">Tilføj</Button>
          <Button variant="ghost" size="sm" onClick={() => setNy(null)}>Annullér</Button>
        </form>
      ) : (
        <div className="elp-fod">
          <Button size="sm" onClick={() => setNy({ art: 'bjaelke', materiale: 'trae', navn: '' })}>+ Tilføj element</Button>
        </div>
      )}
    </section>
  )
}
