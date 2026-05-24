/**
 * RCColumnBlock.jsx — EN 1992-1-1 RC column check
 *
 * Rectangular reinforced concrete column: bending + axial + slenderness.
 */
import React, { useState } from 'react'
import { calcRcColumn } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'

export default function RCColumnBlock({ block, onChange }) {
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

  function intVal(field, e) {
    const v = parseInt(e.target.value, 10)
    if (!isNaN(v)) update({ [field]: v })
  }

  // Load cases stored as [{label, NEd_kN, M0Ed_kNm}]
  function updateLC(idx, key, val) {
    const lcs = [...(d.load_cases ?? [{ label: 'LC1', NEd_kN: 400, M0Ed_kNm: 20 }])]
    lcs[idx] = { ...lcs[idx], [key]: val }
    update({ load_cases: lcs })
  }

  function addLC() {
    const lcs = [...(d.load_cases ?? [])]
    lcs.push({ label: `LC${lcs.length + 1}`, NEd_kN: 400, M0Ed_kNm: 20 })
    update({ load_cases: lcs })
  }

  function removeLC(idx) {
    const lcs = [...(d.load_cases ?? [])].filter((_, i) => i !== idx)
    update({ load_cases: lcs })
  }

  const lcs = d.load_cases ?? [{ label: 'LC1', NEd_kN: 400, M0Ed_kNm: 20 }]

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const blocks = await calcRcColumn({
        label:      d.label      ?? 'C1',
        h_mm:       d.h_mm       ?? 300,
        b_mm:       d.b_mm       ?? 300,
        c_mm:       d.c_mm       ?? 40,
        Ls_mm:      d.Ls_mm      ?? 3500,
        beta_eff:   d.beta_eff   ?? 1.0,
        fck_mpa:    d.fck_mpa    ?? 30,
        fyk_mpa:    d.fyk_mpa    ?? 500,
        gamma_c:    d.gamma_c    ?? 1.5,
        gamma_s:    d.gamma_s    ?? 1.15,
        da_c_mm:    d.da_c_mm    ?? 16,
        n_c:        d.n_c        ?? 2,
        da_t_mm:    d.da_t_mm    ?? 16,
        n_t:        d.n_t        ?? 2,
        load_cases: lcs,
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
      title={d.title ?? 'RC Column Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Label">
        <input style={s.input} value={d.label ?? 'C1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="h (mm)" hint="Section height">
        <input style={s.input} type="number" step="10" min="100"
          value={d.h_mm ?? 300} onChange={e => numVal('h_mm', e)} />
      </Field>
      <Field label="b (mm)" hint="Section width">
        <input style={s.input} type="number" step="10" min="100"
          value={d.b_mm ?? 300} onChange={e => numVal('b_mm', e)} />
      </Field>
      <Field label="Cover c (mm)">
        <input style={s.input} type="number" step="5" min="10"
          value={d.c_mm ?? 40} onChange={e => numVal('c_mm', e)} />
      </Field>
      <Field label="f_ck (MPa)">
        <input style={s.input} type="number" step="5" min="12"
          value={d.fck_mpa ?? 30} onChange={e => numVal('fck_mpa', e)} />
      </Field>
      <Field label="f_yk (MPa)">
        <input style={s.input} type="number" step="50" min="400"
          value={d.fyk_mpa ?? 500} onChange={e => numVal('fyk_mpa', e)} />
      </Field>
      <Field label="Comp. bars ø (mm)">
        <input style={s.input} type="number" step="2" min="8"
          value={d.da_c_mm ?? 16} onChange={e => numVal('da_c_mm', e)} />
      </Field>
      <Field label="Comp. bars n">
        <input style={s.input} type="number" step="1" min="1"
          value={d.n_c ?? 2} onChange={e => intVal('n_c', e)} />
      </Field>
      <Field label="Tens. bars ø (mm)">
        <input style={s.input} type="number" step="2" min="8"
          value={d.da_t_mm ?? 16} onChange={e => numVal('da_t_mm', e)} />
      </Field>
      <Field label="Tens. bars n">
        <input style={s.input} type="number" step="1" min="1"
          value={d.n_t ?? 2} onChange={e => intVal('n_t', e)} />
      </Field>
      <Field label="Ls (mm)" hint="Column height">
        <input style={s.input} type="number" step="100" min="500"
          value={d.Ls_mm ?? 3500} onChange={e => numVal('Ls_mm', e)} />
      </Field>
      <Field label="β_eff" hint="Effective length factor">
        <input style={s.input} type="number" step="0.1" min="0.5" max="2.0"
          value={d.beta_eff ?? 1.0} onChange={e => numVal('beta_eff', e)} />
      </Field>

      {/* Load cases */}
      <div style={{ gridColumn: '1/-1', marginTop: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 }}>
          Load cases
        </div>
        {lcs.map((lc, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
            <input style={{ ...s.input, width: 60 }} placeholder="Label"
              value={lc.label} onChange={e => updateLC(i, 'label', e.target.value)} />
            <input style={{ ...s.input, width: 80 }} type="number" step="10" placeholder="N_Ed kN"
              value={lc.NEd_kN} onChange={e => updateLC(i, 'NEd_kN', parseFloat(e.target.value) || 0)} />
            <input style={{ ...s.input, width: 90 }} type="number" step="1" placeholder="M0Ed kNm"
              value={lc.M0Ed_kNm} onChange={e => updateLC(i, 'M0Ed_kNm', parseFloat(e.target.value) || 0)} />
            <button onClick={() => removeLC(i)}
              style={{ background: 'none', border: '1px solid #ddd', padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
              ✕
            </button>
          </div>
        ))}
        <button onClick={addLC}
          style={{ fontSize: 12, background: 'none', border: '1px dashed #aaa',
                   padding: '4px 10px', cursor: 'pointer', marginTop: 2 }}>
          + Add load case
        </button>
      </div>
    </CalcBlockShell>
  )
}

const s = {
  input: {
    border: '1px solid #e8e8e8', padding: '6px 8px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
  },
}
