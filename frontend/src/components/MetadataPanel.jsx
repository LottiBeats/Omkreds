/**
 * MetadataPanel.jsx — project information form
 *
 * Fields are grouped into three sections:
 *   Project     — name, ref, client, site address, standard, revision
 *   Signatures  — engineer, checker, approver, date, revision description
 *   Firm        — firm name, address, phone, email, CVR (footer of PDF)
 *
 * Save strategy: local state while typing → onSave() on blur.
 */
import React, { useState, useEffect, useRef } from 'react'

/**
 * Compress an image file to JPEG via canvas before storing as base64.
 * Same approach as ImageBlock.jsx — caps the longest dimension at maxDim
 * and applies JPEG quality. SVG is passed through unchanged.
 */
function compressImage(file, maxDim = 1920, quality = 0.85) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const src = ev.target.result
      if (file.type === 'image/svg+xml') { resolve(src); return }
      const img = new window.Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim }
          else                 { width  = Math.round(width  * maxDim / height); height = maxDim }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => resolve(src)
      img.src = src
    }
    reader.readAsDataURL(file)
  })
}

const SECTIONS = [
  {
    title: 'Project',
    hint: 'Appears on the cover page and page header',
    fields: [
      { key: 'project_name', label: 'Project name',      required: true },
      { key: 'project_ref',  label: 'Project reference', hint: 'e.g. 2024-042' },
      { key: 'client',       label: 'Client' },
      { key: 'address',      label: 'Site address / location' },
      { key: 'standard',     label: 'Standard',          hint: 'e.g. DS/EN 1993-1-1' },
    ],
  },
  {
    title: 'Signatures',
    hint: 'Shown in the revision table and page header',
    fields: [
      { key: 'engineer',      label: 'Calculated by' },
      { key: 'checker',       label: 'Checked by' },
      { key: 'approver',      label: 'Approved by' },
      { key: 'date',          label: 'Date',             hint: 'e.g. 2025-05-24' },
      { key: 'revision',      label: 'Revision',         hint: 'e.g. A, B, 01' },
      { key: 'revision_desc', label: 'Revision description', hint: 'e.g. Initial issue' },
    ],
  },
  {
    title: 'Firm',
    hint: 'Appears in the PDF footer on every page',
    fields: [
      { key: 'firm_name',    label: 'Firm name',    hint: 'Also used when no logo is uploaded' },
      { key: 'firm_address', label: 'Firm address' },
      { key: 'phone',        label: 'Phone',        hint: 'e.g. +45 12 34 56 78' },
      { key: 'email',        label: 'Email' },
      { key: 'cvr',          label: 'CVR no.',      hint: 'Danish company registration' },
    ],
  },
]

