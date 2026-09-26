/**
 * WindLoadBlock.jsx — EN 1991-1-4 + DK NA vindlast
 *
 * Peakhastighedstryk q_p og formfaktorerne for en rektangulær bygning med
 * saddeltag. Formfaktorerne aflæses af den projekterende (tabel 7.1, 7.4a og
 * 7.4b); "Forslag" udfylder felterne som et udgangspunkt, der skal efterses.
 *
 * Eksporten (_exports) bærer q_p og formfaktorerne videre til
 * "Laster på rammen", der placerer zonerne på rammens stænger, og til
 * rammeberegningens "Vindlast (zone)".
 */
import React, { useEffect, useState } from 'react'
import { calcWindLoad, windForslag } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const TERRAIN_CATEGORIES = [
  { value: 'I',   label: 'I — hav og åbent vand' },
  { value: 'II',  label: 'II — åbent land (marker, græs)' },
  { value: 'III', label: 'III — forstad eller skov' },
  { value: 'IV',  label: 'IV — by' },
]

const TAG0  = ['F', 'G', 'H', 'I', 'J']
const LANGS = ['A', 'B', 'C', 'F', 'G', 'H', 'I']

/** c_pe with a Danish comma, and empty meaning "not read off yet". */
function Cpe({ value, onChange, label }) {
  const show = (v) => (v == null ? '' : String(v).replace('.', ','))
  const [txt, setTxt] = useState(show(value))
  const [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setTxt(show(value)) }, [value, focus])
  return (
    <label style={s.cpe}>
      <span style={s.cpeL}>{label}</span>
      <input style={{ ...s.input, textAlign: 'right', ...(value == null ? s.missing : null) }}
        value={txt} inputMode="decimal" placeholder="—"
        onFocus={() => setFocus(true)}
        onChange={e => setTxt(e.target.value)}
        onBlur={() => {
          setFocus(false)
          const t = txt.trim().replace(',', '.').replace('−', '-')
          if (t === '') { onChange(null); return }
          const v = Number(t)
          if (Number.isFinite(v)) onChange(v); else setTxt(show(value))
        }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
    </label>
  )
}

