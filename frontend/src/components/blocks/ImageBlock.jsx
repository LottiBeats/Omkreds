/**
 * ImageBlock.jsx — image embed block
 *
 * Lets the user upload an image (PNG, JPG, GIF, WebP, SVG).
 * The image is stored as a base64 data URL inside the block data,
 * so it travels with the project JSON — no separate file uploads needed.
 *
 * Trade-off: large images make the project JSON file bigger.
 * For a real multi-user production app you'd upload to object storage
 * (S3, Azure Blob, etc.) and store just the URL. For office use this is fine.
 *
 * Props:
 *   block    — { id, type: "image", data: { image_b64, caption, width_pct } }
 *   onChange — function(updatedBlock)
 */
import React, { useRef } from 'react'

export default function ImageBlock({ block, onChange }) {
  const d = block.data
  const fileInputRef = useRef(null)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    // FileReader converts the file to a base64 data URL.
    // This runs asynchronously — the onload callback fires when done.
    const reader = new FileReader()
    reader.onload = (ev) => {
      update({
        image_b64: ev.target.result,   // e.g. "data:image/png;base64,iVBO..."
        filename:  file.name,
      })
    }
    reader.readAsDataURL(file)
  }

  // If we have an image, show it + controls
  if (d.image_b64) {
    return (
      <div style={styles.wrapper}>
        <img
          src={d.image_b64}
          alt={d.caption ?? ''}
          style={{
            ...styles.image,
            width: `${d.width_pct ?? 100}%`,
          }}
        />

        {/* Caption */}
        <input
          type="text"
          value={d.caption ?? ''}
          onChange={e => update({ caption: e.target.value })}
          placeholder="Caption (optional)"
          style={styles.captionInput}
        />

        {/* Width slider */}
        <div style={styles.controls}>
          <label style={styles.controlLabel}>
            Width: {d.width_pct ?? 100}%
          </label>
          <input
            type="range"
            min={20} max={100} step={5}
            value={d.width_pct ?? 100}
            onChange={e => update({ width_pct: Number(e.target.value) })}
            style={styles.slider}
          />

          {/* Replace / remove */}
          <button
            style={styles.smallBtn}
            onClick={() => fileInputRef.current?.click()}
          >
            Replace
          </button>
          <button
            style={{ ...styles.smallBtn, ...styles.removeBtn }}
            onClick={() => update({ image_b64: null, filename: null, caption: '' })}
          >
            Remove
          </button>
        </div>

        {d.filename && (
          <div style={styles.filename}>{d.filename}</div>
        )}

        {/* Hidden file input — triggered by the Replace button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    )
  }

  // No image yet — show a drop zone / click-to-upload area
  return (
    <div
      style={styles.dropZone}
      onClick={() => fileInputRef.current?.click()}
    >
      <div style={styles.dropIcon}>🖼</div>
      <div style={styles.dropText}>Click to upload an image</div>
      <div style={styles.dropHint}>PNG, JPG, SVG, WebP</div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  )
}

const styles = {
  wrapper: {
    display:       'flex',
    flexDirection: 'column',
    gap:           8,
    alignItems:    'flex-start',
  },
  image: {
    display:   'block',
    maxWidth:  '100%',
    border:    '1px solid #e8e8e8',
  },
  captionInput: {
    border:     '1px solid #e8e8e8',
    padding:    '5px 10px',
    fontSize:   12,
    fontFamily: 'inherit',
    outline:    'none',
    color:      '#555',
    width:      '100%',
    background: '#fafafa',
    fontStyle:  'italic',
  },
  controls: {
    display:    'flex',
    alignItems: 'center',
    gap:        10,
    flexWrap:   'wrap',
  },
  controlLabel: {
    fontSize: 11,
    color:    '#888',
    minWidth: 70,
  },
  slider: {
    flex:    1,
    minWidth: 80,
    maxWidth: 200,
  },
  smallBtn: {
    background:  'none',
    border:      '1px solid #e8e8e8',
    padding:     '3px 10px',
    fontSize:    11,
    cursor:      'pointer',
    fontFamily:  'inherit',
    color:       '#555',
  },
  removeBtn: {
    color:       '#c0392b',
    border:      '1px solid #f5c6c6',
  },
  filename: {
    fontSize: 10,
    color:    '#bbb',
    fontFamily: 'monospace',
  },
  dropZone: {
    border:         '2px dashed #e8e8e8',
    padding:        '40px 24px',
    textAlign:      'center',
    cursor:         'pointer',
    background:     '#fafafa',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            6,
  },
  dropIcon: {
    fontSize: 32,
  },
  dropText: {
    fontSize:   13,
    fontWeight: 600,
    color:      '#555',
  },
  dropHint: {
    fontSize: 11,
    color:    '#aaa',
  },
}
