/**
 * FrameLoadCasesBlock.jsx — EN 1990 frame load case manager
 *
 * User defines named load cases (G, S, W, Q) — each with a list of
 * element UDL loads or nodal loads — then generates ULS design combinations
 * per EN 1990 eq. 6.10 or 6.10a/b (Danish NA).
 *
 * Exports _exports.combinations so the General Frame FEM block can consume
 * them directly, running the FEM once per combination and enveloping results.
 */
import React, { useState } from 'react'
import { calcFrameLoadCases } from '../../api/client.js'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────

const CASE_TYPES = [
  { value: 'permanent', label: 'Permanent (G)',  color: '#4B5563', psi0: null },
  { value: 'snow',      label: 'Snow (S)',       color: '#0369A1', psi0: 0.5  },
  { value: 'wind',      label: 'Wind (W)',       color: '#6D28D9', psi0: 0.6  },
  { value: 'imposed',   label: 'Imposed (Q)',    color: '#065F46', psi0: 0.7  },
]

const DIRECTIONS = [
  { value: 'vertical',   label: 'Vertical ↓ (gravity)'           },
  { value: 'projected',  label: 'Projected ↓ (snow on slope)'    },
  { value: 'horizontal', label: 'Horizontal → (wind)'            },
]

const CC_OPTIONS = ['CC1', 'CC2', 'CC3']
const METHOD_OPTIONS = [
  { value: '6.10ab', label: 'Eq. 6.10a/b (recommended)' },
  { value: '6.10',   label: 'Eq. 6.10 (conservative)'   },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function NumField({ label, val, set, width = 72 }) {
  return (
    <div style={s.fieldWrap}>
      <label style={s.miniLabel}>{label}</label>
      <NumericInput style={{ ...s.smallInput, width }} value={val} onChange={set} />
    </div>
  )
}

function typeColor(type) {
  return CASE_TYPES.find(t => t.value === type)?.color ?? '#4B5563'
}

// ── Load row inside a case ─────────────────────────────────────────────────────

function LoadRow({ load, onChange, onRemove }) {
  const lt = load.load_type ?? 'udl'
  return (
    <div style={s.loadRow}>
      <div style={s.loadRowInner}>
        <div style={s.fieldWrap}>
          <label style={s.miniLabel}>Type</label>
          <select style={{ ...s.smallInput, width: 66 }} value={lt}
            onChange={e => onChange({ ...load, load_type: e.target.value })}>
            <option value="udl">UDL</option>
            <option value="nodal">Nodal</option>
          </select>
        </div>

        {lt === 'udl' && <>
          <NumField label="Elem" val={load.elem_id ?? 1}
            set={v => onChange({ ...load, elem_id: Math.round(v) })} width={48} />
          <NumField label="kN/m" val={load.value_kNm ?? 5}
            set={v => onChange({ ...load, value_kNm: v })} />
          <div style={s.fieldWrap}>
            <label style={s.miniLabel}>Direction</label>
            <select style={{ ...s.smallInput, width: 170 }}
              value={load.direction ?? 'vertical'}
              onChange={e => onChange({ ...load, direction: e.target.value })}>
              {DIRECTIONS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
        </>}

        {lt === 'nodal' && <>
          <NumField label="Node" val={load.node_id ?? 1}
            set={v => onChange({ ...load, node_id: Math.round(v) })} width={48} />
          <NumField label="Fx (kN)" val={load.Fx_kN ?? 0}
            set={v => onChange({ ...load, Fx_kN: v })} />
          <NumField label="Fy (kN)" val={load.Fy_kN ?? 0}
            set={v => onChange({ ...load, Fy_kN: v })} />
        </>}
      </div>
      <button onClick={onRemove} style={s.removeBtn}>✕</button>
    </div>
  )
}

// ── Case card ─────────────────────────────────────────────────────────────────

function CaseCard({ case_, onChange, onRemove }) {
  const [open, setOpen] = useState(true)
  const color = typeColor(case_.type)

  function updateLoad(i, v) {
    const loads = [...(case_.loads ?? [])]; loads[i] = v
    onChange({ ...case_, loads })
  }
  function addLoad(lt) {
    const loads = [...(case_.loads ?? []),
      lt === 'udl'
        ? { load_type: 'udl',   elem_id: 1, value_kNm: 5, direction: 'vertical' }
        : { load_type: 'nodal', node_id: 1, Fx_kN: 0, Fy_kN: 0 }
    ]
    onChange({ ...case_, loads })
  }
  function removeLoad(i) {
    onChange({ ...case_, loads: (case_.loads ?? []).filter((_, j) => j !== i) })
  }

  const psi0info = CASE_TYPES.find(t => t.value === case_.type)
  const psi0label = psi0info?.psi0 != null ? `ψ₀ = ${psi0info.psi0}` : 'γ_G = 1.35'

  return (
    <div style={{ ...s.caseCard, borderLeftColor: color }}>
      {/* Header */}
      <div style={s.caseHeader}>
        <span style={{ ...s.caseTag, background: color }}>{case_.id}</span>
        <select style={{ ...s.smallInput, width: 160 }} value={case_.type}
          onChange={e => onChange({ ...case_, type: e.target.value })}>
          {CASE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <span style={s.psi0badge}>{psi0label}</span>
        <span style={{ flex: 1 }} />
        <button style={s.toggleBtn} onClick={() => setOpen(o => !o)}>
          {open ? '▲' : '▼'}
        </button>
        <button style={s.removeBtn} onClick={onRemove}>✕</button>
      </div>

      {open && (
        <div style={{ padding: '8px 12px 10px' }}>
          {(case_.loads ?? []).map((ld, i) => (
            <LoadRow key={i} load={ld}
              onChange={v => updateLoad(i, v)}
              onRemove={() => removeLoad(i)} />
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button style={s.addBtn} onClick={() => addLoad('udl')}>+ UDL</button>
            <button style={s.addBtn} onClick={() => addLoad('nodal')}>+ Nodal</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Combination result table ──────────────────────────────────────────────────

function ComboTable({ combinations, cases }) {
  const caseIds = cases.map(c => c.id)
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>Combination</th>
          {caseIds.map(id => <th key={id} style={s.th}>γ·{id}</th>)}
        </tr>
      </thead>
      <tbody>
        {combinations.map((combo, i) => (
          <tr key={i} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
            <td style={{ ...s.td, fontSize: 11 }}>{combo.name}</td>
            {caseIds.map(id => {
              const f = combo.factor_table?.[id]
              return (
                <td key={id} style={{ ...s.td, fontWeight: 600, fontFamily: 'monospace' }}>
                  {f != null && Math.abs(f) > 0.001 ? f.toFixed(3) : '—'}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Main block ────────────────────────────────────────────────────────────────

export default function FrameLoadCasesBlock({ block, onChange }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  const cases = d.cases ?? []

  function updateCase(i, v) {
    const a = [...cases]; a[i] = v; update({ cases: a })
  }
  function addCase() {
    const defaultIds = ['G', 'S', 'W', 'Q']
    const usedIds = cases.map(c => c.id)
    const nextId = defaultIds.find(id => !usedIds.includes(id)) ?? `LC${cases.length + 1}`
    const type = nextId === 'G' ? 'permanent'
               : nextId === 'S' ? 'snow'
               : nextId === 'W' ? 'wind' : 'imposed'
    update({ cases: [...cases, { id: nextId, type, loads: [] }] })
  }
  function removeCase(i) {
    update({ cases: cases.filter((_, j) => j !== i) })
  }

  async function handleRun() {
    setRunning(true); setError(null)
    try {
      const res = await calcFrameLoadCases({
        title:             d.title             ?? 'Frame Load Cases',
        consequence_class: d.consequence_class ?? 'CC2',
        method:            d.method            ?? '6.10ab',
        cases,
      })
      update({
        _exports: res._exports,
        _result:  res._result,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const combinations = d._exports?.combinations ?? []

  return (
    <div style={s.wrapper}>
      {/* Title */}
      <input type="text" value={d.title ?? 'Frame Load Cases'}
        onChange={e => update({ title: e.target.value })}
        placeholder="Block title" style={s.titleInput} />

      {/* Settings */}
      <div style={s.settingsRow}>
        <Field label="Consequence class">
          <select style={s.input} value={d.consequence_class ?? 'CC2'}
            onChange={e => update({ consequence_class: e.target.value })}>
            {CC_OPTIONS.map(cc => <option key={cc}>{cc}</option>)}
          </select>
        </Field>
        <Field label="EN 1990 method">
          <select style={s.input} value={d.method ?? '6.10ab'}
            onChange={e => update({ method: e.target.value })}>
            {METHOD_OPTIONS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Load cases */}
      <div style={s.sectionLabel}>Load cases</div>
      {cases.map((c, i) => (
        <CaseCard key={i} case_={c}
          onChange={v => updateCase(i, v)}
          onRemove={() => removeCase(i)} />
      ))}
      <button style={s.addBtn} onClick={addCase}>+ Add load case</button>

      {/* Run */}
      <div style={s.actionRow}>
        <button style={{ ...s.btn, ...s.btnRun }} onClick={handleRun} disabled={running}>
          {running ? '⏳  Generating…' : '▶  Generate combinations'}
        </button>
        {combinations.length > 0 && (
          <button style={s.btn}
            onClick={() => update({ _exports: null, _result: null })}>
            ✕  Clear
          </button>
        )}
      </div>

      {error && <div style={s.error}>{error}</div>}

      {/* Combination table */}
      {combinations.length > 0 && (
        <div style={s.resultPanel}>
          <div style={s.summaryBar}>
            <span style={s.summaryBadge}>
              {combinations.length} combinations generated
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: '#888' }}>
              Ready for FEM block ✓
            </span>
          </div>
          <div style={{ padding: '10px 14px' }}>
            <ComboTable combinations={combinations} cases={cases} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  wrapper:      { display: 'flex', flexDirection: 'column', gap: 8 },
  titleInput:   { border: '1px solid #e8e8e8', padding: '6px 10px', fontSize: 13,
                  fontWeight: 600, outline: 'none', fontFamily: 'inherit',
                  width: '100%', boxSizing: 'border-box' },
  settingsRow:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: '#aaa', letterSpacing: '0.1em',
                  textTransform: 'uppercase', marginTop: 4 },
  input:        { border: '1px solid #e8e8e8', padding: '6px 8px', fontSize: 13,
                  fontFamily: 'inherit', outline: 'none', width: '100%',
                  boxSizing: 'border-box' },
  caseCard:     { border: '1px solid #e8e8e8', borderLeft: '4px solid #4B5563',
                  borderRadius: 2, background: '#fff' },
  caseHeader:   { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  borderBottom: '1px solid #f0f0f0' },
  caseTag:      { fontSize: 11, fontWeight: 700, color: '#fff', padding: '2px 8px',
                  borderRadius: 2, letterSpacing: '0.05em', fontFamily: 'monospace' },
  psi0badge:    { fontSize: 10, color: '#888', fontFamily: 'monospace' },
  toggleBtn:    { background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, color: '#aaa', padding: '2px 4px' },
  loadRow:      { display: 'flex', alignItems: 'flex-end', gap: 6,
                  background: '#fafafa', border: '1px solid #f0f0f0',
                  padding: '6px 8px', borderRadius: 2, marginBottom: 4 },
  loadRowInner: { display: 'flex', flex: 1, gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' },
  fieldWrap:    { display: 'flex', flexDirection: 'column', gap: 3 },
  miniLabel:    { fontSize: 10, fontWeight: 600, color: '#888', letterSpacing: '0.04em' },
  smallInput:   { border: '1px solid #e0e0e0', padding: '4px 6px', fontSize: 12,
                  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' },
  addBtn:       { background: '#f5f5f7', border: '1px solid #e8e8e8', padding: '4px 10px',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  letterSpacing: '0.04em', color: '#555' },
  removeBtn:    { background: 'none', border: 'none', color: '#ccc', cursor: 'pointer',
                  fontSize: 14, padding: '4px 6px', lineHeight: 1, alignSelf: 'flex-start' },
  actionRow:    { display: 'flex', gap: 8, marginTop: 4 },
  btn:          { background: '#f5f5f7', border: '1px solid #e8e8e8', padding: '7px 14px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  letterSpacing: '0.04em' },
  btnRun:       { background: '#111', color: '#fff', border: '1px solid #111' },
  error:        { background: '#fdf3f2', border: '1px solid #f5c6c6', padding: '8px 12px',
                  fontSize: 12, color: '#c0392b' },
  resultPanel:  { border: '1px solid #e8e8e8' },
  summaryBar:   { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                  background: '#f5f5f7', borderBottom: '1px solid #e8e8e8' },
  summaryBadge: { fontSize: 11, fontWeight: 700, color: '#27ae60' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th:           { textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e8e8e8',
                  fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: '0.06em',
                  textTransform: 'uppercase', background: '#fafafa', fontFamily: 'inherit' },
  td:           { padding: '5px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 12 },
}
