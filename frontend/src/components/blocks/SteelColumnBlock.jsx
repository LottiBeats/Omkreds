/**
 * SteelColumnBlock.jsx — EN 1993-1-1 §6.3.1 + §6.3.3 steel column check
 *
 * Pure compression: N_Ed only (leave M_y = M_z = 0)
 * Beam-column: fill M_y,Ed and/or M_z,Ed to enable the cl. 6.3.3
 *              interaction check (Annex B Method 2).
 */
import React, { useState } from 'react'
import { calcSteelColumn } from '../../api/client.js'
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

// Common C_m values per Annex B Table B.3
const CM_OPTIONS = [
  { value: 1.0,  label: 'C = 1.00 — uniform moment (ψ=1)' },
  { value: 0.95, label: 'C = 0.95 — UDL / parabolic (α_h=0)' },
  { value: 0.6,  label: 'C = 0.60 — end moment only (ψ=0)' },
  { value: 0.4,  label: 'C = 0.40 — antisymmetric (ψ=−1)' },
]

export default function SteelColumnBlock({ block, onChange }) {
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
      const blocks = await calcSteelColumn({
        label:          d.label          ?? 'SC1',
        section:        d.section        ?? 'HEB200',
        grade:          d.grade          ?? 'S355',
        length_m:       d.length_m       ?? 4.0,
        N_Ed_kN:        d.N_Ed_kN        ?? 500.0,
        k_y:            d.k_y            ?? 1.0,
        k_z:            d.k_z            ?? 1.0,
        gamma_M0:       d.gamma_M0       ?? 1.0,
        gamma_M1:       d.gamma_M1       ?? 1.0,
        M_y_Ed_kNm:     d.M_y_Ed_kNm    ?? 0.0,
        M_z_Ed_kNm:     d.M_z_Ed_kNm    ?? 0.0,
        C_my:           d.C_my           ?? 1.0,
        C_mz:           d.C_mz           ?? 1.0,
        ltb_restrained: d.ltb_restrained ?? true,
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
      title={d.title ?? 'Steel Column Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Label">
        <input style={s.input} value={d.label ?? 'SC1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Section">
        <select style={s.input} value={d.section ?? 'HEB200'}
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
      <Field label="Buckling length (m)">
        <input style={s.input} type="number" step="0.1" min="0.5"
          value={d.length_m ?? 4.0} onChange={e => numVal('length_m', e)} />
      </Field>
      <Field label="N_Ed (kN)" hint="Design axial compression">
        <input style={s.input} type="number" step="10" min="0"
          value={d.N_Ed_kN ?? 500.0} onChange={e => numVal('N_Ed_kN', e)} />
      </Field>
      <Field label="k_y" hint="Eff. length factor y-y">
        <input style={s.input} type="number" step="0.05" min="0.5" max="2.0"
          value={d.k_y ?? 1.0} onChange={e => numVal('k_y', e)} />
      </Field>
      <Field label="k_z" hint="Eff. length factor z-z">
        <input style={s.input} type="number" step="0.05" min="0.5" max="2.0"
          value={d.k_z ?? 1.0} onChange={e => numVal('k_z', e)} />
      </Field>
      <Field label="γ_M0">
        <input style={s.input} type="number" step="0.05" min="1"
          value={d.gamma_M0 ?? 1.0} onChange={e => numVal('gamma_M0', e)} />
      </Field>
      <Field label="γ_M1">
        <input style={s.input} type="number" step="0.05" min="1"
          value={d.gamma_M1 ?? 1.0} onChange={e => numVal('gamma_M1', e)} />
      </Field>

      {/* ── Beam-column moments (leave 0 for pure compression) ── */}
      <Field label="M_y,Ed (kNm)" hint="Strong-axis moment — 0 = pure compression">
        <input style={s.input} type="number" step="1" min="0"
          value={d.M_y_Ed_kNm ?? 0.0} onChange={e => numVal('M_y_Ed_kNm', e)} />
      </Field>
      <Field label="M_z,Ed (kNm)" hint="Weak-axis moment">
        <input style={s.input} type="number" step="0.5" min="0"
          value={d.M_z_Ed_kNm ?? 0.0} onChange={e => numVal('M_z_Ed_kNm', e)} />
      </Field>
      <Field label="C_my" hint="Equiv. moment factor y — Annex B Table B.3">
        <select style={s.input} value={d.C_my ?? 1.0}
          onChange={e => update({ C_my: Number(e.target.value) })}>
          {CM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <Field label="C_mz" hint="Equiv. moment factor z">
        <select style={s.input} value={d.C_mz ?? 1.0}
          onChange={e => update({ C_mz: Number(e.target.value) })}>
          {CM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <Field label="LTB restrained" hint="χ_LT = 1.0 (closed section or comp. flange restrained)">
        <input type="checkbox"
          checked={d.ltb_restrained ?? true}
          onChange={e => update({ ltb_restrained: e.target.checked })} />
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
