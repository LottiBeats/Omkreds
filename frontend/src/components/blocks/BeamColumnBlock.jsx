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
        <input style={s.input} type="number" step="any" value={d.N_Ed_kN ?? 200}
          onChange={e => update({ N_Ed_kN: parseFloat(e.target.value) || 0 })} />
      </Field>
      <Field label="M_y,Ed" hint="kNm">
        <input style={s.input} type="number" step="any" value={d.My_Ed_kNm ?? 50}
          onChange={e => update({ My_Ed_kNm: parseFloat(e.target.value) || 0 })} />
      </Field>
      <Field label="M_z,Ed" hint="kNm">
        <input style={s.input} type="number" step="any" value={d.Mz_Ed_kNm ?? 0}
          onChange={e => update({ Mz_Ed_kNm: parseFloat(e.target.value) || 0 })} />
      </Field>

      {/* Buckling lengths */}
      <Field label="L_cr,y" hint="m">
        <input style={s.input} type="number" step="any" value={d.L_y_m ?? 4.0}
          onChange={e => update({ L_y_m: parseFloat(e.target.value) || 0 })} />
      </Field>
      <Field label="L_cr,z" hint="m">
        <input style={s.input} type="number" step="any" value={d.L_z_m ?? 4.0}
          onChange={e => update({ L_z_m: parseFloat(e.target.value) || 0 })} />
      </Field>
      <Field label="L_LTB" hint="m">
        <input style={s.input} type="number" step="any" value={d.L_LTB_m ?? 4.0}
          onChange={e => update({ L_LTB_m: parseFloat(e.target.value) || 0 })} />
      </Field>

      {/* Factors */}
      <Field label="k_y">
        <input style={s.input} type="number" step="0.01" value={d.k_y ?? 1.0}
          onChange={e => update({ k_y: parseFloat(e.target.value) || 1 })} />
      </Field>
      <Field label="k_z">
        <input style={s.input} type="number" step="0.01" value={d.k_z ?? 1.0}
          onChange={e => update({ k_z: parseFloat(e.target.value) || 1 })} />
      </Field>
      <Field label="C_my" hint="0.9=parabolic">
        <input style={s.input} type="number" step="0.01" min="0.4" max="1.0"
          value={d.C_my ?? 1.0}
          onChange={e => update({ C_my: parseFloat(e.target.value) || 1 })} />
      </Field>
      <Field label="C_mz">
        <input style={s.input} type="number" step="0.01" min="0.4" max="1.0"
          value={d.C_mz ?? 1.0}
          onChange={e => update({ C_mz: parseFloat(e.target.value) || 1 })} />
      </Field>
      <Field label="LTB restrained?">
        <label style={s.checkLabel}>
          <input type="checkbox" checked={!!d.ltb_restrained}
            onChange={e => update({ ltb_restrained: e.target.checked })} />
          {' '}χ_LT = 1.0
        </label>
      </Field>
      <Field label="γ_M0">
        <input style={s.input} type="number" step="0.01" value={d.gamma_M0 ?? 1.0}
          onChange={e => update({ gamma_M0: parseFloat(e.target.value) || 1 })} />
      </Field>
      <Field label="γ_M1">
        <input style={s.input} type="number" step="0.01" value={d.gamma_M1 ?? 1.0}
          onChange={e => update({ gamma_M1: parseFloat(e.target.value) || 1 })} />
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
