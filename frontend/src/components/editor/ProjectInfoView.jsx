/**
 * ProjectInfoView — the "Projektbeskrivelse" page.
 *
 * For a new project it opens with one clear first step: say what kind of job
 * this is, and A1, A2, B1 and B2 are written from that description. Once the
 * documents exist, the same card offers to regenerate them (with a snapshot
 * first), instead of a permanent one-click button in the toolbar.
 *
 * The metadata form below is unchanged (it moves to the new form components
 * in the next phase).
 */
import React from 'react'
import { Button, StatusPill } from '../../ui/index.js'
import MetadataPanel from '../MetadataPanel.jsx'
import { DOC_IDS, DOC_SHORT } from '../../templates/docs.js'
import { documentStatus } from '../../lib/docStatus.js'
import { PROJECT_TYPES } from '../../templates/projectTypes.js'
import './editor.css'

export default function ProjectInfoView({ project, isEmpty, onChooseType, onSaveMeta, onGo }) {
  const opts = project.metadata?._doc_options
  return (
    <div className="ed-info">
      {isEmpty ? (
        <section className="ed-start">
          <div className="ed-eyebrow">Kom i gang</div>
          <h2>Hvilken slags opgave er det?</h2>
          <p>
            Vælg en projekttype og beskriv opgaven. Så skrives A1, A2, B1 og B2 ud fra
            den samme beskrivelse, med samme konsekvens- og konstruktionsklasse i alle
            fire. Du kan rette alt bagefter.
          </p>
          <div className="ed-start-actions">
            <Button variant="primary" onClick={onChooseType}>Vælg projekttype…</Button>
            <Button variant="ghost" onClick={() => onGo('A1')}>Start med et tomt A1</Button>
          </div>
          {PROJECT_TYPES.length > 0 && (
            <p className="ed-note">Tilgængelige typer: {PROJECT_TYPES.map(t => t.label).join(' · ')}</p>
          )}
        </section>
      ) : (
        <section className="ed-overview">
          <div className="ed-overview-head">
            <div>
              <div className="ed-eyebrow">Dokumentation</div>
              <h2>Status for projektet</h2>
            </div>
            <Button size="sm" onClick={onChooseType}
                    title="Skriver A1, A2, B1 og B2 forfra. Den nuværende version gemmes i historikken først.">
              Generér dokumenter fra projekttype…
            </Button>
          </div>
          <div className="ed-overview-grid">
            {DOC_IDS.map(id => {
              const st = documentStatus(project.documents?.[id])
              return (
                <button key={id} className="ed-overview-doc" onClick={() => onGo(id)}>
                  <span className="ed-doc-id">{id}</span>
                  <span>{DOC_SHORT[id]}</span>
                  <StatusPill tone={st.tone} title={st.title}>{st.label}</StatusPill>
                </button>
              )
            })}
          </div>
          {opts && (
            <p className="ed-note">
              Beskrevet som: {[opts.konstruktionstype, opts.bygningskategori, opts.etager && `${opts.etager} etage${opts.etager > 1 ? 'r' : ''}`,
                opts.spaendvidde && `spænd ${opts.spaendvidde} m`].filter(Boolean).join(' · ')}
            </p>
          )}
        </section>
      )}

      <MetadataPanel project={project} onSave={onSaveMeta} />
    </div>
  )
}
