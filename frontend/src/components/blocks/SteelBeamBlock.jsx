/**
 * SteelBeamBlock.jsx — EN 1993-1-1 steel beam check
 *
 * Load source:
 *   direct  — user enters g_k / q_k in the chosen unit
 *   combo   — reads E_d_uls from a Load Combo block
 *   fem     — reads M_Ed / V_Ed from a Beam FEM block
 *
 * Load type (direct only):
 *   udl     — kN/m  uniformly distributed
 *   point   — kN    concentrated at midspan
 *   area    — kN/m² area load × tributary width → kN/m
 *
 * Section: catalog lookup — type any designation.
 *   Examples: IPE300  HEA200  HEB240  L100x100x10  UPE200  RHS120x60x5
 *   Full EN 10034 / EN 10056 catalog built in.
 */
import React, { useState } from 'react'
import { calcSteelBeam } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const GRADES = ['S235', 'S275', 'S355', 'S420', 'S460']

// Common sections for autocomplete datalist — covers the main families
const COMMON_SECTIONS = [
  // IPE
  'IPE80','IPE100','IPE120','IPE140','IPE160','IPE180','IPE200','IPE220','IPE240',
  'IPE270','IPE300','IPE330','IPE360','IPE400','IPE450','IPE500','IPE550','IPE600',
  // HEA
  'HEA100','HEA120','HEA140','HEA160','HEA180','HEA200','HEA220','HEA240','HEA260',
  'HEA280','HEA300','HEA320','HEA340','HEA360','HEA400','HEA450','HEA500','HEA550','HEA600',
  // HEB
  'HEB100','HEB120','HEB140','HEB160','HEB180','HEB200','HEB220','HEB240','HEB260',
  'HEB280','HEB300','HEB320','HEB340','HEB360','HEB400','HEB450','HEB500','HEB600',
  // HEM
  'HEM100','HEM120','HEM140','HEM160','HEM200','HEM240','HEM300','HEM360','HEM400',
  // UPE / UPN channels
  'UPE80','UPE100','UPE120','UPE140','UPE160','UPE180','UPE200','UPE220','UPE240','UPE270','UPE300','UPE360','UPE400',
  'UPN80','UPN100','UPN120','UPN140','UPN160','UPN180','UPN200','UPN220','UPN240','UPN260','UPN280','UPN300','UPN320','UPN380','UPN400',
  // L-profiles (equal angles)
  'L40x40x4','L50x50x5','L60x60x6','L65x65x7','L70x70x7','L75x75x8','L80x80x8',
  'L90x90x9','L100x100x10','L110x110x10','L120x120x12','L130x130x12','L150x150x15',
  // RHS / SHS
  'RHS60x40x4','RHS80x60x5','RHS100x60x5','RHS120x60x5','RHS120x80x5','RHS140x80x6','RHS150x100x6',
  'SHS50x50x4','SHS60x60x5','SHS80x80x5','SHS100x100x5','SHS120x120x6','SHS150x150x6',
  // CHS
  'CHS48.3x3.2','CHS60.3x4','CHS76.1x4','CHS88.9x4','CHS101.6x5','CHS114.3x5','CHS139.7x6','CHS168.3x8',
]

const LOAD_UNITS = {
  udl:   { label: 'kN/m',  hint: 'UDL — full-span uniform load' },
  point: { label: 'kN',    hint: 'Concentrated load at midspan' },
  area:  { label: 'kN/m²', hint: 'Area load × tributary width' },
}

