/**
 * DocHeader — the strip above the page: which document this is, its state,
 * and the actions that belong to this document only.
 *
 * "Start fra skabelon" replaces the page's content, so it sits here, next to
 * the thing it replaces, instead of in the global toolbar.
 */
import React, { useState } from 'react'
import { Button, Dialog, Menu, MenuItem, MenuSeparator, StatusPill } from '../../ui/index.js'
import { documentStatus } from '../../lib/docStatus.js'
import './editor.css'

export function NameDialog({ title, label, initial = '', confirmLabel = 'Gem', onSubmit, onClose }) {
  const [value, setValue] = useState(initial)
  const ok = value.trim().length > 0
  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={<>
        <Button onClick={onClose}>Annullér</Button>
        <Button variant="primary" disabled={!ok} onClick={() => ok && onSubmit(value.trim())}>{confirmLabel}</Button>
      </>}
    >
      <label className="ed-field">
        <span>{label}</span>
        <input
          data-autofocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && ok) onSubmit(value.trim()) }}
        />
      </label>
    </Dialog>
  )
}

export default function DocHeader({
  docId, doc, sub, title, templates = [], clipboard,
  onApplyTemplate, onAddSubdoc, onRenameSubdoc, onDeleteSubdoc, onClearClipboard,
}) {
  const st = sub === null ? documentStatus(doc) : null
  const revs = doc?.revisions ?? []
  const last = revs[revs.length - 1]

  return (
    <div className="ed-dochead">
      <div className="ed-dochead-title">
        <span className="ed-dochead-id">{sub === null ? docId : `${docId}.${sub + 1}`}</span>
        <h1>{title}</h1>
        {st && <StatusPill tone={st.tone} title={st.title}>{st.label}</StatusPill>}
        {last && st?.key !== 'issued' && (
          <span className="ed-dochead-rev" title={last.description}>Senest udstedt: Rev {last.rev} · {last.date}</span>
        )}
      </div>

      <div className="ed-dochead-actions">
        {clipboard && (
          <span className="ed-clip" title="Indsæt via + mellem blokkene">
            Kopieret: {clipboard.data?.title || clipboard.type}
            <button className="ed-link" onClick={onClearClipboard} aria-label="Ryd udklipsholder">✕</button>
          </span>
        )}

        <Menu align="right" width={320} trigger={() => (
          <Button size="sm" disabled={templates.length === 0}>Start fra skabelon ▾</Button>
        )}>
          {templates.map((tpl, i) => (
            <MenuItem key={i} onSelect={() => onApplyTemplate(tpl)} hint={tpl.description}>{tpl.label}</MenuItem>
          ))}
        </Menu>

        <Menu align="right" trigger={() => (
          <Button variant="ghost" size="sm" icon title="Flere handlinger" aria-label="Flere handlinger">⋯</Button>
        )}>
          <MenuItem onSelect={() => onAddSubdoc(docId)} hint={`Del ${docId} op, fx i "Tag" og "Fundament"`}>Tilføj underdokument…</MenuItem>
          {sub !== null && (
            <>
              <MenuItem onSelect={() => onRenameSubdoc(docId, sub)}>Omdøb underdokument…</MenuItem>
              <MenuSeparator />
              <MenuItem danger onSelect={() => onDeleteSubdoc(docId, sub)}>Slet underdokument…</MenuItem>
            </>
          )}
        </Menu>
      </div>
    </div>
  )
}
