/**
 * RCBeamBlock.jsx — armeret betonbjælke, DS/EN 1992-1-1 DK NA
 *
 * Bøjning, minimumsarmering, forskydning med og uden bøjler og nedbøjning
 * ved l/d. Lasten er enten g_k/q_k (6.10a/b med K_FI), en regnet
 * lastkombination (w_Ed) eller M_Ed og V_Ed direkte.
 */
import React, { useState } from 'react'
import { calcRcBeam } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const F_CK = [20, 25, 30, 35, 40, 45, 50]
const OE = [6, 8, 10, 12, 14, 16, 20, 25, 32]

const KILDER = [
  { key: 'linje',   label: 'g_k og q_k (6.10a/b)' },
  { key: 'kombi',   label: 'Lastkombination' },
  { key: 'direkte', label: 'M_Ed og V_Ed' },
]

const dk = (v, n = 2) => Number(v).toFixed(n).replace('.', ',')

export default function RCBeamBlock({ block, onChange, blocks = [] }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)
  const update = (changes) => onChange({ ...block, data: { ...d, ...changes } })

  const last = d.last ?? 'linje'
  const kombier = blocks.filter(b => b.type === 'load_combo')
  const kombi = kombier.find(b => b.id === d.kombi_id) ?? kombier[0] ?? null
  const kx = kombi?.data?._exports
  const kombiKlar = kx?.E_d_uls != null && (kx.unit ?? 'kN/m') === 'kN/m'

  const dAuto = (d.h_mm ?? 500) - (d.c_mm ?? 30) - (d.o_bojle_mm ?? 8) - (d.o_traek_mm ?? 16) / 2

  async function handleRun() {
    setRunning(true); setError(null)
    try {
      if (last === 'kombi' && !kombiKlar)
        throw new Error('Vælg en regnet lastkombination med enheden kN/m.')
      const res = await calcRcBeam({
        label: d.label ?? 'B1', span_m: d.span_m ?? 5,
        b_mm: d.b_mm ?? 300, h_mm: d.h_mm ?? 500, c_mm: d.c_mm ?? 30,
        o_bojle_mm: d.o_bojle_mm ?? 8, n_traek: d.n_traek ?? 3, o_traek_mm: d.o_traek_mm ?? 16,
        d_mm: d.d_mm ?? null,
        f_ck_MPa: d.f_ck_MPa ?? 30, f_yk_MPa: d.f_yk_MPa ?? 500,
        gamma_c: d.gamma_c ?? 1.45, gamma_s: d.gamma_s ?? 1.20,
        last,
        g_k_kNm: d.g_k_kNm ?? 10, q_k_kNm: d.q_k_kNm ?? 6,
        consequence_class: d.consequence_class ?? 'CC2',
        w_Ed_kNm: last === 'kombi' ? kx.E_d_uls : null,
        kombi_label: last === 'kombi' ? (kombi.data?.label ?? null) : null,
        M_Ed_kNm: d.M_Ed_kNm ?? null, V_Ed_kN: d.V_Ed_kN ?? null,
        bojle_s_mm: d.bojle_s_mm ?? 200, bojle_snit: d.bojle_snit ?? 2,
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

  const num = (key, def) => (
    <NumericInput style={s.input} value={d[key] ?? def} onChange={v => update({ [key]: v })} />
  )
  const sel = (key, def, opts, fmt = v => v) => (
    <select style={s.input} value={d[key] ?? def} onChange={e => update({ [key]: Number(e.target.value) })}>
      {opts.map(o => <option key={o} value={o}>{fmt(o)}</option>)}
    </select>
  )

  return (
    <CalcBlockShell
      title={d.title ?? 'Betonbjælke'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Betegnelse">
        <input style={s.input} value={d.label ?? 'B1'} onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Spændvidde L (m)" hint="simpelt understøttet">{num('span_m', 5)}</Field>
      <Field label="Beton">{sel('f_ck_MPa', 30, F_CK, v => `C${v}`)}</Field>
      <Field label="Armering f_yk (MPa)">{num('f_yk_MPa', 500)}</Field>

      <div style={s.sub}>Tværsnit</div>
      <Field label="Bredde b (mm)">{num('b_mm', 300)}</Field>
      <Field label="Højde h (mm)">{num('h_mm', 500)}</Field>
      <Field label="Dæklag c (mm)" hint="til bøjlen">{num('c_mm', 30)}</Field>
      <Field label="Trækarmering, antal">{num('n_traek', 3)}</Field>
      <Field label="Trækarmering Ø (mm)">{sel('o_traek_mm', 16, OE, v => `Ø${v}`)}</Field>
      <Field label="Effektiv højde d (mm)" hint={`regnet: ${dk(dAuto, 0)} mm`}>
        <NumericInput style={s.input} value={d.d_mm ?? ''} placeholder={dk(dAuto, 0)}
          onChange={v => update({ d_mm: v > 0 ? v : null })} />
      </Field>
      <Field label="Bøjler Ø (mm)">{sel('o_bojle_mm', 8, OE.filter(o => o <= 16), v => `Ø${v}`)}</Field>
      <Field label="Bøjleafstand s (mm)">{num('bojle_s_mm', 200)}</Field>
      <Field label="Bøjlesnit" hint="2 for lukket bøjle">{num('bojle_snit', 2)}</Field>

      <div style={s.sub}>Last</div>
      <div style={{ gridColumn: '1/-1', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {KILDER.map(k => (
          <label key={k.key} style={s.radio}>
            <input type="radio" name={`rcb-${block.id}`} checked={last === k.key}
              onChange={() => update({ last: k.key })} />
            {k.label}
          </label>
        ))}
      </div>
      {last === 'linje' && (
        <>
          <Field label="g_k (kN/m)">{num('g_k_kNm', 10)}</Field>
          <Field label="q_k (kN/m)">{num('q_k_kNm', 6)}</Field>
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
                ? <span style={s.ok}>w_Ed = {dk(kx.E_d_uls)} kN/m</span>
                : <span style={s.warn}>{kx ? 'Enheden skal være kN/m' : 'Regn lastkombinationen først'}</span>}
            </div>
          )}
        </Field>
      )}
      {last === 'direkte' && (
        <>
          <Field label="M_Ed (kNm)">{num('M_Ed_kNm', 60)}</Field>
          <Field label="V_Ed (kN)">{num('V_Ed_kN', 50)}</Field>
        </>
      )}
      {kombiFlyttet && (
        <div style={{ gridColumn: '1/-1', ...s.warnBox }}>
          Lastkombinationen giver nu w_Ed = {dk(kx.E_d_uls)} kN/m; bjælken er regnet med {dk(d._w_brugt)} kN/m. Regn igen.
        </div>
      )}

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
  radio: { fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 },
  ok: { fontSize: 12, color: '#15803d' },
  warn: { fontSize: 12, color: '#b45309' },
  warnBox: {
    fontSize: 12, color: '#92400e', background: '#fffbeb',
    border: '1px solid #f3d3a4', borderRadius: 4, padding: '6px 8px',
  },
}
