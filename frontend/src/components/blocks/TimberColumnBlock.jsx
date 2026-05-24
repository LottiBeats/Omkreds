/**
 * TimberColumnBlock.jsx — EN 1995-1-1 timber column / beam-column check
 *
 * Checks: section (compression + bending), flexural buckling (both axes),
 * combined interaction equations 6.23 and 6.24.
 * Optional LTB check when l_ef_ltb is provided.
 */
import React, { useState } from 'react'
import { calcTimberColumn } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'

const GRADES = [
  'C14','C16','C18','C20','C22','C24','C27','C30','C35','C40',
  'GL20H','GL22H','GL24H','GL26H','GL28H','GL30H','GL32H',
  'GL24C','GL28C','GL32C',
]
const LOAD_DURATIONS = ['permanent','long','medium','short','instant']
const SERVICE_CLASSES = [1, 2, 3]

export default function TimberColumnBlock({ block, onChange }) {
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
      const blocks = await calcTimberColumn({
        label:                 d.label                 ?? 'C1',
        length_m:              d.length_m              ?? 3.0,
        N_Ed_kN:               d.N_Ed_kN               ?? 50.0,
        M_Ed_kNm:              d.M_Ed_kNm              ?? 0.0,
        b_mm:                  d.b_mm                  ?? 120,
        h_mm:                  d.h_mm                  ?? 120,
        timber_grade:          d.timber_grade           ?? 'C24',
        service_class:         d.service_class          ?? 1,
        load_duration:         d.load_duration          ?? 'medium',
        gamma_M:               d.gamma_M                ?? 1.3,
        effective_length_factor: d.effective_length_factor ?? 1.0,
        l_ef_ltb_m:            d.l_ef_ltb_m            ?? null,
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
      title={d.title ?? 'Timber Column Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Label">
        <input style={s} value={d.label ?? 'C1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Length (m)">
        <input style={s} type="number" step="0.1" min="0.1"
          value={d.length_m ?? 3.0} onChange={e => num('length_m', e)} />
      </Field>
      <Field label="N_Ed (kN)" hint="Axial compression">
        <input style={s} type="number" step="1" min="0"
          value={d.N_Ed_kN ?? 50.0} onChange={e => num('N_Ed_kN', e)} />
      </Field>
      <Field label="M_Ed (kNm)" hint="Bending, strong axis">
        <input style={s} type="number" step="0.1"
          value={d.M_Ed_kNm ?? 0.0} onChange={e => num('M_Ed_kNm', e)} />
      </Field>
      <Field label="Width b (mm)">
        <input style={s} type="number" step="5" min="38"
          value={d.b_mm ?? 120} onChange={e => num('b_mm', e)} />
      </Field>
      <Field label="Depth h (mm)">
        <input style={s} type="number" step="5" min="38"
          value={d.h_mm ?? 120} onChange={e => num('h_mm', e)} />
      </Field>
      <Field label="Timber grade">
        <select style={s} value={d.timber_grade ?? 'C24'}
          onChange={e => update({ timber_grade: e.target.value })}>
          {GRADES.map(g => <option key={g}>{g}</option>)}
        </select>
      </Field>
      <Field label="Service class">
        <select style={s} value={d.service_class ?? 1}
          onChange={e => update({ service_class: Number(e.target.value) })}>
          {SERVICE_CLASSES.map(c => (
            <option key={c} value={c}>{c} — {['Dry interior','Covered outdoor','Exposed'][c-1]}</option>
          ))}
        </select>
      </Field>
      <Field label="Load duration">
        <select style={s} value={d.load_duration ?? 'medium'}
          onChange={e => update({ load_duration: e.target.value })}>
          {LOAD_DURATIONS.map(dur => <option key={dur}>{dur}</option>)}
        </select>
      </Field>
      <Field label="Eff. length factor μ" hint="1.0=pin-pin, 0.7=pin-fixed">
        <input style={s} type="number" step="0.1" min="0.5" max="2.0"
          value={d.effective_length_factor ?? 1.0}
          onChange={e => num('effective_length_factor', e)} />
      </Field>
      <Field label="γ_M">
        <input style={s} type="number" step="0.05" min="1"
          value={d.gamma_M ?? 1.3} onChange={e => num('gamma_M', e)} />
      </Field>
      <Field label="l_ef,LTB (m)" hint="optional — enables LTB check">
        <input style={s} type="number" step="0.1" min="0"
          value={d.l_ef_ltb_m ?? ''}
          placeholder="leave blank to skip"
          onChange={e => update({ l_ef_ltb_m: e.target.value ? parseFloat(e.target.value) : null })} />
      </Field>
    </CalcBlockShell>
  )
}

const s = {
  border: '1px solid #e8e8e8', padding: '6px 8px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
}
