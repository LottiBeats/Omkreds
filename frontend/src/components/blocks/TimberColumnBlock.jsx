/**
 * TimberColumnBlock.jsx — EN 1995-1-1 timber column / beam-column check
 *
 * Checks: section (compression + bending), flexural buckling (both axes),
 * combined interaction equations 6.23 and 6.24.
 * Optional LTB check when l_ef_ltb is provided.
 *
 * Load source:
 *   direct  — user enters N_Ed + load_duration manually (default)
 *   combo   — reads E_d_uls (→ N_Ed) and governing_duration (→ load_duration)
 *             from a Load Combo block in the same document
 */
import React, { useState } from 'react'
import { calcTimberColumn } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const GRADES = [
  'C14','C16','C18','C20','C22','C24','C27','C30','C35','C40',
  'GL20H','GL22H','GL24H','GL26H','GL28H','GL30H','GL32H',
  'GL24C','GL28C','GL32C',
]
const LOAD_DURATIONS = ['permanent','long','medium','short','instant']
const SERVICE_CLASSES = [1, 2, 3]

const DURATION_LABEL = {
  permanent: 'Permanent  (k_mod 0.60)',
  long:      'Long  (k_mod 0.70)',
  medium:    'Medium  (k_mod 0.80)',
  short:     'Short  (k_mod 0.90)',
  instant:   'Instantaneous  (k_mod 1.10)',
}

