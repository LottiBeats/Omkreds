/**
 * ImageBlock.jsx — billede i dokumentet, som man kender det fra Word.
 *
 * Et billede kommer ind ved klik, ved at trække en fil hertil eller med
 * Ctrl+V (skærmklip fra udklipsholderen). Størrelsen ændres ved at trække i
 * hjørnet, og billedet kan stå til venstre, i midten eller til højre.
 * Billedteksten får automatisk "Figur n" foran i PDF og Word; nummeret regnes
 * ved eksport (backend/figurer.py), så det altid passer med rækkefølgen.
 *
 * Billedet gemmes som data-URL i blokken og følger med projektet.
 *
 * Data: { image_b64, caption, width_pct, align: 'left'|'center'|'right', numbered, filename }
 */
import React, { useRef, useState } from 'react'
import './ImageBlock.css'

const MAX_DIM = 1920

/**
 * Skalerer billedet ned til højst MAX_DIM px på den lange led.
 * Tegninger og skærmklip (PNG) forbliver PNG, så streger ikke bliver grødet
 * af JPEG -- medmindre filen bliver stor; fotos bliver JPEG.
 */
export function compressImage(file, maxDim = MAX_DIM, quality = 0.85) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const src = ev.target.result
      if (file.type === 'image/svg+xml') { resolve(src); return }
      const img = new window.Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          const k = maxDim / Math.max(width, height)
          width = Math.round(width * k); height = Math.round(height * k)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        if (file.type === 'image/png') {
          const png = canvas.toDataURL('image/png')
          if (png.length < 1_500_000) { resolve(png); return }
        }
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => resolve(src)
      img.src = src
    }
    reader.readAsDataURL(file)
  })
}

function imageFromTransfer(dt) {
  if (!dt) return null
  for (const item of dt.items ?? []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile()
  }
  for (const f of dt.files ?? []) if (f.type.startsWith('image/')) return f
  return null
}

const ALIGN = [
  { v: 'left',   label: 'Venstre', icon: <svg viewBox="0 0 16 16"><path d="M2 3h12M2 6.5h7M2 10h12M2 13.5h7" /></svg> },
  { v: 'center', label: 'Midt',    icon: <svg viewBox="0 0 16 16"><path d="M2 3h12M4.5 6.5h7M2 10h12M4.5 13.5h7" /></svg> },
  { v: 'right',  label: 'Højre',   icon: <svg viewBox="0 0 16 16"><path d="M2 3h12M7 6.5h7M2 10h12M7 13.5h7" /></svg> },
]

