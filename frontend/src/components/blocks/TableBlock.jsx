/**
 * TableBlock.jsx — editable table for structural documentation
 *
 * Data shape:
 *   {
 *     caption:         string          — table caption (shown above)
 *     has_header:      boolean         — style first row as header
 *     rows:            string[][]      — 2-D array of cell text
 *     highlighted:     string[]        — selected cells as "ri,ci" keys (persisted)
 *   }
 *
 * Interactions:
 *   Click cell → edit inline
 *   Tab / Shift+Tab → move between cells
 *   Enter in last row → add a new row
 *   Backspace on empty last row → delete it
 *
 *   Highlight mode (✦ button in toolbar):
 *   Click any cell → toggle yellow highlight (persisted in data)
 *   Click again → deselect
 */
import React, { useState, useRef, useCallback } from 'react'

const HDR_BG        = '#f0f0f0'
const HDR_TEXT      = '#111'
const HIGHLIGHT_BG  = '#fef08a'   // yellow — matches engineering PDF style
const HIGHLIGHT_BDR = '#ca8a04'   // amber border for selected cells

export default function TableBlock({ block, onChange }) {
  const data        = block.data ?? {}
  const caption     = data.caption     ?? ''
  const has_header  = data.has_header  ?? true
  const rows        = data.rows        ?? [['Kolonne 1', 'Kolonne 2'], ['', '']]
  const highlighted = data.highlighted ?? []   // persisted: ["ri,ci", ...]

  const numCols = rows[0]?.length ?? 2

  // Local UI state — not persisted
  const [selectMode, setSelectMode] = useState(false)

  // ── mutations ──────────────────────────────────────────────────────────────
  function upd(patch) { onChange({ ...block, data: { ...data, ...patch } }) }

  function setCaption(v)   { upd({ caption: v }) }
  function setHasHeader(v) { upd({ has_header: v }) }

  function setCell(ri, ci, v) {
    const next = rows.map((r, i) =>
      i === ri ? r.map((c, j) => j === ci ? v : c) : [...r]
    )
    upd({ rows: next })
  }

  function addRow() {
    upd({ rows: [...rows, Array(numCols).fill('')] })
  }

  function deleteRow(ri) {
    if (rows.length <= 1) return
    // also remove highlights for deleted row
    const nextHL = highlighted.filter(k => !k.startsWith(`${ri},`))
      .map(k => {
        const [r, c] = k.split(',').map(Number)
        return r > ri ? `${r - 1},${c}` : k
      })
    upd({ rows: rows.filter((_, i) => i !== ri), highlighted: nextHL })
  }

  function addCol() {
    upd({ rows: rows.map(r => [...r, '']) })
  }

  function deleteCol(ci) {
    if (numCols <= 1) return
    const nextHL = highlighted.filter(k => {
      const [, c] = k.split(',').map(Number)
      return c !== ci
    }).map(k => {
      const [r, c] = k.split(',').map(Number)
      return c > ci ? `${r},${c - 1}` : k
    })
    upd({ rows: rows.map(r => r.filter((_, j) => j !== ci)), highlighted: nextHL })
  }

  // ── highlight helpers ──────────────────────────────────────────────────────
  function cellKey(ri, ci) { return `${ri},${ci}` }
  function isHL(ri, ci) { return highlighted.includes(cellKey(ri, ci)) }

  function toggleHL(ri, ci) {
    const key = cellKey(ri, ci)
    const next = highlighted.includes(key)
      ? highlighted.filter(k => k !== key)
      : [...highlighted, key]
    upd({ highlighted: next })
  }

  function clearAllHL() { upd({ highlighted: [] }) }

  // ── keyboard nav ──────────────────────────────────────────────────────────
  const gridRef = useRef(null)
  const handleKeyDown = useCallback((e, ri, ci) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const nextCi = e.shiftKey ? ci - 1 : ci + 1
      if (nextCi >= 0 && nextCi < numCols) {
        focusCell(ri, nextCi)
      } else if (!e.shiftKey && ri < rows.length - 1) {
        focusCell(ri + 1, 0)
      } else if (!e.shiftKey) {
        addRow()
        setTimeout(() => focusCell(ri + 1, 0), 30)
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (ri === rows.length - 1) {
        addRow()
        setTimeout(() => focusCell(ri + 1, 0), 30)
      } else {
        focusCell(ri + 1, ci)
      }
    }
  }, [rows, numCols]) // eslint-disable-line

  function focusCell(ri, ci) {
    if (!gridRef.current) return
    const inp = gridRef.current.querySelector(`[data-r="${ri}"][data-c="${ci}"]`)
    inp?.focus()
  }

  // ── styles ────────────────────────────────────────────────────────────────
  const s = {
    wrapper: {
      background: '#fff',
      border: '1px solid #e2e8f0',
    },
    toolbar: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '7px 10px',
      background: '#f8fafc',
      borderBottom: '1px solid #e2e8f0',
      flexWrap: 'wrap',
    },
    captionInput: {
      flex: 1,
      minWidth: 180,
      border: '1px solid #e0e0e0',
      padding: '4px 8px',
      fontSize: 12,
      fontFamily: 'inherit',
      outline: 'none',
      color: '#1c1c1e',
      fontStyle: 'italic',
    },
    toolBtn: {
      background: 'none',
      border: '1px solid #e0e0e0',
      padding: '3px 8px',
      fontSize: 11,
      cursor: 'pointer',
      fontFamily: 'inherit',
      color: '#64748b',
      whiteSpace: 'nowrap',
    },
    selectBtn: (active) => ({
      background: active ? '#fef08a' : 'none',
      border: active ? '1px solid #ca8a04' : '1px solid #e0e0e0',
      padding: '3px 8px',
      fontSize: 11,
      cursor: 'pointer',
      fontFamily: 'inherit',
      color: active ? '#92400e' : '#64748b',
      fontWeight: active ? 700 : 400,
      whiteSpace: 'nowrap',
    }),
    tableWrap: {
      overflowX: 'auto',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
    },
    headerCell: (hl) => ({
      background: hl ? HIGHLIGHT_BG : HDR_BG,
      color: HDR_TEXT,
      borderBottom: '2px solid #999',
      borderRight: '1px solid #d0d0d0',
      outline: hl ? `2px solid ${HIGHLIGHT_BDR}` : 'none',
      outlineOffset: '-2px',
      padding: '0',
      position: 'relative',
      cursor: selectMode ? 'pointer' : 'default',
      transition: 'background 0.1s',
    }),
    dataCell: (hl, evenRow) => ({
      background: hl ? HIGHLIGHT_BG : (evenRow ? '#f9f9f9' : '#fff'),
      borderBottom: '1px solid #d8d8d8',
      borderRight: '1px solid #e8e8e8',
      outline: hl ? `2px solid ${HIGHLIGHT_BDR}` : 'none',
      outlineOffset: '-2px',
      padding: '0',
      position: 'relative',
      cursor: selectMode ? 'pointer' : 'default',
      transition: 'background 0.1s',
    }),
    cellInput: {
      width: '100%',
      border: 'none',
      outline: 'none',
      padding: '5px 7px',
      fontSize: 12,
      fontFamily: 'inherit',
      background: 'transparent',
      color: '#1c1c1e',
      boxSizing: 'border-box',
      pointerEvents: selectMode ? 'none' : 'auto',
      userSelect: selectMode ? 'none' : 'auto',
    },
    headerInput: {
      width: '100%',
      border: 'none',
      outline: 'none',
      padding: '5px 7px',
      fontSize: 12,
      fontFamily: 'inherit',
      fontWeight: 700,
      background: 'transparent',
      color: HDR_TEXT,
      boxSizing: 'border-box',
      pointerEvents: selectMode ? 'none' : 'auto',
      userSelect: selectMode ? 'none' : 'auto',
    },
    delRowBtn: {
      display: 'block',
      background: 'none',
      border: 'none',
      color: '#cbd5e1',
      cursor: 'pointer',
      padding: '4px 4px',
      fontSize: 11,
      lineHeight: 1,
      flexShrink: 0,
    },
    footer: {
      display: 'flex',
      gap: 6,
      padding: '5px 8px',
      borderTop: '1px solid #e2e8f0',
      background: '#fafbfc',
    },
    addBtn: {
      background: 'none',
      border: '1px dashed #cbd5e1',
      padding: '4px 10px',
      fontSize: 11,
      cursor: 'pointer',
      fontFamily: 'inherit',
      color: '#94a3b8',
    },
  }

  return (
    <div style={s.wrapper}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <input
          style={s.captionInput}
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="Table caption (e.g. Tabel A1.1 DK NA — Ψ-faktorer)"
        />
        <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={has_header}
            onChange={e => setHasHeader(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Header row
        </label>

        {/* Highlight mode toggle */}
        <button
          style={s.selectBtn(selectMode)}
          onClick={() => setSelectMode(m => !m)}
          title={selectMode ? 'Exit highlight mode (click cells to edit)' : 'Enter highlight mode (click cells to mark them yellow)'}
        >
          ✦ {selectMode ? 'Fremhaev: TIL' : 'Fremhaev'}
        </button>
        {highlighted.length > 0 && (
          <button
            style={{ ...s.toolBtn, color: '#ca8a04', borderColor: '#fde68a', fontSize: 11 }}
            onClick={clearAllHL}
            title="Clear all highlights"
          >
            Ryd fremhaevning ({highlighted.length})
          </button>
        )}

        <button style={s.toolBtn} onClick={addCol} title="Add column">+ Kolonne</button>
        {numCols > 1 && (
          <button style={{ ...s.toolBtn, color: '#ef4444', borderColor: '#fca5a5' }}
            onClick={() => deleteCol(numCols - 1)} title="Delete last column">
            − Kolonne
          </button>
        )}
      </div>

      {/* Hint when select mode is active */}
      {selectMode && (
        <div style={{ padding: '4px 10px', fontSize: 11, color: '#92400e', background: '#fef9c3', borderBottom: '1px solid #fde68a' }}>
          ✦ Fremhaevningstilstand — klik en celle for at markere den gul. Klik igen for at fjerne.
        </div>
      )}

      {/* Table */}
      <div style={s.tableWrap}>
        <table style={s.table} ref={gridRef}>
          <tbody>
            {rows.map((row, ri) => {
              const isHeader = has_header && ri === 0
              return (
                <tr key={ri}>
                  {row.map((cell, ci) => {
                    const hl = isHL(ri, ci)
                    const tdStyle = isHeader
                      ? s.headerCell(hl)
                      : s.dataCell(hl, ri % 2 === 0)

                    return (
                      <td
                        key={ci}
                        style={tdStyle}
                        onClick={selectMode ? () => toggleHL(ri, ci) : undefined}
                      >
                        <input
                          data-r={ri}
                          data-c={ci}
                          value={cell}
                          onChange={e => setCell(ri, ci, e.target.value)}
                          onKeyDown={e => handleKeyDown(e, ri, ci)}
                          style={isHeader ? s.headerInput : s.cellInput}
                          placeholder="—"
                          readOnly={selectMode}
                          tabIndex={selectMode ? -1 : 0}
                        />
                      </td>
                    )
                  })}
                  {/* Delete row button — hidden in select mode */}
                  <td style={{ border: 'none', padding: 0, verticalAlign: 'middle', background: isHeader ? HDR_BG : 'transparent' }}>
                    {!selectMode && (!isHeader || rows.length > 1) && (
                      <button
                        style={s.delRowBtn}
                        onClick={() => deleteRow(ri)}
                        title="Delete row"
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = '#bbb'}
                      >✕</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer: add row */}
      <div style={s.footer}>
        <button style={s.addBtn} onClick={addRow}>+ Tilfoej raekke</button>
      </div>
    </div>
  )
}
