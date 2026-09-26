/**
 * EditorRail — where you are in the project, and how far each document is.
 *
 *   Projekt       Projektbeskrivelse
 *   Projektering  A1 A2 A3          ← each with a status pill (docStatus.js)
 *   Kontrol       B1 B2
 *   Udførelse ▸   A4 A5 B3          ← collapsed until the construction phase
 *
 * Sub-documents sit under their parent. Adding one is a hover action on the
 * parent row and an item in the document's own menu, instead of a permanent
 * "+ Tilføj underdokument" link under all eight documents.
 */
import React, { useEffect, useState } from 'react'
import { DOC_PHASES, DOC_SHORT } from '../../templates/docs.js'
import { documentStatus, subdocCounts } from '../../lib/docStatus.js'
import StatusPill from '../../ui/StatusPill.jsx'
import './editor.css'

const OPEN_KEY = 'omkreds.rail.udfoerelse'

function readOpen() {
  try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false }
}

function subStatus(doc, i) {
  const c = subdocCounts(doc, i)
  if (c.fail)  return { tone: 'fail', label: String(c.fail) }
  if (c.stale) return { tone: 'warn', label: String(c.stale) }
  if (c.unrun) return { tone: 'warn', label: String(c.unrun) }
  if (c.calcs) return { tone: 'ok',   label: '✓' }
  return null
}

export default function EditorRail({ project, active, onGo, onAddSubdoc }) {
  const docs = project.documents ?? {}
  const [laterOpen, setLaterOpen] = useState(readOpen)

  const phaseHasContent = (phase) => phase.docs.some(id => documentStatus(docs[id]).key !== 'empty')
  const activeInPhase   = (phase) => phase.docs.includes(active.doc)

  // Opening a construction-phase document (from a link, or history) opens its group.
  useEffect(() => {
    const later = DOC_PHASES.find(p => p.later)
    if (later && activeInPhase(later)) setLaterOpen(true)
  }, [active.doc])   // eslint-disable-line react-hooks/exhaustive-deps

  function toggleLater() {
    setLaterOpen(o => {
      try { localStorage.setItem(OPEN_KEY, o ? '0' : '1') } catch { /* private mode */ }
      return !o
    })
  }

  return (
    <nav className="ed-rail" aria-label="Dokumenter">
      <div className="ed-rail-grp">Projekt</div>
      <button
        className={'ed-doc' + (active.info ? ' is-on' : '')}
        aria-current={active.info ? 'page' : undefined}
        onClick={() => onGo('info')}
      >
        <span className="ed-doc-id">·</span>
        <span className="ed-doc-name">Projektbeskrivelse</span>
      </button>

      {DOC_PHASES.map(phase => {
        const collapsible = phase.later
        const open = !collapsible || laterOpen || phaseHasContent(phase) || activeInPhase(phase)
        return (
          <div key={phase.key} className="ed-rail-phase">
            {collapsible ? (
              <button className="ed-rail-grp ed-rail-grp--btn" onClick={toggleLater} aria-expanded={open}>
                {phase.label} <span aria-hidden="true">{open ? '▾' : '▸'}</span>
              </button>
            ) : (
              <div className="ed-rail-grp">{phase.label}</div>
            )}

            {!open && (
              <button className="ed-rail-hint" onClick={toggleLater}>
                {phase.docs.join(' · ')} — bruges når byggeriet er i gang
              </button>
            )}

            {open && phase.docs.map(docId => {
              const doc = docs[docId]
              const subdocs = doc?.subdocs ?? []
              const st = documentStatus(doc)
              const isOn = active.doc === docId && active.sub === null
              return (
                <React.Fragment key={docId}>
                  <div className={'ed-doc-row' + (isOn ? ' is-on' : '')}>
                    <button
                      className={'ed-doc' + (isOn ? ' is-on' : '')}
                      aria-current={isOn ? 'page' : undefined}
                      onClick={() => onGo(docId)}
                      title={doc?.title ?? DOC_SHORT[docId]}
                    >
                      <span className="ed-doc-id">{docId}</span>
                      <span className="ed-doc-name">{DOC_SHORT[docId]}</span>
                      <StatusPill tone={st.tone} title={st.title}>{st.short ?? st.label}</StatusPill>
                    </button>
                    <button
                      className="ed-doc-add"
                      title={`Tilføj underdokument til ${docId}`}
                      aria-label={`Tilføj underdokument til ${docId}`}
                      onClick={() => onAddSubdoc(docId)}
                    >+</button>
                  </div>

                  {subdocs.map((sd, i) => {
                    const on = active.doc === docId && active.sub === i
                    const ss = subStatus(doc, i)
                    return (
                      <button
                        key={i}
                        className={'ed-doc ed-doc--sub' + (on ? ' is-on' : '')}
                        aria-current={on ? 'page' : undefined}
                        onClick={() => onGo(docId, i)}
                      >
                        <span className="ed-doc-id">{docId}.{i + 1}</span>
                        <span className="ed-doc-name">{sd.name || `Underdokument ${i + 1}`}</span>
                        {ss && <StatusPill tone={ss.tone}>{ss.label}</StatusPill>}
                      </button>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}
