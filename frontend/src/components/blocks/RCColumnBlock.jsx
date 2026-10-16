/**
 * RCColumnBlock.jsx — armeret betonsøjle, DS/EN 1992-1-1 DK NA
 *
 * N–M-kurve, slankhed og 2. orden ved nominel stivhed, minimumsarmering.
 * Lasttilfældene er N_Ed og 1. ordens moment M₀_Ed; en regnet
 * lastkombination med enheden kN kan hentes ind som N_Ed.
 */
import React, { useState } from 'react'
import { calcRcColumn } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const F_CK = [20, 25, 30, 35, 40, 45, 50]
const OE = [8, 10, 12, 14, 16, 20, 25, 32]
const STD_LC = [{ label: 'LC1', NEd_kN: 400, M0Ed_kNm: 20 }]
const dk = (v, n = 2) => Number(v).toFixed(n).replace('.', ',')

export default function RCColumnBlock({ block, onChange, blocks = [] }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)
  const update = (changes) => onChange({ ...block, data: { ...d, ...changes } })

  const lcs = d.load_cases ?? STD_LC
  const setLC = (i, key, val) => update({ load_cases: lcs.map((l, j) => j === i ? { ...l, [key]: val } : l) })
  const addLC = (lc) => update({ load_cases: [...lcs, lc ?? { label: `LC${lcs.length + 1}`, NEd_kN: 400, M0Ed_kNm: 20 }] })
  const removeLC = (i) => update({ load_cases: lcs.filter((_, j) => j !== i) })

  // Lastkombinationer med enheden kN kan give N_Ed.
  const kombier = blocks.filter(b => b.type === 'load_combo'
    && b.data?._exports?.E_d_uls != null && (b.data._exports.unit ?? '') === 'kN')

  async function handleRun() {
    setRunning(true); setError(null)
    try {
      const res = await calcRcColumn({
        label: d.label ?? 'C1', h_mm: d.h_mm ?? 300, b_mm: d.b_mm ?? 300,
        c_mm: d.c_mm ?? 45, Ls_mm: d.Ls_mm ?? 3500, beta_eff: d.beta_eff ?? 1.0,
        fck_mpa: d.fck_mpa ?? 30, fyk_mpa: d.fyk_mpa ?? 500,
        gamma_c: d.gamma_c ?? 1.45, gamma_s: d.gamma_s ?? 1.20,
        da_c_mm: d.da_c_mm ?? 16, n_c: d.n_c ?? 2, da_t_mm: d.da_t_mm ?? 16, n_t: d.n_t ?? 2,
        RH_pct: d.RH_pct ?? 50, t0_days: d.t0_days ?? 28,
        M0Eqp_over_M0Ed: d.M0Eqp_over_M0Ed ?? 0.7,
        load_cases: lcs,
      })
      update({ _result: res })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const num = (key, def, round = false) => (
    <NumericInput style={s.input} value={d[key] ?? def}
      onChange={v => update({ [key]: round ? Math.round(v) : v })} />
  )
  const sel = (key, def, opts, fmt) => (
    <select style={s.input} value={d[key] ?? def} onChange={e => update({ [key]: Number(e.target.value) })}>
      {opts.map(o => <option key={o} value={o}>{fmt(o)}</option>)}
    </select>
  )

  return (
    <CalcBlockShell
      title={d.title ?? 'Betonsøjle'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Betegnelse">
        <input style={s.input} value={d.label ?? 'C1'} onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Beton">{sel('fck_mpa', 30, F_CK, v => `C${v}`)}</Field>
      <Field label="Armering f_yk (MPa)">{num('fyk_mpa', 500)}</Field>

      <div style={s.sub}>Tværsnit</div>
      <Field label="h (mm)" hint="i bøjningsretningen">{num('h_mm', 300)}</Field>
      <Field label="b (mm)">{num('b_mm', 300)}</Field>
      <Field label="a (mm)" hint="kant til stængernes midte">{num('c_mm', 45)}</Field>
      <Field label="Trykside, antal">{num('n_c', 2, true)}</Field>
      <Field label="Trykside Ø">{sel('da_c_mm', 16, OE, v => `Ø${v}`)}</Field>
      <Field label="Trækside, antal">{num('n_t', 2, true)}</Field>
      <Field label="Trækside Ø">{sel('da_t_mm', 16, OE, v => `Ø${v}`)}</Field>

      <div style={s.sub}>Længde og krybning</div>
      <Field label="Søjlelængde L (mm)">{num('Ls_mm', 3500)}</Field>
      <Field label="β" hint="l₀ = β·L, afstivet: 0,5–1,0">{num('beta_eff', 1.0)}</Field>
      <Field label="RH (%)" hint="indendørs 50">{num('RH_pct', 50)}</Field>
      <Field label="t₀ (døgn)" hint="alder ved belastning">{num('t0_days', 28)}</Field>
      <Field label="M₀Eqp/M₀Ed" hint="kvasipermanent andel">{num('M0Eqp_over_M0Ed', 0.7)}</Field>

      <div style={{ gridColumn: '1/-1', marginTop: 6 }}>
        <div style={s.sub}>Lasttilfælde — N_Ed og 1. ordens moment M₀_Ed</div>
        <div style={s.lcHead}><span>Navn</span><span>N_Ed (kN)</span><span>M₀_Ed (kNm)</span><span /></div>
        {lcs.map((lc, i) => (
          <div key={i} style={s.lcRow}>
            <input style={s.input} value={lc.label} onChange={e => setLC(i, 'label', e.target.value)} />
            <NumericInput style={s.input} value={lc.NEd_kN} onChange={v => setLC(i, 'NEd_kN', v)} />
            <NumericInput style={s.input} value={lc.M0Ed_kNm} onChange={v => setLC(i, 'M0Ed_kNm', v)} />
            <button style={s.x} onClick={() => removeLC(i)} title="Fjern">✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <button style={s.add} onClick={() => addLC()}>+ Lasttilfælde</button>
          {kombier.map(b => (
            <button key={b.id} style={s.add}
              onClick={() => addLC({ label: b.data.label ?? 'LC', NEd_kN: b.data._exports.E_d_uls, M0Ed_kNm: 0 })}>
              + N_Ed fra {b.data.label} ({dk(b.data._exports.E_d_uls, 1)} kN)
            </button>
          ))}
        </div>
      </div>

      <div style={s.sub}>Partialkoefficienter — DK NA</div>
      <Field label="γ_c">{num('gamma_c', 1.45)}</Field>
      <Field label="γ_s">{num('gamma_s', 1.20)}</Field>
    </CalcBlockShell>
  )
}

const s = {
  input: {
    border: '1px solid #e8e8e8', padding: '6px 8px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
  },
  sub: {
    gridColumn: '1/-1', fontSize: 11, fontWeight: 700, color: '#6b7280',
    letterSpacing: '.06em', textTransform: 'uppercase', marginTop: 6,
  },
  lcHead: {
    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 28px', gap: 6,
    fontSize: 10.5, color: '#888', fontWeight: 600, margin: '4px 0 2px',
  },
  lcRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 28px', gap: 6, marginBottom: 4 },
  x: { background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 12 },
  add: {
    fontSize: 12, background: 'none', border: '1px dashed #bbb', color: '#555',
    padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 4,
  },
}
