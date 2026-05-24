/**
 * CreateProjectModal.jsx — modal form for creating a new project
 *
 * Replaces the ugly window.prompt() calls in ProjectsPage.
 * Rendered as an overlay on top of everything else.
 *
 * Props:
 *   onCreated — function(newProject) called after successful creation
 *   onCancel  — function() called when user dismisses the modal
 *
 * Usage in ProjectsPage:
 *   {showModal && (
 *     <CreateProjectModal
 *       onCreated={project => navigate(`/projects/${project.id}`)}
 *       onCancel={() => setShowModal(false)}
 *     />
 *   )}
 */
import React, { useState, useEffect, useRef } from 'react'
import { createProject } from '../api/client.js'

export default function CreateProjectModal({ onCreated, onCancel }) {
  const [name,    setName]    = useState('')
  const [ref,     setRef]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

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
    e.preventDefault()   // prevent browser page reload (default form behaviour)
    if (!name.trim()) return

    setLoading(true)
    setError(null)
    try {
      const project = await createProject(name.trim(), ref.trim())
      onCreated(project)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    // Clicking the backdrop (outside the modal box) closes the modal
    <div style={styles.backdrop} onClick={onCancel}>

      {/* stopPropagation so clicks inside the box don't bubble up to the backdrop */}
      <div style={styles.modal} onClick={e => e.stopPropagation()}>

        <div style={styles.header}>
          <div style={styles.title}>New Project</div>
          <button style={styles.closeBtn} onClick={onCancel}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={styles.fields}>

            <div style={styles.field}>
              <label style={styles.label}>
                Project name <span style={styles.required}>*</span>
              </label>
              <input
                ref={firstInputRef}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Rooftop extension, Kongens Nytorv"
                style={styles.input}
                required
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                Project reference
                <span style={styles.optional}> — optional</span>
              </label>
              <input
                type="text"
                value={ref}
                onChange={e => setRef(e.target.value)}
                placeholder="e.g. 2024-042"
                style={styles.input}
              />
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
              Cancel
            </button>
            <button
              type="submit"
              style={{
                ...styles.createBtn,
                opacity: loading || !name.trim() ? 0.5 : 1,
              }}
              disabled={loading || !name.trim()}
            >
              {loading ? 'Creating…' : 'Create project'}
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
    inset:          0,              // shorthand for top/right/bottom/left: 0
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
    marginBottom:   24,
  },
  title: {
    fontSize:   20,
    fontWeight: 700,
  },
  closeBtn: {
    background: 'none',
    border:     'none',
    fontSize:   18,
    color:      '#aaa',
    cursor:     'pointer',
    padding:    '0 4px',
    lineHeight: 1,
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
