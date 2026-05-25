/**
 * SteelBeamBlock.jsx — EN 1993-1-1 steel beam check
 *
 * The backend runs the full steel_beam_ipe() function and returns
 * a list of calc blocks (section headings, tables, rendered equations,
 * check results). CalcBlockShell + CalcResultView handle display.
 */
import React, { useState } from 'react'
import { calcSteelBeam } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const SECTIONS = [
  'IPE100','IPE120','IPE140','IPE160','IPE180','IPE200',
  'IPE220','IPE240','IPE270','IPE300','IPE330','IPE360',
  'IPE400','IPE450','IPE500','IPE550','IPE600',
  'HEA100','HEA120','HEA140','HEA160','HEA180','HEA200',
  'HEA220','HEA240','HEA260','HEA280','HEA300','HEA320','HEA340','HEA360','HEA400',
  'HEB100','HEB120','HEB140','HEB160','HEB180','HEB200',
  'HEB220','HEB240','HEB260','HEB280','HEB300','HEB320','HEB340','HEB360','HEB400',
]

const GRADES = ['S235', 'S275', 'S355', 'S420', 'S460']

export default function SteelBeamBlock({ block, onChange }) {
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
      const blocks = await calcSteelBeam({
        label:     d.label    ?? 'S1',
        section:   d.section  ?? 'IPE300',
        grade:     d.grade    ?? 'S355',
        span_m:    d.span_m   ?? 5.0,
        g_k_kNm:  d.g_k_kNm  ?? 5.0,
        q_k_kNm:  d.q_k_kNm  ?? 3.0,
        gamma_M0:  d.gamma_M0 ?? 1.0,
        gamma_M1:  d.gamma_M1 ?? 1.0,
        ltb_restrained:    d.ltb_restrained    ?? false,
        ltb_length_m:      d.ltb_length_m      ?? null,
        buck_y_restrained: d.buck_y_restrained  ?? false,
        buck_x_restrained: d.buck_x_restrained  ?? false,
        deflection_limit:  d.deflection_limit   ?? 200,
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
      title={d.title ?? 'Steel Beam Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Label">
        <input style={s.input} value={d.label ?? 'S1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Section">
        <select style={s.input} value={d.section ?? 'IPE300'}
          onChange={e => update({ section: e.target.value })}>
          {SECTIONS.map(sec => <option key={sec}>{sec}</option>)}
        </select>
      </Field>
      <Field label="Grade">
        <select style={s.input} value={d.grade ?? 'S355'}
          onChange={e => update({ grade: e.target.value })}>
          {GRADES.map(g => <option key={g}>{g}</option>)}
        </select>
      </Field>
      <Field label="Span (m)">
        <NumericInput style={s.input} value={d.span_m ?? 5.0}
          onChange={v => update({ span_m: v })} />
      </Field>
      <Field label="g_k (kN/m)" hint="Permanent">
        <NumericInput style={s.input} value={d.g_k_kNm ?? 5.0}
          onChange={v => update({ g_k_kNm: v })} />
      </Field>
      <Field label="q_k (kN/m)" hint="Variable">
        <NumericInput style={s.input} value={d.q_k_kNm ?? 3.0}
          onChange={v => update({ q_k_kNm: v })} />
      </Field>
      <Field label="γ_M0">
        <NumericInput style={s.input} value={d.gamma_M0 ?? 1.0}
          onChange={v => update({ gamma_M0: v })} />
      </Field>
      <Field label="γ_M1">
        <NumericInput style={s.input} value={d.gamma_M1 ?? 1.0}
          onChange={v => update({ gamma_M1: v })} />
      </Field>
      {/* Restraint checkboxes span 2 columns each */}
      <Field label="LTB restrained" hint="compression flange continuously restrained">
        <input type="checkbox" checked={d.ltb_restrained ?? false}
          onChange={e => update({ ltb_restrained: e.target.checked })} />
      </Field>
      <Field label="LTB length (m)" hint="Between lateral restraints — runs cl. 6.3.2.2 check">
        <input style={s.input} inputMode="decimal"
          placeholder="leave blank or tick Restrained"
          value={d.ltb_length_m ?? ''}
          disabled={d.ltb_restrained ?? false}
          onChange={e => update({ ltb_length_m: e.target.value ? parseFloat(e.target.value) : null })} />
      </Field>
      <Field label="y-axis restrained">
        <input type="checkbox" checked={d.buck_y_restrained ?? false}
          onChange={e => update({ buck_y_restrained: e.target.checked })} />
      </Field>
      <Field label="x-axis restrained">
        <input type="checkbox" checked={d.buck_x_restrained ?? false}
          onChange={e => update({ buck_x_restrained: e.target.checked })} />
      </Field>
      <Field label="Deflection limit" hint="SLS — EN 1990 Annex A1.4">
        <select style={s.input} value={d.deflection_limit ?? 200}
          onChange={e => update({ deflection_limit: Number(e.target.value) })}>
          <option value={200}>L / 200 — total (final)</option>
          <option value={250}>L / 250 — total (finishes)</option>
          <option value={350}>L / 350 — net (after perm.)</option>
          <option value={500}>L / 500 — sensitive finishes</option>
        </select>
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
