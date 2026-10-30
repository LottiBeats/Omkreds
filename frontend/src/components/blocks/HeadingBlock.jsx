/**
 * HeadingBlock.jsx — overskrift som i Word.
 *
 * Niveauet vælges som typografi i båndet over dokumentet (Overskrift 1/2/3
 * eller Brødtekst; components/editor/Baand.jsx) eller med Tab / Shift+Tab.
 * Nummeret (1, 1.1, 1.1.1) vises som det kommer til at stå i PDF og Word; det regnes i BlockList med samme regel som eksporten
 * (pdf_builder._number_headings). Enter giver et tekstafsnit lige under.
 * Et afsnit, som hjælperen kan skrive (templates/a1Afsnit), får en Hjælp-knap.
 */
import React, { useEffect, useRef } from 'react'
import './HeadingBlock.css'
import { saetAktiv, slipAktiv, glemAktiv } from '../../lib/aktivTekst.js'
import { findAfsnit } from '../../templates/a1Afsnit/index.js'

export default function HeadingBlock({ block, onChange, isSelected, headNo, onEnter, onHjaelp }) {
  const { level = 1, text = '' } = block.data
  // Afsnit, som hjælperen kan skrive (fx Robusthed), får en knap ved overskriften.
  const hjaelp = onHjaelp && findAfsnit(block)

  function update(changes) {
    onChange({ ...block, data: { ...block.data, ...changes } })
  }

  // Båndet (lib/aktivTekst.js) viser og skifter niveauet for den overskrift,
  // markøren står i.
  const fokus = useRef(false)
  const meld = (f) => saetAktiv({ blockId: block.id, type: 'heading', level, fokus: f, input: inputRef.current })
  const inputRef = useRef(null)
  useEffect(() => { if (fokus.current) meld(true) })          // nyt niveau → båndet følger med
  useEffect(() => () => glemAktiv(block.id), [block.id])

  function onKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault()
      update({ level: Math.max(1, Math.min(3, level + (e.shiftKey ? -1 : 1))) })
    } else if (e.key === 'Enter' && onEnter) {
      // Blur first, so keys typed before the new paragraph has focus do not
      // land in the heading.
      e.preventDefault(); e.currentTarget.blur(); onEnter()
    }
  }

  return (
    <div className={`hdb hdb-${level}`}>
      <div className="hdb-row">
        {headNo && <span className="hdb-no" title="Nummereres automatisk i rapporten">{headNo}</span>}
        <input
          ref={inputRef}
          type="text"
          value={text}
          onFocus={() => { fokus.current = true; meld(true) }}
          onBlur={() => { fokus.current = false; slipAktiv(block.id) }}
          onChange={e => update({ text: e.target.value })}
          onKeyDown={onKeyDown}
          placeholder={`Overskrift ${level}`}
          aria-label={`Overskrift ${level}`}
        />
        {hjaelp && (
          <button type="button" className="hdb-hjaelp" title={`Hjælp til at skrive ${hjaelp.titel.toLowerCase()}`}
                  onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onHjaelp() }}>
            Hjælp
          </button>
        )}
      </div>
    </div>
  )
}
