/**
 * IssueDocumentModal.jsx — "Udsted dokument"
 *
 * Exporting a PDF and *issuing* a document are different acts.  An export is a
 * draft you look at; an issue is something you hand to a client or a checking
 * engineer, and it has to stay resolvable afterwards.  Issuing therefore:
 *
 *   1. blocks on the calculation-integrity check (stale or unrun calculations),
 *      where a plain export only warns,
 *   2. writes a row into the document's revision history — the table on the
 *      PDF cover page,
 *   3. snapshots the whole project permanently, so the row can be resolved back
 *      to the exact state that produced it.
 *
 * Revisions are per document: A2 rev B has nothing to do with B1 rev A, which
 * is how the documents are delivered and revised in practice.
 */
import { useEffect, useState } from 'react'

const BRAND = '#d94a2b'

/**
 * Suggest the next revision from the last one.
 *   A → B,  Z → AA,  01 → 02,  "" → A
 * Anything else is left to the user.
 */
export function nextRevision(current) {
  const cur = (current || '').trim()
  if (!cur) return 'A'
  if (/^\d+$/.test(cur)) {
    const width = cur.length
    return String(Number(cur) + 1).padStart(width, '0')
  }
  if (/^[A-Z]+$/i.test(cur)) {
    const up = cur.toUpperCase()
    if (up.endsWith('Z')) return 'A'.repeat(up.length + 1)
    return up.slice(0, -1) + String.fromCharCode(up.charCodeAt(up.length - 1) + 1)
  }
  return cur
}

