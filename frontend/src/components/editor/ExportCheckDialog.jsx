/**
 * ExportCheckDialog — "this document isn't finished": stale or unrun
 * calculations and unfilled template fields.
 *
 * Replaces the native confirm() that only gave counts. Each calculation is
 * named and links straight to it, so the fix is one click away.
 */
import React from 'react'
import { Button, Dialog } from '../../ui/index.js'
import './editor.css'

const KIND = {
  stale:   { tone: 'warn', label: 'Forældet' },
  unrun:   { tone: 'idle', label: 'Ikke kørt' },
  missing: { tone: 'warn', label: 'Mangler' },
}

export function ProblemList({ problems, docId, onJump }) {
  return (
    <ul className="ed-problems">
      {problems.map(p => (
        <li key={`${p.kind}:${p.sub}:${p.id}`}>
          <span className={`ui-pill ui-pill--${KIND[p.kind].tone}`}>{KIND[p.kind].label}</span>
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
      title={`${docId} er ikke helt færdigt`}
      width={560}
      onClose={onClose}
      actions={<>
        <Button onClick={onClose}>Annullér</Button>
        <Button variant="primary" data-autofocus onClick={onConfirm}>{what} alligevel</Button>
      </>}
    >
      <p>
        {problems.some(p => p.kind !== 'missing') && 'Rapporten kan vise resultater, der ikke svarer til de angivne input. '}
        {problems.some(p => p.kind === 'missing') && 'Der står stadig felter fra skabelonen, som ikke er udfyldt. '}
        Ret dem først, eller hent et udkast alligevel.
      </p>
      <ProblemList problems={problems} docId={docId} onJump={(p) => { onClose(); onJump(p) }} />
    </Dialog>
  )
}
