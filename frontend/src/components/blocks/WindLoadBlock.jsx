/**
 * WindLoadBlock.jsx — EN 1991-1-4 + DK NA wind load
 *
 * Peak velocity pressure and indicative wall pressures
 * for a rectangular building.
 */
import React, { useState } from 'react'
import { calcWindLoad } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'

const TERRAIN_CATEGORIES = [
  { value: 'I',   label: 'I — Sea / open water' },
  { value: 'II',  label: 'II — Open (fields, grassland)' },
  { value: 'III', label: 'III — Suburban / forest' },
  { value: 'IV',  label: 'IV — Urban / city centre' },
]

export default function WindLoadBlock({ block, onChange }) {
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

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const blocks = await calcWindLoad({
        label:            d.label            ?? 'W1',
        terrain_category: d.terrain_category ?? 'II',
        v_b0_ms:          d.v_b0_ms          ?? 24.0,
        z_ref_m:          d.z_ref_m          ?? 8.0,
        h_m:              d.h_m              ?? 8.0,
        b_m:              d.b_m              ?? 10.0,
        d_m:              d.d_m              ?? 12.0,
        c_dir:            d.c_dir            ?? 1.0,
        c_season:         d.c_season         ?? 1.0,
        c_pe_windward:    d.c_pe_windward    ?? 0.8,
        c_pe_leeward:     d.c_pe_leeward     ?? -0.5,
        c_pi:             d.c_pi             ?? 0.2,
        rho_air:          d.rho_air          ?? 1.25,
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
      title={d.title ?? 'Wind Load Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Label">
        <input style={s.input} value={d.label ?? 'W1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Terrain category">
        <select style={s.input} value={d.terrain_category ?? 'II'}
          onChange={e => update({ terrain_category: e.target.value })}>
          {TERRAIN_CATEGORIES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </Field>
      <Field label="v_b,0 (m/s)" hint="DK: 24 m/s zone 1">
        <input style={s.input} type="number" step="0.5" min="10" max="50"
          value={d.v_b0_ms ?? 24.0} onChange={e => numVal('v_b0_ms', e)} />
      </Field>
      <Field label="z_ref (m)" hint="Reference height">
        <input style={s.input} type="number" step="0.5" min="1"
          value={d.z_ref_m ?? 8.0} onChange={e => numVal('z_ref_m', e)} />
      </Field>
      <Field label="h (m)" hint="Building height">
        <input style={s.input} type="number" step="0.5" min="1"
          value={d.h_m ?? 8.0} onChange={e => numVal('h_m', e)} />
      </Field>
      <Field label="b (m)" hint="Breadth (crosswind)">
        <input style={s.input} type="number" step="0.5" min="1"
          value={d.b_m ?? 10.0} onChange={e => numVal('b_m', e)} />
      </Field>
      <Field label="d (m)" hint="Depth (along wind)">
        <input style={s.input} type="number" step="0.5" min="1"
          value={d.d_m ?? 12.0} onChange={e => numVal('d_m', e)} />
      </Field>
      <Field label="c_pe windward">
        <input style={s.input} type="number" step="0.05"
          value={d.c_pe_windward ?? 0.8} onChange={e => numVal('c_pe_windward', e)} />
      </Field>
      <Field label="c_pe leeward">
        <input style={s.input} type="number" step="0.05"
          value={d.c_pe_leeward ?? -0.5} onChange={e => numVal('c_pe_leeward', e)} />
      </Field>
      <Field label="c_pi" hint="Internal pressure">
        <input style={s.input} type="number" step="0.05"
          value={d.c_pi ?? 0.2} onChange={e => numVal('c_pi', e)} />
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