export default function TimberColumnBlock({ block, onChange, blocks = [] }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  // All load_combo blocks in the document that have been run
  const comboBlocks = blocks.filter(b => b.type === 'load_combo')
  const source      = d.load_source ?? 'direct'

  // Selected combo block and its exports
  const selCombo   = comboBlocks.find(b => b.data.label === d.combo_label) ?? comboBlocks[0]
  const exports_   = selCombo?.data?._exports
  const comboReady = !!exports_?.E_d_uls

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const payload = {
        label:                 d.label                 ?? 'C1',
        length_m:              d.length_m              ?? 3.0,
        N_Ed_kN:               d.N_Ed_kN               ?? 50.0,
        M_Ed_kNm:              d.M_Ed_kNm              ?? 0.0,
        b_mm:                  d.b_mm                  ?? 120,
        h_mm:                  d.h_mm                  ?? 120,
        timber_grade:          d.timber_grade           ?? 'C24',
        service_class:         d.service_class          ?? 1,
        load_duration:         d.load_duration          ?? 'medium',
        gamma_M:               d.gamma_M                ?? 1.3,
        effective_length_factor: d.effective_length_factor ?? 1.0,
        l_ef_ltb_m:            d.l_ef_ltb_m            ?? null,

        // Brand — EN 1995-1-2. Uden en varighed springes afsnittet over.
        fire_t_min:      d.fire_t_min      ?? null,
        fire_exposed_b:  d.fire_exposed_b  ?? 2,
        fire_exposed_h:  d.fire_exposed_h  ?? 2,
        fire_eta_fi:     d.fire_eta_fi     ?? null,
      }

      if (source === 'combo' && exports_) {
        payload.N_Ed_kN          = exports_.E_d_uls
        payload.combo_label      = selCombo?.data?.label ?? ''
        // Enheden med, saa backend kan afvise en linjelast brugt som normalkraft.
        payload.combo_unit       = exports_.unit ?? null
        // Er kombinationen en ulykke, saettes gamma_M til 1,0 (DK NA anneks F 10).
        payload.design_situation = exports_.design_situation ?? 'persistent' 
        // Pass all ULS combinations so the backend can find the truly governing one
        // via max(E_d / k_mod) — not just max(E_d). EN 1995-1-1 §2.2.3.
        payload.uls_combinations = exports_.uls_combinations ?? null
      }

      const blocks_result = await calcTimberColumn(payload)
      update({ _result: blocks_result })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <CalcBlockShell
      title={d.title ?? 'Timber Column Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
      runDisabled={source === 'combo' && !comboReady}
    >
      {/* ── Load source selector ── */}
      <Field label="Lastkilde" style={{ gridColumn: '1/-1' }}>
        <div style={{ display: 'flex', gap: 16, padding: '2px 0' }}>
          {['direct', 'combo'].map(opt => (
            <label key={opt} style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <input type="radio" name={`src-${block.id}`}
                value={opt} checked={source === opt}
                onChange={() => update({ load_source: opt })} />
              {opt === 'direct' ? 'Direct  (N_Ed manual)' : 'Load combination'}
            </label>
          ))}
        </div>
      </Field>

      {/* ── Combo picker ── */}
      {source === 'combo' && (
        <Field label="Lastkombinationsblok" style={{ gridColumn: '1/-1' }}>
          {comboBlocks.length === 0 ? (
            <span style={{ fontSize: 12, color: '#e67e22' }}>
              No load combo blocks in this document yet — add one first.
            </span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <select style={{ ...s, width: 'auto', minWidth: 180 }}
                value={selCombo?.data?.label ?? ''}
                onChange={e => update({ combo_label: e.target.value })}>
                {comboBlocks.map(b => (
                  <option key={b.id} value={b.data.label ?? ''}>
                    {b.data.label ?? '?'}  —  {b.data.title ?? 'Load Combinations'}
                  </option>
                ))}
              </select>
              {comboReady
                ? <span style={{ fontSize: 12, color: '#27ae60', whiteSpace: 'nowrap' }}>
                    ✓ N_Ed = {exports_.E_d_uls.toFixed(2)} {exports_.unit ?? 'kN'}
                    {exports_.governing_duration && (
                      <>  ·  {exports_.governing_duration}</>
                    )}
                  </span>
                : <span style={{ fontSize: 12, color: '#e67e22', whiteSpace: 'nowrap' }}>
                    Run the combo block first
                  </span>
              }
            </div>
          )}
        </Field>
      )}

      {/* ── Label + geometry (always shown) ── */}
      <Field label="Betegnelse">
        <input style={s} value={d.label ?? 'C1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Længde (m)">
        <NumericInput style={s} value={d.length_m ?? 3.0}
          onChange={v => update({ length_m: v })} />
      </Field>

      {/* ── N_Ed — only when source = direct ── */}
      {source === 'direct' && (
        <Field label="N_Ed (kN)" hint="Normalkraft, tryk">
          <NumericInput style={s} value={d.N_Ed_kN ?? 50.0}
            onChange={v => update({ N_Ed_kN: v })} />
        </Field>
      )}

      <Field label="M_Ed (kNm)" hint="Bøjning om stærk akse">
        <NumericInput style={s} value={d.M_Ed_kNm ?? 0.0}
          onChange={v => update({ M_Ed_kNm: v })} />
      </Field>
      <Field label="Bredde b (mm)">
        <NumericInput style={s} value={d.b_mm ?? 120}
          onChange={v => update({ b_mm: v })} />
      </Field>
      <Field label="Højde h (mm)">
        <NumericInput style={s} value={d.h_mm ?? 120}
          onChange={v => update({ h_mm: v })} />
      </Field>
      <Field label="Styrkeklasse">
        <select style={s} value={d.timber_grade ?? 'C24'}
          onChange={e => update({ timber_grade: e.target.value })}>
          {GRADES.map(g => <option key={g}>{g}</option>)}
        </select>
      </Field>
      <Field label="Anvendelsesklasse">
        <select style={s} value={d.service_class ?? 1}
          onChange={e => update({ service_class: Number(e.target.value) })}>
          {SERVICE_CLASSES.map(c => (
            <option key={c} value={c}>{c} — {['Dry interior','Covered outdoor','Exposed'][c-1]}</option>
          ))}
        </select>
      </Field>

      {/* ── Load duration — only when source = direct ── */}
      {source === 'direct' && (
        <Field label="Lastvarighed">
          <select style={s} value={d.load_duration ?? 'medium'}
            onChange={e => update({ load_duration: e.target.value })}>
            {LOAD_DURATIONS.map(dur => (
              <option key={dur} value={dur}>{DURATION_LABEL[dur] ?? dur}</option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Søjlelængdefaktor μ" hint="1,0 = leddet i begge ender · 0,7 = leddet/indspændt">
        <NumericInput style={s} value={d.effective_length_factor ?? 1.0}
          onChange={v => update({ effective_length_factor: v })} />
      </Field>
      <Field label="γ_M">
        <NumericInput style={s} value={d.gamma_M ?? 1.3}
          onChange={v => update({ gamma_M: v })} />
      </Field>
      <div style={{ gridColumn: '1/-1', fontSize: 11, fontWeight: 700,
                    color: '#6b7280', letterSpacing: '.06em',
                    textTransform: 'uppercase', marginTop: 8 }}>
        Brand — EN 1995-1-2
      </div>
      <Field label="Brandvarighed (min)" hint="tom = ingen brandeftervisning">
        <input style={s.input} type="number" step="15"
          value={d.fire_t_min ?? ''}
          onChange={e => update({ fire_t_min: e.target.value ? parseFloat(e.target.value) : null })} />
      </Field>
      <Field label="η_fi" hint="tom = 1,0 (fuld last, på den sikre side)">
        <input style={s.input} type="number" step="0.05"
          value={d.fire_eta_fi ?? ''}
          onChange={e => update({ fire_eta_fi: e.target.value ? parseFloat(e.target.value) : null })} />
      </Field>
      <Field label="Udsatte b-flader" hint="2 = fritstående · 1 = op ad væg">
        <NumericInput style={s.input} value={d.fire_exposed_b ?? 2}
          onChange={v => update({ fire_exposed_b: v })} />
      </Field>
      <Field label="Udsatte h-flader">
        <NumericInput style={s.input} value={d.fire_exposed_h ?? 2}
          onChange={v => update({ fire_exposed_h: v })} />
      </Field>

      <Field label="l_ef,LTB (m)" hint="valgfri — slår kipningseftervisningen til">
        <input style={s} inputMode="decimal"
          value={d.l_ef_ltb_m ?? ''}
          placeholder="leave blank to skip"
          onChange={e => update({ l_ef_ltb_m: e.target.value ? parseFloat(e.target.value) : null })} />
      </Field>
    </CalcBlockShell>
  )
}

const s = {
  border: '1px solid #e8e8e8', padding: '6px 8px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
}
