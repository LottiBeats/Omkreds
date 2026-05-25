/**
 * MasonryWallBlock.jsx — EN 1996-1-1 unreinforced masonry wall
 *
 * Checks: compressive strength, slenderness, vertical load capacity.
 */
import React, { useState } from 'react'
import { calcMasonryWall } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

export default function MasonryWallBlock({ block, onChange }) {
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
      const blocks = await calcMasonryWall({
        label:         d.label         ?? 'W1',
        height_m:      d.height_m      ?? 3.0,
        thickness_mm:  d.thickness_mm  ?? 228,
        length_m:      d.length_m      ?? 5.0,
        N_k_kN:        d.N_k_kN        ?? 100.0,
        f_b_MPa:       d.f_b_MPa       ?? 10.0,
        f_m_MPa:       d.f_m_MPa       ?? 6.0,
        gamma_M:       d.gamma_M       ?? 2.5,
        K:             d.K             ?? 0.55,
        alpha:         d.alpha         ?? 0.7,
        beta:          d.beta          ?? 0.3,
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
      title={d.title ?? 'Masonry Wall Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Label">
        <input style={s} value={d.label ?? 'W1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Height (m)">
        <NumericInput style={s} value={d.height_m ?? 3.0}
          onChange={v => update({ height_m: v })} />
      </Field>
      <Field label="Thickness (mm)">
        <NumericInput style={s} value={d.thickness_mm ?? 228}
          onChange={v => update({ thickness_mm: v })} />
      </Field>
      <Field label="Length (m)">
        <NumericInput style={s} value={d.length_m ?? 5.0}
          onChange={v => update({ length_m: v })} />
      </Field>
      <Field label="N_k (kN)" hint="Characteristic vertical load">
        <NumericInput style={s} value={d.N_k_kN ?? 100.0}
          onChange={v => update({ N_k_kN: v })} />
      </Field>
      <Field label="f_b (MPa)" hint="Unit compressive strength">
        <NumericInput style={s} value={d.f_b_MPa ?? 10.0}
          onChange={v => update({ f_b_MPa: v })} />
      </Field>
      <Field label="f_m (MPa)" hint="Mortar strength">
        <NumericInput style={s} value={d.f_m_MPa ?? 6.0}
          onChange={v => update({ f_m_MPa: v })} />
      </Field>
      <Field label="γ_M">
        <NumericInput style={s} value={d.gamma_M ?? 2.5}
          onChange={v => update({ gamma_M: v })} />
      </Field>
      <Field label="K" hint="Eq. 3.1 constant">
        <NumericInput style={s} value={d.K ?? 0.55}
          onChange={v => update({ K: v })} />
      </Field>
      <Field label="α">
        <NumericInput style={s} value={d.alpha ?? 0.7}
          onChange={v => update({ alpha: v })} />
      </Field>
      <Field label="β">
        <NumericInput style={s} value={d.beta ?? 0.3}
          onChange={v => update({ beta: v })} />
      </Field>
    </CalcBlockShell>
  )
}

const s = {
  border: '1px solid #e8e8e8', padding: '6px 8px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
}