export default function SteelBeamBlock({ block, onChange, blocks = [] }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  const source    = d.load_source ?? 'direct'
  const loadType  = d.load_type   ?? 'udl'
  const unitLabel = LOAD_UNITS[loadType]?.label ?? 'kN/m'

  // ── Combo / FEM pickers ───────────────────────────────────────────────────
  const comboBlocks = blocks.filter(b => b.type === 'load_combo')
  const selCombo    = comboBlocks.find(b => b.data.label === d.combo_label) ?? comboBlocks[0]
  const comboExp    = selCombo?.data?._exports
  const comboReady  = !!comboExp?.E_d_uls

  const femBlocks  = blocks.filter(b => b.type === 'beam_fem')
  const selFem     = femBlocks.find(b => b.id === d.fem_block_id) ?? femBlocks[0]
  const femSummary = selFem?.data?._summary
  const femReady   = !!femSummary?.M_Ed_kNm

  const runDisabled = (source === 'combo' && !comboReady) || (source === 'fem' && !femReady)

  // ── Run ───────────────────────────────────────────────────────────────────
  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const payload = {
        label:     d.label    ?? 'S1',
        section:   d.section  ?? 'IPE300',
        grade:     d.grade    ?? 'S355',
        span_m:    d.span_m   ?? 5.0,
        load_type: loadType,
        trib_width_m:      d.trib_width_m  ?? 1.0,
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

      if (source === 'combo' && comboExp) {
        payload.w_Ed_kNm    = comboExp.E_d_uls
        payload.combo_label = selCombo?.data?.label ?? ''
      } else if (source === 'fem' && femSummary) {
        payload.M_Ed_kNm_direct = femSummary.M_Ed_kNm
        payload.V_Ed_kN_direct  = femSummary.V_Ed_kN
        payload.fem_label       = selFem?.data?.title ?? 'FEM'
      }

      const result = await calcSteelBeam(payload)
      update({ _result: result })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const datalistId = `sections-${block.id}`

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
      {/* ── Section ─────────────────────────────────────────────────── */}
      <div style={sec}>Section</div>

      <Field label="Section" hint="IPE, HEA, HEB, L, UPE, RHS, CHS…">
        <input
          style={inp}
          list={datalistId}
          value={d.section ?? 'IPE300'}
          placeholder="e.g. IPE300, L100x100x10"
          onChange={e => update({ section: e.target.value.toUpperCase().replace(/\s/g, '') })}
        />
        <datalist id={datalistId}>
          {COMMON_SECTIONS.map(s => <option key={s} value={s} />)}
        </datalist>
      </Field>

      <Field label="Grade">
        <select style={inp} value={d.grade ?? 'S355'}
          onChange={e => update({ grade: e.target.value })}>
          {GRADES.map(g => <option key={g}>{g}</option>)}
        </select>
      </Field>

      <Field label="Label">
        <input style={inp} value={d.label ?? 'S1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>

      {/* ── Loads ───────────────────────────────────────────────────── */}
      <div style={sec}>Loads</div>

      {/* Load source */}
      <Field label="Source" style={{ gridColumn: '1/-1' }}>
        <div style={row}>
          {[
            { v: 'direct', l: 'Direct' },
            { v: 'combo',  l: 'Load combination' },
            { v: 'fem',    l: 'Beam FEM' },
          ].map(({ v, l }) => (
            <label key={v} style={radioLbl}>
              <input type="radio" name={`src-${block.id}`}
                value={v} checked={source === v}
                onChange={() => update({ load_source: v })} />
              {l}
            </label>
          ))}
        </div>
      </Field>

      {/* Combo picker */}
      {source === 'combo' && (
        <Field label="Combo block" style={{ gridColumn: '1/-1' }}>
          {comboBlocks.length === 0
            ? <span style={warn}>No Load Combo blocks in this document — add one first.</span>
            : <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <select style={inp} value={selCombo?.data?.label ?? ''}
                  onChange={e => update({ combo_label: e.target.value })}>
                  {comboBlocks.map(b => (
                    <option key={b.id} value={b.data.label ?? ''}>
                      {b.data.label}  —  {b.data.title ?? 'Load Combinations'}
                    </option>
                  ))}
                </select>
                {comboReady
                  ? <span style={ok}>✓ w_Ed = {comboExp.E_d_uls.toFixed(2)} {comboExp.unit ?? 'kN/m'}</span>
                  : <span style={warn}>Run the combo block first</span>}
              </div>
          }
        </Field>
      )}

      {/* FEM picker */}
      {source === 'fem' && (
        <Field label="FEM block" style={{ gridColumn: '1/-1' }}>
          {femBlocks.length === 0
            ? <span style={warn}>No Beam FEM blocks in this document — add one first.</span>
            : <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <select style={inp} value={selFem?.id ?? ''}
                  onChange={e => update({ fem_block_id: Number(e.target.value) })}>
                  {femBlocks.map(b => (
                    <option key={b.id} value={b.id}>{b.data.title ?? 'Beam FEM'}</option>
                  ))}
                </select>
                {femReady
                  ? <span style={ok}>✓ M_Ed = {femSummary.M_Ed_kNm.toFixed(2)} kNm · V_Ed = {femSummary.V_Ed_kN.toFixed(2)} kN</span>
                  : <span style={warn}>Run the FEM block first</span>}
              </div>
          }
        </Field>
      )}

      {/* Load type + values (direct only) */}
      {source === 'direct' && (<>
        <Field label="Load type" style={{ gridColumn: '1/-1' }}>
          <div style={row}>
            {Object.entries(LOAD_UNITS).map(([v, { label, hint }]) => (
              <label key={v} style={radioLbl} title={hint}>
                <input type="radio" name={`lt-${block.id}`}
                  value={v} checked={loadType === v}
                  onChange={() => update({ load_type: v })} />
                {label}
              </label>
            ))}
          </div>
        </Field>

        <Field label={`g_k (${unitLabel})`} hint="Permanent load">
          <NumericInput style={inp} value={d.g_k_kNm ?? 5.0}
            onChange={v => update({ g_k_kNm: v })} />
        </Field>

        <Field label={`q_k (${unitLabel})`} hint="Variable load">
          <NumericInput style={inp} value={d.q_k_kNm ?? 3.0}
            onChange={v => update({ q_k_kNm: v })} />
        </Field>

        {loadType === 'area' && (
          <Field label="Trib. width (m)" hint="Tributary / load width">
            <NumericInput style={inp} value={d.trib_width_m ?? 1.0}
              onChange={v => update({ trib_width_m: v })} />
          </Field>
        )}
      </>)}

      {/* ── Geometry ────────────────────────────────────────────────── */}
      <div style={sec}>Geometry</div>

      <Field label="Span (m)"
        hint={source === 'fem' ? 'Used for SLS deflection check only' : undefined}>
        <NumericInput style={inp} value={d.span_m ?? 5.0}
          onChange={v => update({ span_m: v })} />
      </Field>

      {/* ── Lateral stability ────────────────────────────────────────── */}
      <div style={sec}>Lateral stability</div>

      <Field label="LTB restrained" hint="Compression flange continuously restrained">
        <input type="checkbox" style={{ width: 16, height: 16 }}
          checked={d.ltb_restrained ?? false}
          onChange={e => update({ ltb_restrained: e.target.checked })} />
      </Field>

      <Field label="LTB length (m)" hint="Between lateral restraints — runs cl. 6.3.2.2">
        <input style={{ ...inp, background: (d.ltb_restrained ?? false) ? '#f5f5f5' : undefined }}
          inputMode="decimal"
          placeholder="leave blank = full span"
          value={d.ltb_length_m ?? ''}
          disabled={d.ltb_restrained ?? false}
          onChange={e => update({ ltb_length_m: e.target.value ? parseFloat(e.target.value) : null })} />
      </Field>

      <Field label="Y-axis buckling restrained">
        <input type="checkbox" style={{ width: 16, height: 16 }}
          checked={d.buck_y_restrained ?? false}
          onChange={e => update({ buck_y_restrained: e.target.checked })} />
      </Field>

      <Field label="X-axis buckling restrained">
        <input type="checkbox" style={{ width: 16, height: 16 }}
          checked={d.buck_x_restrained ?? false}
          onChange={e => update({ buck_x_restrained: e.target.checked })} />
      </Field>

      {/* ── Partial factors ─────────────────────────────────────────── */}
      <div style={sec}>Partial factors</div>

      <Field label="γ_M0">
        <NumericInput style={inp} value={d.gamma_M0 ?? 1.0}
          onChange={v => update({ gamma_M0: v })} />
      </Field>

      <Field label="γ_M1">
        <NumericInput style={inp} value={d.gamma_M1 ?? 1.0}
          onChange={v => update({ gamma_M1: v })} />
      </Field>

      {/* ── Deflection ──────────────────────────────────────────────── */}
      <div style={sec}>Deflection (SLS)</div>

      <Field label="Limit" hint="EN 1990 Annex A1.4">
        <select style={inp} value={d.deflection_limit ?? 200}
          onChange={e => update({ deflection_limit: Number(e.target.value) })}>
          <option value={200}>L / 200 — total (final)</option>
          <option value={250}>L / 250 — total (finishes)</option>
          <option value={350}>L / 350 — net (after permanent)</option>
          <option value={500}>L / 500 — sensitive finishes</option>
        </select>
      </Field>
    </CalcBlockShell>
  )
}

const inp = {
  border: '1px solid #e8e8e8', padding: '6px 8px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
}
const sec = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
  color: '#12788E', margin: '10px 0 4px', paddingBottom: 3,
  borderBottom: '1px solid #e0eef1', gridColumn: '1/-1',
}
const row   = { display: 'flex', gap: 16, flexWrap: 'wrap', padding: '2px 0' }
const radioLbl = { fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }
const warn  = { fontSize: 12, color: '#e67e22' }
const ok    = { fontSize: 12, color: '#27ae60', whiteSpace: 'nowrap' }
