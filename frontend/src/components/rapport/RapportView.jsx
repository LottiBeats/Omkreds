/**
 * RapportView.jsx — Rapport-visningen i skrivebordsprogrammet.
 *
 * En side, man skriver direkte på, som i Word: overskrifter, tekstafsnit med
 * simpel formatering (fed, kursiv, lister) og egne beregninger, der regner,
 * mens man skriver. Rammeberegningen fra FEM-visningen står som et kort i
 * rapporten; den kan flyttes og vælges fra, men redigeres i FEM.
 *
 * Mellem blokkene og nederst kan man sætte nyt ind. Til venstre for hver blok
 * er der, når man peger på den, knapper til at flytte og slette.
 *
 * Blokkene er de samme komponenter som på omkreds.dk (TextBlock,
 * HeadingBlock, CustomCalcEditor), så PDF'en tegner dem ens.
 */
import React, { useMemo, useRef, useState } from 'react'
import HeadingBlock from '../blocks/HeadingBlock.jsx'
import TextBlock from '../blocks/TextBlock.jsx'
import CustomCalcBlock from '../blocks/CustomCalcBlock.jsx'
import { overskriftsnumre } from '../../lib/indhold.js'
import { hasCalcResult, isStaleResult } from '../../lib/calcState.js'
import { RAPPORT_TYPER, nyBlok, indsaet, flyt, fjern, erFem, femHarModel, femIRapport } from '../../lib/rapport.js'
import './rapport.css'

function IndsaetLinje({ onVaelg, altid = false }) {
  return (
    <div className={'rp-ins' + (altid ? ' rp-ins-altid' : '')}>
      <span className="rp-ins-streg" />
      {RAPPORT_TYPER.map(t => (
        <button key={t.type} type="button" className="rp-ins-btn" onClick={() => onVaelg(t.type)}>
          + {t.label}
        </button>
      ))}
      <span className="rp-ins-streg" />
    </div>
  )
}

function FemKort({ blok, onVisFem, onSkift }) {
  // Side om side står modellen allerede til venstre; så ingen knap.
  const d = blok.data ?? {}
  const harModel = femHarModel(blok)
  const status = !harModel ? 'Ingen model endnu'
    : !hasCalcResult(blok) ? 'Ikke regnet'
    : isStaleResult(blok) ? 'Ændret siden sidste beregning — regn igen'
    : 'Regnet'
  const ok = harModel && hasCalcResult(blok) && !isStaleResult(blok)
  return (
    <div className={'rp-fem' + (femIRapport(blok) ? '' : ' rp-fem-fra')}>
      <div className="rp-fem-top">
        <span className="rp-fem-ikon">FEM</span>
        <div className="rp-fem-txt">
          <div className="rp-fem-titel">{d.title || 'Rammeberegning'}</div>
          <div className="rp-fem-info">
            {harModel ? `${d.nodes?.length ?? 0} knuder · ${d.elements?.length ?? 0} stænger · ` : ''}
            <span className={ok ? 'rp-ok' : 'rp-adv'}>{status}</span>
          </div>
        </div>
        {onVisFem && <button type="button" className="rp-knap" onClick={onVisFem}>Åbn i FEM</button>}
      </div>
      {harModel && (
        <label className="rp-fem-med">
          <input type="checkbox" checked={blok.iRapport !== false} onChange={e => onSkift(e.target.checked)} />
          Med i rapporten (modellen, snitkræfter og eftervisninger kommer med i PDF'en her)
        </label>
      )}
    </div>
  )
}

export default function RapportView({ blocks, onChange, onVisFem, smal = false }) {
  const [valgt, setValgt] = useState(null)
  const numre = useMemo(() => overskriftsnumre(blocks), [blocks])
  const refs = useRef({})

  // Den nye blok får fokus, så man kan skrive med det samme.
  const fokus = (id) => {
    let n = 0
    const proev = () => {
      const el = refs.current[id]?.querySelector('input, textarea, [contenteditable="true"]')
      if (el) { el.focus(); el.scrollIntoView?.({ block: 'nearest' }) }
      else if (n++ < 20) requestAnimationFrame(proev)
    }
    requestAnimationFrame(proev)
  }

  const saetInd = (i, type) => {
    const b = nyBlok(type)
    onChange(indsaet(blocks, i, b), true)
    setValgt(b.id)
    fokus(b.id)
  }
  const opdater = (nb) => onChange(blocks.map(b => (b.id === nb.id ? nb : b)), false)
  const tom = !blocks.some(b => !erFem(b))

  return (
    <div className={'rp' + (smal ? ' rp-smal' : '')}>
      <div className="rp-side">
        {tom && (
          <div className="rp-tom">
            <div className="rp-tom-titel">Rapporten er tom</div>
            <p>Skriv rapporten her: overskrifter, tekst og egne beregninger, der regner, mens du skriver.
               Rammeberegningen fra FEM kommer med i PDF'en, hvor kortet står.</p>
            <button type="button" className="rp-knap rp-knap-primaer" onClick={() => {
              const h = { ...nyBlok('heading'), data: { level: 1, text: 'Forudsætninger' } }
              const t = nyBlok('text')
              onChange([h, t, ...blocks], true)
              setValgt(t.id); fokus(t.id)
            }}>Start med en overskrift og tekst</button>
          </div>
        )}

        {blocks.map((b, i) => (
          <React.Fragment key={b.id}>
            {i > 0 && <IndsaetLinje onVaelg={(t) => saetInd(i, t)} />}
            <div ref={el => { refs.current[b.id] = el }}
                 className={'rp-blok rp-' + b.type + (valgt === b.id ? ' rp-valgt' : '')}
                 onFocusCapture={() => setValgt(b.id)}
                 onMouseDown={() => setValgt(b.id)}>
              <div className="rp-greb" aria-label="Flyt eller slet">
                <button type="button" title="Flyt op" disabled={i === 0}
                        onClick={() => onChange(flyt(blocks, i, -1), true)}>↑</button>
                <button type="button" title="Flyt ned" disabled={i === blocks.length - 1}
                        onClick={() => onChange(flyt(blocks, i, 1), true)}>↓</button>
                {!erFem(b) && (
                  <button type="button" title="Slet" className="rp-slet"
                          onClick={() => onChange(fjern(blocks, i), true)}>✕</button>
                )}
              </div>
              {b.type === 'heading' && (
                <HeadingBlock block={b} onChange={opdater} isSelected={valgt === b.id}
                              headNo={numre.get(b.id)} onEnter={() => saetInd(i + 1, 'text')} />
              )}
              {b.type === 'text' && <TextBlock block={b} onChange={opdater} />}
              {b.type === 'custom_calc' && <CustomCalcBlock block={b} onChange={opdater} />}
              {erFem(b) && (
                <FemKort blok={b} onVisFem={onVisFem}
                         onSkift={(med) => onChange(blocks.map(x => (x.id === b.id ? { ...x, iRapport: med } : x)), true)} />
              )}
              {!['heading', 'text', 'custom_calc'].includes(b.type) && !erFem(b) && (
                <div className="rp-anden">Blok fra omkreds.dk ({b.type}) — kommer med i PDF'en, redigeres på omkreds.dk.</div>
              )}
            </div>
          </React.Fragment>
        ))}

        <IndsaetLinje altid onVaelg={(t) => saetInd(blocks.length, t)} />
      </div>
    </div>
  )
}
