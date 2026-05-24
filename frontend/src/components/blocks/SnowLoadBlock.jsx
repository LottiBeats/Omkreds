/**
 * SnowLoadBlock.jsx — EN 1991-1-3 + DK NA snow load on roof
 *
 * Characteristic and design snow load from ground load + roof geometry.
 */
import React, { useState } from 'react'
import { calcSnowLoad } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'

const ROOF_TYPES = [
  { value: 'flat',       label: 'Flat (α = 0°)' },
  { value: 'pitched',    label: 'Pitched (both slopes)' },
  { value: 'mono-pitch', label: 'Mono-pitch (one slope)' },
]

const DK_ZONES = [
  { value: '1', label: 'Zone 1 — Most of DK (1.0 kN/m²)' },
  { value: '2', label: 'Zone 2 — N. Jutland coast (0.9 kN/m²)' },
  { value: '3', label: 'Zone 3 — Elevated/hilly (1.5 kN/m²)' },
]

// Default s_k per zone
const ZONE_SK = { '1': 1.0, '2': 0.9, '3': 1.5 }

export default function SnowLoadBlock({ block, onChange }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  function numVal(field, e) {
    const v = parseFloat(e.target.value)
    if (!isNaN(v)) update({ [field]: v })
  }

  function handleZoneChange(zone) {
    update({ dk_zone: zone, s_k_kNm2: ZONE_SK[zone] ?? 1.0 })
  }

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const blocks = await calcSnowLoad({
        label:         d.label         ?? 'SN1',
        roof_type:     d.roof_type     ?? 'pitched',
        alpha_deg:     d.alpha_deg     ?? 20.0,
        s_k_kNm2:      d.s_k_kNm2     ?? 1.0,
        dk_zone:       d.dk_zone       ?? '1',
        C_e:           d.C_e           ?? 1.0,
        C_t:           d.C_t           ?? 1.0,
        roof_span_m:   d.roof_span_m   ?? 8.0,
        eave_height_m: d.eave_height_m ?? 3.0,
        gamma_s:       d.gamma_s       ?? 1.5,
      })
      update({ _result: blocks })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <CalcBlockShell
      title={d.title ?? 'Snow Load Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Label">
        <input style={s.input} value={d.label ?? 'SN1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="DK snow zone">
        <select style={s.input} value={d.dk_zone ?? '1'}
          onChange={e => handleZoneChange(e.target.value)}>
          {DK_ZONES.map(z => (
            <option key={z.value} value={z.value}>{z.label}</option>
          ))}
        </select>
      </Field>
      <Field label="s_k (kN/m²)" hint="Ground snow load">
        <input style={s.input} type="number" step="0.1" min="0"
          value={d.s_k_kNm2 ?? 1.0} onChange={e => numVal('s_k_kNm2', e)} />
      </Field>
      <Field label="Roof type">
        <select style={s.input} value={d.roof_type ?? 'pitched'}
          onChange={e => update({ roof_type: e.target.value })}>
          {ROOF_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </Field>
      <Field label="α (°)" hint="Roof pitch angle">
        <input style={s.input} type="number" step="1" min="0" max="90"
          value={d.alpha_deg ?? 20.0} onChange={e => numVal('alpha_deg', e)} />
      </Field>
      <Field label="Roof span (m)">
        <input style={s.input} type="number" step="0.5" min="1"
          value={d.roof_span_m ?? 8.0} onChange={e => numVal('roof_span_m', e)} />
      </Field>
      <Field label="Eave height (m)">
        <input style={s.input} type="number" step="0.1" min="0"
          value={d.eave_height_m ?? 3.0} onChange={e => numVal('eave_height_m', e)} />
      </Field>
      <Field label="C_e" hint="Exposure coeff.">
        <input style={s.input} type="number" step="0.1" min="0.5" max="1.5"
          value={d.C_e ?? 1.0} onChange={e => numVal('C_e', e)} />
      </Field>
      <Field label="C_t" hint="Thermal coeff.">
        <input style={s.input} type="number" step="0.1" min="0.5" max="1.5"
          value={d.C_t ?? 1.0} onChange={e => numVal('C_t', e)} />
      </Field>
      <Field label="γ_s" hint="Snow partial factor">
        <input style={s.input} type="number" step="0.1" min="1"
          value={d.gamma_s ?? 1.5} onChange={e => numVal('gamma_s', e)} />
      </Field>
    </CalcBlockShell>
  )
}

const s = {
  input: {
    border: '1px solid #e8e8e8', padding: '6px 8px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
  },
}
