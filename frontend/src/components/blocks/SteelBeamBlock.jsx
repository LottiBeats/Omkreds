/**
 * SteelBeamBlock.jsx — EN 1993-1-1 steel beam check
 *
 * Load source:
 *   direct  — user enters g_k / q_k (default, backwards compatible)
 *   combo   — reads E_d_uls from a Load Combo block; M_Ed = w·L²/8
 *   fem     — reads M_Ed and V_Ed directly from a Beam FEM block's results
 *
 * Section source:
 *   catalog — type any section name from the built-in catalog
 *             (IPE300, HEA200, L100x100x10, UPE200, RHS100x60x5, etc.)
 *   manual  — enter W_pl,y / W_el,y / I_y / h directly from a table
 *             (for non-catalog sections, L-profiles, custom fabrications)
 */
import React, { useState } from 'react'
import { calcSteelBeam } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const GRADES = ['S235', 'S275', 'S355', 'S420', 'S460']

export default function SteelBeamBlock({ block, onChange, blocks = [] }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  const source  = d.load_source    ?? 'direct'
  const secSrc  = d.section_source ?? 'catalog'  // 'catalog' | 'manual'

  // ── Combo source ──────────────────────────────────────────────────────────
  const comboBlocks = blocks.filter(b => b.type === 'load_combo')
  const selCombo    = comboBlocks.find(b => b.data.label === d.combo_label) ?? comboBlocks[0]
  const comboExp    = selCombo?.data?._exports
  const comboReady  = !!comboExp?.E_d_uls

  // ── FEM source ────────────────────────────────────────────────────────────
  const femBlocks  = blocks.filter(b => b.type === 'beam_fem')
  const selFem     = femBlocks.find(b => b.id === d.fem_block_id) ?? femBlocks[0]
  const femSummary = selFem?.data?._summary
  const femReady   = !!femSummary?.M_Ed_kNm

  const runDisabled =
    (source === 'combo' && !comboReady) ||
    (source === 'fem'   && !femReady)

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const payload = {
        label:     d.label    ?? 'S1',
        section:   d.section  ?? 'IPE300',
        grade:     d.grade    ?? 'S355',
        span_m:    d.span_m   ?? 5.0,
        g_k_kNm:  d.g_k_kNm  ?? 5.0,
        q_k_kNm:  d.q_k_kNm  ?? 3.0,
        gamma_M0:  d.gamma_M0 ?? 1.0,
        gamma_M1:  d.gamma_M1 ?? 1.0,
        ltb_restrained:    d.ltb_restrained    ?? false,
        ltb_length_m:      d.ltb_length_m      ?? null,
        buck_y_restrained: d.buck_y_restrained  ?? false,
        buck_x_restrained: d.buck_x_restrained  ?? false,
        deflection_limit:  d.deflection_limit   ?? 200,
      }

      // ── Manual section properties ─────────────────────────────────────────
      if (secSrc === 'manual') {
        payload.manual_Wply_cm3       = d.manual_Wply_cm3 ?? null
        payload.manual_Wely_cm3       = d.manual_Wely_cm3 ?? null
        payload.manual_Iy_cm4         = d.manual_Iy_cm4   ?? null
        payload.manual_h_mm           = d.manual_h_mm     ?? null
        payload.manual_tw_mm          = d.manual_tw_mm    ?? null
        payload.use_elastic_modulus   = d.use_elastic_modulus ?? false
      }

      // ── Load source ───────────────────────────────────────────────────────
      if (source === 'combo' && comboExp) {
        payload.w_Ed_kNm    = comboExp.E_d_uls
        payload.combo_label = selCombo?.data?.label ?? ''
      } else if (source === 'fem' && femSummary) {
        payload.M_Ed_kNm_direct = femSummary.M_Ed_kNm
        payload.V_Ed_kN_direct  = femSummary.V_Ed_kN
        payload.fem_label       = selFem?.data?.title ?? 'FEM'
      }

      const blocks_result = await calcSteelBeam(payload)
      update({ _result: blocks_result })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <CalcBlockShell
      title={d.title ?? 'Steel Beam Check'}
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
        <div style={{ display: 'flex', gap: 16, padding: '2px 0' }}>
          {['direct', 'combo', 'fem'].map(opt => (
            <label key={opt} style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <input type="radio" name={`src-${block.id}`}
                value={opt} checked={source === opt}
                onChange={() => update({ load_source: opt })} />
              {opt === 'direct' ? 'Direct  (g_k / q_k)'
               : opt === 'combo' ? 'Load combination'
               : 'FEM results'}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select style={s.input} value={selCombo?.data?.label ?? ''}
                onChange={e => update({ combo_label: e.target.value })}>
                {comboBlocks.map(b => (
                  <option key={b.id} value={b.data.label ?? ''}>
                    {b.data.label ?? '?'}  —  {b.data.title ?? 'Load Combinations'}
                  </option>
                ))}
              </select>
              {comboReady
                ? <span style={{ fontSize: 12, color: '#27ae60', whiteSpace: 'nowrap' }}>
                    ✓ w_Ed = {comboExp.E_d_uls.toFixed(2)} {comboExp.unit ?? 'kN/m'}
                  </span>
                : <span style={{ fontSize: 12, color: '#e67e22', whiteSpace: 'nowrap' }}>
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
              No Beam FEM blocks in this document — add one first.
            </span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select style={s.input}
                value={selFem?.id ?? ''}
                onChange={e => update({ fem_block_id: Number(e.target.value) })}>
                {femBlocks.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.data.title ?? 'Beam FEM Analysis'}
                  </option>
                ))}
              </select>
              {femReady
                ? <span style={{ fontSize: 12, color: '#27ae60', whiteSpace: 'nowrap' }}>
                    ✓ M_Ed = {femSummary.M_Ed_kNm.toFixed(2)} kNm
                    &nbsp;·&nbsp;
                    V_Ed = {femSummary.V_Ed_kN.toFixed(2)} kN
                  </span>
                : <span style={{ fontSize: 12, color: '#e67e22', whiteSpace: 'nowrap' }}>
                    Run the FEM block first
                  </span>
              }
            </div>
          )}
        </Field>
      )}

      {/* ── Direct load inputs (only when source = direct) ── */}
      {source === 'direct' && (<>
        <Field label="g_k (kN/m)" hint="Permanent">
          <NumericInput style={s.input} value={d.g_k_kNm ?? 5.0}
            onChange={v => update({ g_k_kNm: v })} />
        </Field>
        <Field label="q_k (kN/m)" hint="Variable">
          <NumericInput style={s.input} value={d.q_k_kNm ?? 3.0}
            onChange={v => update({ q_k_kNm: v })} />
        </Field>
      </>)}

      {/* ══ Section source toggle ══════════════════════════════════════════════ */}
      <Field label="Section properties" style={{ gridColumn: '1/-1' }}>
        <div style={{ display: 'flex', gap: 16, padding: '2px 0' }}>
          <label style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="radio" name={`secsrc-${block.id}`}
              value="catalog" checked={secSrc === 'catalog'}
              onChange={() => update({ section_source: 'catalog' })} />
            Catalog  (type section name)
          </label>
          <label style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="radio" name={`secsrc-${block.id}`}
              value="manual" checked={secSrc === 'manual'}
              onChange={() => update({ section_source: 'manual' })} />
            Manual  (enter W_pl / W_el from table)
          </label>
        </div>
      </Field>

      {/* ── Catalog: free-text section name ── */}
      {secSrc === 'catalog' && (
        <Field label="Section" hint="e.g. IPE300, HEA200, L100x100x10, UPE200">
          <input style={s.input}
            value={d.section ?? 'IPE300'}
            placeholder="IPE300"
            onChange={e => update({ section: e.target.value.toUpperCase().replace(/\s/g, '') })} />
        </Field>
      )}

      {/* ── Manual: section label + property inputs ── */}
      {secSrc === 'manual' && (<>
        <Field label="Section name" hint="Label for the report (e.g. L100×100×10)">
          <input style={s.input}
            value={d.section ?? ''}
            placeholder="e.g. L100×100×10"
            onChange={e => update({ section: e.target.value })} />
        </Field>

        {/* Modulus selector */}
        <Field label="Modulus to use" hint="EC3 §6.2.5" style={{ gridColumn: '1/-1' }}>
          <div style={{ display: 'flex', gap: 16, padding: '2px 0' }}>
            <label style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <input type="radio" name={`mod-${block.id}`}
                value="plastic" checked={!(d.use_elastic_modulus ?? false)}
                onChange={() => update({ use_elastic_modulus: false })} />
              W_pl,y — plastic  (Class 1 or 2)
            </label>
            <label style={{ fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <input type="radio" name={`mod-${block.id}`}
                value="elastic" checked={d.use_elastic_modulus ?? false}
                onChange={() => update({ use_elastic_modulus: true })} />
              W_el,y — elastic  (Class 3 or angle sections)
            </label>
          </div>
        </Field>

        {/* Plastic modulus */}
        <Field label="W_pl,y (cm³)" hint="Plastic section modulus">
          <NumericInput style={s.input} value={d.manual_Wply_cm3 ?? ''}
            onChange={v => update({ manual_Wply_cm3: v })} />
        </Field>

        {/* Elastic modulus */}
        <Field label="W_el,y (cm³)" hint="Elastic section modulus">
          <NumericInput style={s.input} value={d.manual_Wely_cm3 ?? ''}
            onChange={v => update({ manual_Wely_cm3: v })} />
        </Field>

        {/* I_y */}
        <Field label="I_y (cm⁴)" hint="For deflection check">
          <NumericInput style={s.input} value={d.manual_Iy_cm4 ?? ''}
            onChange={v => update({ manual_Iy_cm4: v })} />
        </Field>

        {/* h */}
        <Field label="h (mm)" hint="Section height — for shear check">
          <NumericInput style={s.input} value={d.manual_h_mm ?? ''}
            onChange={v => update({ manual_h_mm: v })} />
        </Field>

        {/* t_w — optional */}
        <Field label="t_w (mm)" hint="Web / leg thickness  (optional)">
          <NumericInput style={s.input} value={d.manual_tw_mm ?? ''}
            onChange={v => update({ manual_tw_mm: v })} />
        </Field>
      </>)}

      {/* ── Grade + geometry (always shown) ── */}
      <Field label="Label">
        <input style={s.input} value={d.label ?? 'S1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>
      <Field label="Grade">
        <select style={s.input} value={d.grade ?? 'S355'}
          onChange={e => update({ grade: e.target.value })}>
          {GRADES.map(g => <option key={g}>{g}</option>)}
        </select>
      </Field>
      <Field label="Span (m)" hint={source === 'fem' ? 'used for SLS deflection limit only' : undefined}>
        <NumericInput style={s.input} value={d.span_m ?? 5.0}
          onChange={v => update({ span_m: v })} />
      </Field>
      <Field label="γ_M0">
        <NumericInput style={s.input} value={d.gamma_M0 ?? 1.0}
          onChange={v => update({ gamma_M0: v })} />
      </Field>
      <Field label="γ_M1">
        <NumericInput style={s.input} value={d.gamma_M1 ?? 1.0}
          onChange={v => update({ gamma_M1: v })} />
      </Field>
      <Field label="LTB restrained" hint="compression flange continuously restrained">
        <input type="checkbox" checked={d.ltb_restrained ?? false}
          onChange={e => update({ ltb_restrained: e.target.checked })} />
      </Field>
      <Field label="LTB length (m)" hint="Between lateral restraints — runs cl. 6.3.2.2 check">
        <input style={s.input} inputMode="decimal"
          placeholder="leave blank or tick Restrained"
          value={d.ltb_length_m ?? ''}
          disabled={d.ltb_restrained ?? false}
          onChange={e => update({ ltb_length_m: e.target.value ? parseFloat(e.target.value) : null })} />
      </Field>
      <Field label="y-axis restrained">
        <input type="checkbox" checked={d.buck_y_restrained ?? false}
          onChange={e => update({ buck_y_restrained: e.target.checked })} />
      </Field>
      <Field label="x-axis restrained">
        <input type="checkbox" checked={d.buck_x_restrained ?? false}
          onChange={e => update({ buck_x_restrained: e.target.checked })} />
      </Field>
      <Field label="Deflection limit" hint="SLS — EN 1990 Annex A1.4">
        <select style={s.input} value={d.deflection_limit ?? 200}
          onChange={e => update({ deflection_limit: Number(e.target.value) })}>
          <option value={200}>L / 200 — total (final)</option>
          <option value={250}>L / 250 — total (finishes)</option>
          <option value={350}>L / 350 — net (after perm.)</option>
          <option value={500}>L / 500 — sensitive finishes</option>
        </select>
      </Field>
    </CalcBlockShell>
  )
}

const s = {
  input: {
    border: '1px solid #e8e8e8', padding: '6px 8px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
  },
}
