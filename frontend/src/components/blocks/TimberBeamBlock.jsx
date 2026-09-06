/**
 * TimberBeamBlock.jsx — EN 1995-1-1 timber beam check
 *
 * Load source:
 *   direct  — user enters g_k / q_k + load_duration manually (default)
 *   actions — user enters M_Ed / V_Ed directly (hand calc or other tool)
 *   combo   — reads E_d_uls from a Load Combo block; governing combination
 *             determined by max(E_d/k_mod) so k_mod is always correct
 *   fem     — reads M_Ed and V_Ed directly from a Beam FEM block
 *             load_duration must be set manually (FEM has no duration info)
 */
import React, { useState } from 'react'
import { calcTimberBeam } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const GRADES = [
  'C14','C16','C18','C20','C22','C24','C27','C30','C35','C40',
  'GL20H','GL22H','GL24H','GL26H','GL28H','GL30H','GL32H',
  'GL24C','GL28C','GL32C',
  'D30','D35','D40','D50',
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

export default function TimberBeamBlock({ block, onChange, blocks = [] }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  const source = d.load_source ?? 'direct'

  // ── Combo source ──────────────────────────────────────────────────────────
  const comboBlocks = blocks.filter(b => b.type === 'load_combo')
  const selCombo    = comboBlocks.find(b => b.data.label === d.combo_label) ?? comboBlocks[0]
  const comboExp    = selCombo?.data?._exports
  const comboReady  = !!comboExp?.E_d_uls

  // ── FEM source ────────────────────────────────────────────────────────────
  const femBlocks  = blocks.filter(b => b.type === 'beam_fem' || b.type === 'general_frame_fem')
  const selFem     = femBlocks.find(b => b.id === d.fem_block_id) ?? femBlocks[0]
  const isGenFem   = selFem?.type === 'general_frame_fem'
  const femSummary = selFem?.data?._summary
  const genExports = selFem?.data?._exports?.elements ?? []
  const selElemId  = d.fem_elem_id ?? genExports[0]?.id
  const selEnd     = d.fem_end ?? 'max'
  const selElem    = genExports.find(e => e.id === selElemId) ?? genExports[0]
  const femReady   = isGenFem ? !!selElem : !!femSummary?.M_Ed_kNm

  function getFemMV() {
    if (!selFem) return {}
    if (!isGenFem) return { M: femSummary?.M_Ed_kNm, V: femSummary?.V_Ed_kN }
    if (!selElem) return {}
    const M = selEnd === 'i' ? Math.abs(selElem.M_i_kNm)
            : selEnd === 'j' ? Math.abs(selElem.M_j_kNm)
            : selElem.M_max_kNm
    const V = selEnd === 'i' ? Math.abs(selElem.V_i_kN)
            : selEnd === 'j' ? Math.abs(selElem.V_j_kN)
            : selElem.V_max_kN
    return { M, V }
  }

  const runDisabled =
    (source === 'combo'   && !comboReady) ||
    (source === 'fem'     && !femReady)

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const payload = {
        label:          d.label         ?? 'T1',
        span_m:         d.span_m        ?? 4.0,
        b_mm:           d.b_mm          ?? 90,
        h_mm:           d.h_mm          ?? 220,
        g_k_kNm:       d.g_k_kNm       ?? 3.0,
        q_k_kNm:       d.q_k_kNm       ?? 2.0,
        timber_grade:   d.timber_grade  ?? 'C24',
        service_class:  d.service_class ?? 1,
        load_duration:  d.load_duration ?? 'medium',
        gamma_M:        d.gamma_M       ?? 1.3,
        compression_edge_restrained:     d.compression_edge_restrained ?? true,
        torsional_restraint_at_supports: d.torsional_restraint_at_supports ?? true,
        support_length_mm: d.support_length_mm ?? null,

        // Anvendelsesgrænsetilstand — EN 1995-1-1 §7.2
        // Kommer lasten fra en ulykkeskombination, foelger materialesiden med
        // af sig selv -- brugeren skal ikke vide at gamma_M ogsaa aendrer sig.
        design_situation: (source === 'combo' && exports_?.design_situation)
                          || d.design_situation || 'persistent',

        check_deflection: d.check_deflection ?? true,
        psi_1:            d.psi_1            ?? 0.2,
        psi_2:            d.psi_2            ?? 0.0,
        w_c_mm:           d.w_c_mm           ?? null,
        limit_inst:       d.limit_inst       ?? 400,
        limit_net_fin:    d.limit_net_fin    ?? 300,

        // Brand — EN 1995-1-2. Uden en varighed springes afsnittet over.
        fire_t_min:          d.fire_t_min          ?? null,
        fire_beta_n_mm:      d.fire_beta_n_mm      ?? 0.7,
        fire_d0_mm:          d.fire_d0_mm          ?? 7.0,
        fire_exposed_sides:  d.fire_exposed_sides  ?? 2,
        fire_exposed_bottom: d.fire_exposed_bottom ?? true,
        fire_exposed_top:    d.fire_exposed_top    ?? false,
      }

      if (source === 'actions') {
        // User enters M_Ed and V_Ed directly (hand calc / other tool).
        // Re-uses the same FEM path in the backend.
        payload.M_Ed_kNm_direct = d.M_Ed_kNm ?? 0.0
        payload.V_Ed_kN_direct  = d.V_Ed_kN  ?? 0.0
        payload.fem_label       = 'Direct input'
      } else if (source === 'combo' && comboExp) {
        payload.w_Ed_kNm         = comboExp.E_d_uls
        payload.combo_label      = selCombo?.data?.label ?? ''
        // Pass all ULS combinations so the backend finds the truly governing one
        // via max(E_d / k_mod) — not just max(E_d). EN 1995-1-1 §2.2.3.
        payload.uls_combinations = comboExp.uls_combinations ?? null
      } else if (source === 'fem' && femReady) {
        const { M, V } = getFemMV()
        payload.M_Ed_kNm_direct = M
        payload.V_Ed_kN_direct  = V
        payload.fem_label       = isGenFem
          ? `${selFem?.data?.title ?? 'Frame FEM'} — ${selElem?.label ?? ''}`
          : selFem?.data?.title ?? 'Beam FEM'
        // Auto-select k_mod load duration from the governing combination duration
        if (selElem?.M_duration) {
          payload.load_duration = selElem.M_duration
        }
      }

      const blocks_result = await calcTimberBeam(payload)
      update({ _result: blocks_result })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <CalcBlockShell
      title={d.title ?? 'Timber Beam Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
      runDisabled={runDisabled}
    >
      {/* ── Load source selector ── */}
      <Field label="Load source" style={{ gridColumn: '1/-1' }}>
        <div style={{ display: 'flex', gap: 16, padding: '2px 0', flexWrap: 'wrap' }}>
          {[
            { key: 'direct',  label: 'Char. loads  (g_k / q_k)' },
            { key: 'actions', label: 'Design actions  (M_Ed / V_Ed)' },
            { key: 'combo',   label: 'Load combination' },
            { key: 'fem',     label: 'FEM results' },
          ].map(({ key, label }) => (
            <label key={key} style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <input type="radio" name={`src-${block.id}`}
                value={key} checked={source === key}
                onChange={() => update({ load_source: key })} />
              {label}
            </label>
          ))}
        </div>
      </Field>

      {/* ── Combo picker ── */}
      {source === 'combo' && (
        <Field label="Combo block" style={{ gridColumn: '1/-1' }}>
          {comboBlocks.length === 0 ? (
            <span style={{ fontSize: 12, color: '#e67e22' }}>
              No load combo blocks in this document — add one first.
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
                ? <span style={{ fontSize: 12, color: '#27ae60' }}>
                    ✓ w_Ed = {comboExp.E_d_uls.toFixed(2)} {comboExp.unit ?? 'kN/m'}
                    {'  ·  '}{DURATION_LABEL[comboExp.governing_duration] ?? comboExp.governing_duration}
                  </span>
                : <span style={{ fontSize: 12, color: '#e67e22' }}>
                    Run the combo block first
                  </span>
              }
            </div>
          )}
        </Field>
      )}

      {/* ── FEM picker ── */}
      {source === 'fem' && (
        <Field label="FEM block" style={{ gridColumn: '1/-1' }}>
          {femBlocks.length === 0 ? (
            <span style={{ fontSize: 12, color: '#e67e22' }}>
              Ingen FEM-blokke i dette dokument — indsæt en Bjælke-FEM eller Rammeberegning (FEM) først.
            </span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <select style={{ ...s, width: 'auto', minWidth: 180 }}
                value={selFem?.id ?? ''}
                onChange={e => update({ fem_block_id: Number(e.target.value), fem_elem_id: null })}>
                {femBlocks.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.data.title ?? b.type}  [{b.type === 'general_frame_fem' ? 'Frame' : 'Beam'}]
                  </option>
                ))}
              </select>

              {isGenFem && genExports.length > 0 && (<>
                <select style={{ ...s, width: 'auto', minWidth: 160 }}
                  value={selElemId ?? ''}
                  onChange={e => update({ fem_elem_id: Number(e.target.value) })}>
                  {genExports.map(e => (
                    <option key={e.id} value={e.id}>{e.label}</option>
                  ))}
                </select>
                <select style={{ ...s, width: 'auto', minWidth: 90 }}
                  value={selEnd}
                  onChange={e => update({ fem_end: e.target.value })}>
                  <option value="max">Max end</option>
                  <option value="i">End i</option>
                  <option value="j">End j</option>
                </select>
              </>)}

              {femReady ? (() => { const {M,V} = getFemMV(); return (
                <span style={{ fontSize: 12, color: '#27ae60' }}>
                  ✓ M_Ed = {M?.toFixed(2)} kNm · V_Ed = {V?.toFixed(2)} kN
                </span>
              )})() : <span style={{ fontSize: 12, color: '#e67e22' }}>Run the FEM block first</span>}
            </div>
          )}
        </Field>
      )}

      {/* ── Direct characteristic load inputs ── */}
      {source === 'direct' && (<>
        <Field label="g_k (kN/m)" hint="Permanent">
          <NumericInput style={s} value={d.g_k_kNm ?? 3.0}
            onChange={v => update({ g_k_kNm: v })} />
        </Field>
        <Field label="q_k (kN/m)" hint="Variable">
          <NumericInput style={s} value={d.q_k_kNm ?? 2.0}
            onChange={v => update({ q_k_kNm: v })} />
        </Field>
      </>)}

      {/* ── Direct design actions (M_Ed / V_Ed) ── */}
      {source === 'actions' && (<>
        <Field label="M_Ed (kNm)" hint="Design moment">
          <NumericInput style={s} value={d.M_Ed_kNm ?? 0.0}
            onChange={v => update({ M_Ed_kNm: v })} />
        </Field>
        <Field label="V_Ed (kN)" hint="Design shear">
          <NumericInput style={s} value={d.V_Ed_kN ?? 0.0}
            onChange={v => update({ V_Ed_kN: v })} />
        </Field>
      </>)}

      {/* ── Load duration ── */}
      {(source === 'direct' || source === 'actions' || source === 'fem') && (
        <Field label="Lastvarighed"
          hint={source === 'fem' && selElem?.M_duration
            ? `Auto from FEM: "${selElem.M_duration}" (governing combination)`
            : source === 'fem' ? 'Set manually (run FEM first for auto-detection)'
            : undefined}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select style={s} value={d.load_duration ?? 'medium'}
              onChange={e => update({ load_duration: e.target.value })}>
              {LOAD_DURATIONS.map(dur => <option key={dur} value={dur}>{DURATION_LABEL[dur] ?? dur}</option>)}
            </select>
            {source === 'fem' && selElem?.M_duration && (
              <span style={{ fontSize: 10, color: '#27ae60', fontWeight: 700 }}>
                → {selElem.M_duration}
              </span>
            )}
          </div>
        </Field>
      )}

      {/* ── Section / geometry (always shown) ── */}
      <Field label="Betegnelse">
        <input style={s} value={d.label ?? 'T1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Spænd (m)" hint={source === 'fem' ? 'bruges kun til nedbøjningsgrænsen' : undefined}>
        <NumericInput style={s} value={d.span_m ?? 4.0}
          onChange={v => update({ span_m: v })} />
      </Field>
      <Field label="Bredde b (mm)">
        <NumericInput style={s} value={d.b_mm ?? 90}
          onChange={v => update({ b_mm: v })} />
      </Field>
      <Field label="Højde h (mm)">
        <NumericInput style={s} value={d.h_mm ?? 220}
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
            <option key={c} value={c}>
              {c} — {['Dry interior','Covered outdoor','Exposed'][c-1]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="γ_M">
        <NumericInput style={s} value={d.gamma_M ?? 1.3}
          onChange={v => update({ gamma_M: v })} />
      </Field>
      <Field label="Trykzone fastholdt" hint="udelukker kipning">
        <input type="checkbox"
          checked={d.compression_edge_restrained ?? true}
          onChange={e => update({ compression_edge_restrained: e.target.checked })} />
      </Field>
      <Field label="Vridningsfastholdt ved understøtning">
        <input type="checkbox"
          checked={d.torsional_restraint_at_supports ?? true}
          onChange={e => update({ torsional_restraint_at_supports: e.target.checked })} />
      </Field>
      <div style={{ gridColumn: '1/-1', fontSize: 11, fontWeight: 700,
                    color: '#6b7280', letterSpacing: '.06em',
                    textTransform: 'uppercase', marginTop: 8 }}>
        Nedbøjning — EN 1995-1-1 §7.2
      </div>
      <Field label="Eftervis nedbøjning">
        <input type="checkbox" checked={d.check_deflection ?? true}
          onChange={e => update({ check_deflection: e.target.checked })} />
      </Field>
      <Field label="ψ₂ variabel last" hint="DK NA tab. A1.1 · sne og vind 0 · kat. A 0,2">
        <NumericInput style={s.input} value={d.psi_2 ?? 0.0}
          onChange={v => update({ psi_2: v })} />
      </Field>
      <Field label="Grænse w_inst" hint="L / dette tal · EN tab. 7.2: 300–500">
        <NumericInput style={s.input} value={d.limit_inst ?? 400}
          onChange={v => update({ limit_inst: v })} />
      </Field>
      <Field label="Grænse w_net,fin" hint="L / dette tal · EN tab. 7.2: 250–350">
        <NumericInput style={s.input} value={d.limit_net_fin ?? 300}
          onChange={v => update({ limit_net_fin: v })} />
      </Field>
      <Field label="Pilhøjde w_c (mm)" hint="opbygget modpil — valgfri">
        <input style={s.input} type="number" step="1"
          value={d.w_c_mm ?? ''}
          onChange={e => update({ w_c_mm: e.target.value ? parseFloat(e.target.value) : null })} />
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
      <Field label="Brandpåvirkede sider" hint="β_n = 0,7 mm/min · d₀ = 7 mm">
        <NumericInput style={s.input} value={d.fire_exposed_sides ?? 2}
          onChange={v => update({ fire_exposed_sides: v })} />
      </Field>
      <Field label="Underside udsat" hint="et gipsloft beskytter undersiden">
        <input type="checkbox" checked={d.fire_exposed_bottom ?? true}
          onChange={e => update({ fire_exposed_bottom: e.target.checked })} />
      </Field>
      <Field label="Overside udsat">
        <input type="checkbox" checked={d.fire_exposed_top ?? false}
          onChange={e => update({ fire_exposed_top: e.target.checked })} />
      </Field>

      <Field label="Vederlagslængde (mm)" hint="slår eftervisning for tryk ⊥ fibre til">
        <input style={s} inputMode="decimal"
          placeholder="e.g. 100 — leave blank to skip"
          value={d.support_length_mm ?? ''}
          onChange={e => update({ support_length_mm: e.target.value ? parseFloat(e.target.value) : null })} />
      </Field>
    </CalcBlockShell>
  )
}

const s = {
  border: '1px solid #e8e8e8', padding: '6px 8px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
}
