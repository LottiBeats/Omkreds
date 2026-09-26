/**
 * CustomCalcEditor.jsx — "Egen beregning", skrevet linje for linje.
 *
 * Hver linje regnes med det samme; der er ingen Kør-knap. Rapportrækkerne
 * (_result) skrives sammen med linjerne ved hver ændring, så resultatet aldrig
 * står forældet i forhold til det, der er skrevet. Rækkerne er de samme typer
 * som i alle andre beregninger, så PDF og Word tegner dem ens.
 *
 * Gamle blokke (items: var/formula/check/…) omskrives til linjer første gang,
 * de åbnes. Se calcEngine.itemsToLines.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { evaluate, toReportBlocks, itemsToLines, chip, SYMBOLS } from '../../lib/calcEngine.js'
import CalcResultView from '../CalcResultView.jsx'
import './CustomCalcEditor.css'

export const EXAMPLE_LINES = [
  '# Forudsætninger',
  'L = 4,0 m | spændvidde',
  'q_d = 5,0 kN/m | regningsmæssig linjelast',
  'M_Ed = q_d·L²/8 → kNm',
]

export default function CustomCalcEditor({ block, onChange }) {
  const d = block.data
  const propLines = useMemo(() => (Array.isArray(d.lines) ? d.lines : itemsToLines(d.items)), [d.lines, d.items])
  // The lines live here while typing. Each keystroke goes up to the
  // document, but that round trip is not guaranteed to finish before the
  // next key -- building the next edit on the document's copy lost
  // characters when typing fast. The document's copy is taken back only when
  // it changes from outside (undo, another tab).
  const [lines, setLines] = useState(propLines)
  const sent = useRef(propLines)
  useEffect(() => {
    if (propLines !== sent.current) { sent.current = propLines; setLines(propLines) }
  }, [propLines])
  const subst = d.subst ?? true
  const rows = useMemo(() => evaluate(lines), [lines])
  const [focusIdx, setFocusIdx] = useState(null)
  const [showGuide, setShowGuide] = useState(false)
  const [showReport, setShowReport] = useState(true)
  const refs = useRef([])

  function commit(nextLines, patch = {}) {
    setLines(nextLines)
    sent.current = nextLines
    const nextSubst = patch.subst ?? subst
    const title = patch.title ?? d.title
    const res = toReportBlocks(title, evaluate(nextLines), { subst: nextSubst })
    const { items, ...rest } = d
    onChange({ ...block, data: { ...rest, ...patch, lines: nextLines, version: 2, _result: res } })
  }

  // First open of an old block: rewrite to lines once, and give it its report.
  useEffect(() => {
    if (!Array.isArray(d.lines) || !d._result) commit(lines)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Focus moves in the same event as the edit. Done in an effect, the new
  // line got focus a render later -- and a key typed in between landed with
  // the caret at the start of the line.
  function focusLine(i, atEnd) {
    const el = refs.current[i]; if (!el) return
    el.focus()
    const p = atEnd ? el.value.length : 0
    try { el.setSelectionRange(p, p) } catch {}
  }

  function setLine(i, v) {
    const next = lines.slice(); next[i] = v; commit(next)
  }

  function onKey(e, i) {
    const el = e.currentTarget
    if (e.key === 'Enter') {
      e.preventDefault()
      const pos = el.selectionStart ?? el.value.length
      const next = lines.slice()
      next.splice(i, 1, el.value.slice(0, pos), el.value.slice(pos))
      flushSync(() => commit(next)); focusLine(i + 1, false)
    } else if (e.key === 'Backspace' && el.value === '' && lines.length > 1) {
      e.preventDefault()
      const next = lines.slice(); next.splice(i, 1)
      flushSync(() => commit(next)); focusLine(Math.max(0, i - 1), true)
    } else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); focusLine(i - 1, true) }
    else if (e.key === 'ArrowDown' && i < lines.length - 1) { e.preventDefault(); focusLine(i + 1, true) }
  }

  function insertSymbol(sym) {
    const i = focusIdx ?? lines.length - 1
    const el = refs.current[i]; if (!el) return
    const a = el.selectionStart ?? el.value.length, z = el.selectionEnd ?? a
    const ins = sym === '→' || sym === '≤' || sym === '|' ? ` ${sym} ` : sym
    const next = lines.slice(); next[i] = el.value.slice(0, a) + ins + el.value.slice(z)
    commit(next)
    requestAnimationFrame(() => { el.focus(); const p = a + ins.length; try { el.setSelectionRange(p, p) } catch {} })
  }

  const fails = rows.filter(r => r.kind === 'check' && !r.error && !r.ok).length
  const errors = rows.filter(r => r.error).length
  const checks = rows.filter(r => r.kind === 'check' && !r.error)
  const worst = checks.reduce((m, r) => Math.max(m, r.util), 0)

  return (
    <div className="cc2">
      <div className="cc2-head">
        <input className="cc2-title" value={d.title ?? ''} placeholder="Overskrift i rapporten"
          onChange={e => commit(lines, { title: e.target.value })} aria-label="Overskrift" />
        <span className={'cc2-sum' + (fails || errors ? ' bad' : checks.length ? ' ok' : '')}>
          {errors ? `${errors} linje${errors > 1 ? 'r' : ''} kan ikke regnes` :
            checks.length ? `η maks ${worst.toFixed(2).replace('.', ',')} · ${fails ? `${fails} ikke OK` : 'alle OK'}` : 'ingen eftervisninger endnu'}
        </span>
      </div>

      <div className="cc2-ed">
        <div className="cc2-sym" aria-label="Indsæt symbol">
          {SYMBOLS.map(s => (
            <button key={s} type="button" title={`Indsæt ${s}`}
              onMouseDown={e => e.preventDefault()} onClick={() => insertSymbol(s)}>{s}</button>
          ))}
          <span className="cc2-sp" />
          <button type="button" className="cc2-link" onClick={() => setShowGuide(v => !v)}>
            {showGuide ? 'Skjul skrivemåde' : 'Skrivemåde'}
          </button>
        </div>
        {showGuide && (
          <dl className="cc2-guide">
            <dt>L = 2,4 m | spændvidde</dt><dd>Et input. Enheden står ved tallet; alt efter | er beskrivelse.</dd>
            <dt>M_Ed = q_d·L²/8 → kNm</dt><dd>En formel, vist i kNm. Uden pil vælges en passende enhed.</dd>
            <dt>σ_m_d ≤ f_m_d | Bøjning (6.11)</dt><dd>En eftervisning. Udnyttelsen η regnes selv.</dd>
            <dt># Overskrift</dt><dd>Et nyt afsnit. Andre linjer uden = bliver brødtekst.</dd>
            <dt>f_m_k · gamma_M</dt><dd>Vises f<sub>m,k</sub> og γ<sub>M</sub>. Semikolon mellem argumenter: max(a; b).</dd>
            <dt>c = (L &gt; 2 m) ? 1 : 0</dt><dd>Et valg: værdien efter ? hvis betingelsen er opfyldt, ellers efter :.</dd>
          </dl>
        )}
        <div className="cc2-lines">
          {lines.map((raw, i) => {
            const r = rows[i] ?? { kind: 'blank' }
            const [cls, txt] = chip(r)
            return (
              <div key={i} className={`cc2-ln k-${r.kind}`}>
                <span className="no">{i + 1}</span>
                <input ref={el => { refs.current[i] = el }} value={raw} spellCheck={false} autoComplete="off"
                  aria-label={`Linje ${i + 1}`}
                  onFocus={() => setFocusIdx(i)} onChange={e => setLine(i, e.target.value)} onKeyDown={e => onKey(e, i)} />
                <span className={`chip ${cls}`} title={txt}>{txt}</span>
              </div>
            )
          })}
        </div>
        <div className="cc2-foot">
          <button type="button" className="cc2-btn" onClick={() => { const n = lines.length; flushSync(() => commit([...lines, ''])); focusLine(n, true) }}>+ Ny linje</button>
          <label className="cc2-check">
            <input type="checkbox" checked={subst} onChange={e => commit(lines, { subst: e.target.checked })} />
            Vis indsatte tal i rapporten
          </label>
          <span className="cc2-sp" />
          <button type="button" className="cc2-link" onClick={() => setShowReport(v => !v)}>
            {showReport ? 'Skjul rapportvisning' : 'Vis rapportvisning'}
          </button>
        </div>
      </div>

      {showReport && d._result?.length > 0 && (
        <div className="cc2-report">
          <CalcResultView blocks={d._result} />
        </div>
      )}
    </div>
  )
}
