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
import React, { useRef, useState } from 'react'

/**
 * Compress an image file to JPEG before embedding as base64.
 * Caps the longest dimension at maxDim pixels and applies JPEG quality.
 * SVG files are passed through unchanged (can't canvas-compress vectors).
 * Returns a Promise<string> resolving to a base64 data URL.
 */
function compressImage(file, maxDim = 1920, quality = 0.85) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const src = ev.target.result

      // SVG: pass through as-is — canvas can't rasterise arbitrary SVG
      if (file.type === 'image/svg+xml') {
        resolve(src)
        return
      }

      const img = new window.Image()
      img.onload = () => {
        let { width, height } = img

        // Scale down proportionally if larger than maxDim
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round(height * maxDim / width)
            width  = maxDim
          } else {
            width  = Math.round(width * maxDim / height)
            height = maxDim
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width  = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        // White background so transparent PNGs look right in JPEG output
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => resolve(src)   // fallback: use original if decoding fails
      img.src = src
    }
    reader.readAsDataURL(file)
  })
}

export default function ImageBlock({ block, onChange }) {
  const d = block.data
  const fileInputRef = useRef(null)
  const [compressing, setCompressing] = useState(false)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setCompressing(true)
    try {
      const b64 = await compressImage(file)
      // Rough size in KB for the hint label
      const kb = Math.round(b64.length * 0.75 / 1024)
      update({
        image_b64: b64,
        filename:  `${file.name}  (${kb} KB embedded)`,
      })
    } finally {
      setCompressing(false)
      // Reset so the same file can be re-selected if needed
      e.target.value = ''
    }
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
            style={{ ...styles.smallBtn, opacity: compressing ? 0.5 : 1 }}
            disabled={compressing}
            onClick={() => fileInputRef.current?.click()}
          >
            {compressing ? 'Compressing…' : 'Replace'}
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
      style={{ ...styles.dropZone, cursor: compressing ? 'default' : 'pointer' }}
      onClick={() => !compressing && fileInputRef.current?.click()}
    >
      <div style={styles.dropIcon}>{compressing ? '⏳' : '🖼'}</div>
      <div style={styles.dropText}>
        {compressing ? 'Compressing…' : 'Click to upload an image'}
      </div>
      <div style={styles.dropHint}>PNG, JPG, WebP — auto-compressed to JPEG</div>

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
