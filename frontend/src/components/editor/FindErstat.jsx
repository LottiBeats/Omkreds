/**
 * FindErstat.jsx — Find og erstat (Ctrl+F / Ctrl+H), som i Word.
 *
 * Søger i dokumentets tekst og overskrifter. Det fundne markeres på siden
 * (CSS Custom Highlight API), og pilene/Enter går til næste. "Erstat" skifter
 * det markerede, "Erstat alle" alle på én gang -- én ændring, så Fortryd
 * tager det hele tilbage.
 *
 * Teksten gemmes med formatering (**fed**, *kursiv*), og der søges i den
 * gemte tekst; et ord, der er halvt fedt, findes derfor ikke. Det er sjældent.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { findAlle, erstatI } from '../../lib/findErstat.js'

// Den k'te forekomst i et elements synlige tekst, som et Range over tekstnoderne.
function rangeI(el, q, storeSmaa, k) {
  const noder = []; let alt = ''
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) { noder.push([n, alt.length]); alt += n.data }
  const hay = storeSmaa ? alt : alt.toLowerCase(), naal = storeSmaa ? q : q.toLowerCase()
  let at = -1
  for (let i = 0; i <= k; i++) { at = hay.indexOf(naal, at + 1); if (at < 0) return null }
  const pos = (o) => { for (let i = noder.length - 1; i >= 0; i--) if (o >= noder[i][1]) return [noder[i][0], o - noder[i][1]] }
  const r = document.createRange()
  r.setStart(...pos(at)); r.setEnd(...pos(at + q.length))
  return r
}

export default function FindErstat({ blocks, onChange, gaaTil, pageRef, erstat: medErstat, aabnet, onLuk }) {
  const [q, setQ] = useState('')
  const [med, setMed] = useState('')
  const [storeSmaa, setStoreSmaa] = useState(false)
  const [visErstat, setVisErstat] = useState(medErstat)
  const [nr, setNr] = useState(0)
  const inputRef = useRef(null)

  // Ctrl+F igen, mens den er åben: markér søgeteksten, klar til en ny.
  useEffect(() => { setVisErstat(v => v || medErstat); inputRef.current?.focus(); inputRef.current?.select() }, [medErstat, aabnet])

  const fund = useMemo(() => findAlle(blocks, q, storeSmaa), [blocks, q, storeSmaa])
  const cur = fund.length ? fund[Math.min(nr, fund.length - 1)] : null

  useEffect(() => { setNr(0) }, [q, storeSmaa])

  // Markér det aktuelle fund på siden og rul hen til det.
  useEffect(() => {
    const hl = typeof CSS !== 'undefined' && CSS.highlights
    hl?.delete('omk-find')
    if (!cur) return
    const blokEl = pageRef.current?.querySelector(`[data-block-id="${cur.blockId}"]`)
    if (!blokEl) { gaaTil(cur.blockId); return }
    const input = blokEl.querySelector('.hdb input')
    if (input) {
      blokEl.scrollIntoView({ block: 'center' })
      return
    }
    const rt = blokEl.querySelector('.rt') || blokEl
    const r = rangeI(rt, q, storeSmaa, cur.k)
    if (!r) { blokEl.scrollIntoView({ block: 'center' }); return }
    if (hl && typeof Highlight !== 'undefined') hl.set('omk-find', new Highlight(r))
    const rect = r.getBoundingClientRect()
    if (rect.top < 120 || rect.bottom > window.innerHeight - 40) {
      r.startContainer.parentElement?.scrollIntoView({ block: 'center' })
    }
  }, [cur?.blockId, cur?.k, q, storeSmaa, blocks]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { typeof CSS !== 'undefined' && CSS.highlights?.delete('omk-find') }, [])

  const gaa = (d) => fund.length && setNr(n => (n + d + fund.length) % fund.length)

  function erstatEn() {
    if (!cur) return
    onChange(blocks.map(b => (b.id === cur.blockId
      ? { ...b, data: { ...b.data, text: erstatI(String(b.data.text ?? ''), q, med, storeSmaa, cur.k) } } : b)))
  }
  function erstatAlle() {
    if (!fund.length) return
    const ids = new Set(fund.map(f => f.blockId))
    onChange(blocks.map(b => (ids.has(b.id)
      ? { ...b, data: { ...b.data, text: erstatI(String(b.data.text ?? ''), q, med, storeSmaa) } } : b)))
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); onLuk() }
    else if (e.key === 'Enter') { e.preventDefault(); gaa(e.shiftKey ? -1 : 1) }
  }

  return (
    <div className="fe" role="dialog" aria-label="Find og erstat" onKeyDown={onKeyDown}>
      <div className="fe-raekke">
        <button type="button" className="fe-pil" onClick={() => setVisErstat(v => !v)} title="Vis/skjul Erstat (Ctrl+H)" aria-expanded={visErstat}>
          {visErstat ? '▾' : '▸'}
        </button>
        <input ref={inputRef} autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Find i dokumentet" aria-label="Find" />
        <span className="fe-antal" aria-live="polite">{q ? (fund.length ? `${Math.min(nr, fund.length - 1) + 1} af ${fund.length}` : 'Ingen') : ''}</span>
        <button type="button" className={'fe-knap' + (storeSmaa ? ' on' : '')} onClick={() => setStoreSmaa(v => !v)} title="Forskel på store og små bogstaver">Aa</button>
        <button type="button" className="fe-knap" onClick={() => gaa(-1)} disabled={!fund.length} title="Forrige (Shift+Enter)">↑</button>
        <button type="button" className="fe-knap" onClick={() => gaa(1)} disabled={!fund.length} title="Næste (Enter)">↓</button>
        <button type="button" className="fe-knap" onClick={onLuk} title="Luk (Esc)">✕</button>
      </div>
      {visErstat && (
        <div className="fe-raekke fe-erstat">
          <input value={med} onChange={e => setMed(e.target.value)} placeholder="Erstat med" aria-label="Erstat med" />
          <button type="button" className="fe-tekstknap" onClick={erstatEn} disabled={!cur}>Erstat</button>
          <button type="button" className="fe-tekstknap" onClick={erstatAlle} disabled={!fund.length}>Erstat alle</button>
        </div>
      )}
    </div>
  )
}
