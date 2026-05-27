/**
 * BeamFemBlock.jsx — Euler-Bernoulli beam FEM analysis block
 *
 * Inputs:
 *   - Span, E (GPa), I (cm⁴)
 *   - Dynamic support list: x position + type (pin / roller / fixed)
 *   - Dynamic load list: UDL, point load, point moment, trapezoidal,
 *                        Combo UDL (intensity from a linked Load Combo block)
 *
 * Results:
 *   - 4-panel matplotlib figure (beam diagram, displacement, M, V)
 *   - Summary table: max M_Ed, V_Ed, delta_max and reaction forces
 *
 * Load combo integration:
 *   Add a "Combo UDL" load — its w_kNm is read live from E_d_uls of a
 *   Load Combination block in the same document.  The FEM is always run
 *   with the current combo value; no manual sync needed.
 */
import React, { useState } from 'react'
import { calcBeamFem } from '../../api/client.js'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

// ── Material presets ──────────────────────────────────────────────────────────

const E_PRESETS = [
  { label: 'Steel',     value: 210 },
  { label: 'Aluminium', value: 70  },
  { label: 'Concrete',  value: 30  },
  { label: 'Timber',    value: 11  },
  { label: 'Custom',    value: null },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function SupportRow({ sup, onChange, onRemove }) {
  return (
    <div style={s.listRow}>
      <div style={s.listRowInner}>
        <div style={s.fieldWrap}>
          <label style={s.miniLabel}>x (m)</label>
          <NumericInput style={s.smallInput} value={sup.x ?? 0}
            onChange={v => onChange({ ...sup, x: v })} />
        </div>
        <div style={s.fieldWrap}>
          <label style={s.miniLabel}>Type</label>
          <select style={s.smallInput} value={sup.type ?? 'pin'}
            onChange={e => onChange({ ...sup, type: e.target.value })}>
            <option value="pin">Pin</option>
            <option value="roller">Roller</option>
            <option value="fixed">Fixed</option>
          </select>
        </div>
      </div>
      <button onClick={onRemove} style={s.removeBtn} title="Remove">✕</button>
    </div>
  )
}

function LoadRow({ load, L, comboBlocks, onChange, onRemove }) {
  const lt = load.type ?? 'udl'

  // For combo_udl: find the linked combo block and its current E_d_uls
  const selCombo = lt === 'combo_udl'
    ? (comboBlocks.find(b => b.data.label === load.combo_label) ?? comboBlocks[0])
    : null
  const comboW    = selCombo?.data?._exports?.E_d_uls
  const comboUnit = selCombo?.data?._exports?.unit ?? 'kN/m'

  return (
    <div style={s.listRow}>
      <div style={{ ...s.listRowInner, flexWrap: 'wrap' }}>

        {/* Type selector */}
        <div style={s.fieldWrap}>
          <label style={s.miniLabel}>Type</label>
          <select style={s.smallInput} value={lt}
            onChange={e => onChange({ ...load, type: e.target.value })}>
            <option value="udl">UDL</option>
            <option value="combo_udl">Combo UDL</option>
            <option value="point">Point load</option>
            <option value="moment">Moment</option>
            <option value="trapezoidal">Trapezoidal</option>
          </select>
        </div>

        {/* UDL ── w, x1, x2 */}
        {lt === 'udl' && <>
          <NumField label="w (kN/m)" val={load.w_kNm ?? 10}
            set={v => onChange({ ...load, w_kNm: v })} />
          <NumField label="x₁ (m)" val={load.x1 ?? 0}
            set={v => onChange({ ...load, x1: v })} />
          <NumField label="x₂ (m)" val={load.x2 ?? L}
            set={v => onChange({ ...load, x2: v })} />
        </>}

        {/* Combo UDL ── combo picker, x1, x2 + live value display */}
        {lt === 'combo_udl' && <>
          <div style={s.fieldWrap}>
            <label style={s.miniLabel}>Combo</label>
            {comboBlocks.length === 0 ? (
              <span style={{ fontSize: 11, color: '#e67e22' }}>No combo blocks</span>
            ) : (
              <select style={s.smallInput}
                value={selCombo?.data?.label ?? ''}
                onChange={e => onChange({ ...load, combo_label: e.target.value })}>
                {comboBlocks.map(b => (
                  <option key={b.id} value={b.data.label ?? ''}>
                    {b.data.label ?? '?'}
                  </option>
                ))}
              </select>
            )}
          </div>
          <NumField label="x₁ (m)" val={load.x1 ?? 0}
            set={v => onChange({ ...load, x1: v })} />
          <NumField label="x₂ (m)" val={load.x2 ?? L}
            set={v => onChange({ ...load, x2: v })} />
          <div style={s.fieldWrap}>
            <label style={s.miniLabel}>w (kN/m)</label>
            {comboW != null
              ? <span style={{ fontSize: 12, color: '#27ae60', fontWeight: 700, padding: '4px 6px' }}>
                  {comboW.toFixed(2)} {comboUnit}
                </span>
              : <span style={{ fontSize: 11, color: '#e67e22', padding: '4px 6px' }}>
                  run combo first
                </span>
            }
          </div>
        </>}

        {/* Point load ── P, x */}
        {lt === 'point' && <>
          <NumField label="P (kN)"  val={load.P_kN ?? 10}
            set={v => onChange({ ...load, P_kN: v })} />
          <NumField label="x (m)"   val={load.x ?? (L / 2)}
            set={v => onChange({ ...load, x: v })} />
        </>}

        {/* Moment ── M, x */}
        {lt === 'moment' && <>
          <NumField label="M (kNm)" val={load.M_kNm ?? 10}
            set={v => onChange({ ...load, M_kNm: v })} />
          <NumField label="x (m)"   val={load.x ?? (L / 2)}
            set={v => onChange({ ...load, x: v })} />
        </>}

        {/* Trapezoidal ── w1, w2, x1, x2 */}
        {lt === 'trapezoidal' && <>
          <NumField label="w₁ (kN/m)" val={load.w1_kNm ?? 10}
            set={v => onChange({ ...load, w1_kNm: v })} />
          <NumField label="w₂ (kN/m)" val={load.w2_kNm ?? 0}
            set={v => onChange({ ...load, w2_kNm: v })} />
          <NumField label="x₁ (m)" val={load.x1 ?? 0}
            set={v => onChange({ ...load, x1: v })} />
          <NumField label="x₂ (m)" val={load.x2 ?? L}
            set={v => onChange({ ...load, x2: v })} />
        </>}

      </div>
      <button onClick={onRemove} style={s.removeBtn} title="Remove">✕</button>
    </div>
  )
}

// Tiny numeric field used inside list rows
function NumField({ label, val, set }) {
  return (
    <div style={s.fieldWrap}>
      <label style={s.miniLabel}>{label}</label>
      <NumericInput style={s.smallInput} value={val} onChange={set} />
    </div>
  )
}

// ── FEM result panel ──────────────────────────────────────────────────────────

function FemResultPanel({ figB64, summary }) {
  const [open, setOpen] = useState(true)

  return (
    <div style={s.resultPanel}>
      <button style={s.summaryBar} onClick={() => setOpen(o => !o)}>
        <span style={s.summaryBadge}>
          Mmax = {summary.M_Ed_kNm.toFixed(2)} kNm
          &nbsp;·&nbsp;
          Vmax = {summary.V_Ed_kN.toFixed(2)} kN
          &nbsp;·&nbsp;
          δmax = {summary.delta_max_mm.toFixed(2)} mm
        </span>
        <span style={{ flex: 1 }} />
        <span style={s.summaryChevron}>{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>

      {open && (
        <div style={s.resultBody}>
          {figB64 && (
            <img
              src={`data:image/png;base64,${figB64}`}
              alt="FEM plot"
              style={{ width: '100%', display: 'block', marginBottom: 16 }}
            />
          )}

          <table style={s.table}>
            <thead>
              <tr>
                {['Result', 'Value', 'At x'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={s.td}>Max moment M_Ed</td>
                <td style={{ ...s.td, fontWeight: 600 }}>{summary.M_Ed_kNm.toFixed(3)} kNm</td>
                <td style={s.td}>{summary.x_M_Ed_m.toFixed(2)} m</td>
              </tr>
              <tr style={{ background: '#fafafa' }}>
                <td style={s.td}>Max shear V_Ed</td>
                <td style={{ ...s.td, fontWeight: 600 }}>{summary.V_Ed_kN.toFixed(3)} kN</td>
                <td style={s.td}>{summary.x_V_Ed_m.toFixed(2)} m</td>
              </tr>
              <tr>
                <td style={s.td}>Max deflection δ</td>
                <td style={{ ...s.td, fontWeight: 600 }}>{summary.delta_max_mm.toFixed(3)} mm</td>
                <td style={s.td}>{summary.x_delta_m.toFixed(2)} m</td>
              </tr>
            </tbody>
          </table>

          {summary.reactions && Object.keys(summary.reactions).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={s.sectionLabel}>Reactions</div>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>x (m)</th>
                    <th style={s.th}>R_v (kN)</th>
                    <th style={s.th}>R_M (kNm)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.reactions).map(([xStr, r], i) => (
                    <tr key={xStr} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
                      <td style={s.td}>{xStr}</td>
                      <td style={{ ...s.td, fontWeight: 600 }}>
                        {r.V !== undefined ? `${r.V.toFixed(3)}` : '—'}
                      </td>
                      <td style={s.td}>
                        {r.M !== undefined ? `${r.M.toFixed(3)}` : '—'}
                      </td>
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

// ── Main block component ──────────────────────────────────────────────────────

export default function BeamFemBlock({ block, onChange, blocks = [] }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)
  const [ePreset, setEPreset] = useState('Steel')

  // All load combo blocks available in this document
  const comboBlocks = blocks.filter(b => b.type === 'load_combo')

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  // Supports
  const supports = d.supports ?? [
    { x: 0,        type: 'pin'    },
    { x: d.L ?? 6, type: 'roller' },
  ]
  function updateSupport(i, sup) {
    const next = [...supports]; next[i] = sup; update({ supports: next })
  }
  function addSupport() {
    update({ supports: [...supports, { x: (d.L ?? 6) / 2, type: 'pin' }] })
  }
  function removeSupport(i) {
    update({ supports: supports.filter((_, j) => j !== i) })
  }

  // Loads
  const loads = d.loads ?? [
    { type: 'udl', w_kNm: 10, x1: 0, x2: d.L ?? 6 },
  ]
  function updateLoad(i, ld) {
    const next = [...loads]; next[i] = ld; update({ loads: next })
  }
  function addLoad(type = 'udl') {
    const L = d.L ?? 6
    const defaults = {
      udl:          { type: 'udl',         w_kNm: 10,   x1: 0, x2: L },
      combo_udl:    { type: 'combo_udl',   combo_label: comboBlocks[0]?.data?.label ?? '', x1: 0, x2: L },
      point:        { type: 'point',        P_kN: 10,    x: L / 2 },
      moment:       { type: 'moment',       M_kNm: 10,   x: L / 2 },
      trapezoidal:  { type: 'trapezoidal',  w1_kNm: 10, w2_kNm: 0, x1: 0, x2: L },
    }
    update({ loads: [...loads, defaults[type] || defaults.udl] })
  }
  function removeLoad(i) {
    update({ loads: loads.filter((_, j) => j !== i) })
  }

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const L = d.L ?? 6

      // Resolve any Combo UDL loads to their current E_d_uls value
      const resolvedLoads = loads.map(ld => {
        if (ld.type !== 'combo_udl') return ld
        const cb = comboBlocks.find(b => b.data.label === ld.combo_label) ?? comboBlocks[0]
        const w  = cb?.data?._exports?.E_d_uls ?? 0
        return { type: 'udl', w_kNm: w, x1: ld.x1 ?? 0, x2: ld.x2 ?? L }
      })

      const res = await calcBeamFem({
        title:    d.title ?? 'Beam FEM Analysis',
        L,
        E_GPa:    d.E_GPa ?? 210,
        I_cm4:    d.I_cm4 ?? 3000,
        supports: supports.map(sup => ({ x: sup.x, type: sup.type })),
        loads:    resolvedLoads,
      })
      update({
        _fig_b64: res._fig_b64,
        _summary: res._summary,
        _result:  res._result,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const L = d.L ?? 6
  const hasComboUdl = loads.some(ld => ld.type === 'combo_udl')
  const comboUdlReady = !hasComboUdl || loads
    .filter(ld => ld.type === 'combo_udl')
    .every(ld => {
      const cb = comboBlocks.find(b => b.data.label === ld.combo_label) ?? comboBlocks[0]
      return cb?.data?._exports?.E_d_uls != null
    })

  return (
    <div style={s.wrapper}>

      {/* Title */}
      <input type="text" value={d.title ?? 'Beam FEM Analysis'}
        onChange={e => update({ title: e.target.value })}
        placeholder="Analysis title"
        style={s.titleInput} />

      {/* ── Beam properties ── */}
      <div style={s.sectionLabel}>Beam properties</div>
      <div style={s.grid}>
        <Field label="Span L (m)">
          <NumericInput style={s.input} value={d.L ?? 6}
            onChange={v => update({ L: v })} />
        </Field>

        <Field label="Material">
          <select style={s.input} value={ePreset}
            onChange={e => {
              const preset = E_PRESETS.find(p => p.label === e.target.value)
              setEPreset(e.target.value)
              if (preset?.value != null) update({ E_GPa: preset.value })
            }}>
            {E_PRESETS.map(p => <option key={p.label}>{p.label}</option>)}
          </select>
        </Field>

        <Field label="E (GPa)">
          <NumericInput style={s.input} value={d.E_GPa ?? 210}
            onChange={v => { setEPreset('Custom'); update({ E_GPa: v }) }} />
        </Field>

        <Field label="I (cm⁴)">
          <NumericInput style={s.input} value={d.I_cm4 ?? 3000}
            onChange={v => update({ I_cm4: v })} />
        </Field>
      </div>

      {/* ── Supports ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <div style={s.sectionLabel}>Supports</div>
        <button style={s.addBtn} onClick={addSupport}>+ Add support</button>
      </div>
      {supports.map((sup, i) => (
        <SupportRow key={i} sup={sup} L={L}
          onChange={sup => updateSupport(i, sup)}
          onRemove={() => removeSupport(i)} />
      ))}

      {/* ── Loads ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <div style={s.sectionLabel}>Loads</div>
        {['udl', 'combo_udl', 'point', 'moment', 'trapezoidal'].map(lt => (
          <button key={lt} style={s.addBtn} onClick={() => addLoad(lt)}>
            + {lt === 'udl' ? 'UDL'
              : lt === 'combo_udl' ? 'Combo UDL'
              : lt === 'point' ? 'Point'
              : lt === 'moment' ? 'Moment'
              : 'Trapezoidal'}
          </button>
        ))}
      </div>
      {loads.map((ld, i) => (
        <LoadRow key={i} load={ld} L={L} comboBlocks={comboBlocks}
          onChange={ld => updateLoad(i, ld)}
          onRemove={() => removeLoad(i)} />
      ))}

      {/* ── Run button ── */}
      <div style={s.actionRow}>
        <button
          style={{ ...s.btn, ...s.btnRun, opacity: !comboUdlReady ? 0.5 : 1 }}
          onClick={handleRun}
          disabled={running || !comboUdlReady}
          title={!comboUdlReady ? 'Run the linked combo block(s) first' : undefined}
        >
          {running ? '⏳  Running…' : '▶  Run FEM'}
        </button>
        {d._result && (
          <button style={s.btn} onClick={() => update({ _fig_b64: null, _summary: null, _result: null })}>
            ✕  Clear
          </button>
        )}
      </div>

      {/* Error */}
      {error && <div style={s.error}>{error}</div>}

      {/* Result */}
      {d._summary && d._fig_b64 && (
        <FemResultPanel figB64={d._fig_b64} summary={d._summary} />
      )}

    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  wrapper: {
    display:       'flex',
    flexDirection: 'column',
    gap:           10,
  },
  titleInput: {
    border:     '1px solid #e8e8e8',
    padding:    '6px 10px',
    fontSize:   13,
    fontWeight: 600,
    outline:    'none',
    fontFamily: 'inherit',
    width:      '100%',
    boxSizing:  'border-box',
  },
  grid: {
    display:             'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap:                 10,
    alignItems:          'end',
  },
  sectionLabel: {
    fontSize:      10,
    fontWeight:    700,
    color:         '#aaa',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    margin:        '2px 0',
  },
  input: {
    border:     '1px solid #e8e8e8',
    padding:    '6px 8px',
    fontSize:   13,
    fontFamily: 'inherit',
    outline:    'none',
    width:      '100%',
    boxSizing:  'border-box',
  },
  listRow: {
    display:     'flex',
    alignItems:  'flex-end',
    gap:         8,
    background:  '#fafafa',
    border:      '1px solid #f0f0f0',
    padding:     '8px 10px',
    borderRadius: 2,
  },
  listRowInner: {
    display:    'flex',
    flex:       1,
    gap:        8,
    flexWrap:   'wrap',
    alignItems: 'flex-end',
  },
  fieldWrap: {
    display:       'flex',
    flexDirection: 'column',
    gap:           3,
  },
  miniLabel: {
    fontSize:      10,
    fontWeight:    600,
    color:         '#888',
    letterSpacing: '0.04em',
  },
  smallInput: {
    border:     '1px solid #e0e0e0',
    padding:    '4px 6px',
    fontSize:   12,
    fontFamily: 'inherit',
    outline:    'none',
    width:      80,
    boxSizing:  'border-box',
  },
  removeBtn: {
    background: 'none',
    border:     'none',
    color:      '#ccc',
    cursor:     'pointer',
    fontSize:   14,
    padding:    '4px 6px',
    lineHeight: 1,
    alignSelf:  'flex-start',
  },
  addBtn: {
    background:    '#f5f5f7',
    border:        '1px solid #e8e8e8',
    padding:       '4px 10px',
    fontSize:      11,
    fontWeight:    600,
    cursor:        'pointer',
    fontFamily:    'inherit',
    letterSpacing: '0.04em',
    color:         '#555',
  },
  actionRow: {
    display:   'flex',
    gap:       8,
    marginTop: 4,
  },
  btn: {
    background:    '#f5f5f7',
    border:        '1px solid #e8e8e8',
    padding:       '7px 14px',
    fontSize:      12,
    fontWeight:    600,
    cursor:        'pointer',
    fontFamily:    'inherit',
    letterSpacing: '0.04em',
  },
  btnRun: {
    background: '#111',
    color:      '#fff',
    border:     '1px solid #111',
  },
  error: {
    background: '#fdf3f2',
    border:     '1px solid #f5c6c6',
    padding:    '8px 12px',
    fontSize:   12,
    color:      '#c0392b',
  },
  resultPanel: {
    border:    '1px solid #e8e8e8',
    marginTop: 2,
  },
  summaryBar: {
    display:      'flex',
    alignItems:   'center',
    gap:          8,
    width:        '100%',
    background:   '#f5f5f7',
    border:       'none',
    borderBottom: '1px solid #e8e8e8',
    padding:      '7px 12px',
    cursor:       'pointer',
    fontFamily:   'inherit',
    textAlign:    'left',
  },
  summaryBadge: {
    fontSize:   11,
    fontWeight: 700,
    color:      '#27ae60',
  },
  summaryChevron: {
    fontSize: 10,
    color:    '#aaa',
  },
  resultBody: {
    padding: '12px 14px',
  },
  table: {
    width:          '100%',
    borderCollapse: 'collapse',
    fontSize:       12,
    fontFamily:     'monospace',
  },
  th: {
    textAlign:     'left',
    padding:       '6px 10px',
    borderBottom:  '1px solid #e8e8e8',
    fontSize:      10,
    fontWeight:    700,
    color:         '#888',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    background:    '#fafafa',
    fontFamily:    'inherit',
  },
  td: {
    padding:      '5px 10px',
    borderBottom: '1px solid #f0f0f0',
    fontSize:     12,
  },
}
