/**
 * TimberBeamBlock.jsx — EN 1995-1-1 timber beam check
 *
 * Checks: bending, shear, lateral buckling (kipning), bearing at support.
 */
import React, { useState } from 'react'
import { calcTimberBeam } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'

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

  function num(field, e) {
    const v = parseFloat(e.target.value)
    if (!isNaN(v)) update({ [field]: v })
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
        <input style={s} type="number" step="0.1" min="0.1"
          value={d.span_m ?? 4.0} onChange={e => num('span_m', e)} />
      </Field>
      <Field label="Width b (mm)">
        <input style={s} type="number" step="5" min="38"
          value={d.b_mm ?? 90} onChange={e => num('b_mm', e)} />
      </Field>
      <Field label="Depth h (mm)">
        <input style={s} type="number" step="10" min="50"
          value={d.h_mm ?? 220} onChange={e => num('h_mm', e)} />
      </Field>
      <Field label="g_k (kN/m)" hint="Permanent">
        <input style={s} type="number" step="0.1" min="0"
          value={d.g_k_kNm ?? 3.0} onChange={e => num('g_k_kNm', e)} />
      </Field>
      <Field label="q_k (kN/m)" hint="Variable">
        <input style={s} type="number" step="0.1" min="0"
          value={d.q_k_kNm ?? 2.0} onChange={e => num('q_k_kNm', e)} />
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
        <input style={s} type="number" step="0.05" min="1"
          value={d.gamma_M ?? 1.3} onChange={e => num('gamma_M', e)} />
      </Field>
      <Field label="Comp. edge restrained" hint="prevents kipning">
        <input type="checkbox"
          checked={d.compression_edge_restrained ?? true}
          onChange={e => update({ compression_edge_restrained: e.target.checked })} />
      </Field>
      <Field label="Torsional restraint at supports">
        <input type="checkbox"
          checked={d.torsional_restraint_at_supports ?? true}
          onChange={e => update({ torsional_restraint_at_supports: e.target.checked })} />
      </Field>
    </CalcBlockShell>
  )
}

const s = {
  border: '1px solid #e8e8e8', padding: '6px 8px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
}
