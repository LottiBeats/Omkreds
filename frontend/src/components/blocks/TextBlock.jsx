/**
 * TextBlock.jsx — free text / paragraph block
 *
 * A simple multi-line text area. Used for prose descriptions,
 * assumptions, references, etc.
 *
 * Props:
 *   block    — { id, type: "text", data: { text } }
 *   onChange — function(updatedBlock)
 */
import React from 'react'

export default function TextBlock({ block, onChange }) {
  const { text } = block.data

  function handleChange(e) {
    onChange({
      ...block,
      data: { ...block.data, text: e.target.value },
    })
  }

  return (
    <textarea
      value={text}
      onChange={handleChange}
      placeholder="Write text here…"
      rows={4}
      style={styles.textarea}
    />
  )
}

const styles = {
  textarea: {
    width:       '100%',
    border:      '1px solid #e8e8e8',
    padding:     '10px 12px',
    fontSize:    13,
    lineHeight:  1.6,
    resize:      'vertical',
    outline:     'none',
    fontFamily:  'inherit',
    color:       '#1c1c1e',
    background:  '#fff',
    minHeight:   80,
  },
}
