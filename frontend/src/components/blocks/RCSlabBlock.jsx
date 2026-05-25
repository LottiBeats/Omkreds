/**
 * RCSlabBlock.jsx — EN 1992-1-1 one-way RC slab check
 *
 * Simply supported one-way slab: bending flexure + deflection L/d check.
 */
import React, { useState } from 'react'
import { calcRcSlab } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

export default function RCSlabBlock({ block, onChange }) {
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
      const blocks = await calcRcSlab({
        label:        d.label        ?? 'D1',
        span_m:       d.span_m       ?? 5.0,
        h_mm:         d.h_mm         ?? 200,
        d_mm:         d.d_mm         ?? 165,
        g_k_kNm2:     d.g_k_kNm2    ?? 3.5,
        q_k_kNm2:     d.q_k_kNm2    ?? 2.5,
        fck_MPa:      d.fck_MPa      ?? 30,
        fyk_MPa:      d.fyk_MPa      ?? 500,
        As_prov_mm2m: d.As_prov_mm2m ?? null,
        gamma_C:      d.gamma_C      ?? 1.5,
        gamma_S:      d.gamma_S      ?? 1.15,
        cover_mm:     d.cover_mm     ?? 35,
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
      title={d.title ?? 'RC Slab Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Label">
        <input style={s.input} value={d.label ?? 'D1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Span (m)">
        <NumericInput style={s.input} value={d.span_m ?? 5.0}
          onChange={v => update({ span_m: v })} />
      </Field>
      <Field label="h (mm)" hint="Slab thickness">
        <NumericInput style={s.input} value={d.h_mm ?? 200}
          onChange={v => update({ h_mm: v })} />
      </Field>
      <Field label="d (mm)" hint="Effective depth">
        <NumericInput style={s.input} value={d.d_mm ?? 165}
          onChange={v => update({ d_mm: v })} />
      </Field>
      <Field label="g_k (kN/m²)" hint="Permanent">
        <NumericInput style={s.input} value={d.g_k_kNm2 ?? 3.5}
          onChange={v => update({ g_k_kNm2: v })} />
      </Field>
      <Field label="q_k (kN/m²)" hint="Variable">
        <NumericInput style={s.input} value={d.q_k_kNm2 ?? 2.5}
          onChange={v => update({ q_k_kNm2: v })} />
      </Field>
      <Field label="f_ck (MPa)">
        <NumericInput style={s.input} value={d.fck_MPa ?? 30}
          onChange={v => update({ fck_MPa: v })} />
      </Field>
      <Field label="f_yk (MPa)">
        <NumericInput style={s.input} value={d.fyk_MPa ?? 500}
          onChange={v => update({ fyk_MPa: v })} />
      </Field>
      <Field label="As,prov (mm²/m)" hint="Leave blank = use As,req">
        <input style={s.input} inputMode="decimal"
          placeholder="auto"
          value={d.As_prov_mm2m ?? ''}
          onChange={e => {
            const v = parseFloat(e.target.value)
            update({ As_prov_mm2m: isNaN(v) ? null : v })
          }} />
      </Field>
      <Field label="Cover (mm)">
        <NumericInput style={s.input} value={d.cover_mm ?? 35}
          onChange={v => update({ cover_mm: v })} />
      </Field>
      <Field label="γ_C">
        <NumericInput style={s.input} value={d.gamma_C ?? 1.5}
          onChange={v => update({ gamma_C: v })} />
      </Field>
      <Field label="γ_S">
        <NumericInput style={s.input} value={d.gamma_S ?? 1.15}
          onChange={v => update({ gamma_S: v })} />
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
