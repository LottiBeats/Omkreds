/**
 * MasonryWallBlock.jsx — EN 1996-1-1 unreinforced masonry
 *
 * Five calculation types:
 *   vertical      — simple axial + slenderness check
 *   ritter        — single wall Ritter capacity check
 *   bearing       — beam-end bearing check (§6.1.3)
 *   multi_ritter  — multi-storey Ritter with tryklinie plot
 *   plan_dist     — plan stiffness, centroid & lateral distribution
 */
import React, { useState } from 'react'
import { calcMasonryWall } from '../../api/client.js'
import CalcBlockShell from '../CalcBlockShell.jsx'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

const CALC_TYPES = [
  { value: 'vertical',     label: 'Simple vertical' },
  { value: 'ritter',       label: 'Ritter (single wall)' },
  { value: 'multi_ritter', label: 'Multi-storey Ritter' },
  { value: 'bearing',      label: 'Bearing under beam' },
  { value: 'plan_dist',    label: 'Plan distribution' },
]

export default function MasonryWallBlock({ block, onChange }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  const calcType = d.calc_type ?? 'vertical'

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  // ── Dynamic rows helpers ────────────────────────────────────────
  const floors = d.floors ?? [{ name: 'Story 1', height_m: 3.0, axial_kN: 100.0, shear_kN: 5.0 }]

  function updateFloor(i, changes) {
    const next = floors.map((f, j) => j === i ? { ...f, ...changes } : f)
    update({ floors: next })
  }
  function addFloor() {
    update({ floors: [...floors, { name: `Story ${floors.length + 1}`, height_m: 3.0, axial_kN: 50.0, shear_kN: 0.0 }] })
  }
  function removeFloor(i) {
    if (floors.length <= 1) return
    update({ floors: floors.filter((_, j) => j !== i) })
  }

  const wallElements = d.wall_elements ?? [{ d_n: 0.228, b_n: 5.0, x: 2.5, y: 0.114 }]

  function updateWallEl(i, changes) {
    const next = wallElements.map((el, j) => j === i ? { ...el, ...changes } : el)
    update({ wall_elements: next })
  }
  function addWallEl() {
    update({ wall_elements: [...wallElements, { d_n: 0.228, b_n: 3.0, x: 5.0, y: 0.114 }] })
  }
  function removeWallEl(i) {
    if (wallElements.length <= 1) return
    update({ wall_elements: wallElements.filter((_, j) => j !== i) })
  }

  // ── Run ────────────────────────────────────────────────────────
  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const payload = {
        calc_type: calcType,
        label:     d.label   ?? 'W1',
        // shared material
        f_b_MPa:   d.f_b_MPa ?? 10.0,
        f_m_MPa:   d.f_m_MPa ?? 6.0,
        K:         d.K       ?? 0.55,
        gamma_M:   d.gamma_M ?? 2.5,
      }

      if (calcType === 'vertical') {
        Object.assign(payload, {
          height_m:     d.height_m     ?? 3.0,
          thickness_mm: d.thickness_mm ?? 228,
          length_m:     d.length_m     ?? 5.0,
          N_k_kN:       d.N_k_kN       ?? 100.0,
          alpha:        d.alpha        ?? 0.7,
          beta:         d.beta         ?? 0.3,
        })
      }

      if (calcType === 'ritter') {
        Object.assign(payload, {
          b_m:          d.b_m          ?? 1.0,
          t_ef_mm:      d.t_ef_mm      ?? d.thickness_mm ?? 228,
          h_ef_m:       d.h_ef_m       ?? d.height_m     ?? 3.0,
          e_m_mm:       d.e_m_mm       ?? 0.0,
          N_Ed_kN:      d.N_Ed_kN      ?? d.N_k_kN * 1.35 ?? 135.0,
          K1:           d.K1           ?? 0.9,
        })
      }

      if (calcType === 'bearing') {
        Object.assign(payload, {
          N_Ed_bear_kN: d.N_Ed_bear_kN ?? 50.0,
          a_plate_mm:   d.a_plate_mm   ?? 150.0,
          b_plate_mm:   d.b_plate_mm   ?? 200.0,
          t_leaf_mm:    d.t_leaf_mm    ?? d.thickness_mm ?? 228,
        })
      }

      if (calcType === 'multi_ritter') {
        const fl = floors
        Object.assign(payload, {
          thickness_mm:     d.thickness_mm     ?? 228,
          wall_width_m:     d.wall_width_m     ?? 5.0,
          unit_weight_kNm2: d.unit_weight_kNm2 ?? 5.0,
          top_moment_kNm:   d.top_moment_kNm   ?? 0.0,
          Kt:               d.Kt               ?? 0.9,
          floor_names:     fl.map(f => f.name),
          heights_m:       fl.map(f => f.height_m),
          axial_loads_kN:  fl.map(f => f.axial_kN),
          shear_forces_kN: fl.map(f => f.shear_kN),
        })
      }

      if (calcType === 'plan_dist') {
        Object.assign(payload, {
          x_max_m:        d.x_max_m        ?? 10.0,
          y_max_m:        d.y_max_m        ?? 10.0,
          floor_height_m: d.floor_height_m ?? 3.0,
          D_x:            d.D_x            ?? 0.0,
          E_x:            d.E_x            ?? 0.0,
          D_y:            d.D_y            ?? 0.0,
          E_y:            d.E_y            ?? 0.0,
          elements:       wallElements.map(el => [el.d_n, el.b_n, el.x, el.y]),
        })
      }

      const blocks = await calcMasonryWall(payload)
      update({ _result: blocks })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <CalcBlockShell
      title={d.title ?? 'Masonry Wall Check'}
      onTitleChange={t => update({ title: t })}
      onRun={handleRun}
      onClear={() => update({ _result: null })}
      running={running}
      error={error}
      result={d._result ?? null}
    >
      {/* Calc type selector */}
      <Field label="Calc type">
        <select style={s} value={calcType} onChange={e => update({ calc_type: e.target.value })}>
          {CALC_TYPES.map(ct => (
            <option key={ct.value} value={ct.value}>{ct.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Label">
        <input style={s} value={d.label ?? 'W1'}
          onChange={e => update({ label: e.target.value })} />
      </Field>

      {/* ── Shared material params ── */}
      {calcType !== 'plan_dist' && (
        <>
          <div style={sec}>Material</div>
          <Field label="f_b (MPa)" hint="Unit compressive strength">
            <NumericInput style={s} value={d.f_b_MPa ?? 10.0}
              onChange={v => update({ f_b_MPa: v })} />
          </Field>
          <Field label="f_m (MPa)" hint="Mortar strength">
            <NumericInput style={s} value={d.f_m_MPa ?? 6.0}
              onChange={v => update({ f_m_MPa: v })} />
          </Field>
          <Field label="K" hint="Table 3.3 constant">
            <NumericInput style={s} value={d.K ?? 0.55}
              onChange={v => update({ K: v })} />
          </Field>
          <Field label="γ_M">
            <NumericInput style={s} value={d.gamma_M ?? 2.5}
              onChange={v => update({ gamma_M: v })} />
          </Field>
        </>
      )}

      {/* ── Simple vertical ── */}
      {calcType === 'vertical' && (
        <>
          <div style={sec}>Geometry</div>
          <Field label="Thickness (mm)">
            <NumericInput style={s} value={d.thickness_mm ?? 228}
              onChange={v => update({ thickness_mm: v })} />
          </Field>
          <Field label="Height (m)">
            <NumericInput style={s} value={d.height_m ?? 3.0}
              onChange={v => update({ height_m: v })} />
          </Field>
          <Field label="Length (m)">
            <NumericInput style={s} value={d.length_m ?? 5.0}
              onChange={v => update({ length_m: v })} />
          </Field>
          <div style={sec}>Loading</div>
          <Field label="N_k (kN)" hint="Characteristic vertical load">
            <NumericInput style={s} value={d.N_k_kN ?? 100.0}
              onChange={v => update({ N_k_kN: v })} />
          </Field>
          <div style={sec}>EN 1996-1-1 Eq. 3.1</div>
          <Field label="α">
            <NumericInput style={s} value={d.alpha ?? 0.7}
              onChange={v => update({ alpha: v })} />
          </Field>
          <Field label="β">
            <NumericInput style={s} value={d.beta ?? 0.3}
              onChange={v => update({ beta: v })} />
          </Field>
        </>
      )}

      {/* ── Ritter single wall ── */}
      {calcType === 'ritter' && (
        <>
          <div style={sec}>Geometry</div>
          <Field label="b (m)" hint="Tributary width">
            <NumericInput style={s} value={d.b_m ?? 1.0}
              onChange={v => update({ b_m: v })} />
          </Field>
          <Field label="t_ef (mm)" hint="Effective thickness">
            <NumericInput style={s} value={d.t_ef_mm ?? d.thickness_mm ?? 228}
              onChange={v => update({ t_ef_mm: v })} />
          </Field>
          <Field label="h_ef (m)" hint="Effective height">
            <NumericInput style={s} value={d.h_ef_m ?? d.height_m ?? 3.0}
              onChange={v => update({ h_ef_m: v })} />
          </Field>
          <Field label="e_m (mm)" hint="Midheight eccentricity">
            <NumericInput style={s} value={d.e_m_mm ?? 0.0}
              onChange={v => update({ e_m_mm: v })} />
          </Field>
          <div style={sec}>Loading</div>
          <Field label="N_Ed (kN)" hint="Design axial force">
            <NumericInput style={s} value={d.N_Ed_kN ?? 135.0}
              onChange={v => update({ N_Ed_kN: v })} />
          </Field>
          <div style={sec}>Factors</div>
          <Field label="K_1" hint="Long-term factor (0.9)">
            <NumericInput style={s} value={d.K1 ?? 0.9}
              onChange={v => update({ K1: v })} />
          </Field>
        </>
      )}

      {/* ── Bearing under beam ── */}
      {calcType === 'bearing' && (
        <>
          <div style={sec}>Plate geometry</div>
          <Field label="a_plate (mm)" hint="Length along span">
            <NumericInput style={s} value={d.a_plate_mm ?? 150.0}
              onChange={v => update({ a_plate_mm: v })} />
          </Field>
          <Field label="b_plate (mm)" hint="Width across wall">
            <NumericInput style={s} value={d.b_plate_mm ?? 200.0}
              onChange={v => update({ b_plate_mm: v })} />
          </Field>
          <Field label="t_leaf (mm)" hint="Leaf thickness">
            <NumericInput style={s} value={d.t_leaf_mm ?? d.thickness_mm ?? 228}
              onChange={v => update({ t_leaf_mm: v })} />
          </Field>
          <div style={sec}>Loading</div>
          <Field label="N_Ed (kN)" hint="Beam end reaction">
            <NumericInput style={s} value={d.N_Ed_bear_kN ?? 50.0}
              onChange={v => update({ N_Ed_bear_kN: v })} />
          </Field>
        </>
      )}

      {/* ── Multi-storey Ritter ── */}
      {calcType === 'multi_ritter' && (
        <>
          <div style={sec}>Wall geometry</div>
          <Field label="Thickness (mm)">
            <NumericInput style={s} value={d.thickness_mm ?? 228}
              onChange={v => update({ thickness_mm: v })} />
          </Field>
          <Field label="Width (m)" hint="Wall width / tributary length">
            <NumericInput style={s} value={d.wall_width_m ?? 5.0}
              onChange={v => update({ wall_width_m: v })} />
          </Field>
          <div style={sec}>Loads</div>
          <Field label="Self-weight (kN/m²)" hint="Unit wall weight per storey">
            <NumericInput style={s} value={d.unit_weight_kNm2 ?? 5.0}
              onChange={v => update({ unit_weight_kNm2: v })} />
          </Field>
          <Field label="M_top (kNm)" hint="Top-of-wall moment">
            <NumericInput style={s} value={d.top_moment_kNm ?? 0.0}
              onChange={v => update({ top_moment_kNm: v })} />
          </Field>
          <Field label="K_t" hint="Long-term factor (0.9)">
            <NumericInput style={s} value={d.Kt ?? 0.9}
              onChange={v => update({ Kt: v })} />
          </Field>

          {/* Floors table */}
          <div style={sec}>Storeys</div>
          <div style={{ overflowX: 'auto', marginBottom: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Name', 'h (m)', 'N (kN)', 'V (kN)', ''].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {floors.map((fl, i) => (
                  <tr key={i}>
                    <td style={td}>
                      <input style={ts} value={fl.name}
                        onChange={e => updateFloor(i, { name: e.target.value })} />
                    </td>
                    <td style={td}>
                      <NumericInput style={ts} value={fl.height_m}
                        onChange={v => updateFloor(i, { height_m: v })} />
                    </td>
                    <td style={td}>
                      <NumericInput style={ts} value={fl.axial_kN}
                        onChange={v => updateFloor(i, { axial_kN: v })} />
                    </td>
                    <td style={td}>
                      <NumericInput style={ts} value={fl.shear_kN}
                        onChange={v => updateFloor(i, { shear_kN: v })} />
                    </td>
                    <td style={{ padding: '2px 4px' }}>
                      <button onClick={() => removeFloor(i)} style={btnDel} title="Remove">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addFloor} style={btnAdd}>+ Add storey</button>
        </>
      )}

      {/* ── Plan lateral distribution ── */}
      {calcType === 'plan_dist' && (
        <>
          <div style={sec}>Plan dimensions</div>
          <Field label="x_max (m)">
            <NumericInput style={s} value={d.x_max_m ?? 10.0}
              onChange={v => update({ x_max_m: v })} />
          </Field>
          <Field label="y_max (m)">
            <NumericInput style={s} value={d.y_max_m ?? 10.0}
              onChange={v => update({ y_max_m: v })} />
          </Field>
          <Field label="Floor height (m)">
            <NumericInput style={s} value={d.floor_height_m ?? 3.0}
              onChange={v => update({ floor_height_m: v })} />
          </Field>
          <div style={sec}>Wind loads (kN/m²)</div>
          <Field label="D_x" hint="Windward x">
            <NumericInput style={s} value={d.D_x ?? 0.0}
              onChange={v => update({ D_x: v })} />
          </Field>
          <Field label="E_x" hint="Leeward x">
            <NumericInput style={s} value={d.E_x ?? 0.0}
              onChange={v => update({ E_x: v })} />
          </Field>
          <Field label="D_y" hint="Windward y">
            <NumericInput style={s} value={d.D_y ?? 0.0}
              onChange={v => update({ D_y: v })} />
          </Field>
          <Field label="E_y" hint="Leeward y">
            <NumericInput style={s} value={d.E_y ?? 0.0}
              onChange={v => update({ E_y: v })} />
          </Field>

          {/* Wall elements table */}
          <div style={sec}>Wall elements</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
            d_N = depth in N-dir, b_N = breadth in N-dir (all in metres)
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['d_N (m)', 'b_N (m)', 'x (m)', 'y (m)', ''].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wallElements.map((el, i) => (
                  <tr key={i}>
                    <td style={td}>
                      <NumericInput style={ts} value={el.d_n}
                        onChange={v => updateWallEl(i, { d_n: v })} />
                    </td>
                    <td style={td}>
                      <NumericInput style={ts} value={el.b_n}
                        onChange={v => updateWallEl(i, { b_n: v })} />
                    </td>
                    <td style={td}>
                      <NumericInput style={ts} value={el.x}
                        onChange={v => updateWallEl(i, { x: v })} />
                    </td>
                    <td style={td}>
                      <NumericInput style={ts} value={el.y}
                        onChange={v => updateWallEl(i, { y: v })} />
                    </td>
                    <td style={{ padding: '2px 4px' }}>
                      <button onClick={() => removeWallEl(i)} style={btnDel} title="Remove">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addWallEl} style={btnAdd}>+ Add wall element</button>
        </>
      )}
    </CalcBlockShell>
  )
}

const s = {
  border: '1px solid #e8e8e8', padding: '6px 8px',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
}
const ts = {
  border: '1px solid #e8e8e8', padding: '3px 5px',
  fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%',
}
const sec = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
  color: '#731F0D', margin: '10px 0 4px', paddingBottom: 3,
  borderBottom: '1px solid #f0e8e6',
}
const th = {
  background: '#f5f5f5', fontSize: 11, fontWeight: 600,
  padding: '4px 6px', textAlign: 'left', whiteSpace: 'nowrap',
  borderBottom: '1px solid #e0e0e0',
}
const td = { padding: '2px 4px', verticalAlign: 'middle' }
const btnDel = {
  background: 'none', border: 'none', color: '#c0392b', fontSize: 16,
  cursor: 'pointer', padding: '0 4px', lineHeight: 1,
}
const btnAdd = {
  background: '#fdf6f5', border: '1px solid #e8d5d2',
  borderRadius: 4, padding: '5px 12px', fontSize: 12,
  color: '#731F0D', cursor: 'pointer', width: '100%',
}
