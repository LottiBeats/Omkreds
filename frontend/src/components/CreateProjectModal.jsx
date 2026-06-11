/**
 * CreateProjectModal.jsx — modal form for creating a new project
 *
 * Two modes:
 *   Blank project   — default, same as before
 *   From template   — pass { templateId, templateName } props to pre-select a template
 *
 * Props:
 *   onCreated       — function(newProject) called after successful creation
 *   onCancel        — function() called when user dismisses the modal
 *   templateId      — (optional) ID of the template to clone from
 *   templateName    — (optional) display name for the template
 */
import React, { useState, useEffect, useRef } from 'react'
import { createProject, createProjectFromTemplate } from '../api/client.js'

const BRAND = '#d94a2b'

export default function CreateProjectModal({ onCreated, onCancel, templateId = null, templateName = '' }) {
  const [name,       setName]       = useState('')
  const [ref,        setRef]        = useState('')
  const [visibility, setVisibility] = useState('team')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)

  const isFromTemplate = Boolean(templateId)

  // Auto-focus the first field when the modal opens
  const firstInputRef = useRef(null)
  useEffect(() => {
    firstInputRef.current?.focus()
  }, [])

  // Allow closing the modal by pressing Escape
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)
    try {
      let project
      if (isFromTemplate) {
        project = await createProjectFromTemplate(templateId, name.trim(), ref.trim(), visibility)
      } else {
        project = await createProject(name.trim(), ref.trim(), visibility)
      }
      onCreated(project)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={styles.backdrop} onClick={onCancel}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>

        <div style={styles.header}>
          <div style={styles.title}>
            {isFromTemplate ? 'Nyt projekt fra skabelon' : 'Nyt projekt'}
          </div>
          <button style={styles.closeBtn} onClick={onCancel}>✕</button>
        </div>

        {/* Template badge */}
        {isFromTemplate && (
          <div style={styles.templateBadge}>
            <span style={styles.templateBadgeIcon}>📋</span>
            <div>
              <div style={styles.templateBadgeName}>{templateName || 'Skabelon'}</div>
              <div style={styles.templateBadgeHint}>
                Dokumentstrukturen kopieres — udfyld projektoplysningerne nedenfor
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={styles.fields}>

            <div style={styles.field}>
              <label style={styles.label}>
                Projektnavn <span style={styles.required}>*</span>
              </label>
              <input
                ref={firstInputRef}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="fx Tagudvidelse, Kongens Nytorv"
                style={styles.input}
                required
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                Projektreference
                <span style={styles.optional}> — valgfri</span>
              </label>
              <input
                type="text"
                value={ref}
                onChange={e => setRef(e.target.value)}
                placeholder="fx 2024-042"
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Synlighed</label>
              <select
                value={visibility}
                onChange={e => setVisibility(e.target.value)}
                style={styles.input}
              >
                <option value="team">Team — synligt for alle i firmaet</option>
                <option value="personal">Privat — kun synligt for dig</option>
              </select>
            </div>

          </div>

          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.actions}>
            <button
              type="button"
              style={styles.cancelBtn}
              onClick={onCancel}
              disabled={loading}
            >
              Annullér
            </button>
            <button
              type="submit"
              style={{
                ...styles.createBtn,
                opacity: loading || !name.trim() ? 0.5 : 1,
              }}
              disabled={loading || !name.trim()}
            >
              {loading
                ? 'Opretter…'
                : (isFromTemplate ? 'Opret fra skabelon' : 'Opret projekt')}
            </button>
          </div>
        </form>

      </div>
    </div>
  )
}

const styles = {
  backdrop: {
    position:       'fixed',
    inset:          0,
    background:     'rgba(0,0,0,0.4)',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    zIndex:         1000,
  },
  modal: {
    background:   '#fff',
    width:        480,
    maxWidth:     '90vw',
    padding:      '28px 28px 24px',
    boxShadow:    '0 20px 60px rgba(0,0,0,0.2)',
  },
  header: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   20,
  },
  title: {
    fontSize:   20,
    fontWeight: 700,
  },
  closeBtn: {
    background: 'none',
    border:     'none',
    fontSize:   16,
    color:      '#aaa',
    cursor:     'pointer',
    padding:    '0 4px',
    lineHeight: 1,
  },
  templateBadge: {
    display:      'flex',
    alignItems:   'flex-start',
    gap:          10,
    background:   '#fff7ed',
    border:       '1px solid #fed7aa',
    borderLeft:   `3px solid ${BRAND}`,
    padding:      '10px 12px',
    marginBottom: 20,
  },
  templateBadgeIcon: {
    fontSize:   18,
    lineHeight: 1,
    flexShrink: 0,
    marginTop:  1,
  },
  templateBadgeName: {
    fontSize:     13,
    fontWeight:   700,
    color:        '#1c1c1e',
    marginBottom: 2,
  },
  templateBadgeHint: {
    fontSize: 11,
    color:    '#6b7280',
  },
  fields: {
    display:       'flex',
    flexDirection: 'column',
    gap:           16,
    marginBottom:  20,
  },
  field: {
    display:       'flex',
    flexDirection: 'column',
    gap:           6,
  },
  label: {
    fontSize:   12,
    fontWeight: 600,
    color:      '#444',
  },
  required: {
    color: '#c0392b',
  },
  optional: {
    fontWeight: 400,
    color:      '#aaa',
  },
  input: {
    border:     '1px solid #e8e8e8',
    padding:    '10px 12px',
    fontSize:   14,
    fontFamily: 'inherit',
    outline:    'none',
    color:      '#1c1c1e',
  },
  error: {
    background:   '#fdf3f2',
    border:       '1px solid #f5c6c6',
    color:        '#c0392b',
    padding:      '10px 12px',
    fontSize:     13,
    marginBottom: 16,
  },
  actions: {
    display:        'flex',
    justifyContent: 'flex-end',
    gap:            10,
  },
  cancelBtn: {
    background: 'none',
    border:     '1px solid #e8e8e8',
    padding:    '9px 18px',
    fontSize:   13,
    fontFamily: 'inherit',
    cursor:     'pointer',
    color:      '#555',
  },
  createBtn: {
    background:  '#111',
    color:       '#fff',
    border:      'none',
    padding:     '9px 20px',
    fontSize:    13,
    fontWeight:  700,
    fontFamily:  'inherit',
    cursor:      'pointer',
    letterSpacing: '0.04em',
  },
}