export default function ImageBlock({ block, onChange, isSelected, figNo }) {
  const d = block.data
  const fileRef = useRef(null)
  const boxRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [dragPct, setDragPct] = useState(null)

  const width = dragPct ?? d.width_pct ?? 100
  const align = d.align ?? 'center'
  const numbered = d.numbered ?? true

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  async function take(file) {
    if (!file) return
    setBusy(true)
    try {
      const b64 = await compressImage(file)
      const kb = Math.round(b64.length * 0.75 / 1024)
      const name = file.name && file.name !== 'image.png' ? file.name : 'Indsat billede'
      update({ image_b64: b64, filename: `${name} · ${kb} KB` })
    } finally { setBusy(false) }
  }

  function onPaste(e) {
    const f = imageFromTransfer(e.clipboardData)
    if (f) { e.preventDefault(); take(f) }
  }
  function onDrop(e) {
    e.preventDefault(); setOver(false)
    take(imageFromTransfer(e.dataTransfer))
  }
  const dragProps = {
    onDragOver: e => { e.preventDefault(); setOver(true) },
    onDragLeave: () => setOver(false),
    onDrop,
  }

  // Træk i hjørnet: bredden i procent af spalten, i trin á 5 %.
  function startResize(e, side) {
    e.preventDefault(); e.stopPropagation()
    const box = boxRef.current; if (!box) return
    const colW = box.parentElement.getBoundingClientRect().width
    const startX = e.clientX
    const startW = box.getBoundingClientRect().width
    // Et centreret billede vokser til begge sider, så musen flytter dobbelt.
    const k = (align === 'center' ? 2 : 1) * (side === 'left' ? -1 : 1)
    let pct = width
    const move = ev => {
      const w = startW + k * (ev.clientX - startX)
      pct = Math.max(10, Math.min(100, Math.round((w / colW) * 100 / 5) * 5))
      setDragPct(pct)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragPct(null)
      update({ width_pct: pct })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const fileInput = (
    <input ref={fileRef} type="file" accept="image/*" hidden
      onChange={e => { take(e.target.files?.[0]); e.target.value = '' }} />
  )

  if (!d.image_b64) {
    return (
      <div className={'imgb-drop' + (over ? ' over' : '')} tabIndex={0} role="button"
        aria-label="Indsæt billede"
        onClick={() => !busy && fileRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
        onPaste={onPaste} {...dragProps}>
        <svg className="imgb-drop-ico" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m4 18 5-5 4 4 3-3 4 4" />
        </svg>
        <div className="imgb-drop-t">{busy ? 'Indsætter…' : 'Klik for at vælge et billede'}</div>
        <div className="imgb-drop-h">eller træk en fil hertil · eller markér feltet og tryk Ctrl+V</div>
        {fileInput}
      </div>
    )
  }

  return (
    <div className={`imgb imgb-${align}` + (isSelected ? ' sel' : '') + (over ? ' over' : '')}
      onPaste={onPaste} {...dragProps}>

      <div className="imgb-col">
        <div ref={boxRef} className="imgb-box" style={{ width: `${width}%` }} tabIndex={0}
          aria-label="Billede — tryk Ctrl+V for at erstatte">
          <img src={d.image_b64} alt={d.caption ?? ''} draggable={false} />
          <span className="imgb-h l" onPointerDown={e => startResize(e, 'left')} aria-hidden="true" />
          <span className="imgb-h r" onPointerDown={e => startResize(e, 'right')} aria-hidden="true" />
          {dragPct != null && <span className="imgb-pct">{dragPct} %</span>}
        </div>
      </div>

      <div className="imgb-cap">
        {numbered && <span className="imgb-fig">Figur {figNo ?? ''}</span>}
        <input type="text" value={d.caption ?? ''} onChange={e => update({ caption: e.target.value })}
          placeholder="Skriv en billedtekst…" aria-label="Billedtekst"
          style={{ width: `${Math.max(22, (d.caption ?? '').length + 2)}ch` }} />
      </div>

      {isSelected && <div className="imgb-bar" role="toolbar" aria-label="Billede">
        <div className="imgb-grp">
          {ALIGN.map(a => (
            <button key={a.v} type="button" title={a.label} aria-label={a.label}
              className={align === a.v ? 'on' : ''} onClick={() => update({ align: a.v })}>{a.icon}</button>
          ))}
        </div>
        <div className="imgb-grp">
          {[25, 50, 75, 100].map(p => (
            <button key={p} type="button" className={'txt' + ((d.width_pct ?? 100) === p ? ' on' : '')}
              onClick={() => update({ width_pct: p })}>{p} %</button>
          ))}
        </div>
        <label className="imgb-num" title="Sæt “Figur n” foran billedteksten i rapporten">
          <input type="checkbox" checked={numbered} onChange={e => update({ numbered: e.target.checked })} />
          Figurnummer
        </label>
        <span className="imgb-sp" />
        <button type="button" className="txt" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Indsætter…' : 'Erstat'}
        </button>
        <button type="button" className="txt danger"
          onClick={() => update({ image_b64: null, filename: null })}>Fjern</button>
      </div>}
      {isSelected && d.filename && <div className="imgb-file">{d.filename}</div>}
      {fileInput}
    </div>
  )
}