export default function MetadataPanel({ project, onSave }) {
  const [meta,        setMeta]        = useState(project.metadata)
  const fileInputRef  = useRef(null)
  const [dragOver,    setDragOver]    = useState(false)
  const [compressing, setCompressing] = useState(false)

  useEffect(() => {
    setMeta(project.metadata)
  }, [project.id])

  function handleChange(key, value) {
    setMeta(m => ({ ...m, [key]: value }))
  }

  function handleBlur() {
    onSave(meta)
  }

  // ── Cover image ────────────────────────────────────────────────────────────
  async function handleCoverImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    setCompressing(true)
    try {
      const b64     = await compressImage(file)
      const updated = { ...meta, cover_image_b64: b64 }
      setMeta(updated)
      onSave(updated)
    } finally {
      setCompressing(false)
    }
  }

  function handleCoverImageDrop(e) {
    e.preventDefault()
    setDragOver(false)
    handleCoverImageFile(e.dataTransfer.files[0])
  }

  function clearCoverImage() {
    const updated = { ...meta, cover_image_b64: '' }
    setMeta(updated)
    onSave(updated)
  }

  return (
    <div style={s.wrapper}>
      <div style={s.header}>
        <div style={s.title}>Project Information</div>
        <div style={s.subtitle}>
          This data populates the cover page, page header, and every PDF footer.
        </div>
      </div>

      {SECTIONS.map(section => (
        <div key={section.title} style={s.section}>
          <div style={s.sectionTitle}>{section.title}</div>
          {section.hint && <div style={s.sectionHint}>{section.hint}</div>}
          <div style={s.grid}>
            {section.fields.map(field => (
              <div key={field.key} style={s.field}>
                <label style={s.label}>
                  {field.label}
                  {field.required && <span style={s.required}> *</span>}
                  {field.hint && <span style={s.hint}> — {field.hint}</span>}
                </label>
                <input
                  type="text"
                  value={meta[field.key] ?? ''}
                  onChange={e => handleChange(field.key, e.target.value)}
                  onBlur={handleBlur}
                  style={s.input}
                  placeholder={field.hint || ''}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ── Cover image ─────────────────────────────────────────────────────── */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Cover Image</div>
        <div style={s.sectionHint}>
          Appears on the front page of every PDF export for this project.
          JPG or PNG recommended. Landscape photos work best.
        </div>

        {compressing ? (
          <div style={{ ...s.dropZone, cursor: 'default', borderColor: '#d1d5db' }}>
            <div style={s.dropIcon}>⏳</div>
            <div style={s.dropLabel}>Compressing…</div>
          </div>
        ) : meta.cover_image_b64 ? (
          /* ── Preview state ── */
          <div style={s.imgPreviewWrap}>
            <img
              src={meta.cover_image_b64}
              alt="Cover"
              style={s.imgPreview}
            />
            <div style={s.imgPreviewOverlay}>
              <button
                style={s.imgChangeBtn}
                onClick={() => fileInputRef.current?.click()}
              >
                Change image
              </button>
              <button
                style={{ ...s.imgChangeBtn, background: 'rgba(185,28,28,0.85)' }}
                onClick={clearCoverImage}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          /* ── Drop zone ── */
          <div
            style={{
              ...s.dropZone,
              borderColor: dragOver ? '#1e3a5f' : '#d1d5db',
              background:  dragOver ? '#eff6ff' : '#fafafa',
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleCoverImageDrop}
          >
            <div style={s.dropIcon}>🖼</div>
            <div style={s.dropLabel}>Click or drag an image here</div>
            <div style={s.dropSub}>JPG, PNG, WebP — auto-compressed to JPEG</div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => handleCoverImageFile(e.target.files[0])}
        />
      </div>

      {/* PDF header preview */}
      <div style={s.previewWrap}>
        <div style={s.previewLabel}>PDF header preview</div>
        <div style={s.preview}>
          {/* Mock header table */}
          <div style={s.previewHeader}>
            <div style={s.previewLogo}>
              {meta.firm_name
                ? <span style={{ fontWeight: 700, fontSize: 11 }}>{meta.firm_name}</span>
                : <span style={{ color: '#bbb', fontSize: 10 }}>Logo</span>}
            </div>
            <div style={s.previewInfo}>
              <div style={s.previewRow}>
                <span style={s.previewCell}>
                  <span style={s.previewFieldLabel}>Sag</span>
                  <span style={s.previewFieldValue}>{meta.project_name || '—'}</span>
                </span>
                <span style={{ ...s.previewCell, flex: '0 0 80px' }}>
                  <span style={s.previewFieldLabel}>Sagsnr</span>
                  <span style={s.previewFieldValue}>{meta.project_ref || '—'}</span>
                </span>
              </div>
              <div style={s.previewRow}>
                <span style={s.previewCell}>
                  <span style={s.previewFieldLabel}>Afsnit</span>
                  <span style={s.previewFieldValue}>{meta.standard || meta.project_name || '—'}</span>
                </span>
                <span style={{ ...s.previewCell, flex: '0 0 80px' }}>
                  <span style={s.previewFieldLabel}>Side</span>
                  <span style={s.previewFieldValue}>1 af n</span>
                </span>
              </div>
              <div style={{ ...s.previewRow, fontSize: 9, color: '#666', borderTop: '1px solid #ddd', paddingTop: 3 }}>
                <span>Beregnet: {meta.engineer || '—'}</span>
                <span>Dato: {meta.date || '—'}</span>
                <span>Kontrol: {meta.checker || '—'}</span>
                <span>Rev: {meta.revision || 'A'}</span>
              </div>
            </div>
          </div>
          {/* Footer preview */}
          <div style={s.previewFooter}>
            {[meta.firm_name, meta.firm_address, meta.phone && `Tlf: ${meta.phone}`,
              meta.cvr && `CVR: ${meta.cvr}`, meta.email && `Mail: ${meta.email}`]
              .filter(Boolean).join('    ')}
          </div>
        </div>
      </div>
    </div>
  )
}

const s = {
  wrapper: {
    maxWidth: 640,
    margin: '0 auto',
    padding: '8px 0 60px',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: '#1c1c1e',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#111',
    marginBottom: 2,
    paddingBottom: 6,
    borderBottom: '2px solid #111',
  },
  sectionHint: {
    fontSize: 11,
    color: '#999',
    marginBottom: 12,
    marginTop: 4,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px 20px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: '#555',
    letterSpacing: '0.03em',
  },
  required: {
    color: '#c0392b',
  },
  hint: {
    fontWeight: 400,
    color: '#aaa',
  },
  input: {
    border: '1px solid #e0e0e0',
    padding: '8px 10px',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    color: '#1c1c1e',
    background: '#fff',
  },
  dropZone: {
    border:         '2px dashed #d1d5db',
    padding:        '36px 24px',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            8,
    cursor:         'pointer',
    transition:     'background 0.15s, border-color 0.15s',
  },
  dropIcon: {
    fontSize: 28,
    lineHeight: 1,
  },
  dropLabel: {
    fontSize:   13,
    fontWeight: 600,
    color:      '#374151',
  },
  dropSub: {
    fontSize: 11,
    color:    '#9ca3af',
  },
  imgPreviewWrap: {
    position:   'relative',
    lineHeight: 0,
    overflow:   'hidden',
  },
  imgPreview: {
    width:     '100%',
    maxHeight: 260,
    objectFit: 'cover',
    display:   'block',
  },
  imgPreviewOverlay: {
    position:       'absolute',
    bottom:         0,
    left:           0,
    right:          0,
    display:        'flex',
    gap:            8,
    padding:        '10px 12px',
    background:     'linear-gradient(transparent, rgba(0,0,0,0.55))',
    justifyContent: 'flex-end',
  },
  imgChangeBtn: {
    background:    'rgba(15,23,42,0.75)',
    color:         '#fff',
    border:        'none',
    padding:       '5px 12px',
    fontSize:      11,
    fontWeight:    600,
    cursor:        'pointer',
    letterSpacing: '0.03em',
    fontFamily:    'inherit',
  },
  previewWrap: {
    marginTop: 36,
    paddingTop: 24,
    borderTop: '1px solid #e8e8e8',
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#aaa',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  preview: {
    border: '1px solid #ccc',
    background: '#fff',
    fontSize: 10,
    fontFamily: 'monospace',
    overflow: 'hidden',
  },
  previewHeader: {
    display: 'flex',
    borderBottom: '1px solid #ccc',
  },
  previewLogo: {
    width: 80,
    minHeight: 56,
    borderRight: '1px solid #ccc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f9f9f9',
    padding: 6,
    color: '#aaa',
  },
  previewInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  previewRow: {
    display: 'flex',
    borderBottom: '1px solid #e8e8e8',
    gap: 8,
    padding: '4px 8px',
  },
  previewCell: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  previewFieldLabel: {
    fontSize: 8,
    color: '#aaa',
    lineHeight: 1.2,
  },
  previewFieldValue: {
    fontSize: 10,
    color: '#111',
    fontWeight: 600,
  },
  previewFooter: {
    background: '#f9f9f9',
    borderTop: '1px solid #ccc',
    padding: '5px 10px',
    fontSize: 9,
    color: '#666',
    textAlign: 'center',
    minHeight: 20,
  },
}
