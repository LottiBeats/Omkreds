/**
 * FoundationBlock.jsx — EN 1997-1 Annex D spread footing bearing check
 *
 * Rectangular footing on Mohr-Coulomb soil (drained c', φ').
 */
import React, { useState } from 'react'
import { calcFoundation } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

export default function FoundationBlock({ block, onChange }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
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
        <NumericInput style={s.input} value={d.B_m ?? 1.5}
          onChange={v => update({ B_m: v })} />
      </Field>
      <Field label="L (m)" hint="Footing length">
        <NumericInput style={s.input} value={d.L_m ?? 2.0}
          onChange={v => update({ L_m: v })} />
      </Field>
      <Field label="D (m)" hint="Embedment depth">
        <NumericInput style={s.input} value={d.D_m ?? 0.8}
          onChange={v => update({ D_m: v })} />
      </Field>
      <Field label="c' (kPa)" hint="Effective cohesion">
        <NumericInput style={s.input} value={d.c_kPa ?? 5.0}
          onChange={v => update({ c_kPa: v })} />
      </Field>
      <Field label="φ' (°)" hint="Friction angle">
        <NumericInput style={s.input} value={d.phi_deg ?? 30.0}
          onChange={v => update({ phi_deg: v })} />
      </Field>
      <Field label="γ (kN/m³)" hint="Soil unit weight">
        <NumericInput style={s.input} value={d.gamma_kNm3 ?? 18.0}
          onChange={v => update({ gamma_kNm3: v })} />
      </Field>
      <Field label="γ' (kN/m³)" hint="Buoyant weight">
        <NumericInput style={s.input} value={d.gamma_b_kNm3 ?? 10.0}
          onChange={v => update({ gamma_b_kNm3: v })} />
      </Field>
      <Field label="Water table at base">
        <input type="checkbox" checked={d.water_table ?? false}
          onChange={e => update({ water_table: e.target.checked })} />
      </Field>
      <Field label="V_Ed (kN)" hint="Design vertical load">
        <NumericInput style={s.input} value={d.V_Ed_kN ?? 300.0}
          onChange={v => update({ V_Ed_kN: v })} />
      </Field>
      <Field label="H_Ed (kN)" hint="Horizontal load (B-dir)">
        <NumericInput style={s.input} value={d.H_Ed_kN ?? 0.0}
          onChange={v => update({ H_Ed_kN: v })} />
      </Field>
      <Field label="M_Ed (kNm)" hint="Moment about L-axis">
        <NumericInput style={s.input} value={d.M_Ed_kNm ?? 0.0}
          onChange={v => update({ M_Ed_kNm: v })} />
      </Field>
      <Field label="γ_R,v" hint="Resistance factor GEO">
        <NumericInput style={s.input} value={d.gamma_Rv ?? 1.4}
          onChange={v => update({ gamma_Rv: v })} />
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
