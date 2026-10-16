/**
 * EgenlastBlock.jsx — egenlast af tag, dæk eller væg ud fra lagopbygningen
 *
 * Afløser "Tagets egenlast" (roof_dead_load), som bad om kN/m² pr. lag uden
 * at hjælpe med at finde dem. Her beskrives opbygningen, som den står på
 * tegningen — gips 13 mm, 45×195 c/c 600, isolering, tagsten — og lasten
 * regnes ud. Tre slags lag:
 *
 *   Plade/fyld   γ · t          (densitet fra bilag A eller en byggevare)
 *   Ribbe        γ · b · h / c/c (spær, stolper, bjælker, lægter)
 *   Fast last    kN/m² direkte   (tagsten, pap, folie)
 *
 * Resultatet eksporteres som G_k. Lastkombinationer og "Laster på rammen"
 * kan hente det, og når blokken regnes igen, får de den nye værdi og bliver
 * markeret forældede.
 */
import React, { useEffect, useState } from 'react'
import { calcEgenlast, fetchMaterialDensities, fetchByggevarer } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'
import { BYGNINGSDELE, STANDARD_OPBYGNING, slaaOp, summer, afhaengige } from '../../lib/egenlast.js'

const LAGTYPER = [
  { value: 'lag',   label: 'Plade / fyld  (γ · t)' },
  { value: 'ribbe', label: 'Ribbe  (γ · b · h / c/c)' },
  { value: 'fast',  label: 'Fast last  (kN/m²)' },
]

const NYT_LAG = {
  lag:   { type: 'lag',   beskrivelse: '', materiale: null, t_mm: 0 },
  ribbe: { type: 'ribbe', beskrivelse: '', materiale: 'C24', b_mm: 45, h_mm: 195, cc_mm: 600 },
  fast:  { type: 'fast',  beskrivelse: '', g_kNm2: 0 },
}

const dk = (v, n = 3) => (v == null || !Number.isFinite(v)) ? '—' : v.toFixed(n).replace('.', ',')

