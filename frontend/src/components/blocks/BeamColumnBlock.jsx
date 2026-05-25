/**
 * BeamColumnBlock.jsx — EC3 §6.3.3 beam-column interaction check
 *
 * Combined axial compression + bending (N + My + Mz).
 * Method 2 (Annex B) for Class 1/2 hot-rolled I/H sections.
 * Section properties are looked up by the backend from the CSV catalog.
 */
import React, { useState } from 'react'
import { calcBeamColumn } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const SECTIONS = [
  'HEA100','HEA120','HEA140','HEA160','HEA180','HEA200',
  'HEA220','HEA240','HEA260','HEA280','HEA300','HEA320','HEA340','HEA360','HEA400',
  'HEB100','HEB120','HEB140','HEB160','HEB180','HEB200',
  'HEB220','HEB240','HEB260','HEB280','HEB300','HEB320','HEB340','HEB360','HEB400',
  'IPE200','IPE220','IPE240','IPE270','IPE300','IPE330','IPE360','IPE400',
]
const GRADES = ['S235', 'S275', 'S355', 'S420', 'S460']

export default function BeamColumnBlock({ block, onChange }) {
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
      const blocks = await calcBeamColumn({
        label:    d.label    ?? 'BC1',
        section:  d.section  ?? 'HEB200',
        grade:    d.grade    ?? 'S355',
        N_Ed_kN:    d.N_Ed_kN    ?? 200,
        My_Ed_kNm:  d.My_Ed_kNm  ?? 50,
        Mz_Ed_kNm:  d.Mz_Ed_kNm  ?? 0,
        L_y_m:   d.L_y_m   ?? 4.0,
        L_z_m:   d.L_z_m   ?? 4.0,
        L_LTB_m: d.L_LTB_m ?? 4.0,
        k_y:     d.k_y     ?? 1.0,
        k_z:     d.k_z     ?? 1.0,
        C_my:    d.C_my    ?? 1.0,
        C_mz:    d.C_mz    ?? 1.0,
        C_mLT:   d.C_mLT   ?? 1.0,
        ltb_restrained: d.ltb_restrained ?? false,
        gamma_M0: d.gamma_M0 ?? 1.0,
        gamma_M1: d.gamma_M1 ?? 1.0,
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
      title={d.title ?? 'Beam-Column Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Label">
        <input style={s.input} value={d.label ?? 'BC1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Section">
        <select style={s.input} value={d.section ?? 'HEB200'}
          onChange={e => update({ section: e.target.value })}>
          {SECTIONS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </Field>
      <Field label="Grade">
        <select style={s.input} value={d.grade ?? 'S355'}
          onChange={e => update({ grade: e.target.value })}>
          {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </Field>

      {/* Design actions */}
      <Field label="N_Ed" hint="kN">
        <NumericInput style={s.input} value={d.N_Ed_kN ?? 200}
          onChange={v => update({ N_Ed_kN: v })} />
      </Field>
      <Field label="M_y,Ed" hint="kNm">
        <NumericInput style={s.input} value={d.My_Ed_kNm ?? 50}
          onChange={v => update({ My_Ed_kNm: v })} />
      </Field>
      <Field label="M_z,Ed" hint="kNm">
        <NumericInput style={s.input} value={d.Mz_Ed_kNm ?? 0}
          onChange={v => update({ Mz_Ed_kNm: v })} />
      </Field>

      {/* Buckling lengths */}
      <Field label="L_cr,y" hint="m">
        <NumericInput style={s.input} value={d.L_y_m ?? 4.0}
          onChange={v => update({ L_y_m: v })} />
      </Field>
      <Field label="L_cr,z" hint="m">
        <NumericInput style={s.input} value={d.L_z_m ?? 4.0}
          onChange={v => update({ L_z_m: v })} />
      </Field>
      <Field label="L_LTB" hint="m">
        <NumericInput style={s.input} value={d.L_LTB_m ?? 4.0}
          onChange={v => update({ L_LTB_m: v })} />
      </Field>

      {/* Factors */}
      <Field label="k_y">
        <NumericInput style={s.input} value={d.k_y ?? 1.0}
          onChange={v => update({ k_y: v })} />
      </Field>
      <Field label="k_z">
        <NumericInput style={s.input} value={d.k_z ?? 1.0}
          onChange={v => update({ k_z: v })} />
      </Field>
      <Field label="C_my" hint="0.9=parabolic">
        <NumericInput style={s.input} value={d.C_my ?? 1.0}
          onChange={v => update({ C_my: v })} />
      </Field>
      <Field label="C_mz">
        <NumericInput style={s.input} value={d.C_mz ?? 1.0}
          onChange={v => update({ C_mz: v })} />
      </Field>
      <Field label="LTB restrained?">
        <label style={s.checkLabel}>
          <input type="checkbox" checked={!!d.ltb_restrained}
            onChange={e => update({ ltb_restrained: e.target.checked })} />
          {' '}χ_LT = 1.0
        </label>
      </Field>
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
  checkLabel: {
    fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 0', cursor: 'pointer',
  },
}
