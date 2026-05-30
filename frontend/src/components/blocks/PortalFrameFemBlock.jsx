/**
 * PortalFrameFemBlock.jsx — parametric portal frame FEM block
 *
 * Inputs:
 *   - Frame geometry: n_bays, h_bay, w_bay
 *   - Section: E (GPa), A (cm²), Iz (cm⁴)
 *   - Rafter UDL loads (one per rafter, by 0-based index)
 *   - Lateral point loads at eave of any column
 *
 * Results:
 *   - 3 matplotlib figures: deformed shape, bending moment, shear
 *   - Summary table: max lateral disp, vertical disp, max moment
 *   - Reactions table per column base
 */
import React, { useState } from 'react'
import { calcPortalFrameFem } from '../../api/client.js'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const E_PRESETS = [
  { label: 'Steel',     value: 200 },
  { label: 'Aluminium', value: 70  },
  { label: 'Concrete',  value: 30  },
  { label: 'Timber',    value: 11  },
  { label: 'Custom',    value: null },
]

// ── Small helpers ─────────────────────────────────────────────────────────────

function NumField({ label, val, set, width = 80 }) {
  return (
    <div style={s.fieldWrap}>
      <label style={s.miniLabel}>{label}</label>
      <NumericInput style={{ ...s.smallInput, width }} value={val} onChange={set} />
    </div>
  )
}

// ── Load row sub-components ───────────────────────────────────────────────────

function RafterLoadRow({ load, nBays, onChange, onRemove }) {
  return (
    <div style={s.listRow}>
      <div style={s.listRowInner}>
        <div style={s.fieldWrap}>
          <label style={s.miniLabel}>Rafter</label>
          <select style={{ ...s.smallInput, width: 70 }}
            value={load.rafter_idx ?? 0}
            onChange={e => onChange({ ...load, rafter_idx: Number(e.target.value) })}>
            {Array.from({ length: nBays }, (_, i) => (
              <option key={i} value={i}>#{i + 1}</option>
            ))}
          </select>
        </div>
        <NumField label="wy (kN/m)" val={load.wy_kNm ?? -10}
          set={v => onChange({ ...load, wy_kNm: v })} />
        <span style={s.hint}>−ve = down</span>
      </div>
      <button onClick={onRemove} style={s.removeBtn} title="Remove">✕</button>
    </div>
  )
}

function LateralLoadRow({ load, nCols, onChange, onRemove }) {
  return (
    <div style={s.listRow}>
      <div style={s.listRowInner}>
        <div style={s.fieldWrap}>
          <label style={s.miniLabel}>Column</label>
          <select style={{ ...s.smallInput, width: 70 }}
            value={load.col_idx ?? 0}
            onChange={e => onChange({ ...load, col_idx: Number(e.target.value) })}>
            {Array.from({ length: nCols }, (_, i) => (
              <option key={i} value={i}>col {i + 1}</option>
            ))}
          </select>
        </div>
        <NumField label="Fx (kN)" val={load.Fx_kN ?? 10}
          set={v => onChange({ ...load, Fx_kN: v })} />
        <span style={s.hint}>+ve = right</span>
      </div>
      <button onClick={onRemove} style={s.removeBtn} title="Remove">✕</button>
    </div>
  )
}

// ── Result panel ──────────────────────────────────────────────────────────────

