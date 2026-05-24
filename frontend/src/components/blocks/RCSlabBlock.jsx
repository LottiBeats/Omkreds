/**
 * RCSlabBlock.jsx — EN 1992-1-1 one-way RC slab check
 *
 * Simply supported one-way slab: bending flexure + deflection L/d check.
 */
import React, { useState } from 'react'
import { calcRcSlab } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'

export default function RCSlabBlock({ block, onChange }) {
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
        <input style={s.input} type="number" step="0.1" min="1"
          value={d.span_m ?? 5.0} onChange={e => numVal('span_m', e)} />
      </Field>
      <Field label="h (mm)" hint="Slab thickness">
        <input style={s.input} type="number" step="10" min="60"
          value={d.h_mm ?? 200} onChange={e => numVal('h_mm', e)} />
      </Field>
      <Field label="d (mm)" hint="Effective depth">
        <input style={s.input} type="number" step="5" min="40"
          value={d.d_mm ?? 165} onChange={e => numVal('d_mm', e)} />
      </Field>
      <Field label="g_k (kN/m²)" hint="Permanent">
        <input style={s.input} type="number" step="0.1" min="0"
          value={d.g_k_kNm2 ?? 3.5} onChange={e => numVal('g_k_kNm2', e)} />
      </Field>
      <Field label="q_k (kN/m²)" hint="Variable">
        <input style={s.input} type="number" step="0.1" min="0"
          value={d.q_k_kNm2 ?? 2.5} onChange={e => numVal('q_k_kNm2', e)} />
      </Field>
      <Field label="f_ck (MPa)">
        <input style={s.input} type="number" step="5" min="12"
          value={d.fck_MPa ?? 30} onChange={e => numVal('fck_MPa', e)} />
      </Field>
      <Field label="f_yk (MPa)">
        <input style={s.input} type="number" step="50" min="400"
          value={d.fyk_MPa ?? 500} onChange={e => numVal('fyk_MPa', e)} />
      </Field>
      <Field label="As,prov (mm²/m)" hint="Leave blank = use As,req">
        <input style={s.input} type="number" step="50" min="0"
          placeholder="auto"
          value={d.As_prov_mm2m ?? ''}
          onChange={e => {
            const v = parseFloat(e.target.value)
            update({ As_prov_mm2m: isNaN(v) ? null : v })
          }} />
      </Field>
      <Field label="Cover (mm)">
        <input style={s.input} type="number" step="5" min="10"
          value={d.cover_mm ?? 35} onChange={e => numVal('cover_mm', e)} />
      </Field>
      <Field label="γ_C">
        <input style={s.input} type="number" step="0.05" min="1"
          value={d.gamma_C ?? 1.5} onChange={e => numVal('gamma_C', e)} />
      </Field>
      <Field label="γ_S">
        <input style={s.input} type="number" step="0.05" min="1"
          value={d.gamma_S ?? 1.15} onChange={e => numVal('gamma_S', e)} />
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
