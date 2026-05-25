/**
 * RCColumnBlock.jsx — EN 1992-1-1 RC column check
 *
 * Rectangular reinforced concrete column: bending + axial + slenderness.
 */
import React, { useState } from 'react'
import { calcRcColumn } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

export default function RCColumnBlock({ block, onChange }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
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
        <NumericInput style={s.input} value={d.h_mm ?? 300}
          onChange={v => update({ h_mm: v })} />
      </Field>
      <Field label="b (mm)" hint="Section width">
        <NumericInput style={s.input} value={d.b_mm ?? 300}
          onChange={v => update({ b_mm: v })} />
      </Field>
      <Field label="Cover c (mm)">
        <NumericInput style={s.input} value={d.c_mm ?? 40}
          onChange={v => update({ c_mm: v })} />
      </Field>
      <Field label="f_ck (MPa)">
        <NumericInput style={s.input} value={d.fck_mpa ?? 30}
          onChange={v => update({ fck_mpa: v })} />
      </Field>
      <Field label="f_yk (MPa)">
        <NumericInput style={s.input} value={d.fyk_mpa ?? 500}
          onChange={v => update({ fyk_mpa: v })} />
      </Field>
      <Field label="Comp. bars ø (mm)">
        <NumericInput style={s.input} value={d.da_c_mm ?? 16}
          onChange={v => update({ da_c_mm: v })} />
      </Field>
      <Field label="Comp. bars n">
        <NumericInput style={s.input} value={d.n_c ?? 2}
          onChange={v => update({ n_c: Math.round(v) })} />
      </Field>
      <Field label="Tens. bars ø (mm)">
        <NumericInput style={s.input} value={d.da_t_mm ?? 16}
          onChange={v => update({ da_t_mm: v })} />
      </Field>
      <Field label="Tens. bars n">
        <NumericInput style={s.input} value={d.n_t ?? 2}
          onChange={v => update({ n_t: Math.round(v) })} />
      </Field>
      <Field label="Ls (mm)" hint="Column height">
        <NumericInput style={s.input} value={d.Ls_mm ?? 3500}
          onChange={v => update({ Ls_mm: v })} />
      </Field>
      <Field label="β_eff" hint="Effective length factor">
        <NumericInput style={s.input} value={d.beta_eff ?? 1.0}
          onChange={v => update({ beta_eff: v })} />
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
            <NumericInput style={{ ...s.input, width: 80 }} placeholder="N_Ed kN"
              value={lc.NEd_kN} onChange={v => updateLC(i, 'NEd_kN', v)} />
            <NumericInput style={{ ...s.input, width: 90 }} placeholder="M0Ed kNm"
              value={lc.M0Ed_kNm} onChange={v => updateLC(i, 'M0Ed_kNm', v)} />
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
