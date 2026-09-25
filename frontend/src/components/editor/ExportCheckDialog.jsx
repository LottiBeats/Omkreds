/**
 * ExportCheckDialog — "these calculations don't match their inputs".
 *
 * Replaces the native confirm() that only gave counts. Each calculation is
 * named and links straight to it, so the fix is one click away.
 */
import React from 'react'
import { Button, Dialog } from '../../ui/index.js'
import './editor.css'

export function ProblemList({ problems, docId, onJump }) {
  return (
    <ul className="ed-problems">
      {problems.map(p => (
        <li key={`${p.sub}:${p.id}`}>
          <span className={`ui-pill ui-pill--${p.kind === 'stale' ? 'warn' : 'idle'}`}>
            {p.kind === 'stale' ? 'Forældet' : 'Ikke kørt'}
          </span>
          <span>
            <button className="ed-link" onClick={() => onJump(p)}>
              {p.sub !== null ? `${docId}.${p.sub + 1} · ` : ''}{p.name}
            </button>
            <small>{p.reason}</small>
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function ExportCheckDialog({ docId, problems, what, onConfirm, onJump, onClose }) {
  return (
    <Dialog
      title={`${docId} har beregninger, der ikke er opdaterede`}
      width={560}
      onClose={onClose}
      actions={<>
        <Button onClick={onClose}>Annullér</Button>
        <Button variant="primary" data-autofocus onClick={onConfirm}>{what} alligevel</Button>
      </>}
    >
      <p>Rapporten kan vise resultater, der ikke svarer til de angivne input. Kør dem først, eller hent et udkast alligevel.</p>
      <ProblemList problems={problems} docId={docId} onJump={(p) => { onClose(); onJump(p) }} />
    </Dialog>
  )
}
