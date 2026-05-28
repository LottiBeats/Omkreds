/**
 * TableBlock.jsx — editable table for structural documentation
 *
 * Data shape:
 *   {
 *     caption:    string          — table caption (shown above)
 *     has_header: boolean         — style first row as header
 *     rows:       string[][]      — 2-D array of cell text
 *   }
 *
 * Interactions:
 *   Click cell → edit inline
 *   Tab / Shift+Tab → move between cells
 *   Enter in last row → add a new row
 *   Backspace on empty last row → delete it
 */
import React, { useRef, useCallback } from 'react'

const BRAND = '#d94a2b'
const NAVY  = '#1e3a5f'

export default function TableBlock({ block, onChange }) {
  const data       = block.data ?? {}
  const caption    = data.caption    ?? ''
  const has_header = data.has_header ?? true
  const rows       = data.rows       ?? [['Kolonne 1', 'Kolonne 2'], ['', '']]

  const numCols = rows[0]?.length ?? 2

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
    upd({ rows: rows.filter((_, i) => i !== ri) })
  }

  function addCol() {
    upd({ rows: rows.map(r => [...r, '']) })
  }

  function deleteCol(ci) {
    if (numCols <= 1) return
    upd({ rows: rows.map(r => r.filter((_, j) => j !== ci)) })
  }

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
    tableWrap: {
      overflowX: 'auto',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
    },
    headerCell: {
      background: NAVY,
      color: '#fff',
      padding: '4px 6px',
      position: 'relative',
    },
    dataCell: {
      borderBottom: '1px solid #e2e8f0',
      borderRight: '1px solid #f0f4f8',
      padding: '0',
      position: 'relative',
    },
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
      color: '#fff',
      boxSizing: 'border-box',
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
    delColBtn: {
      display: 'block',
      background: 'none',
      border: 'none',
      color: '#93c5fd',
      cursor: 'pointer',
      padding: '2px 4px',
      fontSize: 10,
      lineHeight: 1,
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
        <button style={s.toolBtn} onClick={addCol} title="Add column">+ Col</button>
        {numCols > 1 && (
          <button style={{ ...s.toolBtn, color: '#ef4444', borderColor: '#fca5a5' }}
            onClick={() => deleteCol(numCols - 1)} title="Delete last column">
            − Col
          </button>
        )}
      </div>

      {/* Table */}
      <div style={s.tableWrap}>
        <table style={s.table} ref={gridRef}>
          <tbody>
            {rows.map((row, ri) => {
              const isHeader = has_header && ri === 0
              return (
                <tr key={ri} style={ri % 2 === 1 && !isHeader ? { background: '#f8fafc' } : {}}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={isHeader ? s.headerCell : s.dataCell}>
                      <input
                        data-r={ri}
                        data-c={ci}
                        value={cell}
                        onChange={e => setCell(ri, ci, e.target.value)}
                        onKeyDown={e => handleKeyDown(e, ri, ci)}
                        style={isHeader ? s.headerInput : s.cellInput}
                        placeholder="—"
                      />
                    </td>
                  ))}
                  {/* Delete row button */}
                  <td style={{ border: 'none', padding: 0, verticalAlign: 'middle', background: isHeader ? NAVY : 'transparent' }}>
                    {(!isHeader || rows.length > 1) && (
                      <button
                        style={s.delRowBtn}
                        onClick={() => deleteRow(ri)}
                        title="Delete row"
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = isHeader ? '#93c5fd' : '#cbd5e1'}
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
        <button style={s.addBtn} onClick={addRow}>+ Add row</button>
      </div>
    </div>
  )
}
