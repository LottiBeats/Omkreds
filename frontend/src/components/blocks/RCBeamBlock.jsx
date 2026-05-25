/**
 * RCBeamBlock.jsx — EN 1992-1-1 reinforced concrete beam
 *
 * Checks: ULS bending moment, required + minimum reinforcement area.
 */
import React, { useState } from 'react'
import { calcRcBeam } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const F_CK_OPTIONS = [20, 25, 28, 30, 32, 35, 40, 45, 50]

export default function RCBeamBlock({ block, onChange }) {
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
      const blocks = await calcRcBeam({
        label:    d.label   ?? 'B1',
        span_m:   d.span_m  ?? 5.0,
        b_mm:     d.b_mm    ?? 300,
        h_mm:     d.h_mm    ?? 500,
        d_mm:     d.d_mm    ?? 450,
        g_k_kNm: d.g_k_kNm ?? 10.0,
        q_k_kNm: d.q_k_kNm ?? 6.0,
        f_ck_MPa: d.f_ck_MPa ?? 30,
        f_yk_MPa: d.f_yk_MPa ?? 500,
        As_prov_mm2: d.As_prov_mm2 ?? null,
        gamma_C:  d.gamma_C ?? 1.5,
        gamma_S:  d.gamma_S ?? 1.15,
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
      title={d.title ?? 'RC Beam Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Label">
        <input style={s} value={d.label ?? 'B1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Span (m)">
        <NumericInput style={s} value={d.span_m ?? 5.0}
          onChange={v => update({ span_m: v })} />
      </Field>
      <Field label="Width b (mm)">
        <NumericInput style={s} value={d.b_mm ?? 300}
          onChange={v => update({ b_mm: v })} />
      </Field>
      <Field label="Total depth h (mm)">
        <NumericInput style={s} value={d.h_mm ?? 500}
          onChange={v => update({ h_mm: v })} />
      </Field>
      <Field label="Eff. depth d (mm)">
        <NumericInput style={s} value={d.d_mm ?? 450}
          onChange={v => update({ d_mm: v })} />
      </Field>
      <Field label="g_k (kN/m)" hint="Permanent">
        <NumericInput style={s} value={d.g_k_kNm ?? 10.0}
          onChange={v => update({ g_k_kNm: v })} />
      </Field>
      <Field label="q_k (kN/m)" hint="Variable">
        <NumericInput style={s} value={d.q_k_kNm ?? 6.0}
          onChange={v => update({ q_k_kNm: v })} />
      </Field>
      <Field label="f_ck (MPa)">
        <select style={s} value={d.f_ck_MPa ?? 30}
          onChange={e => update({ f_ck_MPa: Number(e.target.value) })}>
          {F_CK_OPTIONS.map(v => <option key={v} value={v}>C{v}</option>)}
        </select>
      </Field>
      <Field label="f_yk (MPa)">
        <select style={s} value={d.f_yk_MPa ?? 500}
          onChange={e => update({ f_yk_MPa: Number(e.target.value) })}>
          {[400, 500, 600].map(v => <option key={v} value={v}>B{v}B</option>)}
        </select>
      </Field>
      <Field label="As,prov (mm²)" hint="optional">
        <input style={s} inputMode="decimal"
          value={d.As_prov_mm2 ?? ''}
          placeholder="leave blank"
          onChange={e => update({ As_prov_mm2: e.target.value ? parseFloat(e.target.value) : null })} />
      </Field>
      <Field label="γ_C">
        <NumericInput style={s} value={d.gamma_C ?? 1.5}
          onChange={v => update({ gamma_C: v })} />
      </Field>
      <Field label="γ_S">
        <NumericInput style={s} value={d.gamma_S ?? 1.15}
          onChange={v => update({ gamma_S: v })} />
      </Field>
    </CalcBlockShell>
  )
}

const s = {
  border: '1px solid #e8e8e8', padding: '6px 8px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
}
