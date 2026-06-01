/**
 * RoofDeadLoadBlock.jsx — EN 1991-1-1 roof permanent load
 *
 * Computes g_k per rafter [kN/m, horizontal projection] from a user-defined
 * layer table (kN/m² on roof surface) plus rafter self-weight.
 */
import React, { useState } from 'react'
import { calcRoofDeadLoad } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const DEFAULT_LAYERS = [
  { description: 'Tegltagsten (monier)',        g_kNm2: 0.55 },
  { description: 'Lægte + kontralägte (38 mm)', g_kNm2: 0.04 },
  { description: 'Undertag (vindspærrepap)',     g_kNm2: 0.03 },
  { description: 'Krydsfinérsarking 12 mm',     g_kNm2: 0.07 },
  { description: 'Isolering 200 mm (glasuld)',   g_kNm2: 0.04 },
  { description: 'Dampspærre',                  g_kNm2: 0.01 },
]

export default function RoofDeadLoadBlock({ block, onChange }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  const layers = d.layers ?? DEFAULT_LAYERS

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  function updateLayer(i, changes) {
    const next = layers.map((l, j) => j === i ? { ...l, ...changes } : l)
    update({ layers: next })
  }

  function addLayer() {
    update({ layers: [...layers, { description: '', g_kNm2: 0.0 }] })
  }

  function removeLayer(i) {
    update({ layers: layers.filter((_, j) => j !== i) })
  }

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const res = await calcRoofDeadLoad({
        title:     d.title     ?? 'Roof Dead Load',
        label:     d.label     ?? 'G1',
        alpha_deg: d.alpha_deg ?? 30.0,
        a_m:       d.a_m       ?? 1.0,
        layers:    layers,
        b_mm:      d.b_mm      ?? 45.0,
        h_mm:      d.h_mm      ?? 145.0,
        rho_kgm3:  d.rho_kgm3  ?? 380.0,
      })
      update({ _result: res._result })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const g_tag = layers.reduce((s, l) => s + (l.g_kNm2 ?? 0), 0)

  return (
    <CalcBlockShell
      title={d.title ?? 'Roof Dead Load'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <div style={s.row}>
        <Field label="Label">
          <input style={s.input} value={d.label ?? 'G1'}
            onChange={e => update({ label: e.target.value })} />
        </Field>
        <Field label="α (°)" hint="Roof pitch">
          <NumericInput style={s.input} value={d.alpha_deg ?? 30.0}
            onChange={v => update({ alpha_deg: v })} />
        </Field>
        <Field label="a (m)" hint="Rafter spacing">
          <NumericInput style={s.input} value={d.a_m ?? 1.0}
            onChange={v => update({ a_m: v })} />
        </Field>
      </div>

      {/* Layer table */}
      <div style={s.tableWrap}>
        <div style={s.tableHeader}>
          <span style={{ flex: 3 }}>Layer description</span>
          <span style={{ flex: 1, textAlign: 'right' }}>g_k (kN/m²)</span>
          <span style={{ width: 28 }} />
        </div>
        {layers.map((l, i) => (
          <div key={i} style={s.tableRow}>
            <input
              style={{ ...s.input, flex: 3 }}
              value={l.description}
              placeholder="e.g. Tegltagsten"
              onChange={e => updateLayer(i, { description: e.target.value })}
            />
            <NumericInput
              style={{ ...s.input, flex: 1, textAlign: 'right' }}
              value={l.g_kNm2}
              onChange={v => updateLayer(i, { g_kNm2: v })}
            />
            <button style={s.removeBtn} onClick={() => removeLayer(i)}>✕</button>
          </div>
        ))}
        <div style={s.tableRow}>
          <span style={{ flex: 3, fontWeight: 600, fontSize: 12, color: '#374151' }}>
            Total g_tag
          </span>
          <span style={{ flex: 1, textAlign: 'right', fontWeight: 600, fontSize: 12 }}>
            {g_tag.toFixed(3)} kN/m²
          </span>
          <span style={{ width: 28 }} />
        </div>
        <button style={s.addBtn} onClick={addLayer}>+ Add layer</button>
      </div>

      {/* Rafter self-weight */}
      <div style={s.sectionLabel}>Rafter self-weight</div>
      <div style={s.row}>
        <Field label="b (mm)">
          <NumericInput style={s.input} value={d.b_mm ?? 45.0}
            onChange={v => update({ b_mm: v })} />
        </Field>
        <Field label="h (mm)">
          <NumericInput style={s.input} value={d.h_mm ?? 145.0}
            onChange={v => update({ h_mm: v })} />
        </Field>
        <Field label="ρ (kg/m³)">
          <NumericInput style={s.input} value={d.rho_kgm3 ?? 380.0}
            onChange={v => update({ rho_kgm3: v })} />
        </Field>
      </div>
    </CalcBlockShell>
  )
}

const s = {
  row: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  input: {
    border: '1px solid #e8e8e8', padding: '6px 8px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
  },
  tableWrap: { marginBottom: 8 },
  tableHeader: {
    display: 'flex', gap: 6, alignItems: 'center',
    fontSize: 11, color: '#6b7280', fontWeight: 600,
    padding: '2px 4px', borderBottom: '1px solid #e5e7eb', marginBottom: 2,
  },
  tableRow: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 },
  removeBtn: {
    width: 22, height: 22, border: 'none', background: 'none',
    cursor: 'pointer', color: '#9ca3af', fontSize: 12, padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    marginTop: 4, border: '1px dashed #d1d5db', background: 'none',
    cursor: 'pointer', fontSize: 12, color: '#6b7280', padding: '4px 10px',
    borderRadius: 4,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    marginBottom: 4, marginTop: 4,
  },
}
