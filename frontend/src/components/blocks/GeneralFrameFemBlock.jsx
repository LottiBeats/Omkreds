/**
 * GeneralFrameFemBlock.jsx — general 2D frame/truss FEM block
 *
 * Users define:
 *   - Nodes (id, x, y)
 *   - Elements (id, ni→nj, type, E, A, Iz, moment release)
 *   - Supports (node, ux/uy/rz)
 *   - Loads (nodal Fx/Fy/Mz or element UDL wy/wx)
 *
 * Results (from OpenSeesPy + OpsVis):
 *   - 3 matplotlib figures: deformed shape, bending moment, shear
 *   - Summary: max displacements, max moment, reactions
 */
import React, { useState } from 'react'
import { calcGeneralFrameFem, previewGeneralFrameFem } from '../../api/client.js'
import Field from './Field.jsx'
import NumericInput from './NumericInput.jsx'

// ── Section presets ───────────────────────────────────────────────────────────

const SECTION_PRESETS = [
  { label: 'IPE 200 (S235)', E: 210, A: 28.5,  Iz: 1943  },
  { label: 'IPE 240 (S235)', E: 210, A: 39.1,  Iz: 3892  },
  { label: 'IPE 300 (S235)', E: 210, A: 53.8,  Iz: 8356  },
  { label: 'IPE 360 (S235)', E: 210, A: 72.7,  Iz: 16270 },
  { label: 'IPE 400 (S235)', E: 210, A: 84.5,  Iz: 23130 },
  { label: 'HEB 200 (S235)', E: 210, A: 78.1,  Iz: 5700  },
  { label: 'HEB 300 (S235)', E: 210, A: 149.0, Iz: 25170 },
  { label: 'Custom',         E: null, A: null,  Iz: null  },
]

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function NumField({ label, val, set, width = 72 }) {
  return (
    <div style={s.fieldWrap}>
      <label style={s.miniLabel}>{label}</label>
      <NumericInput style={{ ...s.smallInput, width }} value={val} onChange={set} />
    </div>
  )
}

function SectionLabel({ text }) {
  return <div style={s.sectionLabel}>{text}</div>
}

// ── Row components ────────────────────────────────────────────────────────────

function NodeRow({ node, onChange, onRemove }) {
  return (
    <div style={s.listRow}>
      <div style={s.listRowInner}>
        <NumField label="ID"   val={node.id} set={v => onChange({ ...node, id: Math.round(v) })} width={44} />
        <NumField label="x (m)" val={node.x}  set={v => onChange({ ...node, x: v })} />
        <NumField label="y (m)" val={node.y}  set={v => onChange({ ...node, y: v })} />
      </div>
      <button onClick={onRemove} style={s.removeBtn}>✕</button>
    </div>
  )
}

function ElemRow({ elem, onChange, onRemove }) {
  const [preset, setPreset] = useState('Custom')

  function applyPreset(label) {
    const p = SECTION_PRESETS.find(x => x.label === label)
    setPreset(label)
    if (p && p.E != null) onChange({ ...elem, E_GPa: p.E, A_cm2: p.A, Iz_cm4: p.Iz })
  }

  return (
    <div style={s.listRow}>
      <div style={s.listRowInner}>
        <NumField label="ID" val={elem.id} set={v => onChange({ ...elem, id: Math.round(v) })} width={44} />
        <NumField label="ni" val={elem.ni} set={v => onChange({ ...elem, ni: Math.round(v) })} width={44} />
        <NumField label="nj" val={elem.nj} set={v => onChange({ ...elem, nj: Math.round(v) })} width={44} />

        <div style={s.fieldWrap}>
          <label style={s.miniLabel}>Type</label>
          <select style={{ ...s.smallInput, width: 66 }} value={elem.type ?? 'beam'}
            onChange={e => onChange({ ...elem, type: e.target.value })}>
            <option value="beam">Beam</option>
            <option value="truss">Truss</option>
          </select>
        </div>

        {(elem.type ?? 'beam') === 'beam' && (
          <div style={s.fieldWrap}>
            <label style={s.miniLabel}>Release</label>
            <select style={{ ...s.smallInput, width: 72 }} value={elem.release ?? 'none'}
              onChange={e => onChange({ ...elem, release: e.target.value })}>
              <option value="none">None</option>
              <option value="start">Pin i</option>
              <option value="end">Pin j</option>
              <option value="both">Pin both</option>
            </select>
          </div>
        )}

        <div style={s.fieldWrap}>
          <label style={s.miniLabel}>Section</label>
          <select style={{ ...s.smallInput, width: 130 }} value={preset}
            onChange={e => applyPreset(e.target.value)}>
            {SECTION_PRESETS.map(p => <option key={p.label}>{p.label}</option>)}
          </select>
        </div>

        <NumField label="E (GPa)" val={elem.E_GPa  ?? 210}  set={v => { setPreset('Custom'); onChange({ ...elem, E_GPa:  v }) }} />
        <NumField label="A (cm²)" val={elem.A_cm2  ?? 39.1} set={v => { setPreset('Custom'); onChange({ ...elem, A_cm2:  v }) }} />
        {(elem.type ?? 'beam') === 'beam' && (
          <NumField label="Iz (cm⁴)" val={elem.Iz_cm4 ?? 3892} set={v => { setPreset('Custom'); onChange({ ...elem, Iz_cm4: v }) }} width={88} />
        )}
      </div>
      <button onClick={onRemove} style={s.removeBtn}>✕</button>
    </div>
  )
}

