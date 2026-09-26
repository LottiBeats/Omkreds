/**
 * FrameLoadsBlock.jsx — "Laster på rammen"
 *
 * Står mellem sne/vind og rammeberegningen. Henter q_p og formfaktorerne i
 * vindblokken, s_k i sneblokken og geometrien i rammeberegningen, og regner
 * lasttilfælde og linjelaster ud pr. led: zonerne D/E på væggene, G/H og J/I
 * på tagfladerne, A/B/C og F/G/H/I ved vind på langs, og sne jævnt og
 * asymmetrisk.
 *
 * Når den regnes, skrives lasterne ind i rammeberegningen, som så er forældet
 * og skal regnes igen. Lasterne er låst dér ("fra lastmodulet") — de rettes
 * her, ét sted.
 */
import React, { useMemo, useState } from 'react'
import { calcFrameLoads } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'
import { ROLES, detectRoles, memberLines, applyFrameLoads } from '../fem/femRoles.js'

const PLACERING = [
  { value: 'naeste',  label: 'Første mellemramme (x = s)' },
  { value: 'endefag', label: 'Endefag, ved gavlen (x = 0)' },
  { value: 'midt',    label: 'Midt i bygningen' },
  { value: 'egen',    label: 'Egen afstand fra gavl' },
]

function sig(v) {
  const str = JSON.stringify(v ?? null)
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return String(h)
}

