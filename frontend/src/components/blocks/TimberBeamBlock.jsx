/**
 * TimberBeamBlock.jsx — EN 1995-1-1 timber beam check
 *
 * Checks: bending, shear, lateral buckling (kipning), bearing at support.
 */
import React, { useState } from 'react'
import { calcTimberBeam } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const GRADES = [
  'C14','C16','C18','C20','C22','C24','C27','C30','C35','C40',
  'GL20H','GL22H','GL24H','GL26H','GL28H','GL30H','GL32H',
  'GL24C','GL28C','GL32C',
  'D30','D35','D40','D50',
]
const LOAD_DURATIONS = ['permanent','long','medium','short','instant']
const SERVICE_CLASSES = [1, 2, 3]

export default function TimberBeamBlock({ block, onChange }) {
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
      const blocks = await calcTimberBeam({
        label:          d.label         ?? 'T1',
        span_m:         d.span_m        ?? 4.0,
        b_mm:           d.b_mm          ?? 90,
        h_mm:           d.h_mm          ?? 220,
        g_k_kNm:       d.g_k_kNm       ?? 3.0,
        q_k_kNm:       d.q_k_kNm       ?? 2.0,
        timber_grade:   d.timber_grade  ?? 'C24',
        service_class:  d.service_class ?? 1,
        load_duration:  d.load_duration ?? 'medium',
        gamma_M:        d.gamma_M       ?? 1.3,
        compression_edge_restrained:     d.compression_edge_restrained ?? true,
        torsional_restraint_at_supports: d.torsional_restraint_at_supports ?? true,
        support_length_mm: d.support_length_mm ?? null,
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
      title={d.title ?? 'Timber Beam Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Label">
        <input style={s} value={d.label ?? 'T1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Span (m)">
        <NumericInput style={s} value={d.span_m ?? 4.0}
          onChange={v => update({ span_m: v })} />
      </Field>
      <Field label="Width b (mm)">
        <NumericInput style={s} value={d.b_mm ?? 90}
          onChange={v => update({ b_mm: v })} />
      </Field>
      <Field label="Depth h (mm)">
        <NumericInput style={s} value={d.h_mm ?? 220}
          onChange={v => update({ h_mm: v })} />
      </Field>
      <Field label="g_k (kN/m)" hint="Permanent">
        <NumericInput style={s} value={d.g_k_kNm ?? 3.0}
          onChange={v => update({ g_k_kNm: v })} />
      </Field>
      <Field label="q_k (kN/m)" hint="Variable">
        <NumericInput style={s} value={d.q_k_kNm ?? 2.0}
          onChange={v => update({ q_k_kNm: v })} />
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
            <option key={c} value={c}>
              {c} — {['Dry interior','Covered outdoor','Exposed'][c-1]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Load duration">
        <select style={s} value={d.load_duration ?? 'medium'}
          onChange={e => update({ load_duration: e.target.value })}>
          {LOAD_DURATIONS.map(d => <option key={d}>{d}</option>)}
        </select>
      </Field>
      <Field label="γ_M">
        <NumericInput style={s} value={d.gamma_M ?? 1.3}
          onChange={v => update({ gamma_M: v })} />
      </Field>
      <Field label="Comp. edge restrained" hint="prevents LTB / kipning">
        <input type="checkbox"
          checked={d.compression_edge_restrained ?? true}
          onChange={e => update({ compression_edge_restrained: e.target.checked })} />
      </Field>
      <Field label="Torsional restraint at supports">
        <input type="checkbox"
          checked={d.torsional_restraint_at_supports ?? true}
          onChange={e => update({ torsional_restraint_at_supports: e.target.checked })} />
      </Field>
      <Field label="Support length (mm)" hint="Bearing length → enables compression ⊥ grain check">
        <input style={s} inputMode="decimal"
          placeholder="e.g. 100 — leave blank to skip"
          value={d.support_length_mm ?? ''}
          onChange={e => update({ support_length_mm: e.target.value ? parseFloat(e.target.value) : null })} />
      </Field>
    </CalcBlockShell>
  )
}

const s = {
  border: '1px solid #e8e8e8', padding: '6px 8px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
}