function SupportRow({ sup, onChange, onRemove }) {
  function tog(key) { onChange({ ...sup, [key]: !sup[key] }) }
  return (
    <div style={s.listRow}>
      <div style={s.listRowInner}>
        <NumField label="Node" val={sup.node_id} set={v => onChange({ ...sup, node_id: Math.round(v) })} width={50} />
        {['ux', 'uy', 'rz'].map(dof => (
          <div key={dof} style={s.fieldWrap}>
            <label style={s.miniLabel}>{dof}</label>
            <input type="checkbox" checked={!!sup[dof]} onChange={() => tog(dof)}
              style={{ width: 18, height: 18, cursor: 'pointer' }} />
          </div>
        ))}
        <span style={s.hint}>
          {[sup.ux && 'ux', sup.uy && 'uy', sup.rz && 'rz'].filter(Boolean).join('+') || 'free'}
        </span>
      </div>
      <button onClick={onRemove} style={s.removeBtn}>✕</button>
    </div>
  )
}

function LoadRow({ load, onChange, onRemove, comboBlocks }) {
  const lt = load.type ?? 'nodal'
  const selCombo = lt === 'combo_udl'
    ? (comboBlocks.find(b => b.data.label === load.combo_label) ?? comboBlocks[0])
    : null
  const comboW = selCombo?.data?._exports?.E_d_uls

  return (
    <div style={s.listRow}>
      <div style={s.listRowInner}>
        <div style={s.fieldWrap}>
          <label style={s.miniLabel}>Type</label>
          <select style={{ ...s.smallInput, width: 88 }} value={lt}
            onChange={e => onChange({ ...load, type: e.target.value })}>
            <option value="nodal">Nodal</option>
            <option value="udl">UDL</option>
            <option value="combo_udl">Combo UDL</option>
          </select>
        </div>

        {lt === 'nodal' && <>
          <NumField label="Node"     val={load.node_id ?? 1} set={v => onChange({ ...load, node_id: Math.round(v) })} width={50} />
          <NumField label="Fx (kN)"  val={load.Fx_kN  ?? 0}  set={v => onChange({ ...load, Fx_kN:  v })} />
          <NumField label="Fy (kN)"  val={load.Fy_kN  ?? 0}  set={v => onChange({ ...load, Fy_kN:  v })} />
          <NumField label="Mz (kNm)" val={load.Mz_kNm ?? 0}  set={v => onChange({ ...load, Mz_kNm: v })} />
        </>}

        {lt === 'udl' && <>
          <NumField label="Elem"      val={load.elem_id ?? 1} set={v => onChange({ ...load, elem_id: Math.round(v) })} width={50} />
          <NumField label="wy (kN/m)" val={load.wy_kNm ?? 10} set={v => onChange({ ...load, wy_kNm: v })} />
          <NumField label="wx (kN/m)" val={load.wx_kNm ?? 0}  set={v => onChange({ ...load, wx_kNm: v })} />
          <span style={s.hint}>wy +ve=down</span>
        </>}

        {lt === 'combo_udl' && <>
          <NumField label="Elem" val={load.elem_id ?? 1} set={v => onChange({ ...load, elem_id: Math.round(v) })} width={50} />
          <div style={s.fieldWrap}>
            <label style={s.miniLabel}>Combo</label>
            {comboBlocks.length === 0
              ? <span style={{ fontSize: 10, color: '#e67e22' }}>No combo blocks</span>
              : <select style={{ ...s.smallInput, width: 120 }}
                  value={selCombo?.data?.label ?? ''}
                  onChange={e => onChange({ ...load, combo_label: e.target.value })}>
                  {comboBlocks.map(b => (
                    <option key={b.id} value={b.data.label ?? ''}>{b.data.label}</option>
                  ))}
                </select>
            }
          </div>
          <div style={s.fieldWrap}>
            <label style={s.miniLabel}>wy (kN/m)</label>
            {comboW != null
              ? <span style={{ fontSize: 12, color: '#27ae60', fontWeight: 700, padding: '4px 6px' }}>
                  {comboW.toFixed(2)}
                </span>
              : <span style={{ fontSize: 10, color: '#e67e22', padding: '4px 6px' }}>run combo first</span>
            }
          </div>
        </>}
      </div>
      <button onClick={onRemove} style={s.removeBtn}>✕</button>
    </div>
  )
}

