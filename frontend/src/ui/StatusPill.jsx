/**
 * StatusPill — a small state marker.
 *
 *   tone: 'ok' · 'warn' · 'fail' · 'idle' · 'rev' · 'draft'
 *
 * The tone carries the meaning (green = eftervist/klar, amber = forældet,
 * red = fejler, grey = ikke startet), so use the same tone for the same state
 * everywhere.
 */
import React from 'react'

export default function StatusPill({ tone = 'idle', title, children }) {
  return <span className={`ui-pill ui-pill--${tone}`} title={title}>{children}</span>
}
