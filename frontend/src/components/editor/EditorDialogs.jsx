/**
 * EditorDialogs — the save-conflict dialog and the PDF preview.
 * Same behaviour as before; moved out of EditorPage and onto the shared Dialog.
 */
import React from 'react'
import { Button, Dialog } from '../../ui/index.js'
import './editor.css'

export function ConflictDialog({ conflict, onKeepMine, onReload, onDownload }) {
  return (
    <Dialog
      title="Projektet er ændret et andet sted"
      width={540}
      actions={<>
        <Button onClick={onDownload}>Gem min version som fil</Button>
        <Button onClick={onReload}>Hent serverens version</Button>
        <Button variant="primary" data-autofocus onClick={onKeepMine}>Behold mine ændringer</Button>
      </>}
    >
      <p>
        {conflict.updatedBy
          ? <>En anden bruger gemte projektet, mens du havde det åbent
              {conflict.updatedAt ? ` (${new Date(conflict.updatedAt).toLocaleString('da-DK')})` : ''}.</>
          : <>Projektet blev gemt et andet sted, sandsynligvis i en anden fane, mens du havde det åbent.</>}
        {' '}Dine ændringer er <strong>ikke</strong> gemt endnu.
      </p>
      <p className="ed-note">Uanset hvad du vælger, gemmes den anden version i versionshistorikken. Intet arbejde går tabt.</p>
    </Dialog>
  )
}

export function PdfPreview({ url, docId, busy, onDownload, onClose }) {
  return (
    <div className="ui-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ed-pdf" role="dialog" aria-modal="true" aria-label={`PDF-forhåndsvisning af ${docId}`}>
        <div className="ed-pdf-head">
          <b>Forhåndsvisning · {docId} (udkast)</b>
          <span className="ed-spacer" />
          <Button size="sm" busy={busy} onClick={onDownload}>Hent PDF</Button>
          <Button size="sm" variant="ghost" icon onClick={onClose} aria-label="Luk">✕</Button>
        </div>
        <iframe src={url} title={`PDF ${docId}`} />
      </div>
    </div>
  )
}
