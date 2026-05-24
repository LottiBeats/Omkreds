/**
 * HeadingBlock.jsx — section heading block
 *
 * Lets the user write a heading text and choose the level (H1 / H2 / H3).
 *
 * Props:
 *   block    — { id, type: "heading", data: { level, text } }
 *   onChange — function(updatedBlock) called whenever the user types or changes level
 *
 * How React state / props work here:
 *   - `block` is READ-ONLY data passed from the parent (BlockList).
 *   - When the user edits something, we build a new block object and call onChange().
 *   - BlockList then updates its list and calls EditorPage's onChange(), which saves to the API.
 *   - React re-renders the component with the new data — that's how the UI updates.
 */
import React from 'react'

// Map level number → CSS font size
const LEVEL_SIZES = { 1: 22, 2: 17, 3: 14 }

export default function HeadingBlock({ block, onChange }) {
  const { level, text } = block.data

  // Helper: produce a new block with some data fields changed
  // We always spread the old data first to keep untouched fields intact
  function update(changes) {
    onChange({
      ...block,
      data: { ...block.data, ...changes },
    })
  }

  return (
    <div style={styles.wrapper}>

      {/* Level selector: H1 / H2 / H3 buttons */}
      <div style={styles.levelRow}>
        {[1, 2, 3].map(lvl => (
          <button
            key={lvl}
            style={{
              ...styles.levelBtn,
              ...(level === lvl ? styles.levelBtnActive : {}),
            }}
            onClick={() => update({ level: lvl })}
          >
            H{lvl}
          </button>
        ))}
      </div>

      {/* Text input — styled to look like the heading it represents */}
      <input
        type="text"
        value={text}
        onChange={e => update({ text: e.target.value })}
        placeholder="Heading text…"
        style={{
          ...styles.textInput,
          fontSize:   LEVEL_SIZES[level] ?? 14,
          fontWeight: level === 1 ? 700 : level === 2 ? 600 : 500,
        }}
      />

    </div>
  )
}

const styles = {
  wrapper: {
    display:       'flex',
    flexDirection: 'column',
    gap:           8,
  },
  levelRow: {
    display: 'flex',
    gap:     4,
  },
  levelBtn: {
    background:  'none',
    border:      '1px solid #e8e8e8',
    padding:     '2px 10px',
    fontSize:    11,
    fontWeight:  700,
    color:       '#888',
    cursor:      'pointer',
    fontFamily:  'monospace',
  },
  levelBtnActive: {
    background:  '#111',
    color:       '#fff',
    border:      '1px solid #111',
  },
  textInput: {
    width:        '100%',
    border:       'none',
    borderBottom: '2px solid #f0f0f0',
    padding:      '4px 0',
    outline:      'none',
    fontFamily:   'inherit',
    lineHeight:   1.3,
    color:        '#1c1c1e',
    background:   'transparent',
  },
}
