/**
 * EditorTopBar — project, location, save state and the few actions that
 * apply to the whole view.
 *
 * One primary button: "Udsted". Preview, draft PDF, separate PDFs and Word
 * are all "get a file out" and live in one Eksportér menu instead of five
 * differently coloured buttons.
 */
import React, { useEffect, useState } from 'react'
import { Button, Menu, MenuItem, MenuSeparator, MenuLabel } from '../../ui/index.js'
import './editor.css'

function fmtTime(d) {
  return d ? d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }) : ''
}

export function SaveIndicator({ state, onRetry }) {
  // Re-render every half minute so "Gemt" doesn't go stale on screen
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t) }, [])

  const s = state.status
  if (s === 'saving' || s === 'pending') {
    return <span className="ed-save"><span className="ed-save-dot is-busy" />Gemmer…</span>
  }
  if (s === 'error') {
    return (
      <span className="ed-save is-err" title={state.error?.message}>
        <span className="ed-save-dot" />Ikke gemt
        {onRetry && <button className="ed-link" onClick={onRetry}>Prøv igen</button>}
      </span>
    )
  }
  if (s === 'conflict') return <span className="ed-save is-err"><span className="ed-save-dot" />Konflikt — vælg version</span>
  if (s === 'saved')    return <span className="ed-save" title="Alle ændringer er gemt"><span className="ed-save-dot is-ok" />Gemt {fmtTime(state.at)}</span>
  return <span className="ed-save"><span className="ed-save-dot is-ok" />Alt er gemt</span>
}

export default function EditorTopBar({
  project, crumb, saveState, onRetrySave, onBack,
  undo, onUndo, onRedo,
  activeDoc, hasSubdocs, busy,
  onPreview, onExportPdf, onExportZip, onExportWord, onIssue,
  onHistory, onSaveAsTemplate,
}) {
  const meta = project.metadata ?? {}
  return (
    <header className="ed-bar">
      <button className="ed-logo" onClick={onBack} title="Alle projekter">
        <img src="/logo.png" alt="Omkreds" />
      </button>

      <nav className="ed-crumbs" aria-label="Placering">
        <button className="ed-link" onClick={onBack}>Projekter</button>
        <span aria-hidden="true">/</span>
        <span className="ed-crumb-project" title={meta.project_name}>{meta.project_name || 'Unavngivet projekt'}</span>
        {meta.project_ref && <span className="ed-crumb-ref">{meta.project_ref}</span>}
        {crumb && <><span aria-hidden="true">/</span><b>{crumb}</b></>}
      </nav>

      <span className="ed-spacer" />
      <SaveIndicator state={saveState} onRetry={onRetrySave} />

      {activeDoc && (
        <span className="ed-group">
          <Button variant="ghost" size="sm" icon onClick={onUndo} disabled={!undo.canUndo} title="Fortryd (Ctrl+Z)" aria-label="Fortryd">↶</Button>
          <Button variant="ghost" size="sm" icon onClick={onRedo} disabled={!undo.canRedo} title="Annullér fortryd (Ctrl+Y)" aria-label="Annullér fortryd">↷</Button>
        </span>
      )}

      <Menu align="right" trigger={() => <Button variant="ghost" size="sm" title="Projekt">Projekt ▾</Button>}>
        <MenuItem onSelect={onHistory} hint="Se og gendan tidligere versioner af hele projektet">Versionshistorik</MenuItem>
        <MenuItem onSelect={onSaveAsTemplate} hint="Genbrug dokumentstrukturen i nye projekter">Gem som projektskabelon…</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={onBack}>Alle projekter</MenuItem>
      </Menu>

      {activeDoc && (
        <>
          <Menu align="right" width={280} trigger={() => (
            <Button size="sm" busy={busy.export}>Eksportér ▾</Button>
          )}>
            <MenuLabel>{activeDoc} som udkast</MenuLabel>
            <MenuItem onSelect={onPreview} hint="Vis PDF'en her uden at hente den">Forhåndsvis PDF</MenuItem>
            <MenuItem onSelect={onExportPdf} hint="Ingen revision registreres">Hent PDF</MenuItem>
            {hasSubdocs && (
              <MenuItem onSelect={onExportZip} hint="Ét PDF pr. underdokument, samlet i en ZIP">Hent separate PDF'er</MenuItem>
            )}
            <MenuItem onSelect={onExportWord} hint="Redigerbar .docx">Hent Word</MenuItem>
          </Menu>
          <Button variant="primary" size="sm" busy={busy.issue} onClick={onIssue}
                  title="Registrér en revision, gem et permanent øjebliksbillede og hent PDF'en">
            Udsted {activeDoc}…
          </Button>
        </>
      )}
    </header>
  )
}
