/**
 * FoundationBlock.jsx — EN 1997-1 Annex D spread footing bearing check
 *
 * Rectangular footing on Mohr-Coulomb soil (drained c', φ').
 */
import React, { useState } from 'react'
import { calcFoundation } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'

export default function FoundationBlock({ block, onChange }) {
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
      const blocks = await calcFoundation({
        label:        d.label        ?? 'F1',
        B_m:          d.B_m          ?? 1.5,
        L_m:          d.L_m          ?? 2.0,
        D_m:          d.D_m          ?? 0.8,
        c_kPa:        d.c_kPa        ?? 5.0,
        phi_deg:      d.phi_deg      ?? 30.0,
        gamma_kNm3:   d.gamma_kNm3   ?? 18.0,
        gamma_b_kNm3: d.gamma_b_kNm3 ?? 10.0,
        water_table:  d.water_table  ?? false,
        V_Ed_kN:      d.V_Ed_kN      ?? 300.0,
        H_Ed_kN:      d.H_Ed_kN      ?? 0.0,
        M_Ed_kNm:     d.M_Ed_kNm     ?? 0.0,
        gamma_phi:    d.gamma_phi    ?? 1.0,
        gamma_c:      d.gamma_c      ?? 1.0,
        gamma_Rv:     d.gamma_Rv     ?? 1.4,
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
      title={d.title ?? 'Foundation Bearing Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Label">
        <input style={s.input} value={d.label ?? 'F1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="B (m)" hint="Footing width">
        <input style={s.input} type="number" step="0.1" min="0.3"
          value={d.B_m ?? 1.5} onChange={e => numVal('B_m', e)} />
      </Field>
      <Field label="L (m)" hint="Footing length">
        <input style={s.input} type="number" step="0.1" min="0.3"
          value={d.L_m ?? 2.0} onChange={e => numVal('L_m', e)} />
      </Field>
      <Field label="D (m)" hint="Embedment depth">
        <input style={s.input} type="number" step="0.1" min="0"
          value={d.D_m ?? 0.8} onChange={e => numVal('D_m', e)} />
      </Field>
      <Field label="c' (kPa)" hint="Effective cohesion">
        <input style={s.input} type="number" step="1" min="0"
          value={d.c_kPa ?? 5.0} onChange={e => numVal('c_kPa', e)} />
      </Field>
      <Field label="φ' (°)" hint="Friction angle">
        <input style={s.input} type="number" step="1" min="1" max="54"
          value={d.phi_deg ?? 30.0} onChange={e => numVal('phi_deg', e)} />
      </Field>
      <Field label="γ (kN/m³)" hint="Soil unit weight">
        <input style={s.input} type="number" step="0.5" min="8" max="25"
          value={d.gamma_kNm3 ?? 18.0} onChange={e => numVal('gamma_kNm3', e)} />
      </Field>
      <Field label="γ' (kN/m³)" hint="Buoyant weight">
        <input style={s.input} type="number" step="0.5" min="4" max="15"
          value={d.gamma_b_kNm3 ?? 10.0} onChange={e => numVal('gamma_b_kNm3', e)} />
      </Field>
      <Field label="Water table at base">
        <input type="checkbox" checked={d.water_table ?? false}
          onChange={e => update({ water_table: e.target.checked })} />
      </Field>
      <Field label="V_Ed (kN)" hint="Design vertical load">
        <input style={s.input} type="number" step="10" min="1"
          value={d.V_Ed_kN ?? 300.0} onChange={e => numVal('V_Ed_kN', e)} />
      </Field>
      <Field label="H_Ed (kN)" hint="Horizontal load (B-dir)">
        <input style={s.input} type="number" step="5" min="0"
          value={d.H_Ed_kN ?? 0.0} onChange={e => numVal('H_Ed_kN', e)} />
      </Field>
      <Field label="M_Ed (kNm)" hint="Moment about L-axis">
        <input style={s.input} type="number" step="5"
          value={d.M_Ed_kNm ?? 0.0} onChange={e => numVal('M_Ed_kNm', e)} />
      </Field>
      <Field label="γ_R,v" hint="Resistance factor GEO">
        <input style={s.input} type="number" step="0.1" min="1.0"
          value={d.gamma_Rv ?? 1.4} onChange={e => numVal('gamma_Rv', e)} />
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
