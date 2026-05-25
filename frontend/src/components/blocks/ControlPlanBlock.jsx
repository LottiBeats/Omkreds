/**
 * ControlPlanBlock.jsx — DS 1140 Statisk kontrolplan / kontrolrapport
 *
 * Used in B2 (plan mode) and B3 (report mode).
 *
 * plan mode:   Pos | Beskrivelse | KK-krav | Kontrol | Ansvarlig | Reference
 * report mode: + Status | Dato | Udøver | Bemærkninger
 *
 * The mode is stored on block.data.mode so it persists with the document.
 */
import React from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────

const CONTROL_TYPES = [
  { value: 'E', label: 'E',  desc: 'Egenkontrol' },
  { value: 'U', label: 'U',  desc: 'Uvildig kontrol' },
  { value: 'T', label: 'T',  desc: 'Tilsyn' },
]

const STATUS_OPTIONS = [
  { value: '',        label: '—',            color: '#94a3b8' },
  { value: 'OK',      label: '✓ OK',         color: '#16a34a' },
  { value: 'N/A',     label: 'N/A',          color: '#94a3b8' },
  { value: 'Afventer',label: '⏳ Afventer',  color: '#b45309' },
  { value: 'Fejl',    label: '✗ Fejl',       color: '#dc2626' },
]

const KK_OPTIONS = ['KK1', 'KK2', 'KK3', 'KK4']

const DEFAULT_ITEM_PLAN = {
  pos: '', description: '', kk: 'KK1', control: 'E', responsible: '', reference: '',
}
const DEFAULT_ITEM_REPORT = {
  ...DEFAULT_ITEM_PLAN,
  status: '', date: '', performed_by: '', remarks: '',
}

// ── Styles ────────────────────────────────────────────────────────────────────

const TH = {
  padding:     '5px 7px',
  background:  '#1e3a5f',
  color:       '#fff',
  fontWeight:  600,
  fontSize:    11,
  borderRight: '1px solid #2a4f82',
  whiteSpace:  'nowrap',
}
const TD = {
  padding:       '4px 6px',
  fontSize:      12,
  verticalAlign: 'top',
  borderBottom:  '1px solid #e2e8f0',
  borderRight:   '1px solid #e2e8f0',
}
const INPUT = {
  width:        '100%',
  border:       '1px solid #cbd5e1',
  borderRadius: 3,
  padding:      '2px 5px',
  fontSize:     12,
  background:   '#fff',
  outline:      'none',
  minWidth:     0,
  boxSizing:    'border-box',
}
const BTN = {
  padding:      '2px 8px',
  fontSize:     11,
  border:       '1px solid #cbd5e1',
  borderRadius: 4,
  cursor:       'pointer',
  background:   '#f8fafc',
  color:        '#475569',
}

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({ item, index, isReport, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  return (
    <tr style={{ background: index % 2 === 0 ? '#fafbfc' : '#fff' }}>

      {/* Pos */}
      <td style={{ ...TD, width: 38 }}>
        <input style={INPUT} value={item.pos} onChange={e => onUpdate({ pos: e.target.value })} placeholder="1" />
      </td>

      {/* Beskrivelse */}
      <td style={TD}>
        <input style={INPUT} value={item.description} onChange={e => onUpdate({ description: e.target.value })} placeholder="Beskriv kontrolpunktet…" />
      </td>

      {/* KK-krav */}
      <td style={{ ...TD, width: 68 }}>
        <select style={{ ...INPUT, width: 64 }} value={item.kk} onChange={e => onUpdate({ kk: e.target.value })}>
          {KK_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </td>

      {/* Kontroltype */}
      <td style={{ ...TD, width: 110 }}>
        <select
          style={{ ...INPUT, width: 108 }}
          value={item.control}
          onChange={e => onUpdate({ control: e.target.value })}
        >
          {CONTROL_TYPES.map(c => (
            <option key={c.value} value={c.value}>{c.value} – {c.desc}</option>
          ))}
        </select>
      </td>

      {/* Ansvarlig */}
      <td style={{ ...TD, width: 100 }}>
        <input style={INPUT} value={item.responsible} onChange={e => onUpdate({ responsible: e.target.value })} placeholder="Initialer…" />
      </td>

      {/* Reference */}
      <td style={{ ...TD, width: 80 }}>
        <input style={INPUT} value={item.reference} onChange={e => onUpdate({ reference: e.target.value })} placeholder="A2, A3…" />
      </td>

      {/* B3 report columns */}
      {isReport && <>
        <td style={{ ...TD, width: 110 }}>
          <select
            style={{
              ...INPUT, width: 108,
              color: STATUS_OPTIONS.find(s => s.value === item.status)?.color || '#1e293b',
            }}
            value={item.status}
            onChange={e => onUpdate({ status: e.target.value })}
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s.value} value={s.value} style={{ color: s.color }}>{s.label}</option>
            ))}
          </select>
        </td>
        <td style={{ ...TD, width: 90 }}>
          <input style={INPUT} type="date" value={item.date} onChange={e => onUpdate({ date: e.target.value })} />
        </td>
        <td style={{ ...TD, width: 90 }}>
          <input style={INPUT} value={item.performed_by} onChange={e => onUpdate({ performed_by: e.target.value })} placeholder="Initialer…" />
        </td>
        <td style={TD}>
          <input style={INPUT} value={item.remarks} onChange={e => onUpdate({ remarks: e.target.value })} placeholder="Bemærkninger…" />
        </td>
      </>}

      {/* Row actions */}
      <td style={{ ...TD, width: 60, borderRight: 'none' }}>
        <div style={{ display: 'flex', gap: 2 }}>
          <button style={{ ...BTN, padding: '2px 5px' }} disabled={isFirst}  onClick={onMoveUp}   title="Flyt op">↑</button>
          <button style={{ ...BTN, padding: '2px 5px' }} disabled={isLast}   onClick={onMoveDown} title="Flyt ned">↓</button>
          <button style={{ ...BTN, padding: '2px 5px', color: '#dc2626', borderColor: '#fca5a5' }} onClick={onDelete} title="Slet">✕</button>
        </div>
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
// Receives { block, onChange } — the same contract as every other block component.
// onChange(newBlock) is called with the full updated block object.

