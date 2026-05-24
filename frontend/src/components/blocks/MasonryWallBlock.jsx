/**
 * MasonryWallBlock.jsx — EN 1996-1-1 unreinforced masonry wall
 *
 * Checks: compressive strength, slenderness, vertical load capacity.
 */
import React, { useState } from 'react'
import { calcMasonryWall } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'

export default function MasonryWallBlock({ block, onChange }) {
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
        <input style={s} type="number" step="0.1" min="0.1"
          value={d.height_m ?? 3.0} onChange={e => num('height_m', e)} />
      </Field>
      <Field label="Thickness (mm)">
        <input style={s} type="number" step="14" min="70"
          value={d.thickness_mm ?? 228} onChange={e => num('thickness_mm', e)} />
      </Field>
      <Field label="Length (m)">
        <input style={s} type="number" step="0.5" min="0.5"
          value={d.length_m ?? 5.0} onChange={e => num('length_m', e)} />
      </Field>
      <Field label="N_k (kN)" hint="Characteristic vertical load">
        <input style={s} type="number" step="5" min="0"
          value={d.N_k_kN ?? 100.0} onChange={e => num('N_k_kN', e)} />
      </Field>
      <Field label="f_b (MPa)" hint="Unit compressive strength">
        <input style={s} type="number" step="0.5" min="1"
          value={d.f_b_MPa ?? 10.0} onChange={e => num('f_b_MPa', e)} />
      </Field>
      <Field label="f_m (MPa)" hint="Mortar strength">
        <input style={s} type="number" step="0.5" min="1"
          value={d.f_m_MPa ?? 6.0} onChange={e => num('f_m_MPa', e)} />
      </Field>
      <Field label="γ_M">
        <input style={s} type="number" step="0.1" min="1.5"
          value={d.gamma_M ?? 2.5} onChange={e => num('gamma_M', e)} />
      </Field>
      <Field label="K" hint="Eq. 3.1 constant">
        <input style={s} type="number" step="0.05" min="0.1" max="1"
          value={d.K ?? 0.55} onChange={e => num('K', e)} />
      </Field>
      <Field label="α">
        <input style={s} type="number" step="0.05" min="0.1" max="1"
          value={d.alpha ?? 0.7} onChange={e => num('alpha', e)} />
      </Field>
      <Field label="β">
        <input style={s} type="number" step="0.05" min="0.1" max="1"
          value={d.beta ?? 0.3} onChange={e => num('beta', e)} />
      </Field>
    </CalcBlockShell>
  )
}

const s = {
  border: '1px solid #e8e8e8', padding: '6px 8px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
}
