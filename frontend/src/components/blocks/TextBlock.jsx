/**
 * TextBlock.jsx — inline-editable paragraph block
 *
 * Renders as plain document text. Click anywhere on it to start typing.
 * No separate editor panel — the text IS the editor.
 */
import React, { useRef, useEffect } from 'react'

export default function TextBlock({ block, onChange }) {
  const { text } = block.data
  const ref = useRef(null)

  // Auto-resize on content change
  useEffect(() => {
    const ta = ref.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }, [text])

  function handleChange(e) {
    onChange({ ...block, data: { ...block.data, text: e.target.value } })
  }

  return (
    <textarea
      ref={ref}
      value={text ?? ''}
      onChange={handleChange}
      placeholder="Write text here…"
      rows={1}
      style={{
        display:    'block',
        width:      '100%',
        border:     'none',
        padding:    0,
        margin:     0,
        fontSize:   14,
        lineHeight: 1.75,
        fontFamily: 'inherit',
        color:      text ? '#333' : '#bbb',
        background: 'transparent',
        resize:     'none',
        outline:    'none',
        cursor:     'text',
        overflow:   'hidden',
        whiteSpace: 'pre-wrap',
        minHeight:  '1.75em',
        boxSizing:  'border-box',
      }}
    />
  )
}
