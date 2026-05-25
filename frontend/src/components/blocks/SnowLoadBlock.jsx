/**
 * SnowLoadBlock.jsx — EN 1991-1-3 + DK NA snow load on roof
 *
 * Characteristic and design snow load from ground load + roof geometry.
 */
import React, { useState } from 'react'
import { calcSnowLoad } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

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
        <NumericInput style={s.input} value={d.s_k_kNm2 ?? 1.0}
          onChange={v => update({ s_k_kNm2: v })} />
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
        <NumericInput style={s.input} value={d.alpha_deg ?? 20.0}
          onChange={v => update({ alpha_deg: v })} />
      </Field>
      <Field label="Roof span (m)">
        <NumericInput style={s.input} value={d.roof_span_m ?? 8.0}
          onChange={v => update({ roof_span_m: v })} />
      </Field>
      <Field label="Eave height (m)">
        <NumericInput style={s.input} value={d.eave_height_m ?? 3.0}
          onChange={v => update({ eave_height_m: v })} />
      </Field>
      <Field label="C_e" hint="Exposure coeff.">
        <NumericInput style={s.input} value={d.C_e ?? 1.0}
          onChange={v => update({ C_e: v })} />
      </Field>
      <Field label="C_t" hint="Thermal coeff.">
        <NumericInput style={s.input} value={d.C_t ?? 1.0}
          onChange={v => update({ C_t: v })} />
      </Field>
      <Field label="γ_s" hint="Snow partial factor">
        <NumericInput style={s.input} value={d.gamma_s ?? 1.5}
          onChange={v => update({ gamma_s: v })} />
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
