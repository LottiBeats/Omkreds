/**
 * AfsnitHjaelper — panelet i højre side, der hjælper med at skrive ét afsnit.
 *
 *   Hjælp · 4.5 Robusthed                                   ×
 *   Fra projektbeskrivelsen   CC2 · 2 etager · træ
 *   Tekster                   ◉ CC2 — vurdering …   Anbefalet
 *                             ○ Simpel konstruktion …
 *   Spørgsmål                 Er der nøgleelementer? (Nej) (Ja)   ← til den valgte tekst
 *   Sådan bliver teksten      [forhåndsvisning]
 *   [Erstat afsnittet]  [Indsæt under]
 *
 * Det, projektbeskrivelsen ved (CC, etager, materialer), rettes ikke her:
 * A1, B1 og B2 bygger på den samme beskrivelse og skal sige det samme.
 * Panelet ændrer intet, før man trykker på en af knapperne.
 */
import React, { useMemo, useState } from 'react'
import { Button, StatusPill } from '../../ui/index.js'
import { kontekst, varianterFor, fingeraftryk } from '../../templates/a1Afsnit/index.js'
import './editor.css'

function Forhaandsvisning({ blokke }) {
  return (
    <div className="ah-preview">
      {blokke.map((b, i) => b.type === 'table' ? (
        <div key={i} className="ah-preview-tbl">
          <em>{b.data.caption}</em>
          <table><tbody>
            {b.data.rows.map((r, j) => <tr key={j}>{r.map((c, k) => j === 0 ? <th key={k}>{c}</th> : <td key={k}>{c}</td>)}</tr>)}
          </tbody></table>
        </div>
      ) : (
        <p key={i}>{b.data.text}</p>
      ))}
    </div>
  )
}

export default function AfsnitHjaelper({ afsnit, overskrift, nr, nuvaerende, harUnderafsnit, options, gemt, travl, onIndsaet, onLuk }) {
  const [svar, setSvar] = useState(() => ({ ...afsnit.standardSvar(kontekst(options)), ...(gemt?.svar ?? {}) }))
  const ktx = useMemo(() => kontekst(svar.cc ? { ...(options ?? {}), ccValgt: Number(svar.cc) } : options), [options, svar.cc])
  const varianter = useMemo(() => varianterFor(afsnit, ktx), [afsnit, ktx])
  const [valgt, setValgt] = useState(() => gemt?.variant ?? varianter[0].key)
  const variant = varianter.find(v => v.key === valgt) ?? varianter[0]
  const synligeSpoergsmaal = afsnit.spoergsmaal.filter(q => !q.hvis || q.hvis(svar, ktx, variant.key))
  const blokke = useMemo(() => variant.skriv(ktx, svar), [variant, ktx, svar])

  const rettet = gemt && gemt.fingeraftryk !== fingeraftryk(nuvaerende)
  const tomt = nuvaerende.length === 0
  const saet = (k, v) => setSvar(s => ({ ...s, [k]: v }))

  const materialer = Object.entries(ktx.materialer).filter(([, v]) => v).map(([k]) => k)
    .map(k => ({ beton: 'beton', staal: 'stål', murvaerk: 'murværk', trae: 'træ' }[k])).join(', ')

  return (
    <aside className="ah" aria-label={`Hjælp til ${afsnit.titel}`}>
      <header className="ah-head">
        <div>
          <div className="ed-eyebrow">Hjælp til afsnittet</div>
          <h2>{nr ? `${nr} ` : ''}{overskrift}</h2>
        </div>
        <button className="ah-luk" onClick={onLuk} aria-label="Luk hjælpen">×</button>
      </header>

      <section className="ah-sek">
        <h3>Fra projektbeskrivelsen</h3>
        {ktx.kendt ? (
          <p className="ah-fakta">
            CC{ktx.cc} · {ktx.etager} etage{ktx.etager === 1 ? '' : 'r'}{materialer ? ` · ${materialer}` : ''}
            {ktx.simpel ? ' · simpel konstruktion' : ''} · {ktx.konstruktionstype}
          </p>
        ) : (
          <label className="ah-felt">
            <span>Projektet har ingen beskrivelse endnu. Konsekvensklasse:</span>
            <select value={svar.cc ?? ''} onChange={e => saet('cc', e.target.value || undefined)}>
              <option value="">Vælg …</option>
              <option value="1">CC1</option><option value="2">CC2</option><option value="3">CC3</option>
            </select>
          </label>
        )}
      </section>

      <section className="ah-sek">
        <h3>Tekster</h3>
        <div className="ah-varianter" role="radiogroup">
          {varianter.map(v => (
            <button key={v.key} type="button" role="radio" aria-checked={v.key === variant.key}
                    className={'ah-variant' + (v.key === variant.key ? ' on' : '')} onClick={() => setValgt(v.key)}>
              <span className="ah-dot" aria-hidden="true" />
              <span>{v.titel}</span>
              {v.anbefalet && <StatusPill tone="ok">Anbefalet</StatusPill>}
            </button>
          ))}
        </div>
      </section>

      {synligeSpoergsmaal.length > 0 && (
        <section className="ah-sek">
          <h3>Spørgsmål</h3>
          {synligeSpoergsmaal.map(q => (
            <label key={q.key} className="ah-felt">
              <span>{q.label}</span>
              {q.type === 'tekst' ? (
                <input type="text" value={svar[q.key] ?? ''} placeholder={q.pladsholder}
                       onChange={e => saet(q.key, e.target.value)} />
              ) : q.valg.length <= 2 ? (
                <span className="ah-seg" role="radiogroup">
                  {q.valg.map(v => (
                    <button key={v.key} type="button" role="radio" aria-checked={svar[q.key] === v.key}
                            className={svar[q.key] === v.key ? 'on' : ''} onClick={() => saet(q.key, v.key)}>{v.label}</button>
                  ))}
                </span>
              ) : (
                <select value={svar[q.key]} onChange={e => saet(q.key, e.target.value)}>
                  {q.valg.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                </select>
              )}
            </label>
          ))}
        </section>
      )}

      <section className="ah-sek">
        <h3>Sådan bliver teksten</h3>
        <Forhaandsvisning blokke={blokke} />
      </section>

      {rettet && (
        <p className="ah-advarsel">
          Du har rettet i afsnittet, siden hjælperen skrev det. "Erstat" overskriver dine rettelser
          (der gemmes en version først).
        </p>
      )}
      {harUnderafsnit && (
        <p className="ah-advarsel">Afsnittet har underafsnit, så teksten kan kun indsættes under det.</p>
      )}

      <footer className="ah-knapper">
        <Button variant="primary" disabled={harUnderafsnit} busy={travl}
                onClick={() => onIndsaet('erstat', blokke, svar, variant.key)}>
          {tomt ? 'Indsæt i afsnittet' : 'Erstat afsnittet'}
        </Button>
        {!tomt && (
          <Button variant="ghost" disabled={travl} onClick={() => onIndsaet('under', blokke, svar, variant.key)}>Indsæt under</Button>
        )}
      </footer>
    </aside>
  )
}