function ResultPanel({ figs, summary }) {
  const [open, setOpen]     = useState(true)
  const [figIdx, setFigIdx] = useState(0)
  const FIG_LABELS = ['Deflection', 'Bending Moment', 'Shear Force']

  return (
    <div style={s.resultPanel}>
      <button style={s.summaryBar} onClick={() => setOpen(o => !o)}>
        <span style={s.summaryBadge}>
          δ_x = {summary.max_lateral_disp_mm.toFixed(2)} mm
          &nbsp;·&nbsp;
          M_max = {summary.max_moment_kNm.toFixed(2)} kNm
        </span>
        <span style={{ flex: 1 }} />
        <span style={s.summaryChevron}>{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>

      {open && (
        <div style={s.resultBody}>

          {/* Figure switcher */}
          {figs?.length > 0 && (
            <div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {FIG_LABELS.map((lbl, i) => (
                  <button key={i} style={{ ...s.tabBtn, ...(figIdx === i ? s.tabBtnActive : {}) }}
                    onClick={() => setFigIdx(i)}>
                    {lbl}
                  </button>
                ))}
              </div>
              <img
                src={`data:image/png;base64,${figs[figIdx]}`}
                alt={FIG_LABELS[figIdx]}
                style={{ width: '100%', display: 'block', marginBottom: 16 }}
              />
            </div>
          )}

          {/* Results table */}
          <table style={s.table}>
            <thead>
              <tr>{['Result', 'Value', 'Location'].map(h =>
                <th key={h} style={s.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              <tr>
                <td style={s.td}>Max lateral disp. δ_x</td>
                <td style={{ ...s.td, fontWeight: 600 }}>{summary.max_lateral_disp_mm.toFixed(2)} mm</td>
                <td style={s.td}>node {summary.max_lateral_disp_node}</td>
              </tr>
              <tr style={{ background: '#fafafa' }}>
                <td style={s.td}>Max vertical disp. δ_y</td>
                <td style={{ ...s.td, fontWeight: 600 }}>{summary.max_vertical_disp_mm.toFixed(2)} mm</td>
                <td style={s.td}>node {summary.max_vertical_disp_node}</td>
              </tr>
              <tr>
                <td style={s.td}>Max bending moment M</td>
                <td style={{ ...s.td, fontWeight: 600 }}>{summary.max_moment_kNm.toFixed(2)} kNm</td>
                <td style={s.td}>element {summary.max_moment_ele}</td>
              </tr>
            </tbody>
          </table>

          {/* Reactions */}
          {summary.reactions && Object.keys(summary.reactions).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={s.sectionLabel}>Support reactions</div>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Column</th>
                    <th style={s.th}>Fx (kN)</th>
                    <th style={s.th}>Fy (kN)</th>
                    <th style={s.th}>Mz (kNm)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.reactions).map(([key, R], i) => (
                    <tr key={key} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
                      <td style={s.td}>{key}</td>
                      <td style={{ ...s.td, fontWeight: 600 }}>{R.Fx_kN?.toFixed(2)}</td>
                      <td style={{ ...s.td, fontWeight: 600 }}>{R.Fy_kN?.toFixed(2)}</td>
                      <td style={{ ...s.td, fontWeight: 600 }}>{R.Mz_kNm?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main block ────────────────────────────────────────────────────────────────

export default function PortalFrameFemBlock({ block, onChange }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)
  const [ePreset, setEPreset] = useState('Steel')

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  const nBays = d.n_bays ?? 1
  const nCols = nBays + 1

  // Rafter loads
  const rafterLoads = d.rafter_loads ?? []
  function updateRafter(i, v) { const a = [...rafterLoads]; a[i] = v; update({ rafter_loads: a }) }
  function addRafter()         { update({ rafter_loads: [...rafterLoads, { rafter_idx: 0, wy_kNm: -10 }] }) }
  function removeRafter(i)     { update({ rafter_loads: rafterLoads.filter((_, j) => j !== i) }) }

  // Lateral loads
  const lateralLoads = d.lateral_loads ?? []
  function updateLateral(i, v) { const a = [...lateralLoads]; a[i] = v; update({ lateral_loads: a }) }
  function addLateral()         { update({ lateral_loads: [...lateralLoads, { col_idx: 0, Fx_kN: 10 }] }) }
  function removeLateral(i)     { update({ lateral_loads: lateralLoads.filter((_, j) => j !== i) }) }

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const res = await calcPortalFrameFem({
        title:         d.title    ?? 'Portal Frame FEM',
        n_bays:        nBays,
        h_bay_m:       d.h_bay_m  ?? 5.0,
        w_bay_m:       d.w_bay_m  ?? 10.0,
        E_GPa:         d.E_GPa    ?? 200.0,
        A_cm2:         d.A_cm2    ?? 300.0,
        Iz_cm4:        d.Iz_cm4   ?? 30000.0,
        rafter_loads:  rafterLoads,
        lateral_loads: lateralLoads,
      })
      update({
        _figs_b64: res._figs_b64,
        _summary:  res._summary,
        _result:   res._result,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={s.wrapper}>

      {/* Title */}
      <input type="text" value={d.title ?? 'Portal Frame FEM'}
        onChange={e => update({ title: e.target.value })}
        placeholder="Analysis title"
        style={s.titleInput} />

      {/* ── Geometry ── */}
      <div style={s.sectionLabel}>Frame geometry</div>
      <div style={s.grid}>
        <Field label="Bays">
          <NumericInput style={s.input} value={nBays}
            onChange={v => update({ n_bays: Math.max(1, Math.round(v)) })} />
        </Field>
        <Field label="Bay width (m)">
          <NumericInput style={s.input} value={d.w_bay_m ?? 10.0}
            onChange={v => update({ w_bay_m: v })} />
        </Field>
        <Field label="Height (m)">
          <NumericInput style={s.input} value={d.h_bay_m ?? 5.0}
            onChange={v => update({ h_bay_m: v })} />
        </Field>
      </div>

      {/* ── Section ── */}
      <div style={s.sectionLabel}>Section (all members)</div>
      <div style={s.grid}>
        <Field label="Material">
          <select style={s.input} value={ePreset}
            onChange={e => {
              const p = E_PRESETS.find(x => x.label === e.target.value)
              setEPreset(e.target.value)
              if (p?.value != null) update({ E_GPa: p.value })
            }}>
            {E_PRESETS.map(p => <option key={p.label}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="E (GPa)">
          <NumericInput style={s.input} value={d.E_GPa ?? 200.0}
            onChange={v => { setEPreset('Custom'); update({ E_GPa: v }) }} />
        </Field>
        <Field label="A (cm²)">
          <NumericInput style={s.input} value={d.A_cm2 ?? 300.0}
            onChange={v => update({ A_cm2: v })} />
        </Field>
        <Field label="Iz (cm⁴)">
          <NumericInput style={s.input} value={d.Iz_cm4 ?? 30000.0}
            onChange={v => update({ Iz_cm4: v })} />
        </Field>
      </div>

      {/* ── Rafter UDL loads ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <div style={s.sectionLabel}>Rafter UDL loads</div>
        <button style={s.addBtn} onClick={addRafter}>+ Add</button>
      </div>
      {rafterLoads.map((rl, i) => (
        <RafterLoadRow key={i} load={rl} nBays={nBays}
          onChange={v => updateRafter(i, v)}
          onRemove={() => removeRafter(i)} />
      ))}

      {/* ── Lateral loads ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <div style={s.sectionLabel}>Lateral loads (at eave)</div>
        <button style={s.addBtn} onClick={addLateral}>+ Add</button>
      </div>
      {lateralLoads.map((ll, i) => (
        <LateralLoadRow key={i} load={ll} nCols={nCols}
          onChange={v => updateLateral(i, v)}
          onRemove={() => removeLateral(i)} />
      ))}

      {/* ── Run ── */}
      <div style={s.actionRow}>
        <button style={{ ...s.btn, ...s.btnRun }} onClick={handleRun} disabled={running}>
          {running ? '⏳  Running…' : '▶  Run FEM'}
        </button>
        {d._summary && (
          <button style={s.btn}
            onClick={() => update({ _figs_b64: null, _summary: null, _result: null })}>
            ✕  Clear
          </button>
        )}
      </div>

      {error && <div style={s.error}>{error}</div>}

      {d._summary && d._figs_b64 && (
        <ResultPanel figs={d._figs_b64} summary={d._summary} />
      )}

    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  wrapper:      { display: 'flex', flexDirection: 'column', gap: 10 },
  titleInput:   { border: '1px solid #e8e8e8', padding: '6px 10px', fontSize: 13,
                  fontWeight: 600, outline: 'none', fontFamily: 'inherit',
                  width: '100%', boxSizing: 'border-box' },
  grid:         { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: 10, alignItems: 'end' },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: '#aaa', letterSpacing: '0.1em',
                  textTransform: 'uppercase', margin: '2px 0' },
  input:        { border: '1px solid #e8e8e8', padding: '6px 8px', fontSize: 13,
                  fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' },
  listRow:      { display: 'flex', alignItems: 'flex-end', gap: 8,
                  background: '#fafafa', border: '1px solid #f0f0f0',
                  padding: '8px 10px', borderRadius: 2 },
  listRowInner: { display: 'flex', flex: 1, gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' },
  fieldWrap:    { display: 'flex', flexDirection: 'column', gap: 3 },
  miniLabel:    { fontSize: 10, fontWeight: 600, color: '#888', letterSpacing: '0.04em' },
  smallInput:   { border: '1px solid #e0e0e0', padding: '4px 6px', fontSize: 12,
                  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' },
  hint:         { fontSize: 10, color: '#bbb', alignSelf: 'center' },
  removeBtn:    { background: 'none', border: 'none', color: '#ccc', cursor: 'pointer',
                  fontSize: 14, padding: '4px 6px', lineHeight: 1, alignSelf: 'flex-start' },
  addBtn:       { background: '#f5f5f7', border: '1px solid #e8e8e8', padding: '4px 10px',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  letterSpacing: '0.04em', color: '#555' },
  actionRow:    { display: 'flex', gap: 8, marginTop: 4 },
  btn:          { background: '#f5f5f7', border: '1px solid #e8e8e8', padding: '7px 14px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  letterSpacing: '0.04em' },
  btnRun:       { background: '#111', color: '#fff', border: '1px solid #111' },
  error:        { background: '#fdf3f2', border: '1px solid #f5c6c6', padding: '8px 12px',
                  fontSize: 12, color: '#c0392b' },
  resultPanel:  { border: '1px solid #e8e8e8', marginTop: 2 },
  summaryBar:   { display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  background: '#f5f5f7', border: 'none', borderBottom: '1px solid #e8e8e8',
                  padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },
  summaryBadge: { fontSize: 11, fontWeight: 700, color: '#27ae60' },
  summaryChevron: { fontSize: 10, color: '#aaa' },
  resultBody:   { padding: '12px 14px' },
  tabBtn:       { background: '#f5f5f7', border: '1px solid #e8e8e8', padding: '4px 12px',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  letterSpacing: '0.04em', color: '#555' },
  tabBtnActive: { background: '#111', color: '#fff', border: '1px solid #111' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace' },
  th:           { textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e8e8e8',
                  fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: '0.06em',
                  textTransform: 'uppercase', background: '#fafafa', fontFamily: 'inherit' },
  td:           { padding: '5px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 12 },
}