export default function IssueDocumentModal({
  docId,
  docTitle,
  metadata = {},
  revisions = [],
  integrity = { stale: 0, unrun: 0 },
  busy = false,
  onIssue,
  onClose,
}) {
  const lastRev = revisions.length ? revisions[revisions.length - 1].rev : ''
  const [revision,    setRevision]    = useState(nextRevision(lastRev))
  const [description, setDescription] = useState(revisions.length ? '' : 'Første udgave')
  const [override,    setOverride]    = useState(false)
  const [reason,      setReason]      = useState('')

  const problems = (integrity.stale || 0) + (integrity.unrun || 0)
  const blocked  = problems > 0 && !(override && reason.trim())
  const missingSignatures = !metadata.engineer || !metadata.checker
  const canIssue = !busy && !blocked && revision.trim() && description.trim()

  // Enter submits from any field; the button is the only other way in.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  function submit() {
    if (!canIssue) return
    onIssue({
      revision:    revision.trim(),
      description: description.trim(),
      ...(override && reason.trim() ? { override_reason: reason.trim() } : {}),
    })
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div style={S.modal}>

        <div style={S.header}>
          <div>
            <div style={S.title}>Udsted dokument</div>
            <div style={S.subtitle}>{docId} — {docTitle}</div>
          </div>
          <button style={S.closeBtn} onClick={onClose} disabled={busy}>✕</button>
        </div>

        <div style={S.body}>

          {/* Integrity — the reason issuing is a separate action from exporting */}
          {problems === 0 ? (
            <div style={S.ok}>
              ✓ Alle beregninger i dokumentet er kørt og opdaterede.
            </div>
          ) : (
            <div style={S.warn}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Dokumentet er ikke klar til udstedelse
              </div>
              <ul style={S.list}>
                {integrity.stale > 0 && (
                  <li>{integrity.stale} beregning{integrity.stale > 1 ? 'er' : ''} har
                      ændrede input siden sidste kørsel</li>
                )}
                {integrity.unrun > 0 && (
                  <li>{integrity.unrun} beregning{integrity.unrun > 1 ? 'er' : ''} er
                      ikke kørt endnu</li>
                )}
              </ul>
              <label style={S.checkRow}>
                <input
                  type="checkbox"
                  checked={override}
                  onChange={e => setOverride(e.target.checked)}
                />
                <span>Udsted alligevel — jeg har en begrundelse</span>
              </label>
              {override && (
                <input
                  style={{ ...S.input, marginTop: 8 }}
                  placeholder="Begrundelse (gemmes i revisionshistorikken)"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  maxLength={200}
                />
              )}
            </div>
          )}

          <div style={S.fieldRow}>
            <label style={{ ...S.field, flex: '0 0 90px' }}>
              <span style={S.label}>Revision</span>
              <input
                style={S.input}
                value={revision}
                onChange={e => setRevision(e.target.value)}
                maxLength={8}
                autoFocus
              />
            </label>
            <label style={{ ...S.field, flex: 1 }}>
              <span style={S.label}>Beskrivelse</span>
              <input
                style={S.input}
                value={description}
                onChange={e => setDescription(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit() }}
                placeholder="fx “Tilføjet hanebånd, opdateret snelast”"
                maxLength={200}
              />
            </label>
          </div>

          {/* These two names go into the revision row and the page header */}
          <div style={S.sigRow}>
            <div><span style={S.sigLabel}>Udarbejdet af</span> {metadata.engineer || '—'}</div>
            <div><span style={S.sigLabel}>Kontrolleret af</span> {metadata.checker || '—'}</div>
          </div>
          {missingSignatures && (
            <div style={S.note}>
              Udfyld udarbejdet af / kontrolleret af under projektoplysninger —
              de trykkes i revisionstabellen og i sidehovedet.
            </div>
          )}

          {revisions.length > 0 && (
            <div style={S.history}>
              <div style={S.historyTitle}>Tidligere udstedelser af {docId}</div>
              {[...revisions].reverse().slice(0, 4).map((r, i) => (
                <div key={i} style={S.historyRow}>
                  <span style={S.historyRev}>{r.rev}</span>
                  <span style={{ color: '#94a3b8' }}>{r.date}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{r.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={S.footer}>
          <button style={S.ghostBtn} onClick={onClose} disabled={busy}>Annullér</button>
          <button
            style={{ ...S.primaryBtn, opacity: canIssue ? 1 : 0.45, cursor: canIssue ? 'pointer' : 'not-allowed' }}
            onClick={submit}
            disabled={!canIssue}
          >
            {busy ? 'Udsteder…' : 'Udsted og hent PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2300,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    width: 'min(560px, 94vw)', maxHeight: '88vh', background: '#fff',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 80px rgba(0,0,0,0.35)', borderTop: `3px solid ${BRAND}`,
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '16px 20px 12px', borderBottom: '1px solid #e5e7eb',
  },
  title:    { fontSize: 15, fontWeight: 700, color: '#1c1c1e' },
  subtitle: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 15, cursor: 'pointer',
    color: '#64748b', fontFamily: 'inherit', padding: 4,
  },
  body: { padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 },
  ok: {
    fontSize: 12, color: '#15803d', background: '#f0fdf4',
    border: '1px solid #bbf7d0', borderLeft: '3px solid #16a34a', padding: '9px 12px',
  },
  warn: {
    fontSize: 12, color: '#b45309', background: '#fffbeb',
    border: '1px solid #fde68a', borderLeft: '3px solid #f59e0b', padding: '10px 12px',
  },
  list: { margin: '0 0 8px', paddingLeft: 18, lineHeight: 1.6 },
  checkRow: { display: 'flex', gap: 7, alignItems: 'center', fontSize: 12, cursor: 'pointer' },
  fieldRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 90 },
  label: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#64748b' },
  input: {
    padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit',
    border: '1px solid #d1d5db', background: '#fff', color: '#1c1c1e', width: '100%',
    boxSizing: 'border-box',
  },
  sigRow: { display: 'flex', gap: 24, fontSize: 12, color: '#1c1c1e', flexWrap: 'wrap' },
  sigLabel: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#64748b', marginRight: 6 },
  note: { fontSize: 11, color: '#b45309', lineHeight: 1.5, marginTop: -6 },
  history: { borderTop: '1px solid #f1f5f9', paddingTop: 12 },
  historyTitle: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#64748b', marginBottom: 8 },
  historyRow: { display: 'flex', gap: 10, fontSize: 12, color: '#475569', padding: '3px 0' },
  historyRev: { fontWeight: 700, color: '#1c1c1e', minWidth: 22 },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 8,
    padding: '12px 20px', borderTop: '1px solid #e5e7eb', background: '#f8fafc',
  },
  primaryBtn: {
    background: BRAND, color: '#fff', border: 'none', padding: '9px 18px',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', fontFamily: 'inherit',
  },
  ghostBtn: {
    background: '#fff', color: '#475569', border: '1px solid #d1d5db',
    padding: '9px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
