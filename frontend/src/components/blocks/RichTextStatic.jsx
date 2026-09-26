/**
 * RichTextStatic — a text block's content, formatted but not editable.
 *
 * Shown for the moment it takes to load the editor (TipTap is fetched on
 * demand), so the page appears at once and looks the same before and after.
 * Uses the same parser as the editor, and the same CSS.
 */
import React from 'react'
import { parseText } from '../../lib/richText.js'
import { findPlaceholders } from '../../lib/placeholders.js'
import './TextBlock.css'

function Inline({ nodes = [] }) {
  return nodes.map((n, i) => {
    if (n.type === 'hardBreak') return <br key={i} />
    const marks = new Set((n.marks ?? []).map(m => m.type))
    let el = <Holes text={n.text} />
    if (marks.has('italic')) el = <em>{el}</em>
    if (marks.has('bold')) el = <strong>{el}</strong>
    return <React.Fragment key={i}>{el}</React.Fragment>
  })
}

function Holes({ text }) {
  const ph = findPlaceholders(text)
  if (!ph.length) return text
  const out = []
  let pos = 0
  ph.forEach((p, i) => {
    if (p.from > pos) out.push(text.slice(pos, p.from))
    out.push(<span key={i} className="rt-ph">{text.slice(p.from, p.to)}</span>)
    pos = p.to
  })
  out.push(text.slice(pos))
  return out
}

export default function RichTextStatic({ text }) {
  if (!String(text ?? '').trim()) return <div className="rt"><span style={{ color: 'var(--faint)' }}>Skriv tekst her…</span></div>
  const doc = parseText(text)
  return (
    <div className="rt">
      {doc.content.map((b, i) => {
        const join = b.attrs?.joinPrev ? { 'data-join': '' } : {}
        if (b.type === 'bulletList' || b.type === 'orderedList') {
          const L = b.type === 'bulletList' ? 'ul' : 'ol'
          return (
            <L key={i} {...join} start={b.attrs?.start}>
              {b.content.map((it, k) => <li key={k}><p><Inline nodes={it.content?.[0]?.content} /></p></li>)}
            </L>
          )
        }
        return <p key={i} {...join}><Inline nodes={b.content} /></p>
      })}
    </div>
  )
}