export default function EgenlastBlock({ block, onChange, blocks = [], onUpdateBlock }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)
  const update = (changes) => onChange({ ...block, data: { ...d, ...changes } })

  // Bilag A og byggevarerne. Uden dem kan man stadig skrive faste laster.
  const [lib, setLib] = useState(null)
  useEffect(() => {
    let alive = true
    Promise.all([
      fetchMaterialDensities().catch(() => ({ groups: [] })),
      fetchByggevarer().catch(() => ({ byggevarer: [] })),
    ]).then(([den, bv]) => {
      if (!alive) return
      const densiteter = {}
      for (const g of den.groups ?? []) for (const m of g.materials) densiteter[m.key] = m
      const byggevarer = {}
      for (const b of bv.byggevarer ?? []) byggevarer[b.key] = b
      setLib({ grupper: den.groups ?? [], densiteter, byggevarer, liste: bv.byggevarer ?? [] })
    })
    return () => { alive = false }
  }, [])

  const lag = d.lag ?? STANDARD_OPBYGNING
  const del = d.bygningsdel ?? 'tag'
  const erTag = del === 'tag'
  const { pr, g_flade, g_vandret } = summer({ ...d, lag, bygningsdel: del }, lib)
  const bredde = d.bredde_m ?? 0
  const g_linje = bredde > 0 ? (del === 'vaeg' ? g_flade : g_vandret) * bredde : null

  const saetLag = (i, changes) => update({ lag: lag.map((l, j) => j === i ? { ...l, ...changes } : l) })
  const fjernLag = (i) => update({ lag: lag.filter((_, j) => j !== i) })
  const flytLag = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= lag.length) return
    const n = [...lag]; [n[i], n[j]] = [n[j], n[i]]
    update({ lag: n })
  }
  const nytLag = (type) => update({ lag: [...lag, { ...NYT_LAG[type] }] })

  function skiftType(i, type) {
    const l = lag[i]
    // Beskrivelsen følger med; resten starter forfra for den nye type.
    saetLag(i, { ...NYT_LAG[type], beskrivelse: l.beskrivelse,
                 ...(type === 'fast' ? { g_kNm2: pr[i] ?? 0 } : {}) })
  }

  function vaelgMateriale(i, key) {
    const l = lag[i]
    const m = slaaOp(lib, key)
    saetLag(i, { materiale: key || null, gamma_kNm3: null,
                 beskrivelse: l.beskrivelse || m?.navn || '' })
  }

  function vaelgProdukt(i, key) {
    const l = lag[i]
    const p = lib?.byggevarer[key]
    if (!p) { saetLag(i, { produkt: null }); return }
    saetLag(i, { produkt: key, g_kNm2: p.value, beskrivelse: l.beskrivelse || p.name })
  }

  async function handleRun() {
    setRunning(true); setError(null)
    try {
      const list = await calcEgenlast({
        label: d.label ?? 'G1', bygningsdel: del,
        alpha_deg: erTag ? (d.alpha_deg ?? 0) : 0,
        lag, bredde_m: bredde,
      })
      const sentinel = list.find(b => b.type === '_exports')
      const self = { ...block, data: { ...d, lag, _result: list.filter(b => b.type !== '_exports'),
                                       _exports: sentinel?.exports ?? null } }
      // Blokke, der henter G_k herfra, får den nye værdi med det samme.
      const par = [[block.id, self], ...afhaengige(blocks, self)]
      if (onUpdateBlock) onUpdateBlock(par)
      else onChange(self)
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const brugere = blocks.filter(b =>
    (b.type === 'load_combo' && b.data?.G_kilde?.id === block.id) ||
    (b.type === 'frame_loads' && b.data?.g_tag_kilde?.id === block.id))

  return (
    <CalcBlockShell
      title={d.title ?? 'Egenlast'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null, _exports: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Betegnelse">
        <input style={s.input} value={d.label ?? 'G1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Bygningsdel">
        <select style={s.input} value={del} onChange={e => update({ bygningsdel: e.target.value })}>
          {BYGNINGSDELE.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
      </Field>
      {erTag && (
        <Field label="Taghældning (°)" hint="α">
          <NumericInput style={s.input} value={d.alpha_deg ?? 30}
            onChange={v => update({ alpha_deg: v })} />
        </Field>
      )}
      <Field label={del === 'vaeg' ? 'Væghøjde (m)' : 'Belastningsbredde (m)'}
             hint={del === 'vaeg' ? '0 = ingen linjelast' : 'fx spærafstand · 0 = ingen'}>
        <NumericInput style={s.input} value={bredde}
          onChange={v => update({ bredde_m: v })} />
      </Field>

      <div style={s.full}>
        <div style={s.sub}>Opbygning, udefra og ind — pr. m² {erTag ? 'tagflade' : 'flade'}</div>
        {lag.map((l, i) => (
          <LagKort key={i} l={l} g={pr[i]} lib={lib}
            forste={i === 0} sidste={i === lag.length - 1}
            onSaet={c => saetLag(i, c)} onType={t => skiftType(i, t)}
            onMateriale={k => vaelgMateriale(i, k)} onProdukt={k => vaelgProdukt(i, k)}
            onOp={() => flytLag(i, -1)} onNed={() => flytLag(i, 1)} onFjern={() => fjernLag(i)} />
        ))}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={s.addBtn} onClick={() => nytLag('lag')}>+ Plade / fyld</button>
          <button style={s.addBtn} onClick={() => nytLag('ribbe')}>+ Ribbe</button>
          <button style={s.addBtn} onClick={() => nytLag('fast')}>+ Fast last</button>
        </div>
      </div>

      <div style={{ ...s.full, ...s.sumBox }}>
        <div style={s.sumRow}><span>g_k</span><b>{dk(g_flade)} kN/m² {erTag ? 'tagflade' : ''}</b></div>
        {erTag && (
          <div style={s.sumRow}><span>g_k,vandret = g_k / cos α</span><b>{dk(g_vandret)} kN/m² vandret</b></div>
        )}
        {g_linje != null && (
          <div style={s.sumRow}>
            <span>{del === 'vaeg' ? 'g_k · H' : erTag ? 'g_k,vandret · a' : 'g_k · a'}</span>
            <b>{dk(g_linje)} kN/m</b>
          </div>
        )}
        <div style={s.muted}>
          {d._exports
            ? (brugere.length
                ? `Bruges af ${brugere.map(b => b.data?.title ?? b.data?.label).join(', ')}.`
                : 'Kan hentes som G_k i Lastkombinationer og Laster på rammen.')
            : 'Regn blokken for at kunne hente G_k i andre blokke.'}
        </div>
      </div>
    </CalcBlockShell>
  )
}

function LagKort({ l, g, lib, forste, sidste, onSaet, onType, onMateriale, onProdukt, onOp, onNed, onFjern }) {
  const type = l.type ?? 'fast'
  const m = slaaOp(lib, type === 'ribbe' ? (l.materiale || 'C24') : l.materiale)
  const produkt = type === 'fast' ? lib?.byggevarer[l.produkt] : null
  const kilde = type === 'fast'
    ? (produkt && produkt.value === l.g_kNm2 ? `vejledende · ${produkt.note || produkt.source}` : 'angivet')
    : l.gamma_kNm3 != null ? 'densitet angivet' : m?.kilde

  return (
    <div style={s.card}>
      <div style={s.rowC}>
        <input style={{ ...s.input, flex: 1 }} value={l.beskrivelse ?? ''}
          placeholder="fx gips 13 mm" onChange={e => onSaet({ beskrivelse: e.target.value })} />
        <select style={{ ...s.input, width: 'auto' }} value={type} onChange={e => onType(e.target.value)}>
          {LAGTYPER.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button style={s.iconBtn} disabled={forste} onClick={onOp} title="Flyt op">↑</button>
        <button style={s.iconBtn} disabled={sidste} onClick={onNed} title="Flyt ned">↓</button>
        <button style={s.iconBtn} onClick={onFjern} title="Fjern lag">✕</button>
      </div>

      {type === 'fast' && (
        <div style={s.rowC}>
          <select style={{ ...s.input, flex: 1 }} value={l.produkt ?? ''} onChange={e => onProdukt(e.target.value)}>
            <option value="">— egen værdi —</option>
            {(lib?.liste ?? []).filter(p => p.kind === 'flade').map(p => (
              <option key={p.key} value={p.key}>{p.name} · {dk(p.value, 2)} kN/m²</option>
            ))}
          </select>
          <NumericInput style={{ ...s.input, width: 72, textAlign: 'right' }}
            value={l.g_kNm2 ?? 0} onChange={v => onSaet({ g_kNm2: v })} />
          <span style={s.enhed}>kN/m²</span>
        </div>
      )}

      {type !== 'fast' && (
        <select style={{ ...s.input, width: '100%' }} value={l.materiale ?? ''}
          onChange={e => onMateriale(e.target.value)}>
          {type === 'lag' && <option value="">— vælg materiale —</option>}
          {type === 'lag' && (lib?.liste ?? []).some(p => p.kind === 'densitet') && (
            <optgroup label="Byggevarer — vejledende, kontrollér med datablad">
              {lib.liste.filter(p => p.kind === 'densitet').map(p => (
                <option key={p.key} value={p.key}>{p.name} · {dk(p.value, 2)} kN/m³</option>
              ))}
            </optgroup>
          )}
          {(lib?.grupper ?? []).filter(gr => type === 'lag' || gr.table === 'A.3' || gr.table === 'A.4').map(gr => (
            <optgroup key={gr.table} label={`EN 1991-1-1 tabel ${gr.table} — ${gr.title}`}>
              {gr.materials.map(mm => (
                <option key={mm.key} value={mm.key}>
                  {mm.name} · {mm.is_range ? `${mm.min_kNm3}–${mm.max_kNm3}` : mm.default_kNm3} kN/m³
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}

      {type === 'lag' && (
        <div style={s.rowC}>
          <span style={s.enhed}>t</span>
          <NumericInput style={{ ...s.input, width: 64, textAlign: 'right' }}
            value={l.t_mm ?? 0} onChange={v => onSaet({ t_mm: v })} />
          <span style={s.enhed}>mm</span>
          <Gamma l={l} m={m} onSaet={onSaet} />
          <span style={s.lig}>=</span>
          <b style={s.g}>{dk(g)}</b><span style={s.enhed}>kN/m²</span>
        </div>
      )}

      {type === 'ribbe' && (
        <div style={s.rowC}>
          <NumericInput style={{ ...s.input, width: 50, textAlign: 'right' }}
            value={l.b_mm ?? 0} onChange={v => onSaet({ b_mm: v })} />
          <span style={s.enhed}>×</span>
          <NumericInput style={{ ...s.input, width: 56, textAlign: 'right' }}
            value={l.h_mm ?? 0} onChange={v => onSaet({ h_mm: v })} />
          <span style={s.enhed}>c/c</span>
          <NumericInput style={{ ...s.input, width: 56, textAlign: 'right' }}
            value={l.cc_mm ?? 0} onChange={v => onSaet({ cc_mm: v })} />
          <span style={s.enhed}>mm</span>
          <Gamma l={l} m={m} onSaet={onSaet} />
          <span style={s.lig}>=</span>
          <b style={s.g}>{dk(g)}</b><span style={s.enhed}>kN/m²</span>
        </div>
      )}

      {kilde && <div style={s.hint}>{kilde}</div>}
      {type === 'ribbe' && g == null && <div style={s.warn}>c/c skal være større end bredden.</div>}
    </div>
  )
}

// γ: vises med opslaget; skriver man et andet tal, bruges det i stedet.
function Gamma({ l, m, onSaet }) {
  const vaerdi = l.gamma_kNm3 ?? m?.gamma ?? null
  return (
    <>
      <span style={s.enhed}>γ</span>
      <NumericInput style={{ ...s.input, width: 56, textAlign: 'right',
                             ...(l.gamma_kNm3 != null ? { borderColor: '#d97706' } : null) }}
        value={vaerdi ?? ''} placeholder="—"
        onChange={v => onSaet({ gamma_kNm3: m && v === m.gamma ? null : v })} />
      <span style={s.enhed}>kN/m³</span>
      {l.gamma_kNm3 != null && m && (
        <button style={s.linkBtn} onClick={() => onSaet({ gamma_kNm3: null })}
          title={`Tilbage til ${m.gamma} kN/m³`}>↺</button>
      )}
    </>
  )
}

const s = {
  input: {
    border: '1px solid #e8e8e8', padding: '6px 8px', borderRadius: 3,
    fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
  },
  full: { gridColumn: '1/-1', display: 'grid', gap: 6 },
  sub: {
    fontSize: 11, fontWeight: 700, color: '#555',
    letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 4,
  },
  card: { border: '1px solid #eee', borderRadius: 4, padding: 6, display: 'grid', gap: 4 },
  rowC: { display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' },
  enhed: { fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' },
  lig: { fontSize: 12, color: '#9ca3af', padding: '0 2px' },
  g: { fontSize: 12.5, color: '#111827', whiteSpace: 'nowrap', marginLeft: 'auto' },
  hint: { fontSize: 10.5, color: '#6b7280' },
  warn: { fontSize: 11, color: '#b45309' },
  iconBtn: {
    width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer',
    color: '#9ca3af', fontSize: 12, padding: 0, flexShrink: 0,
  },
  linkBtn: {
    border: 'none', background: 'none', cursor: 'pointer', color: '#b45309',
    fontSize: 13, padding: '0 2px',
  },
  addBtn: {
    border: '1px dashed #d1d5db', background: 'none', cursor: 'pointer',
    fontSize: 12, color: '#6b7280', padding: '4px 10px', borderRadius: 4,
    fontFamily: 'inherit',
  },
  sumBox: { background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 4, padding: 8, gap: 3 },
  sumRow: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 },
  muted: { fontSize: 11, color: '#6b7280', marginTop: 2 },
}
