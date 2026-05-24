/**
 * Field.jsx — labelled input wrapper used inside all calc block forms
 *
 * Renders: label (+ optional hint) on top, then whatever children you pass.
 *
 * Usage:
 *   <Field label="Span (m)" hint="Simply supported">
 *     <input ... />
 *   </Field>
 */
import React from 'react'

export default function Field({ label, hint, children }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>
        {label}
        {hint && <span style={styles.hint}> — {hint}</span>}
      </label>
      {children}
    </div>
  )
}

const styles = {
  field: {
    display:       'flex',
    flexDirection: 'column',
    gap:           4,
  },
  label: {
    fontSize:      11,
    fontWeight:    700,
    color:         '#555',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    userSelect:    'none',
  },
  hint: {
    fontWeight:    400,
    color:         '#aaa',
    textTransform: 'none',
    letterSpacing: 0,
  },
}