export default function WindLoadBlock({ block, onChange }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)
  const [hint,    setHint]    = useState(null)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  const tag0  = d.tagzoner ?? {}
  const tryk  = d.tagzoner_tryk ?? {}
  const langs = d.langs ?? {}
  const har = (obj, keys) => keys.some(k => obj[k] != null)

  async function handleForslag() {
    setHint(null)
    try {
      const f = await windForslag({ alpha_deg: d.alpha_deg ?? 15, h_m: d.h_m ?? 8, d_m: d.d_m ?? 12 })
      update({
        c_pe_windward: f.vaegge.D, c_pe_leeward: f.vaegge.E,
        tagzoner: f.tag_sug,
        tagzoner_tryk: f.tag_tryk ?? null,
        langs: f.langs,
      })
      setHint('Udfyldt med forslag efter tabel 7.1, 7.4a og 7.4b. Efterse dem mod standarden — tallene står i rapporten som dine.')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const tagOk = ['G', 'H', 'I', 'J'].every(k => tag0[k] != null)
      const list = await calcWindLoad({
        label:            d.label            ?? 'W1',
        terrain_category: d.terrain_category ?? 'II',
        v_b0_ms:          d.v_b0_ms          ?? 24.0,
        z_ref_m:          d.z_ref_m          ?? 8.0,
        h_m:              d.h_m              ?? 8.0,
        b_m:              d.b_m              ?? 10.0,
        d_m:              d.d_m              ?? 12.0,
        c_dir:            d.c_dir            ?? 1.0,
        c_season:         d.c_season         ?? 1.0,
        c_pe_windward:    d.c_pe_windward    ?? 0.8,
        c_pe_leeward:     d.c_pe_leeward     ?? -0.5,
        c_pi:             d.c_pi             ?? 0.2,
        rho_air:          d.rho_air          ?? 1.25,
        alpha_deg:        d.alpha_deg        ?? 0,
        tagzoner:         tagOk ? Object.fromEntries(Object.entries(tag0).filter(([, v]) => v != null)) : null,
        tagzoner_tryk:    tagOk && TAG0.every(k => tryk[k] != null) ? tryk : null,
        langs:            LANGS.every(k => langs[k] != null) ? langs : null,
      })
      // Eksporten rejser som en usynlig første blok; den skal ud af
      // resultatet og ligge for sig, så andre blokke kan læse den.
      const sentinel = list.find(b => b.type === '_exports')
      update({ _result: list.filter(b => b.type !== '_exports'), _exports: sentinel?.exports ?? null })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <CalcBlockShell
      title={d.title ?? 'Vindlast'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null, _exports: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      <Field label="Betegnelse">
        <input style={s.input} value={d.label ?? 'W1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Terrænkategori">
        <select style={s.input} value={d.terrain_category ?? 'II'}
          onChange={e => update({ terrain_category: e.target.value })}>
          {TERRAIN_CATEGORIES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </Field>
      <Field label="v_b,0 (m/s)" hint="DK: 24 m/s">
        <NumericInput style={s.input} value={d.v_b0_ms ?? 24.0}
          onChange={v => update({ v_b0_ms: v })} />
      </Field>
      <Field label="z_ref (m)" hint="referencehøjde">
        <NumericInput style={s.input} value={d.z_ref_m ?? 8.0}
          onChange={v => update({ z_ref_m: v })} />
      </Field>
      <Field label="h (m)" hint="bygningshøjde">
        <NumericInput style={s.input} value={d.h_m ?? 8.0}
          onChange={v => update({ h_m: v })} />
      </Field>
      <Field label="b (m)" hint="længde langs kippen">
        <NumericInput style={s.input} value={d.b_m ?? 10.0}
          onChange={v => update({ b_m: v })} />
      </Field>
      <Field label="d (m)" hint="bredde på tværs af kippen">
        <NumericInput style={s.input} value={d.d_m ?? 12.0}
          onChange={v => update({ d_m: v })} />
      </Field>
      <Field label="Taghældning α (°)">
        <NumericInput style={s.input} value={d.alpha_deg ?? 15}
          onChange={v => update({ alpha_deg: v })} />
      </Field>

      <div style={s.section}>
        <div style={s.head}>
          <b>Formfaktorer c<sub>pe,10</sub></b>
          <button type="button" style={s.btn} onClick={handleForslag}
            title="Udfyld med tabelværdier ved α, h og d — efterses før brug">Forslag fra tabellerne</button>
        </div>
        {hint && <div style={s.note}>{hint}</div>}

        <div style={s.sub}>Vægge, vind på tværs af kippen (tabel 7.1)</div>
        <div style={s.grid}>
          <Cpe label="D — luv" value={d.c_pe_windward ?? 0.8} onChange={v => update({ c_pe_windward: v ?? 0.8 })} />
          <Cpe label="E — læ" value={d.c_pe_leeward ?? -0.5} onChange={v => update({ c_pe_leeward: v ?? -0.5 })} />
        </div>

        <div style={s.sub}>Tag, vind på tværs af kippen (tabel 7.4a){har(tryk, TAG0) ? ' — sug' : ''}</div>
        <div style={s.grid}>
          {TAG0.map(z => <Cpe key={z} label={z} value={tag0[z] ?? null} onChange={v => update({ tagzoner: { ...tag0, [z]: v } })} />)}
        </div>

        <label style={s.check}>
          <input type="checkbox" checked={!!d.tagzoner_tryk} onChange={e => update({ tagzoner_tryk: e.target.checked ? {} : null })} />
          Også tryk-sættet (tabel 7.4a giver både sug og tryk ved 5°–45°)
        </label>
        {d.tagzoner_tryk && (
          <div style={s.grid}>
            {TAG0.map(z => <Cpe key={z} label={z} value={tryk[z] ?? null} onChange={v => update({ tagzoner_tryk: { ...tryk, [z]: v } })} />)}
          </div>
        )}

        <label style={s.check}>
          <input type="checkbox" checked={!!d.langs} onChange={e => update({ langs: e.target.checked ? {} : null })} />
          Vind på langs af kippen (vægge A/B/C, tabel 7.1 · tag F/G/H/I, tabel 7.4b)
        </label>
        {d.langs && (
          <div style={s.grid}>
            {LANGS.map((z, i) => <Cpe key={z} label={`${z} ${i < 3 ? 'væg' : 'tag'}`} value={langs[z] ?? null} onChange={v => update({ langs: { ...langs, [z]: v } })} />)}
          </div>
        )}

        <div style={s.sub}>Indvendigt tryk</div>
        <div style={s.grid}>
          <Cpe label="c_pi (vægtabel)" value={d.c_pi ?? 0.2} onChange={v => update({ c_pi: v ?? 0.2 })} />
        </div>
        <div style={s.note}>
          Med tagzonerne udfyldt regnes begge indvendige tryk, c<sub>pi</sub> = +0,2 og −0,3 (§7.2.9(6)).
          Tomme felter er ikke aflæst endnu — de bliver ikke til nul.
        </div>
      </div>
    </CalcBlockShell>
  )
}

const s = {
  input: {
    border: '1px solid var(--line-2, #e8e8e8)', padding: '6px 8px', borderRadius: 4,
    fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
  },
  missing: { background: 'var(--warn-wash, #fffbeb)' },
  section: { gridColumn: '1/-1', display: 'grid', gap: 8, marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--line, #eee)' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13 },
  btn: { border: '1px solid var(--line-2, #ddd)', background: 'var(--surface, #fff)', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  sub: { fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '.04em', textTransform: 'uppercase', marginTop: 4 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 6 },
  cpe: { display: 'grid', gap: 2 },
  cpeL: { fontSize: 11, color: '#666' },
  check: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: '#444' },
  note: { fontSize: 12, color: '#666', lineHeight: 1.5 },
}