export default function FrameLoadsBlock({ block, onChange, blocks = [], onUpdateBlock }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)
  const update = (changes) => onChange({ ...block, data: { ...d, ...changes } })

  const femBlocks  = blocks.filter(b => b.type === 'general_frame_fem')
  const windBlocks = blocks.filter(b => b.type === 'wind_load')
  const snowBlocks = blocks.filter(b => b.type === 'snow_load')
  const fem  = femBlocks.find(b => b.id === d.fem_block_id) ?? femBlocks[0] ?? null
  const wind = windBlocks.find(b => b.id === d.wind_block_id) ?? windBlocks[0] ?? null
  const snow = snowBlocks.find(b => b.id === d.snow_block_id) ?? snowBlocks[0] ?? null
  const wx = wind?.data?._exports ?? null

  const model = useMemo(() => ({ nodes: fem?.data?.nodes ?? [], elements: fem?.data?.elements ?? [] }), [fem])
  const lines = useMemo(() => memberLines(model), [model])
  const auto  = useMemo(() => detectRoles(model), [model])
  const roles = { ...auto, ...(d.roller ?? {}) }

  const s_m = d.s_m ?? 5.0
  const laengde = d.laengde_m ?? wx?.b_m ?? wind?.data?.b_m ?? null
  const placering = d.placering ?? 'naeste'
  const x_m = placering === 'endefag' ? 0 : placering === 'naeste' ? s_m
    : placering === 'midt' ? (laengde ? laengde / 2 : null) : (d.x_m ?? s_m)

  // The wind block is computed for a building; the frame is drawn for one.
  // If they disagree, the zones and c_pe belong to another roof.
  const tagHaeld = Math.max(0, ...lines.filter(l => ['tag_v', 'tag_h'].includes(roles[l.member_id]))
    .map(l => Math.atan2(Math.abs(l.y1 - l.y0), Math.abs(l.x1 - l.x0) || 1e-9) * 180 / Math.PI))
  const top = lines.length ? Math.max(...lines.flatMap(l => [l.y0, l.y1])) - Math.min(...lines.flatMap(l => [l.y0, l.y1])) : 0
  const vindAlpha = wind?.data?.alpha_deg
  const afvigelser = []
  if (vindAlpha != null && tagHaeld > 0 && Math.abs(vindAlpha - tagHaeld) > 2)
    afvigelser.push(`vindblokken er regnet for α = ${Math.round(vindAlpha)}°, rammens tag har ${Math.round(tagHaeld)}°`)
  if (wx?.h_m != null && top > wx.h_m + 0.05)
    afvigelser.push(`vindblokken bruger h = ${String(wx.h_m).replace('.', ',')} m, rammen er ${String(Math.round(top * 100) / 100).replace('.', ',')} m høj`)

  const brugSne  = d.med_sne ?? true
  const brugVind = d.med_vind ?? true
  const vindKlar = !!(wx?.cpe0?.length || wx?.cpe90)

  // What the loads were computed from. If any of it has moved since, the
  // loads in the model are from an older state of the project.
  const kilde = sig({
    lines, roles, wx: brugVind ? wx : null,
    sne: brugSne ? [snow?.data?.s_k_kNm2, snow?.data?.C_e, snow?.data?.C_t] : null,
  })
  const kildeFlyttet = d._result && d._kilde_sig && d._kilde_sig !== kilde

  async function handleRun() {
    setRunning(true); setError(null)
    try {
      if (!fem) throw new Error('Der er ingen rammeberegning i dokumentet at sætte lasterne på.')
      if (!lines.length) throw new Error('Rammeberegningen har ingen led endnu.')
      if (brugVind && !vindKlar) throw new Error('Vindblokken er ikke regnet med formfaktorer for tagzonerne. Udfyld dem (eller brug "Forslag"), og regn vindblokken — eller slå vind fra her.')
      const list = await calcFrameLoads({
        navn: fem.data?.title ?? 'Ramme',
        led: lines.map(l => ({ member_id: l.member_id, rolle: roles[l.member_id] ?? 'ingen', x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1 })),
        s_m, x_m, laengde_m: laengde,
        g_tag_kNm2: d.g_tag_kNm2 ?? 0,
        sne: brugSne ? { s_k: snow?.data?.s_k_kNm2 ?? 1.0, C_e: snow?.data?.C_e ?? 1.0, C_t: snow?.data?.C_t ?? 1.0 } : null,
        vind: brugVind && wx ? { q_p: wx.q_p_kNm2, h: wx.h_m, b: wx.b_m, d: wx.d_m, cpe0: wx.cpe0 ?? [], cpe90: wx.cpe90 ?? null } : null,
      })
      const sentinel = list.find(b => b.type === '_exports')
      const ex = sentinel?.exports ?? null
      const self = { ...block, data: { ...d, fem_block_id: fem.id, _result: list.filter(b => b.type !== '_exports'), _exports: ex, _kilde_sig: kilde } }
      const femNext = { ...fem, data: applyFrameLoads(fem.data, ex, block.id) }
      if (onUpdateBlock) onUpdateBlock([[block.id, self], [fem.id, femNext]])
      else onChange(self)
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const ex = d._exports
  return (
    <CalcBlockShell
      title={d.title ?? 'Laster på rammen'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null, _exports: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Rammeberegning" style={{ gridColumn: '1/-1' }}>
        <select style={s.input} value={fem?.id ?? ''} onChange={e => update({ fem_block_id: Number(e.target.value) })}>
          {!femBlocks.length && <option value="">— ingen i dokumentet —</option>}
          {femBlocks.map(b => <option key={b.id} value={b.id}>{b.data?.title ?? 'Rammeberegning'}</option>)}
        </select>
      </Field>
      <Field label="Rammeafstand s (m)">
        <NumericInput style={s.input} value={s_m} onChange={v => update({ s_m: v })} />
      </Field>
      <Field label="Bygningens længde (m)" hint={wx?.b_m ? 'fra vindblokken' : 'langs kippen'}>
        <NumericInput style={s.input} value={laengde ?? ''} onChange={v => update({ laengde_m: v })} />
      </Field>
      <Field label="Rammens placering">
        <select style={s.input} value={placering} onChange={e => update({ placering: e.target.value })}>
          {PLACERING.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </Field>
      {placering === 'egen' && (
        <Field label="Afstand fra gavl x (m)">
          <NumericInput style={s.input} value={d.x_m ?? s_m} onChange={v => update({ x_m: v })} />
        </Field>
      )}
      <Field label="Egenlast af tag (kN/m²)" hint="0 = ikke med">
        <NumericInput style={s.input} value={d.g_tag_kNm2 ?? 0} onChange={v => update({ g_tag_kNm2: v })} />
      </Field>

      <div style={s.section}>
        <label style={s.check}>
          <input type="checkbox" checked={brugSne} onChange={e => update({ med_sne: e.target.checked })} />
          Sne {snow ? `fra "${snow.data?.title ?? 'Snelast'}" — s_k = ${String(snow.data?.s_k_kNm2 ?? 1).replace('.', ',')} kN/m²` : '— ingen sneblok, s_k = 1,0 kN/m²'}
        </label>
        <label style={s.check}>
          <input type="checkbox" checked={brugVind} onChange={e => update({ med_vind: e.target.checked })} />
          Vind {wind ? `fra "${wind.data?.title ?? 'Vindlast'}"` : '— ingen vindblok i dokumentet'}
          {brugVind && wind && !vindKlar && <span style={s.warn}> · vindblokken mangler tagzonerne eller er ikke regnet</span>}
          {brugVind && wx?.q_p_kNm2 != null && vindKlar && <span style={s.muted}> · q_p = {String(wx.q_p_kNm2).replace('.', ',')} kN/m²{wx.cpe90 ? ' · også på langs' : ''}</span>}
        </label>
        {brugVind && afvigelser.length > 0 && (
          <div style={{ ...s.staleBox, padding: 8 }}>
            Tjek vindblokken: {afvigelser.join(' · ')}. Formfaktorerne og zonebredden e hører til den bygning, vinden er regnet for.
          </div>
        )}
        {windBlocks.length > 1 && (
          <select style={s.input} value={wind?.id ?? ''} onChange={e => update({ wind_block_id: Number(e.target.value) })}>
            {windBlocks.map(b => <option key={b.id} value={b.id}>{b.data?.title ?? b.data?.label}</option>)}
          </select>
        )}
      </div>

      <div style={s.section}>
        <div style={s.sub}>Led og flader</div>
        {!lines.length && <div style={s.muted}>Rammeberegningen har ingen led endnu.</div>}
        {lines.length > 0 && (
          <table style={s.tbl}>
            <thead><tr><th style={s.th}>Led</th><th style={s.th}>Fra → til</th><th style={s.th}>Flade</th></tr></thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.member_id}>
                  <td style={s.td}>{l.member_id}</td>
                  <td style={{ ...s.td, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
                    ({fmt(l.x0)}; {fmt(l.y0)}) → ({fmt(l.x1)}; {fmt(l.y1)})
                  </td>
                  <td style={s.td}>
                    <select style={{ ...s.input, padding: '3px 6px' }} value={roles[l.member_id] ?? 'ingen'}
                      onChange={e => update({ roller: { ...(d.roller ?? {}), [l.member_id]: e.target.value } })}>
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}{auto[l.member_id] === r.value ? ' (fundet)' : ''}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {ex && (
        <div style={{ ...s.section, ...(kildeFlyttet ? s.staleBox : null) }}>
          {kildeFlyttet
            ? <b>Vind, sne eller rammens geometri er ændret siden lasterne blev regnet. Regn blokken igen, så rammeberegningen får de nye laster.</b>
            : <span>{ex.load_cases.length} lasttilfælde og {ex.loads.length} linjelaster er sat på "{fem?.data?.title ?? 'rammen'}" · lastbredde {fmt(ex.lastbredde_m)} m. Regn rammeberegningen igen.</span>}
        </div>
      )}
    </CalcBlockShell>
  )
}

const fmt = (v) => (Number.isFinite(v) ? (Math.round(v * 100) / 100).toString().replace('.', ',') : '—')

const s = {
  input: {
    border: '1px solid var(--line-2, #e8e8e8)', padding: '6px 8px', borderRadius: 4,
    fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
  },
  section: { gridColumn: '1/-1', display: 'grid', gap: 6, marginTop: 4, paddingTop: 10, borderTop: '1px solid var(--line, #eee)', fontSize: 12.5 },
  staleBox: { background: 'var(--warn-wash, #fffbeb)', padding: 10, borderRadius: 6, border: '1px solid var(--warn, #d97706)' },
  sub: { fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '.04em', textTransform: 'uppercase' },
  check: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', color: '#333' },
  warn: { color: 'var(--warn, #b45309)' },
  muted: { color: '#777' },
  tbl: { borderCollapse: 'collapse', width: '100%', fontSize: 12.5 },
  th: { textAlign: 'left', fontSize: 10.5, color: '#777', fontWeight: 600, padding: '4px 6px', borderBottom: '1px solid #eee' },
  td: { padding: '3px 6px', borderBottom: '1px solid #f3f3f3' },
}
