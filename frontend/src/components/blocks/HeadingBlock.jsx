/**
 * HeadingBlock.jsx — overskrift som i Word.
 *
 * Niveauet vælges som typografi ("Overskrift 1/2/3") eller med Tab /
 * Shift+Tab. Nummeret (1, 1.1, 1.1.1) vises som det kommer til at stå i PDF
 * og Word; det regnes i BlockList med samme regel som eksporten
 * (pdf_builder._number_headings). Enter giver et tekstafsnit lige under.
 * Et afsnit, som hjælperen kan skrive (templates/a1Afsnit), får en Hjælp-knap.
 */
import React from 'react'
import './HeadingBlock.css'
import { findAfsnit } from '../../templates/a1Afsnit/index.js'

const LEVELS = [
  { v: 1, label: 'Overskrift 1' },
  { v: 2, label: 'Overskrift 2' },
  { v: 3, label: 'Overskrift 3' },
]

export default function HeadingBlock({ block, onChange, isSelected, headNo, onEnter, onHjaelp }) {
  const { level = 1, text = '' } = block.data
  // Afsnit, som hjælperen kan skrive (fx Robusthed), får en knap ved overskriften.
  const hjaelp = onHjaelp && findAfsnit(block)

  function update(changes) {
    onChange({ ...block, data: { ...block.data, ...changes } })
  }

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
      {isSelected && (
        <div className="hdb-bar" role="toolbar" aria-label="Overskrift">
          <div className="hdb-grp" role="radiogroup" aria-label="Niveau">
            {LEVELS.map(l => (
              <button key={l.v} type="button" role="radio" aria-checked={level === l.v}
                className={`hdb-sty hdb-sty-${l.v}` + (level === l.v ? ' on' : '')}
                onMouseDown={e => { e.preventDefault(); update({ level: l.v }) }}>{l.label}</button>
            ))}
          </div>
          <span className="hdb-hint">Tab / Shift+Tab skifter niveau · Enter giver et tekstafsnit</span>
        </div>
      )}
      <div className="hdb-row">
        {headNo && <span className="hdb-no" title="Nummereres automatisk i rapporten">{headNo}</span>}
        <input
          type="text"
          value={text}
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
