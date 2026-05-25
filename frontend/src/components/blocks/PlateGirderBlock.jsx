/**
 * PlateGirderBlock.jsx — EN 1993-1-1 / EN 1993-1-5 plate girder check
 *
 * Checks:
 *   1. Cross-section classification (web + flange)
 *   2. Bending resistance (Class 1-4 incl. effective section for Class 4)
 *   3. Shear buckling resistance V_b,Rd (web + flange contributions)
 *   4. M + V interaction (EN 1993-1-5 §7)
 */
import React, { useState } from 'react'
import { calcPlateGirder } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const GRADES = ['S235', 'S275', 'S355', 'S420', 'S460']

export default function PlateGirderBlock({ block, onChange }) {
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
      const blocks = await calcPlateGirder({
        label:          d.label          ?? 'PG1',
        title:          d.title          ?? '',
        h_w_mm:         d.h_w_mm         ?? 1200,
        t_w_mm:         d.t_w_mm         ?? 12,
        b_f_mm:         d.b_f_mm         ?? 400,
        t_f_mm:         d.t_f_mm         ?? 25,
        a_mm:           d.a_mm           ?? 2000,
        grade:          d.grade          ?? 'S355',
        gamma_M0:       d.gamma_M0       ?? 1.0,
        gamma_M1:       d.gamma_M1       ?? 1.0,
        V_Ed_kN:        d.V_Ed_kN        ?? 0,
        M_Ed_kNm:       d.M_Ed_kNm       ?? 0,
        eta:            d.eta            ?? 1.0,
        rigid_end_post: d.rigid_end_post ?? true,
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
      title={d.title ?? 'Plate Girder Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      {/* Identification */}
      <Field label="Label">
        <input style={s.input} value={d.label ?? 'PG1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Grade">
        <select style={s.input} value={d.grade ?? 'S355'}
          onChange={e => update({ grade: e.target.value })}>
          {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </Field>

      {/* Web */}
      <div style={s.groupHeader}>Web</div>
      <Field label="Web height h_w" hint="mm">
        <NumericInput style={s.input} value={d.h_w_mm ?? 1200}
          onChange={v => update({ h_w_mm: v })} />
      </Field>
      <Field label="Web thickness t_w" hint="mm">
        <NumericInput style={s.input} value={d.t_w_mm ?? 12}
          onChange={v => update({ t_w_mm: v })} />
      </Field>

      {/* Flanges */}
      <div style={s.groupHeader}>Flanges (equal top &amp; bottom)</div>
      <Field label="Flange width b_f" hint="mm">
        <NumericInput style={s.input} value={d.b_f_mm ?? 400}
          onChange={v => update({ b_f_mm: v })} />
      </Field>
      <Field label="Flange thickness t_f" hint="mm">
        <NumericInput style={s.input} value={d.t_f_mm ?? 25}
          onChange={v => update({ t_f_mm: v })} />
      </Field>

      {/* Panel */}
      <div style={s.groupHeader}>Stiffener layout</div>
      <Field label="Panel length a" hint="mm  (stiffener spacing)">
        <NumericInput style={s.input} value={d.a_mm ?? 2000}
          onChange={v => update({ a_mm: v })} />
      </Field>
      <Field label="End post">
        <select style={s.input} value={d.rigid_end_post ?? true ? 'rigid' : 'non-rigid'}
          onChange={e => update({ rigid_end_post: e.target.value === 'rigid' })}>
          <option value="rigid">Rigid  (tension field — EC3-1-5 Table 5.1a)</option>
          <option value="non-rigid">Non-rigid  (EC3-1-5 Table 5.1b)</option>
        </select>
      </Field>
      <Field label="η factor">
        <select style={s.input} value={d.eta ?? 1.0}
          onChange={e => update({ eta: parseFloat(e.target.value) })}>
          <option value={1.2}>η = 1.2  (f_yw ≤ 460 — EC3 recommended)</option>
          <option value={1.0}>η = 1.0  (conservative / many NAs)</option>
        </select>
      </Field>

      {/* Design actions */}
      <div style={s.groupHeader}>Design actions</div>
      <Field label="V_Ed" hint="kN">
        <NumericInput style={s.input} value={d.V_Ed_kN ?? 0}
          onChange={v => update({ V_Ed_kN: v })} />
      </Field>
      <Field label="M_Ed" hint="kNm">
        <NumericInput style={s.input} value={d.M_Ed_kNm ?? 0}
          onChange={v => update({ M_Ed_kNm: v })} />
      </Field>

      {/* Partial factors */}
      <div style={s.groupHeader}>Partial factors</div>
      <Field label="γ_M0">
        <NumericInput style={s.input} value={d.gamma_M0 ?? 1.0}
          onChange={v => update({ gamma_M0: v })} />
      </Field>
      <Field label="γ_M1">
        <NumericInput style={s.input} value={d.gamma_M1 ?? 1.0}
          onChange={v => update({ gamma_M1: v })} />
      </Field>
    </CalcBlockShell>
  )
}

const s = {
  input: {
    border: '1px solid #e8e8e8', padding: '6px 8px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
  },
  groupHeader: {
    gridColumn: '1/-1',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: '#888',
    borderBottom: '1px solid #f0f0f0',
    paddingBottom: 4, marginTop: 8,
  },
}
