/**
 * BeamColumnBlock.jsx — bjælke-søjle, EN 1993-1-1 §6.3.3 og anneks B
 *
 * Tryk og bøjning om begge akser (N + M_y + M_z). Regnes i backend af
 * stålsøjlens eftervisning, så interaktionsfaktorerne kun findes ét sted.
 *
 * Lastkilde:
 *   direct — N_Ed tastes
 *   combo  — N_Ed = E_d_uls fra en lastkombination (enheden skal være kN)
 * M_y,Ed og M_z,Ed tastes altid.
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
const dk = (v, n = 2) => Number(v).toFixed(n).replace('.', ',')

export default function BeamColumnBlock({ block, onChange, blocks = [] }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)
  const update = (changes) => onChange({ ...block, data: { ...d, ...changes } })

  const comboBlocks = blocks.filter(b => b.type === 'load_combo')
  const source      = d.load_source ?? 'direct'
  const selCombo    = comboBlocks.find(b => b.data.label === d.combo_label) ?? comboBlocks[0]
  const exports_    = selCombo?.data?._exports
  const comboReady  = !!exports_?.E_d_uls

  // Ældre blokke blev oprettet med γ_M0 = γ_M1 = 1,0.
  const gM0 = d.gamma_M0 ?? 1.10
  const gM1 = d.gamma_M1 ?? 1.20
  const ikkeDkNa = gM0 !== 1.10 || gM1 !== 1.20

  async function handleRun() {
    setRunning(true); setError(null)
    try {
      const payload = {
        label: d.label ?? 'BC1', section: d.section ?? 'HEB200', grade: d.grade ?? 'S355',
        N_Ed_kN: d.N_Ed_kN ?? 200, My_Ed_kNm: d.My_Ed_kNm ?? 50, Mz_Ed_kNm: d.Mz_Ed_kNm ?? 0,
        L_y_m: d.L_y_m ?? 4.0, L_z_m: d.L_z_m ?? 4.0, L_LTB_m: d.L_LTB_m ?? 4.0,
        k_y: d.k_y ?? 1.0, k_z: d.k_z ?? 1.0,
        C_my: d.C_my ?? 1.0, C_mz: d.C_mz ?? 1.0, C_mLT: d.C_mLT ?? 1.0, C_1: d.C_1 ?? 1.0,
        ltb_restrained: d.ltb_restrained ?? false,
        gamma_M0: gM0, gamma_M1: gM1,
      }
      if (source === 'combo' && exports_) {
        payload.N_Ed_kN = exports_.E_d_uls
        payload.combo_label = selCombo?.data?.label ?? ''
        payload.combo_unit = exports_.unit ?? null
      }
      update({ _result: await calcBeamColumn(payload) })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const num = (key, def) => <NumericInput style={s.input} value={d[key] ?? def} onChange={v => update({ [key]: v })} />

  return (
    <CalcBlockShell
      title={d.title ?? 'Bjælke-søjle'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
      runDisabled={source === 'combo' && !comboReady}
    >
      <Field label="Lastkilde for N_Ed" style={{ gridColumn: '1/-1' }}>
        <div style={{ display: 'flex', gap: 16, padding: '2px 0' }}>
          {[['direct', 'Tastes'], ['combo', 'Lastkombination']].map(([opt, txt]) => (
            <label key={opt} style={s.radio}>
              <input type="radio" name={`src-${block.id}`} checked={source === opt}
                onChange={() => update({ load_source: opt })} />
              {txt}
            </label>
          ))}
        </div>
      </Field>

      {source === 'combo' && (
        <Field label="Lastkombination" style={{ gridColumn: '1/-1' }}>
          {comboBlocks.length === 0 ? (
            <span style={s.warn}>Der er ingen lastkombination i dokumentet.</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <select style={{ ...s.input, width: 'auto', minWidth: 180 }}
                value={selCombo?.data?.label ?? ''}
                onChange={e => update({ combo_label: e.target.value })}>
                {comboBlocks.map(b => (
                  <option key={b.id} value={b.data.label ?? ''}>
                    {b.data.label ?? '?'} — {b.data.title ?? 'Lastkombinationer'}
                  </option>
                ))}
              </select>
              {comboReady
                ? <span style={s.ok}>N_Ed = {dk(exports_.E_d_uls)} {exports_.unit ?? 'kN'}</span>
                : <span style={s.warn}>Regn lastkombinationen først</span>}
            </div>
          )}
        </Field>
      )}

      <Field label="Betegnelse">
        <input style={s.input} value={d.label ?? 'BC1'} onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Profil">
        <select style={s.input} value={d.section ?? 'HEB200'} onChange={e => update({ section: e.target.value })}>
          {SECTIONS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </Field>
      <Field label="Stål">
        <select style={s.input} value={d.grade ?? 'S355'} onChange={e => update({ grade: e.target.value })}>
          {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </Field>

      {source === 'direct' && <Field label="N_Ed (kN)" hint="tryk">{num('N_Ed_kN', 200)}</Field>}
      <Field label="M_y,Ed (kNm)" hint="stærk akse">{num('My_Ed_kNm', 50)}</Field>
      <Field label="M_z,Ed (kNm)" hint="svag akse">{num('Mz_Ed_kNm', 0)}</Field>

      <div style={s.sub}>Længder</div>
      <Field label="Længde om y, L_y (m)">{num('L_y_m', 4.0)}</Field>
      <Field label="Længde om z, L_z (m)" hint="afstand mellem afstivninger">{num('L_z_m', 4.0)}</Field>
      <Field label="k_y" hint="L_cr,y = k_y·L_y">{num('k_y', 1.0)}</Field>
      <Field label="k_z" hint="L_cr,z = k_z·L_z">{num('k_z', 1.0)}</Field>
      <Field label="Fastholdt mod kipning?">
        <label style={s.check}>
          <input type="checkbox" checked={!!d.ltb_restrained}
            onChange={e => update({ ltb_restrained: e.target.checked })} />
          χ_LT = 1,0 (tabel B.1)
        </label>
      </Field>
      {!d.ltb_restrained && (
        <>
          <Field label="Kiplængde L_LT (m)">{num('L_LTB_m', 4.0)}</Field>
          <Field label="C₁" hint="1,0 konstant · 1,13 jævn last">{num('C_1', 1.0)}</Field>
        </>
      )}

      <div style={s.sub}>Momentfaktorer — anneks B tabel B.3</div>
      <Field label="C_my" hint="1,0 på den sikre side">{num('C_my', 1.0)}</Field>
      <Field label="C_mz">{num('C_mz', 1.0)}</Field>
      {!d.ltb_restrained && <Field label="C_mLT">{num('C_mLT', 1.0)}</Field>}

      <div style={s.sub}>Partialkoefficienter — DK NA</div>
      <Field label="γ_M0" hint="DK NA 1,10">{num('gamma_M0', 1.10)}</Field>
      <Field label="γ_M1" hint="DK NA 1,20">{num('gamma_M1', 1.20)}</Field>
      {ikkeDkNa && (
        <div style={{ gridColumn: '1/-1', ...s.warnBox }}>
          γ_M0 = {dk(gM0)} og γ_M1 = {dk(gM1)} er ikke DK NA (1,10 og 1,20).{' '}
          <button style={s.link} onClick={() => update({ gamma_M0: 1.10, gamma_M1: 1.20 })}>Brug DK NA</button>
        </div>
      )}
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
  radio: { fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 },
  check: { fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', cursor: 'pointer' },
  ok: { fontSize: 12, color: '#15803d' },
  warn: { fontSize: 12, color: '#b45309' },
  warnBox: {
    fontSize: 12, color: '#92400e', background: '#fffbeb',
    border: '1px solid #f3d3a4', borderRadius: 4, padding: '6px 8px',
  },
  link: {
    border: 'none', background: 'none', padding: 0, cursor: 'pointer',
    color: '#1d4ed8', textDecoration: 'underline', fontSize: 12, fontFamily: 'inherit',
  },
}
