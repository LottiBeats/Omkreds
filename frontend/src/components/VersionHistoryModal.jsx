/**
 * VersionHistoryModal.jsx — "Versionshistorik"
 *
 * Every save snapshots the previous state on the server (throttled to one
 * automatic snapshot per 15 min).  This panel lists those snapshots and lets
 * the user roll the project back to any of them.
 *
 * A restore is itself snapshotted first, so it can always be undone — that is
 * what makes it safe to offer the button at all.
 */
import { useEffect, useState } from 'react'
import { getVersions, createVersion, restoreVersion } from '../api/client.js'

const BRAND = '#d94a2b'

// Snapshot kinds, in the user's language.  'auto' is the common case and is
// deliberately quiet; the explicit kinds are what the user goes looking for.
const KIND_LABELS = {
  auto:          { text: 'Automatisk',        color: '#94a3b8' },
  manual:        { text: 'Gemt version',      color: BRAND },
  issue:         { text: 'Udstedt dokument',  color: '#15803d' },
  'pre-restore': { text: 'Før gendannelse',   color: '#b45309' },
  'pre-delete':  { text: 'Ved sletning',      color: '#dc2626' },
}

function formatWhen(iso) {
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    const time = d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
    if (sameDay) return `I dag ${time}`
    return `${d.toLocaleDateString('da-DK', { day: '2-digit', month: 'short' })} ${time}`
  } catch {
    return iso
  }
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function VersionHistoryModal({ projectId, onClose, onRestored }) {
  const [versions, setVersions] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [busy,     setBusy]     = useState('')     // version id being restored
  const [confirmId, setConfirmId] = useState(null) // restore needs one confirmation
  const [label,    setLabel]    = useState('')

  async function load() {
    try {
      setLoading(true)
      setVersions(await getVersions(projectId))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId])

  async function handleSaveVersion() {
    try {
      setBusy('new')
      await createVersion(projectId, label.trim())
      setLabel('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function handleRestore(versionId) {
    try {
      setBusy(versionId)
      const restored = await restoreVersion(projectId, versionId)
      onRestored?.(restored)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy('')
    }
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>

        <div style={S.header}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>🕘 Versionshistorik</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Save a named version — the entry point for "this is the one we issued" */}
        <div style={S.newRow}>
          <input
            style={S.input}
            placeholder="Navngiv den nuværende tilstand, fx “Til kontrol hos JHN”"
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveVersion() }}
            maxLength={120}
          />
          <button
            style={{ ...S.primaryBtn, opacity: busy === 'new' ? 0.6 : 1 }}
            onClick={handleSaveVersion}
            disabled={busy === 'new'}
          >
            {busy === 'new' ? 'Gemmer…' : 'Gem version'}
          </button>
        </div>

        <div style={S.body}>
          {error && <div style={S.error}>{error}</div>}

          {loading ? (
            <div style={S.empty}>Henter historik…</div>
          ) : versions.length === 0 ? (
            <div style={S.empty}>
              Ingen tidligere versioner endnu. Der gemmes automatisk et
              øjebliksbillede, første gang du ændrer projektet efter en pause.
            </div>
          ) : (
            versions.map(v => {
              const kind = KIND_LABELS[v.kind] ?? KIND_LABELS.auto
              const isConfirming = confirmId === v.id
              return (
                <div key={v.id} style={S.row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.when}>
                      {formatWhen(v.created_at)}
                      <span style={{ ...S.kind, color: kind.color }}>{kind.text}</span>
                    </div>
                    <div style={S.meta}>
                      {v.label ? `${v.label} · ` : ''}rev {v.rev}
                      {v.size_bytes ? ` · ${formatSize(v.size_bytes)}` : ''}
                    </div>
                  </div>

                  {isConfirming ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      <span style={S.confirmText}>Erstat nuværende?</span>
                      <button
                        style={{ ...S.primaryBtn, opacity: busy === v.id ? 0.6 : 1 }}
                        onClick={() => handleRestore(v.id)}
                        disabled={busy === v.id}
                      >
                        {busy === v.id ? 'Gendanner…' : 'Ja, gendan'}
                      </button>
                      <button style={S.ghostBtn} onClick={() => setConfirmId(null)}>
                        Fortryd
                      </button>
                    </div>
                  ) : (
                    <button
                      style={{ ...S.ghostBtn, flexShrink: 0 }}
                      onClick={() => setConfirmId(v.id)}
                    >
                      Gendan
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div style={S.footer}>
          Den nuværende tilstand gemmes automatisk, før en gendannelse
          gennemføres — du kan altid gå tilbage igen.
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    width: 'min(680px, 92vw)', maxHeight: '82vh', background: '#fff',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 80px rgba(0,0,0,0.35)', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid #e5e7eb', background: '#f8fafc',
  },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 15, cursor: 'pointer',
    color: '#64748b', fontFamily: 'inherit', padding: 4,
  },
  newRow: {
    display: 'flex', gap: 8, padding: '12px 16px',
    borderBottom: '1px solid #e5e7eb',
  },
  input: {
    flex: 1, padding: '7px 10px', fontSize: 12, fontFamily: 'inherit',
    border: '1px solid #d1d5db', background: '#fff', color: '#1c1c1e',
  },
  primaryBtn: {
    background: BRAND, color: '#fff', border: 'none', padding: '7px 14px',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
  },
  ghostBtn: {
    background: '#fff', color: '#475569', border: '1px solid #d1d5db',
    padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  body: { flex: 1, overflowY: 'auto', padding: '4px 0' },
  row: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
    borderBottom: '1px solid #f1f5f9',
    // The confirm state adds three controls to the row; on a narrow modal they
    // wrap under the label instead of colliding with it.
    flexWrap: 'wrap',
  },
  when: { fontSize: 12, fontWeight: 600, color: '#1c1c1e', display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' },
  kind: { fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' },
  meta: { fontSize: 11, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  confirmText: { fontSize: 11, color: '#b45309', fontWeight: 600 },
  empty: { padding: '28px 20px', fontSize: 12, color: '#94a3b8', textAlign: 'center', lineHeight: 1.6 },
  error: {
    margin: '10px 16px', padding: '8px 12px', fontSize: 12, color: '#dc2626',
    background: '#fef2f2', border: '1px solid #fecaca', borderLeft: '3px solid #dc2626',
  },
  footer: {
    padding: '10px 16px', borderTop: '1px solid #e5e7eb', background: '#f8fafc',
    fontSize: 11, color: '#94a3b8', lineHeight: 1.5,
  },
}