export default function ControlPlanBlock({ block, onChange }) {
  const data     = block.data
  const mode     = data.mode  || 'plan'   // 'plan' | 'report'
  const isReport = mode === 'report'
  const items    = data.items || []

  function updateData(changes) {
    onChange({ ...block, data: { ...data, ...changes } })
  }

  function updateItem(i, changes) {
    const next = items.map((it, idx) => idx === i ? { ...it, ...changes } : it)
    updateData({ items: next })
  }

  function addItem() {
    const template = isReport ? DEFAULT_ITEM_REPORT : DEFAULT_ITEM_PLAN
    const pos = String(items.length + 1)
    updateData({ items: [...items, { ...template, pos }] })
  }

  function deleteItem(i) {
    updateData({ items: items.filter((_, idx) => idx !== i) })
  }

  function moveItem(i, dir) {
    const next = [...items]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    updateData({ items: next })
  }

  return (
    <div style={{ padding: '12px 0 4px' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <input
          style={{ ...INPUT, width: 240, fontWeight: 600, fontSize: 13 }}
          value={data.title || ''}
          onChange={e => updateData({ title: e.target.value })}
          placeholder="Sektionsnavn…"
        />

        <label style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isReport}
            onChange={e => updateData({ mode: e.target.checked ? 'report' : 'plan' })}
          />
          Rapporteringskolonner (B3)
        </label>

        <button
          style={{ ...BTN, marginLeft: 'auto', background: '#1e3a5f', color: '#fff', border: 'none', padding: '4px 12px' }}
          onClick={addItem}
        >
          + Kontrolpunkt
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 4 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 38 }}>Pos</th>
              <th style={{ ...TH }}>Beskrivelse</th>
              <th style={{ ...TH, width: 68 }}>KK-krav</th>
              <th style={{ ...TH, width: 110 }}>Kontroltype</th>
              <th style={{ ...TH, width: 100 }}>Ansvarlig</th>
              <th style={{ ...TH, width: 80 }}>Reference</th>
              {isReport && <>
                <th style={{ ...TH, width: 110 }}>Status</th>
                <th style={{ ...TH, width: 90 }}>Dato</th>
                <th style={{ ...TH, width: 90 }}>Udøver</th>
                <th style={{ ...TH }}>Bemærkninger</th>
              </>}
              <th style={{ ...TH, width: 60, borderRight: 'none' }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={isReport ? 11 : 7}
                  style={{ ...TD, textAlign: 'center', color: '#94a3b8', padding: '20px', borderRight: 'none' }}
                >
                  Ingen kontrolpunkter endnu — klik <strong>+ Kontrolpunkt</strong> for at tilføje
                </td>
              </tr>
            )}
            {items.map((item, i) => (
              <ItemRow
                key={i}
                item={item}
                index={i}
                isReport={isReport}
                onUpdate={changes => updateItem(i, changes)}
                onDelete={() => deleteItem(i)}
                onMoveUp={() => moveItem(i, -1)}
                onMoveDown={() => moveItem(i, 1)}
                isFirst={i === 0}
                isLast={i === items.length - 1}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span><strong>Kontroltype:</strong></span>
        {CONTROL_TYPES.map(c => (
          <span key={c.value}><strong>{c.value}</strong> = {c.desc}</span>
        ))}
      </div>
    </div>
  )
}
