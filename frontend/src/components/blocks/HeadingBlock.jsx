/**
 * HeadingBlock.jsx — inline-editable heading block
 *
 * Renders as a styled heading. Click to edit.
 * H1/H2/H3 selector appears when the block is selected.
 */
import React from 'react'

const SIZES   = { 1: 26, 2: 20, 3: 16 }
const WEIGHTS = { 1: 700, 2: 700, 3: 600 }

export default function HeadingBlock({ block, onChange, isSelected }) {
  const { level = 1, text = '' } = block.data
  const sz = SIZES[level]  ?? 18
  const fw = WEIGHTS[level] ?? 600

  function update(changes) {
    onChange({ ...block, data: { ...block.data, ...changes } })
  }

  return (
    <div>
      {/* Level selector — only visible when the block is selected */}
      {isSelected && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          {[1, 2, 3].map(lvl => (
            <button
              key={lvl}
              onMouseDown={e => { e.preventDefault(); update({ level: lvl }) }}
              style={{
                fontSize:   10,
                fontWeight: 700,
                fontFamily: 'monospace',
                padding:    '1px 8px',
                border:     '1px solid ' + (level === lvl ? '#111' : '#e0e0e0'),
                background: level === lvl ? '#111' : 'none',
                color:      level === lvl ? '#fff' : '#888',
                cursor:     'pointer',
                borderRadius: 2,
              }}
            >
              H{lvl}
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        value={text}
        onChange={e => update({ text: e.target.value })}
        placeholder={`Heading ${level}…`}
        style={{
          display:    'block',
          width:      '100%',
          border:     'none',
          padding:    0,
          margin:     0,
          fontSize:   sz,
          fontWeight: fw,
          lineHeight: 1.3,
          fontFamily: 'inherit',
          color:      text ? '#1c1c1e' : '#ccc',
          background: 'transparent',
          outline:    'none',
          cursor:     'text',
        }}
      />
    </div>
  )
}
