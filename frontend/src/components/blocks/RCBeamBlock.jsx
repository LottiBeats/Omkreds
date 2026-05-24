/**
 * RCBeamBlock.jsx — EN 1992-1-1 reinforced concrete beam
 *
 * Checks: ULS bending moment, required + minimum reinforcement area.
 */
import React, { useState } from 'react'
import { calcRcBeam } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'

const F_CK_OPTIONS = [20, 25, 28, 30, 32, 35, 40, 45, 50]

export default function RCBeamBlock({ block, onChange }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  function num(field, e) {
    const v = parseFloat(e.target.value)
    if (!isNaN(v)) update({ [field]: v })
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
        <input style={s} type="number" step="0.1" min="0.1"
          value={d.span_m ?? 5.0} onChange={e => num('span_m', e)} />
      </Field>
      <Field label="Width b (mm)">
        <input style={s} type="number" step="25" min="100"
          value={d.b_mm ?? 300} onChange={e => num('b_mm', e)} />
      </Field>
      <Field label="Total depth h (mm)">
        <input style={s} type="number" step="25" min="100"
          value={d.h_mm ?? 500} onChange={e => num('h_mm', e)} />
      </Field>
      <Field label="Eff. depth d (mm)">
        <input style={s} type="number" step="5" min="50"
          value={d.d_mm ?? 450} onChange={e => num('d_mm', e)} />
      </Field>
      <Field label="g_k (kN/m)" hint="Permanent">
        <input style={s} type="number" step="0.5" min="0"
          value={d.g_k_kNm ?? 10.0} onChange={e => num('g_k_kNm', e)} />
      </Field>
      <Field label="q_k (kN/m)" hint="Variable">
        <input style={s} type="number" step="0.5" min="0"
          value={d.q_k_kNm ?? 6.0} onChange={e => num('q_k_kNm', e)} />
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
        <input style={s} type="number" step="100" min="0"
          value={d.As_prov_mm2 ?? ''}
          placeholder="leave blank"
          onChange={e => update({ As_prov_mm2: e.target.value ? parseFloat(e.target.value) : null })} />
      </Field>
      <Field label="γ_C">
        <input style={s} type="number" step="0.05" min="1"
          value={d.gamma_C ?? 1.5} onChange={e => num('gamma_C', e)} />
      </Field>
      <Field label="γ_S">
        <input style={s} type="number" step="0.05" min="1"
          value={d.gamma_S ?? 1.15} onChange={e => num('gamma_S', e)} />
      </Field>
    </CalcBlockShell>
  )
}

const s = {
  border: '1px solid #e8e8e8', padding: '6px 8px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
}
