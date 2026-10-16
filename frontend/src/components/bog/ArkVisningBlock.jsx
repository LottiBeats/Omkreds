/**
 * ArkVisningBlock.jsx — et ark (eller et område af det) fra projektets
 * regnearksbog, vist i rapporten. Tallene er levende: retter man i bogen,
 * følger visningen med. Dobbeltklik på tabellen åbner bogen på arket.
 *
 * data: { ark: arkets id, omraade: "A1:D34" (tom = hele arket), titel }
 */
import React from 'react'
import { useBog } from './BogKontekst.js'
import { udsnit, gyldigtOmraade, laesOmraade } from '../../lib/regnearksbog.js'
import { adresse, laesTal } from '../../lib/regneark.js'
import { fmtStil } from '../../lib/regnearkFormat.js'
import '../blocks/Regneark.css'

const FEJL = /^#(DIV\/0!|REF!|NAVN\?|VÆRDI!|CYKLUS!|TAL!|I\/T)$/

/** Er den tomme celle k dækket af tekst, der løber ud fra en celle til venstre? */
function daekket(r, k, art) {
  for (let j = k - 1; j >= 0; j--) {
    const c = String(r[j]).trim()
    if (c) return laesTal(c) === null && art[j] !== 'i'
  }
  return false
}

export function ArkTabel({ ark, omraade, titel, onAabn }) {
  const u = udsnit(ark, omraade)
  if (!u || !u.raekker.length) return <div className="av-tom">Arket er tomt.</div>
  const total = u.bredder.reduce((a, b) => a + b, 0)
  // Mange kolonner (fx lastnedføringen) må gerne rulle; ellers fylder tabellen siden.
  const bred = u.bredder.length > 14
  return (
    <div>
      {(titel || ark.titel) && <div className="av-caption">{titel || ark.titel}</div>}
      <div className="av-rul">
      <table lang="da" className={'av-tabel' + (bred ? ' av-bred' : '')} style={bred ? { minWidth: Math.round(total * 0.8) } : undefined}
             onDoubleClick={onAabn} title={onAabn ? 'Dobbeltklik for at åbne arket' : undefined}>
        <colgroup>{u.bredder.map((b, i) => <col key={i} style={{ width: `${(100 * b / total).toFixed(2)}%` }} />)}</colgroup>
        <tbody>
          {u.raekker.map((r, i) => (u.typer[i] === 'tom' && (i === 0 || u.typer[i - 1] === 'tom')) ? null : (
            <tr key={i} className={u.typer[i] ? `av-${u.typer[i]}` : ''}>
              {r.map((c, k) => {
                const tal = laesTal(c) !== null
                // Tekst løber ud over tomme celler til højre, som i Excel.
                if (k > 0 && !String(c).trim() && daekket(r, k, u.art[i])) return null
                let span = 1
                if (String(c).trim() && !tal && u.art[i][k] !== 'i') while (k + span < r.length && !String(r[k + span]).trim()) span++
                return (
                  <td key={k} colSpan={span > 1 ? span : undefined} style={fmtStil(u.fmt[i][k])} className={[
                    tal ? 'av-tal' : '', FEJL.test(c) ? 'av-fejl' : '', u.fed[i][k] ? 'av-fed' : '',
                    u.art[i][k] === 'i' && tal && u.typer[i] !== 'hoved' ? 'av-input' : '',
                  ].join(' ')}>{c}</td>
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

export default function ArkVisningBlock({ block, onChange }) {
  const { bog, aabn, nytArk } = useBog()
  const d = block.data ?? {}
  const ark = bog.ark.find(a => a.id === d.ark) ?? null
  const set = (p) => onChange({ ...block, data: { ...d, ...p } })
  const ok = gyldigtOmraade(d.omraade)
  const start = () => {
    const o = laesOmraade(d.omraade)
    return o ? adresse(o.r0, o.k0) : null
  }

  return (
    <div className="av" onClick={e => e.stopPropagation()}>
      <div className="av-top">
        <select value={ark ? d.ark : ''} onChange={e => {
          if (e.target.value === '__nyt') { const id = nytArk?.(); if (id) { set({ ark: id }); aabn?.(id) } return }
          set({ ark: e.target.value })
        }}>
          <option value="">{d.ark && !ark ? 'Arket er slettet — vælg et andet…' : 'Vælg ark…'}</option>
          {bog.ark.map(a => <option key={a.id} value={a.id}>{a.navn}</option>)}
          {nytArk && <option value="__nyt">+ Nyt ark…</option>}
        </select>
        {ark && (
          <>
            <input className={`av-omr ${ok ? '' : 'av-ugyldig'}`} value={d.omraade ?? ''} placeholder="Hele arket"
                   title="Område, der vises, fx A1:D34. Tom = hele arket." onChange={e => set({ omraade: e.target.value })} />
            <input className="av-titel" value={d.titel ?? ''} placeholder={ark.titel || 'Tabeltekst (valgfri)'}
                   onChange={e => set({ titel: e.target.value })} />
          </>
        )}
        {ark && aabn && <button type="button" className="av-aabn" onClick={() => aabn(ark.id, start())}>Åbn i regnearket</button>}
      </div>
      {ark
        ? <ArkTabel ark={ark} omraade={ok ? d.omraade : ''} titel={d.titel} onAabn={aabn ? () => aabn(ark.id, start()) : undefined} />
        : <div className="av-tom">Vælg et ark fra projektets regnearksbog{nytArk ? ', eller opret et nyt' : ''}.</div>}
    </div>
  )
}