// ── Result panel ──────────────────────────────────────────────────────────────

const TABS = ['Figures', 'Elements', 'Nodes', 'Loads', 'Reactions']
const FIG_LABELS = ['Static model', 'Deflection', 'Bending Moment', 'Shear Force', 'Axial Force']

function Tbl({ headers, rows, zebra = true }) {
  return (
    <table style={s.table}>
      <thead><tr>{headers.map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ background: zebra && i % 2 ? '#fafafa' : '#fff' }}>
            {row.map((cell, j) => (
              <td key={j} style={{ ...s.td, fontWeight: j > 0 ? 600 : 400 }}>{cell ?? '—'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ResultPanel({ figs, summary }) {
  const [open,   setOpen]   = useState(true)
  const [tab,    setTab]    = useState('Figures')
  const [figIdx, setFigIdx] = useState(0)

  return (
    <div style={s.resultPanel}>
      {/* Header bar */}
      <button style={s.summaryBar} onClick={() => setOpen(o => !o)}>
        <span style={s.summaryBadge}>
          δ_x = {summary.max_ux_mm.toFixed(2)} mm
          &nbsp;·&nbsp;
          δ_y = {summary.max_uy_mm.toFixed(2)} mm
          &nbsp;·&nbsp;
          M_max = {summary.max_moment_kNm.toFixed(2)} kNm
        </span>
        <span style={{ flex: 1 }} />
        <span style={s.summaryChevron}>{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>

      {open && (
        <div style={s.resultBody}>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t}
                style={{ ...s.tabBtn, ...(tab === t ? s.tabBtnActive : {}) }}
                onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>

          {/* ── Figures ── */}
          {tab === 'Figures' && figs?.length > 0 && (
            <div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {FIG_LABELS.slice(0, figs.length).map((lbl, i) => (
                  <button key={i}
                    style={{ ...s.tabBtn, ...(figIdx === i ? s.tabBtnActive : {}) }}
                    onClick={() => setFigIdx(i)}>
                    {lbl}
                  </button>
                ))}
              </div>
              <img src={`data:image/png;base64,${figs[figIdx]}`} alt={FIG_LABELS[figIdx]}
                style={{ width: '100%', display: 'block' }} />
            </div>
          )}

          {/* ── Elements ── */}
          {/* ── Envelope (combination mode) ── */}
          {tab === 'Elements' && summary?.envelope && (
            <div style={{ marginBottom: 14 }}>
              <div style={s.detailLabel}>Envelope — worst case per element (all combinations)</div>
              <Tbl
                headers={['Elem', 'M_max (kNm)', 'Governing combo (M)', 'V_max (kN)', 'N_max (kN)']}
                rows={Object.entries(summary.envelope).map(([eid, v]) => [
                  eid,
                  v.M_max_kNm.toFixed(2), v.M_combo,
                  v.V_max_kN.toFixed(2),  v.N_max_kN.toFixed(2),
                ])}
              />
            </div>
          )}

          {tab === 'Elements' && (
            <div>
              <div style={s.detailLabel}>Section properties</div>
              <Tbl
                headers={['Elem', 'Type', 'ni→nj', 'L (m)', 'E (GPa)', 'A (cm²)', 'Iz (cm⁴)', 'Release']}
                rows={(summary.ele_force_table ?? []).map(e => [
                  e.id, e.type, `${e.ni}→${e.nj}`, e.L_m.toFixed(2),
                  e.E_GPa, e.A_cm2, e.type === 'beam' ? e.Iz_cm4 : '—', e.release,
                ])}
              />
              <div style={{ ...s.detailLabel, marginTop: 12 }}>End forces (local axes)</div>
              <Tbl
                headers={['Elem', 'N_i (kN)', 'V_i (kN)', 'M_i (kNm)', 'N_j (kN)', 'V_j (kN)', 'M_j (kNm)']}
                rows={(summary.ele_force_table ?? []).map(e => [
                  e.id,
                  e.N_i_kN.toFixed(2), e.V_i_kN.toFixed(2), e.M_i_kNm.toFixed(2),
                  e.N_j_kN.toFixed(2), e.V_j_kN.toFixed(2), e.M_j_kNm.toFixed(2),
                ])}
              />
            </div>
          )}

          {/* ── Nodes ── */}
          {tab === 'Nodes' && (
            <Tbl
              headers={['Node', 'x (m)', 'y (m)', 'δ_x (mm)', 'δ_y (mm)', 'θ_z (mrad)']}
              rows={(summary.node_disp_table ?? []).map(n => [
                n.id, n.x_m, n.y_m,
                n.ux_mm.toFixed(3), n.uy_mm.toFixed(3), n.rz_mrad.toFixed(3),
              ])}
            />
          )}

          {/* ── Loads ── */}
          {tab === 'Loads' && (
            <Tbl
              headers={['Type', 'Target', 'Fx (kN)', 'Fy (kN)', 'Mz (kNm)', 'wy (kN/m)', 'wx (kN/m)']}
              rows={(summary.loads_table ?? []).map(l => [
                l.type, l.target,
                l.Fx_kN  != null ? l.Fx_kN.toFixed(2)  : '—',
                l.Fy_kN  != null ? l.Fy_kN.toFixed(2)  : '—',
                l.Mz_kNm != null ? l.Mz_kNm.toFixed(2) : '—',
                l.wy_kNm != null ? l.wy_kNm.toFixed(2) : '—',
                l.wx_kNm != null ? l.wx_kNm.toFixed(2) : '—',
              ])}
            />
          )}

          {/* ── Reactions ── */}
          {tab === 'Reactions' && (
            <Tbl
              headers={['Node', 'Fx (kN)', 'Fy (kN)', 'Mz (kNm)']}
              rows={Object.entries(summary.reactions ?? {}).map(([nid, R]) => [
                nid, R.Fx_kN.toFixed(2), R.Fy_kN.toFixed(2), R.Mz_kNm.toFixed(2),
              ])}
            />
          )}

        </div>
      )}
    </div>
  )
}

// ── Main block ────────────────────────────────────────────────────────────────

export default function GeneralFrameFemBlock({ block, onChange, blocks = [] }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  const comboBlocks      = blocks.filter(b => b.type === 'load_combo')
  const loadCaseBlocks   = blocks.filter(b => b.type === 'frame_load_cases')
  const selLoadCaseBlock = loadCaseBlocks.find(b => b.id === d.load_cases_block_id)
                           ?? loadCaseBlocks[0]
  const loadCaseCombos   = selLoadCaseBlock?.data?._exports?.combinations ?? []
  const loadCasesReady   = loadCaseCombos.length > 0

  const loadMode = d.load_mode ?? 'simple'   // 'simple' | 'load_cases'

  const [previewing, setPreviewing] = useState(false)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  async function handlePreview() {
    setPreviewing(true)
    try {
      const res = await previewGeneralFrameFem({
        title: d.title ?? '2D Frame FEM',
        nodes: d.nodes ?? [], elements: d.elements ?? [],
        supports: d.supports ?? [], loads: d.loads ?? [],
      })
      update({ _model_b64: res._model_b64 })
    } catch (err) {
      setError(err.message)
    } finally {
      setPreviewing(false)
    }
  }

  // Nodes
  const nodes = d.nodes ?? []
  function updateNode(i, v)  { const a = [...nodes]; a[i] = v; update({ nodes: a }) }
  function addNode()          { const id = (nodes[nodes.length - 1]?.id ?? 0) + 1
                                update({ nodes: [...nodes, { id, x: 0, y: 0 }] }) }
  function removeNode(i)      { update({ nodes: nodes.filter((_, j) => j !== i) }) }

  // Elements
  const elements = d.elements ?? []
  function updateElem(i, v)  { const a = [...elements]; a[i] = v; update({ elements: a }) }
  function addElem()          { const id = (elements[elements.length - 1]?.id ?? 0) + 1
                                const ni = nodes[nodes.length - 2]?.id ?? 1
                                const nj = nodes[nodes.length - 1]?.id ?? 2
                                update({ elements: [...elements, { id, ni, nj, type: 'beam', release: 'none', E_GPa: 210, A_cm2: 39.1, Iz_cm4: 3892 }] }) }
  function removeElem(i)      { update({ elements: elements.filter((_, j) => j !== i) }) }

  // Supports
  const supports = d.supports ?? []
  function updateSup(i, v)   { const a = [...supports]; a[i] = v; update({ supports: a }) }
  function addSup()           { update({ supports: [...supports, { node_id: nodes[0]?.id ?? 1, ux: true, uy: true, rz: false }] }) }
  function removeSup(i)       { update({ supports: supports.filter((_, j) => j !== i) }) }

  // Loads
  const loads = d.loads ?? []
  function updateLoad(i, v)  { const a = [...loads]; a[i] = v; update({ loads: a }) }
  function addLoad(type)      { update({ loads: [...loads,
    type === 'udl'
      ? { type: 'udl',       elem_id: elements[0]?.id ?? 1, wy_kNm: 10, wx_kNm: 0 }
      : type === 'combo_udl'
      ? { type: 'combo_udl', elem_id: elements[0]?.id ?? 1, combo_label: comboBlocks[0]?.data?.label ?? '' }
      : { type: 'nodal',     node_id: nodes[0]?.id    ?? 1, Fx_kN: 0, Fy_kN: 0, Mz_kNm: 0 }
  ]}) }
  function removeLoad(i)      { update({ loads: loads.filter((_, j) => j !== i) }) }

  async function handleRun() {
    setRunning(true); setError(null)
    try {
      let resolvedLoads = []
      let combinations  = []

      if (loadMode === 'load_cases') {
        // Combination mode — pass all combos to backend
        combinations = loadCaseCombos
      } else {
        // Simple mode — resolve combo_udl loads
        resolvedLoads = loads.map(ld => {
          if (ld.type !== 'combo_udl') return ld
          const cb = comboBlocks.find(b => b.data.label === ld.combo_label) ?? comboBlocks[0]
          const w  = cb?.data?._exports?.E_d_uls ?? 0
          return { type: 'udl', elem_id: ld.elem_id ?? 1, wy_kNm: w, wx_kNm: 0 }
        })
      }

      const res = await calcGeneralFrameFem({
        title:        d.title ?? '2D Frame FEM',
        nodes, elements, supports,
        loads:        resolvedLoads,
        combinations,
      })

      // Build _exports so capacity check blocks can read element forces
      const eleTable = res._summary?.ele_force_table ?? []
      const exports_ = {
        elements: eleTable.map(e => ({
          id:        e.id,
          label:     `Elem ${e.id}  (${e.ni}→${e.nj}, L=${e.L_m}m)`,
          M_max_kNm: Math.max(Math.abs(e.M_i_kNm), Math.abs(e.M_j_kNm)),
          V_max_kN:  Math.max(Math.abs(e.V_i_kN),  Math.abs(e.V_j_kN)),
          N_max_kN:  Math.max(Math.abs(e.N_i_kN),  Math.abs(e.N_j_kN)),
          M_i_kNm: e.M_i_kNm, V_i_kN: e.V_i_kN, N_i_kN: e.N_i_kN,
          M_j_kNm: e.M_j_kNm, V_j_kN: e.V_j_kN, N_j_kN: e.N_j_kN,
        })),
      }

      update({
        _figs_b64: res._figs_b64,
        _summary:  res._summary,
        _result:   res._result,
        _exports:  exports_,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={s.wrapper}>

      <input type="text" value={d.title ?? '2D Frame FEM'}
        onChange={e => update({ title: e.target.value })}
        placeholder="Analysis title" style={s.titleInput} />

      {/* Nodes */}
      <div style={s.rowHeader}>
        <SectionLabel text="Nodes" />
        <button style={s.addBtn} onClick={addNode}>+ Node</button>
      </div>
      {nodes.map((n, i) => (
        <NodeRow key={i} node={n} onChange={v => updateNode(i, v)} onRemove={() => removeNode(i)} />
      ))}

      {/* Elements */}
      <div style={s.rowHeader}>
        <SectionLabel text="Elements" />
        <button style={s.addBtn} onClick={addElem}>+ Element</button>
      </div>
      {elements.map((el, i) => (
        <ElemRow key={i} elem={el} onChange={v => updateElem(i, v)} onRemove={() => removeElem(i)} />
      ))}

      {/* Supports */}
      <div style={s.rowHeader}>
        <SectionLabel text="Supports" />
        <button style={s.addBtn} onClick={addSup}>+ Support</button>
      </div>
      {supports.map((sup, i) => (
        <SupportRow key={i} sup={sup} onChange={v => updateSup(i, v)} onRemove={() => removeSup(i)} />
      ))}

      {/* Load mode selector */}
      <div style={s.rowHeader}>
        <SectionLabel text="Loads" />
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {[['simple', 'Simple'], ['load_cases', 'Frame Load Cases']].map(([v, l]) => (
            <button key={v}
              style={{ ...s.addBtn, ...(loadMode === v ? { background: '#111', color: '#fff', border: '1px solid #111' } : {}) }}
              onClick={() => update({ load_mode: v })}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Frame Load Cases picker */}
      {loadMode === 'load_cases' && (
        <div style={{ background: '#fafafa', border: '1px solid #e8e8e8', padding: '10px 12px', borderRadius: 2 }}>
          {loadCaseBlocks.length === 0 ? (
            <span style={{ fontSize: 12, color: '#e67e22' }}>
              No Frame Load Cases blocks in this document — add one first.
            </span>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={s.fieldWrap}>
                <label style={s.miniLabel}>Load cases block</label>
                <select style={{ ...s.smallInput, width: 220 }}
                  value={selLoadCaseBlock?.id ?? ''}
                  onChange={e => update({ load_cases_block_id: Number(e.target.value) })}>
                  {loadCaseBlocks.map(b => (
                    <option key={b.id} value={b.id}>{b.data.title ?? 'Frame Load Cases'}</option>
                  ))}
                </select>
              </div>
              {loadCasesReady
                ? <span style={{ fontSize: 12, color: '#27ae60', fontWeight: 700 }}>
                    ✓ {loadCaseCombos.length} combinations ready — FEM will run all and envelope
                  </span>
                : <span style={{ fontSize: 12, color: '#e67e22' }}>
                    Run the Frame Load Cases block first
                  </span>
              }
            </div>
          )}
        </div>
      )}

      {/* Simple loads list */}
      {loadMode === 'simple' && (<>
        <div style={s.rowHeader}>
          <button style={s.addBtn} onClick={() => addLoad('nodal')}>+ Nodal</button>
          <button style={s.addBtn} onClick={() => addLoad('udl')}>+ UDL</button>
          <button style={s.addBtn} onClick={() => addLoad('combo_udl')}>+ Combo UDL</button>
        </div>
        {loads.map((ld, i) => (
          <LoadRow key={i} load={ld} comboBlocks={comboBlocks}
            onChange={v => updateLoad(i, v)} onRemove={() => removeLoad(i)} />
        ))}
      </>)}

      {/* Actions */}
      <div style={s.actionRow}>
        <button style={{ ...s.btn, ...s.btnRun,
                         opacity: (loadMode === 'load_cases' && !loadCasesReady) ? 0.5 : 1 }}
          onClick={handleRun}
          disabled={running || previewing || (loadMode === 'load_cases' && !loadCasesReady)}
          title={loadMode === 'load_cases' && !loadCasesReady ? 'Run the Frame Load Cases block first' : undefined}>
          {running ? '⏳  Running…' : '▶  Run FEM'}
        </button>
        <button style={s.btn} onClick={handlePreview} disabled={running || previewing}>
          {previewing ? '⏳ …' : '🔍  Preview model'}
        </button>
        {d._summary && (
          <button style={s.btn}
            onClick={() => update({ _figs_b64: null, _summary: null, _result: null, _model_b64: null })}>
            ✕  Clear
          </button>
        )}
      </div>

      {error && <div style={s.error}>{error}</div>}

      {/* Static model preview */}
      {d._model_b64 && !d._summary && (
        <div style={s.resultPanel}>
          <div style={{ ...s.summaryBar, cursor: 'default' }}>
            <span style={s.summaryBadge}>Static model</span>
          </div>
          <div style={{ padding: '12px 14px' }}>
            <img src={`data:image/png;base64,${d._model_b64}`}
              alt="Static model" style={{ width: '100%', display: 'block' }} />
          </div>
        </div>
      )}

      {d._summary && d._figs_b64 && (
        <ResultPanel figs={d._figs_b64} summary={d._summary} />
      )}

    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  wrapper:      { display: 'flex', flexDirection: 'column', gap: 8 },
  titleInput:   { border: '1px solid #e8e8e8', padding: '6px 10px', fontSize: 13,
                  fontWeight: 600, outline: 'none', fontFamily: 'inherit',
                  width: '100%', boxSizing: 'border-box' },
  rowHeader:    { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: '#aaa', letterSpacing: '0.1em',
                  textTransform: 'uppercase' },
  listRow:      { display: 'flex', alignItems: 'flex-end', gap: 8,
                  background: '#fafafa', border: '1px solid #f0f0f0',
                  padding: '8px 10px', borderRadius: 2 },
  listRowInner: { display: 'flex', flex: 1, gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' },
  fieldWrap:    { display: 'flex', flexDirection: 'column', gap: 3 },
  miniLabel:    { fontSize: 10, fontWeight: 600, color: '#888', letterSpacing: '0.04em' },
  smallInput:   { border: '1px solid #e0e0e0', padding: '4px 6px', fontSize: 12,
                  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' },
  hint:         { fontSize: 10, color: '#bbb', alignSelf: 'center' },
  removeBtn:    { background: 'none', border: 'none', color: '#ccc', cursor: 'pointer',
                  fontSize: 14, padding: '4px 6px', lineHeight: 1, alignSelf: 'flex-start' },
  addBtn:       { background: '#f5f5f7', border: '1px solid #e8e8e8', padding: '4px 10px',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  letterSpacing: '0.04em', color: '#555' },
  actionRow:    { display: 'flex', gap: 8, marginTop: 4 },
  btn:          { background: '#f5f5f7', border: '1px solid #e8e8e8', padding: '7px 14px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  letterSpacing: '0.04em' },
  btnRun:       { background: '#111', color: '#fff', border: '1px solid #111' },
  error:        { background: '#fdf3f2', border: '1px solid #f5c6c6', padding: '8px 12px',
                  fontSize: 12, color: '#c0392b' },
  resultPanel:  { border: '1px solid #e8e8e8', marginTop: 2 },
  summaryBar:   { display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  background: '#f5f5f7', border: 'none', borderBottom: '1px solid #e8e8e8',
                  padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },
  summaryBadge: { fontSize: 11, fontWeight: 700, color: '#27ae60' },
  summaryChevron: { fontSize: 10, color: '#aaa' },
  resultBody:   { padding: '12px 14px' },
  tabBtn:       { background: '#f5f5f7', border: '1px solid #e8e8e8', padding: '4px 12px',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  letterSpacing: '0.04em', color: '#555' },
  tabBtnActive: { background: '#111', color: '#fff', border: '1px solid #111' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace' },
  th:           { textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e8e8e8',
                  fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: '0.06em',
                  textTransform: 'uppercase', background: '#fafafa', fontFamily: 'inherit' },
  td:           { padding: '5px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 12 },
  detailLabel:  { fontSize: 10, fontWeight: 700, color: '#aaa', letterSpacing: '0.1em',
                  textTransform: 'uppercase', marginBottom: 6 },
}
