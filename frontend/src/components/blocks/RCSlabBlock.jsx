/**
 * RCSlabBlock.jsx — enkeltspændt betondæk, DS/EN 1992-1-1 DK NA
 *
 * 1 m stribe, simpelt understøttet, uden forskydningsarmering: bøjning,
 * armeringsregler, V_Rd,c og nedbøjning ved l/d.
 */
import React, { useState } from 'react'
import { calcRcSlab } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const F_CK = [20, 25, 30, 35, 40, 45, 50]
const OE = [6, 8, 10, 12, 14, 16, 20]
const KILDER = [
  { key: 'linje',   label: 'g_k og q_k (6.10a/b)' },
  { key: 'kombi',   label: 'Lastkombination (kN/m²)' },
  { key: 'direkte', label: 'M_Ed og V_Ed pr. m' },
]
const dk = (v, n = 2) => Number(v).toFixed(n).replace('.', ',')

export default function RCSlabBlock({ block, onChange, blocks = [] }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)
  const update = (changes) => onChange({ ...block, data: { ...d, ...changes } })

  const last = d.last ?? 'linje'
  const kombier = blocks.filter(b => b.type === 'load_combo')
  const kombi = kombier.find(b => b.id === d.kombi_id) ?? kombier[0] ?? null
  const kx = kombi?.data?._exports
  const kombiKlar = kx?.E_d_uls != null && (kx.unit ?? '') === 'kN/m²'
  const dAuto = (d.h_mm ?? 200) - (d.c_mm ?? 25) - (d.o_mm ?? 10) / 2
  const As = Math.PI * (d.o_mm ?? 10) ** 2 / 4 * 1000 / (d.s_mm ?? 150)

  async function handleRun() {
    setRunning(true); setError(null)
    try {
      if (last === 'kombi' && !kombiKlar)
        throw new Error('Vælg en regnet lastkombination med enheden kN/m².')
      const res = await calcRcSlab({
        label: d.label ?? 'D1', span_m: d.span_m ?? 5, h_mm: d.h_mm ?? 200,
        c_mm: d.c_mm ?? 25, o_mm: d.o_mm ?? 10, s_mm: d.s_mm ?? 150, d_mm: d.d_mm ?? null,
        fck_MPa: d.fck_MPa ?? 30, fyk_MPa: d.fyk_MPa ?? 500,
        gamma_C: d.gamma_C ?? 1.45, gamma_S: d.gamma_S ?? 1.20,
        last, g_k_kNm2: d.g_k_kNm2 ?? 3.5, q_k_kNm2: d.q_k_kNm2 ?? 2.5,
        consequence_class: d.consequence_class ?? 'CC2',
        w_Ed_kNm2: last === 'kombi' ? kx.E_d_uls : null,
        kombi_label: last === 'kombi' ? (kombi.data?.label ?? null) : null,
        M_Ed_kNmm: d.M_Ed_kNmm ?? null, V_Ed_kNm: d.V_Ed_kNm ?? null,
      })
      update({ _result: res, _w_brugt: last === 'kombi' ? kx.E_d_uls : null,
               kombi_id: last === 'kombi' ? kombi.id : d.kombi_id ?? null })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const kombiFlyttet = last === 'kombi' && d._result && d._w_brugt != null
    && kx?.E_d_uls != null && kx.E_d_uls !== d._w_brugt

  const num = (key, def) => <NumericInput style={s.input} value={d[key] ?? def} onChange={v => update({ [key]: v })} />
  const sel = (key, def, opts, fmt) => (
    <select style={s.input} value={d[key] ?? def} onChange={e => update({ [key]: Number(e.target.value) })}>
      {opts.map(o => <option key={o} value={o}>{fmt(o)}</option>)}
    </select>
  )

  return (
    <CalcBlockShell
      title={d.title ?? 'Betondæk'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Betegnelse">
        <input style={s.input} value={d.label ?? 'D1'} onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Spændvidde L (m)" hint="simpelt understøttet">{num('span_m', 5)}</Field>
      <Field label="Beton">{sel('fck_MPa', 30, F_CK, v => `C${v}`)}</Field>
      <Field label="Armering f_yk (MPa)">{num('fyk_MPa', 500)}</Field>

      <div style={s.sub}>Tværsnit</div>
      <Field label="Tykkelse h (mm)">{num('h_mm', 200)}</Field>
      <Field label="Dæklag c (mm)">{num('c_mm', 25)}</Field>
      <Field label="Hovedarmering Ø">{sel('o_mm', 10, OE, v => `Ø${v}`)}</Field>
      <Field label="Afstand s (mm)" hint={`A_s = ${dk(As, 0)} mm²/m`}>{num('s_mm', 150)}</Field>
      <Field label="Effektiv højde d (mm)" hint={`regnet: ${dk(dAuto, 0)} mm`}>
        <NumericInput style={s.input} value={d.d_mm ?? ''} placeholder={dk(dAuto, 0)}
          onChange={v => update({ d_mm: v > 0 ? v : null })} />
      </Field>

      <div style={s.sub}>Last</div>
      <div style={{ gridColumn: '1/-1', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {KILDER.map(k => (
          <label key={k.key} style={s.radio}>
            <input type="radio" name={`rcs-${block.id}`} checked={last === k.key}
              onChange={() => update({ last: k.key })} />
            {k.label}
          </label>
        ))}
      </div>
      {last === 'linje' && (
        <>
          <Field label="g_k (kN/m²)" hint="inkl. dækkets egenvægt">{num('g_k_kNm2', 3.5)}</Field>
          <Field label="q_k (kN/m²)">{num('q_k_kNm2', 2.5)}</Field>
          <Field label="Konsekvensklasse">
            <select style={s.input} value={d.consequence_class ?? 'CC2'}
              onChange={e => update({ consequence_class: e.target.value })}>
              <option value="CC1">CC1 (K_FI = 0,9)</option>
              <option value="CC2">CC2 (K_FI = 1,0)</option>
              <option value="CC3">CC3 (K_FI = 1,1)</option>
            </select>
          </Field>
        </>
      )}
      {last === 'kombi' && (
        <Field label="Lastkombination" style={{ gridColumn: '1/-1' }}>
          {kombier.length === 0 ? (
            <span style={s.warn}>Der er ingen lastkombination i dokumentet.</span>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select style={{ ...s.input, width: 'auto', minWidth: 200 }} value={kombi?.id ?? ''}
                onChange={e => update({ kombi_id: Number(e.target.value) })}>
                {kombier.map(b => (
                  <option key={b.id} value={b.id}>{b.data?.label ?? '?'} — {b.data?.title ?? 'Lastkombinationer'}</option>
                ))}
              </select>
              {kombiKlar
                ? <span style={s.ok}>w_Ed = {dk(kx.E_d_uls)} kN/m²</span>
                : <span style={s.warn}>{kx ? 'Enheden skal være kN/m²' : 'Regn lastkombinationen først'}</span>}
            </div>
          )}
        </Field>
      )}
      {last === 'direkte' && (
        <>
          <Field label="M_Ed (kNm/m)">{num('M_Ed_kNmm', 20)}</Field>
          <Field label="V_Ed (kN/m)">{num('V_Ed_kNm', 20)}</Field>
        </>
      )}
      {kombiFlyttet && (
        <div style={{ gridColumn: '1/-1', ...s.warnBox }}>
          Lastkombinationen giver nu w_Ed = {dk(kx.E_d_uls)} kN/m²; dækket er regnet med {dk(d._w_brugt)} kN/m². Regn igen.
        </div>
      )}

      <div style={s.sub}>Partialkoefficienter — DK NA</div>
      <Field label="γ_c">{num('gamma_C', 1.45)}</Field>
      <Field label="γ_s">{num('gamma_S', 1.20)}</Field>
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
  ok: { fontSize: 12, color: '#15803d' },
  warn: { fontSize: 12, color: '#b45309' },
  warnBox: {
    fontSize: 12, color: '#92400e', background: '#fffbeb',
    border: '1px solid #f3d3a4', borderRadius: 4, padding: '6px 8px',
  },
}
