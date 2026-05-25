/**
 * BoltConnectionBlock.jsx — EC3 §6.5/§6.6 bolted/welded connection check
 *
 * Two modes selectable via a tab:
 *   "bolts" — shear bolt group (bearing + bolt shear)
 *   "weld"  — fillet weld (simplified directional method)
 */
import React, { useState } from 'react'
import { calcBoltGroup, calcFilletWeld } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const BOLT_CLASSES = ['4.6', '5.6', '6.8', '8.8', '10.9']
const DIAMETERS    = [10, 12, 14, 16, 20, 22, 24, 27, 30, 36]
const GRADES       = ['S235', 'S275', 'S355', 'S420', 'S460']

export default function BoltConnectionBlock({ block, onChange }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  const mode = d.mode ?? 'bolts'

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      let blocks
      if (mode === 'bolts') {
        blocks = await calcBoltGroup({
          label:          d.label          ?? 'BG1',
          n_bolts:        d.n_bolts        ?? 4,
          bolt_class:     d.bolt_class     ?? '8.8',
          d_mm:           d.d_mm           ?? 20,
          shear_plane:    d.shear_plane    ?? 'thread',
          n_shear_planes: d.n_shear_planes ?? 1,
          t_plate_mm:     d.t_plate_mm     ?? 10,
          f_u_plate_MPa:  d.f_u_plate_MPa  ?? 510,
          e1_mm:          d.e1_mm          ?? 40,
          e2_mm:          d.e2_mm          ?? 40,
          p1_mm:          d.p1_mm          ?? 60,
          V_Ed_kN:        d.V_Ed_kN        ?? 100,
          gamma_M2:       d.gamma_M2       ?? 1.25,
        })
      } else {
        blocks = await calcFilletWeld({
          label:       d.label       ?? 'W1',
          a_mm:        d.a_mm        ?? 6,
          L_mm:        d.L_mm        ?? 200,
          F_Ed_kN:     d.F_Ed_kN     ?? 80,
          steel_grade: d.steel_grade ?? 'S355',
          f_u_MPa:     d.f_u_MPa     ?? null,
          gamma_M2:    d.gamma_M2    ?? 1.25,
        })
      }
      update({ _result: blocks })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <CalcBlockShell
      title={d.title ?? 'Connection Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      {/* Mode selector */}
      <div style={{ gridColumn: '1/-1', display: 'flex', gap: 0, marginBottom: 2 }}>
        {[['bolts', '🔩 Bolt group'], ['weld', '⚡ Fillet weld']].map(([val, lbl]) => (
          <button
            key={val}
            style={{
              ...s.tab,
              ...(mode === val ? s.tabActive : {}),
            }}
            onClick={() => update({ mode: val, _result: null })}
          >
            {lbl}
          </button>
        ))}
      </div>

      <Field label="Label">
        <input style={s.input} value={d.label ?? (mode === 'bolts' ? 'BG1' : 'W1')}
          onChange={e => update({ label: e.target.value })} />
      </Field>

      {mode === 'bolts' ? (
        <>
          <Field label="n bolts">
            <NumericInput style={s.input} value={d.n_bolts ?? 4}
              onChange={v => update({ n_bolts: Math.round(v) })} />
          </Field>
          <Field label="Bolt class">
            <select style={s.input} value={d.bolt_class ?? '8.8'}
              onChange={e => update({ bolt_class: e.target.value })}>
              {BOLT_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Diameter" hint="mm">
            <select style={s.input} value={d.d_mm ?? 20}
              onChange={e => update({ d_mm: parseFloat(e.target.value) })}>
              {DIAMETERS.map(d => <option key={d} value={d}>M{d}</option>)}
            </select>
          </Field>
          <Field label="Shear plane">
            <select style={s.input} value={d.shear_plane ?? 'thread'}
              onChange={e => update({ shear_plane: e.target.value })}>
              <option value="thread">Thread  (α_v = 0.5)</option>
              <option value="shank">Shank   (α_v = 0.6)</option>
            </select>
          </Field>
          <Field label="n shear planes">
            <NumericInput style={s.input} value={d.n_shear_planes ?? 1}
              onChange={v => update({ n_shear_planes: Math.round(v) })} />
          </Field>
          <Field label="Plate thickness" hint="mm">
            <NumericInput style={s.input} value={d.t_plate_mm ?? 10}
              onChange={v => update({ t_plate_mm: v })} />
          </Field>
          <Field label="f_u plate" hint="MPa">
            <NumericInput style={s.input} value={d.f_u_plate_MPa ?? 510}
              onChange={v => update({ f_u_plate_MPa: v })} />
          </Field>
          <Field label="e₁" hint="mm  end dist.">
            <NumericInput style={s.input} value={d.e1_mm ?? 40}
              onChange={v => update({ e1_mm: v })} />
          </Field>
          <Field label="e₂" hint="mm  edge dist.">
            <NumericInput style={s.input} value={d.e2_mm ?? 40}
              onChange={v => update({ e2_mm: v })} />
          </Field>
          <Field label="p₁" hint="mm  bolt pitch">
            <NumericInput style={s.input} value={d.p1_mm ?? 60}
              onChange={v => update({ p1_mm: v })} />
          </Field>
          <Field label="V_Ed" hint="kN  total">
            <NumericInput style={s.input} value={d.V_Ed_kN ?? 100}
              onChange={v => update({ V_Ed_kN: v })} />
          </Field>
          <Field label="γ_M2">
            <NumericInput style={s.input} value={d.gamma_M2 ?? 1.25}
              onChange={v => update({ gamma_M2: v })} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Throat a" hint="mm">
            <NumericInput style={s.input} value={d.a_mm ?? 6}
              onChange={v => update({ a_mm: v })} />
          </Field>
          <Field label="Length L" hint="mm  total">
            <NumericInput style={s.input} value={d.L_mm ?? 200}
              onChange={v => update({ L_mm: v })} />
          </Field>
          <Field label="F_Ed" hint="kN  resultant">
            <NumericInput style={s.input} value={d.F_Ed_kN ?? 80}
              onChange={v => update({ F_Ed_kN: v })} />
          </Field>
          <Field label="Steel grade">
            <select style={s.input} value={d.steel_grade ?? 'S355'}
              onChange={e => update({ steel_grade: e.target.value })}>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="γ_M2">
            <NumericInput style={s.input} value={d.gamma_M2 ?? 1.25}
              onChange={v => update({ gamma_M2: v })} />
          </Field>
        </>
      )}
    </CalcBlockShell>
  )
}

const s = {
  input: {
    border: '1px solid #e8e8e8', padding: '6px 8px',
    fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
  },
  tab: {
    background: '#f5f5f7', border: '1px solid #e0e0e0',
    padding: '6px 16px', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', marginRight: -1,
  },
  tabActive: {
    background: '#111', color: '#fff', border: '1px solid #111',
  },
}
