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
import ModelSketch from './ModelSketch.jsx'
import FemSystemModal from './FemSystemModal.jsx'

// ── Section presets ───────────────────────────────────────────────────────────

// A section is a *reference*, not a set of numbers copied onto the element.
// The backend derives E, A and I from it, and the member check generated below
// inherits the same reference — so the analysis and the verification cannot end
// up describing different sections.
const MATERIALS = [
  { key: 'steel',  label: 'Stål',  grades: ['S235', 'S275', 'S355', 'S420'] },
  { key: 'timber', label: 'Træ',   grades: ['C18', 'C24', 'C30', 'GL24c', 'GL24h', 'GL28c', 'GL28h', 'GL30c'] },
]

// Which verification belongs with each material. Mirrors
// CHECK_TYPE_FOR_MATERIAL in backend/section_resolver.py.
const CHECK_TYPE_FOR_MATERIAL = { steel: 'steel_beam', timber: 'timber_beam' }

const STEEL_SECTIONS = [
  'IPE200', 'IPE240', 'IPE270', 'IPE300', 'IPE360', 'IPE400', 'IPE450', 'IPE500',
  'HEA200', 'HEA300', 'HEB200', 'HEB300',
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
  const material = elem.material ?? ''
  const matDef   = MATERIALS.find(m => m.key === material)
  // With a section reference the backend owns E/A/I; showing editable fields
  // would invite them to disagree with the section.
  const derived  = !!(material && elem.section)

  function setMaterial(key) {
    if (!key) {
      const { material: _m, section: _s, grade: _g, ...rest } = elem
      onChange(rest)                       // back to raw E/A/I
      return
    }
    const def = MATERIALS.find(m => m.key === key)
    onChange({
      ...elem,
      material: key,
      grade: def?.grades?.includes(elem.grade) ? elem.grade : def?.grades?.[key === 'steel' ? 2 : 1],
      section: key === 'steel' ? (STEEL_SECTIONS.includes(elem.section) ? elem.section : 'IPE300')
                               : (/^\s*\d/.test(elem.section ?? '') ? elem.section : '140x360'),
    })
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
          <label style={s.miniLabel}>Materiale</label>
          <select style={{ ...s.smallInput, width: 84 }} value={material}
            onChange={e => setMaterial(e.target.value)}>
            <option value="">Egne tal</option>
            {MATERIALS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>

        {derived && (
          <>
            <div style={s.fieldWrap}>
              <label style={s.miniLabel}>Tværsnit</label>
              {material === 'steel' ? (
                <select style={{ ...s.smallInput, width: 96 }} value={elem.section}
                  onChange={e => onChange({ ...elem, section: e.target.value })}>
                  {STEEL_SECTIONS.map(x => <option key={x}>{x}</option>)}
                </select>
              ) : (
                <input style={{ ...s.smallInput, width: 96 }} value={elem.section}
                  placeholder="b x h mm"
                  onChange={e => onChange({ ...elem, section: e.target.value })} />
              )}
            </div>
            <div style={s.fieldWrap}>
              <label style={s.miniLabel}>Kvalitet</label>
              <select style={{ ...s.smallInput, width: 84 }} value={elem.grade ?? ''}
                onChange={e => onChange({ ...elem, grade: e.target.value })}>
                {(matDef?.grades ?? []).map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
          </>
        )}

        {!derived && (
          <>
            <NumField label="E (GPa)" val={elem.E_GPa  ?? 210}  set={v => onChange({ ...elem, E_GPa:  v })} />
            <NumField label="A (cm²)" val={elem.A_cm2  ?? 39.1} set={v => onChange({ ...elem, A_cm2:  v })} />
            {(elem.type ?? 'beam') === 'beam' && (
              <NumField label="Iz (cm⁴)" val={elem.Iz_cm4 ?? 3892} set={v => onChange({ ...elem, Iz_cm4: v })} width={88} />
            )}
          </>
        )}
        <NumField label="Group" val={elem.member_id ?? 0}
          set={v => onChange({ ...elem, member_id: v > 0 ? Math.round(v) : undefined })}
          width={52} />
      </div>
      <button onClick={onRemove} style={s.removeBtn}>✕</button>
    </div>
  )
}

// ── Member load expansion ─────────────────────────────────────────────────────
// Loads that target a member_id are expanded to one load per sub-element.
function expandMemberLoads(loads, elements) {
  const result = []
  for (const ld of loads) {
    if (ld.load_type === 'udl' && ld.member_id != null) {
      // member_id → expand to all elements belonging to that member
      const memberElems = elements.filter(e => e.member_id === ld.member_id)
      if (memberElems.length === 0) { result.push(ld); continue }
      for (const el of memberElems) {
        result.push({ ...ld, elem_id: el.id, member_id: undefined })
      }
    } else if (ld.load_type === 'udl' && ld.elem_ids != null) {
      // elem_ids array → one load per element
      for (const eid of ld.elem_ids) {
        result.push({ ...ld, elem_id: eid, elem_ids: undefined })
      }
    } else {
      result.push(ld)
    }
  }
  return result
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

// A positive w always acts in the direction named here — negative is uplift or
// suction. The hint under the field says so, because the previous behaviour
// (positive acting upwards) taught anyone who used the block to type a minus.
const UDL_DIRECTIONS = [
  { value: 'vertical',     label: '↓ Lodret (egenlast / nyttelast)', hint: '+ virker nedad' },
  { value: 'projected',    label: '❄ Sne (vandret projektion)',      hint: '+ virker nedad, pr. m vandret' },
  { value: 'horizontal',   label: '→ Vandret (vind på væg)',         hint: '+ virker mod højre (+x)' },
  { value: 'perpendicular',label: '⊥ Vinkelret (vind på flade)',     hint: '+ trykker ind på fladen' },
]

function LoadRow({ load, onChange, onRemove, comboBlocks }) {
  const lt = load.type ?? 'nodal'
  const selCombo = lt === 'combo_udl'
    ? (comboBlocks.find(b => b.data.label === load.combo_label) ?? comboBlocks[0])
    : null
  const comboW = selCombo?.data?._exports?.E_d_uls

  // UDL sub-fields
  const udlTarget    = load.target    ?? 'elem'   // 'elem' | 'member'
  const udlDirection = load.direction ?? 'vertical'

  return (
    <div style={s.listRow}>
      <div style={s.listRowInner}>
        <div style={s.fieldWrap}>
          <label style={s.miniLabel}>Type</label>
          <select style={{ ...s.smallInput, width: 88 }} value={lt}
            onChange={e => onChange({ ...load, type: e.target.value })}>
            <option value="nodal">Punktlast</option>
            <option value="udl">Linjelast</option>
            <option value="combo_udl">Kombi-linjelast</option>
          </select>
        </div>

        {lt === 'nodal' && <>
          <NumField label="Node"     val={load.node_id ?? 1} set={v => onChange({ ...load, node_id: Math.round(v) })} width={50} />
          <NumField label="Fx (kN)"  val={load.Fx_kN  ?? 0}  set={v => onChange({ ...load, Fx_kN:  v })} />
          <NumField label="Fy (kN)"  val={load.Fy_kN  ?? 0}  set={v => onChange({ ...load, Fy_kN:  v })} />
          <NumField label="Mz (kNm)" val={load.Mz_kNm ?? 0}  set={v => onChange({ ...load, Mz_kNm: v })} />
        </>}

        {lt === 'udl' && <>
          {/* Target: element or member group */}
          <div style={s.fieldWrap}>
            <label style={s.miniLabel}>Target</label>
            <select style={{ ...s.smallInput, width: 80 }} value={udlTarget}
              onChange={e => onChange({ ...load, target: e.target.value })}>
              <option value="elem">Element</option>
              <option value="member">Member</option>
            </select>
          </div>
          {udlTarget === 'member'
            ? <NumField label="Group" val={load.member_id ?? 1} set={v => onChange({ ...load, member_id: Math.round(v) })} width={52} />
            : <NumField label="Elem"  val={load.elem_id  ?? 1} set={v => onChange({ ...load, elem_id:   Math.round(v) })} width={52} />
          }
          {/* Direction */}
          <div style={s.fieldWrap}>
            <label style={s.miniLabel}>Direction</label>
            <select style={{ ...s.smallInput, width: 188 }} value={udlDirection}
              onChange={e => onChange({ ...load, direction: e.target.value })}>
              {UDL_DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <NumField label="w (kN/m)" val={load.value_kNm ?? load.wy_kNm ?? 10}
            set={v => onChange({ ...load, value_kNm: v })} />
          <span style={s.dirHint}>
            {UDL_DIRECTIONS.find(x => x.value === udlDirection)?.hint}
          </span>
        </>}

        {lt === 'combo_udl' && <>
          <NumField label="Elem" val={load.elem_id ?? 1} set={v => onChange({ ...load, elem_id: Math.round(v) })} width={50} />
          <div style={s.fieldWrap}>
            <label style={s.miniLabel}>Combo</label>
            {comboBlocks.length === 0
              ? <span style={{ fontSize: 10, color: '#e67e22' }}>Ingen kombinationsblokke</span>
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
              : <span style={{ fontSize: 10, color: '#e67e22', padding: '4px 6px' }}>kør kombinationen først</span>
            }
          </div>
        </>}
      </div>
      <button onClick={onRemove} style={s.removeBtn}>✕</button>
    </div>
  )
}

// ── Equal-DOF row (pin joints between co-located nodes) ──────────────────────

function EqualDOFRow({ eq, onChange, onRemove }) {
  const dofs = eq.dofs ?? [1, 2]
  function toggleDof(d) {
    const next = dofs.includes(d) ? dofs.filter(x => x !== d) : [...dofs, d].sort()
    onChange({ ...eq, dofs: next })
  }
  return (
    <div style={s.listRow}>
      <div style={s.listRowInner}>
        <NumField label="Retained node"    val={eq.r_node ?? 1}
          set={v => onChange({ ...eq, r_node: Math.round(v) })} width={56} />
        <NumField label="Constrained node" val={eq.c_node ?? 2}
          set={v => onChange({ ...eq, c_node: Math.round(v) })} width={56} />
        <div style={s.fieldWrap}>
          <label style={s.miniLabel}>Shared DOFs</label>
          <div style={{ display: 'flex', gap: 6, paddingTop: 4 }}>
            {[['ux', 1], ['uy', 2], ['rz', 3]].map(([lbl, d]) => (
              <label key={d} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                <input type="checkbox" checked={dofs.includes(d)}
                  onChange={() => toggleDof(d)} />
                {lbl}
              </label>
            ))}
          </div>
        </div>
        <span style={{ ...s.hint, alignSelf: 'center' }}>
          {dofs.includes(3) ? 'rigid' : 'pin joint'}
        </span>
      </div>
      <button onClick={onRemove} style={s.removeBtn}>✕</button>
    </div>
  )
}

// ── Result panel ──────────────────────────────────────────────────────────────

const TABS = ['Figurer', 'Stabilitet', 'Elementer', 'Knuder', 'Laster', 'Reaktioner']
/**
 * Two decimals on every number reads as precision the analysis does not have —
 * "1052856.00 kNm" is four significant digits of noise. Scale the decimals to
 * the magnitude instead.
 */
function fmt(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  return v.toFixed(a >= 1000 ? 0 : a >= 100 ? 1 : 2)
}

const FIG_LABELS       = ['Statisk model', 'Deformation', 'Moment', 'Forskydning', 'Normalkraft']
const COMBO_FIG_LABELS = ['Deformation', 'Moment', 'Forskydning', 'Normalkraft']

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

// ── Create-check dropdown button (shown per element row) ─────────────────────

const CHECK_TYPES = [
  { type: 'steel_beam',  label: 'Stålbjælke (EC3)' },
  { type: 'beam_column', label: 'Søjle-bjælke N+M (EC3)' },
  { type: 'timber_beam', label: 'Træbjælke (EC5)' },
  { type: 'rc_beam',     label: 'Betonbjælke (EC2)' },
]

function CreateCheckButton({ elemId, elemL, blockId, onAddBlock, material }) {
  const [open, setOpen] = useState(false)
  if (!onAddBlock) return null
  const suggested = CHECK_TYPE_FOR_MATERIAL[material]

  function create(type) {
    onAddBlock(type, {
      label:        `E${elemId}`,
      title:        `${CHECK_TYPES.find(c => c.type === type)?.label} — Elem ${elemId}`,
      load_source:  'fem',
      fem_block_id: blockId,
      fem_elem_id:  elemId,
      fem_end:      'max',
      span_m:       parseFloat(elemL.toFixed(2)),
    })
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{ fontSize: 10, padding: '2px 7px', background: '#1e3a5f', color: '#fff',
                 border: 'none', cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap' }}>
        → Eftervis
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }}
               onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100,
                        background: '#fff', border: '1px solid #e0e0e0',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 190, paddingBlock: 4 }}>
            {[...CHECK_TYPES].sort((a, b) =>
                (b.type === suggested ? 1 : 0) - (a.type === suggested ? 1 : 0)).map(c => (
              <button key={c.type} onClick={() => create(c.type)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px',
                         fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
                         fontFamily: 'inherit' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                {c.label}{c.type === suggested ? '  ·  passer til materialet' : ''}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}


function ResultPanel({ figs, summary, onAddBlock, onAddBlocks, blockId, title, elements }) {
  const [open,      setOpen]      = useState(true)
  const [tab,       setTab]       = useState('Figurer')
  const [figIdx,    setFigIdx]    = useState(0)
  const [comboIdx,  setComboIdx]  = useState(null)  // null = static model

  function generateA2() {
    if (!onAddBlocks) return
    const heading = title ?? '2D Frame FEM'
    const memberExports = summary?._exports?.elements ?? []
    // Prefer member-level entries (id >= 1000); fall back to element-level
    const entries = memberExports.filter(e => e.id >= 1000).length > 0
      ? memberExports.filter(e => e.id >= 1000)
      : memberExports

    const newBlocks = []

    // Heading
    newBlocks.push({ type: 'heading', data: { level: 2, text: `A2 — ${heading}` } })

    // Static model figure
    if (figs?.[0]) {
      newBlocks.push({ type: 'image', data: {
        image_b64: `data:image/png;base64,${figs[0]}`,
        caption: 'Fig. 1 — Statisk model og last', width_pct: 100,
      }})
    }
    // Bending moment diagram (index 2 = BMD in standard order)
    const bmdIdx = figs?.length >= 3 ? 2 : (figs?.length >= 2 ? 1 : -1)
    if (bmdIdx >= 0 && figs?.[bmdIdx]) {
      newBlocks.push({ type: 'image', data: {
        image_b64: `data:image/png;base64,${figs[bmdIdx]}`,
        caption: 'Fig. 2 — Momentkurve', width_pct: 100,
      }})
    }

    if (entries.length > 0) {
      newBlocks.push({ type: 'heading', data: { level: 3, text: 'Eftervisning af stænger' } })
      entries.forEach((entry, i) => {
        // The verification follows the element's material. Without a section
        // reference there is nothing to go on, so fall back to steel and say so
        // in the title rather than silently producing the wrong check.
        const type = CHECK_TYPE_FOR_MATERIAL[entry.material] ?? 'steel_beam'
        const data = {
          title:        entry.label ?? `Element ${entry.id}`,
          label:        `M${i + 1}`,
          load_source:  'fem',
          fem_block_id: blockId,
          fem_elem_id:  entry.id,
          fem_end:      'max',
          span_m:       parseFloat((entry.L_m ?? 1).toFixed(2)),
        }
        if (entry.material === 'steel' && entry.section) {
          data.section = entry.section
          if (entry.grade) data.grade = entry.grade
        }
        if (entry.material === 'timber' && entry.section) {
          const m = /^\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*$/.exec(entry.section)
          if (m) {
            data.b_mm = parseFloat(m[1].replace(',', '.'))
            data.h_mm = parseFloat(m[2].replace(',', '.'))
          }
          if (entry.grade) data.grade = entry.grade
        }
        newBlocks.push({ type, data })
      })
    }

    onAddBlocks(newBlocks)
  }

  return (
    <div style={s.resultPanel}>
      {/* Header bar */}
      <button style={s.summaryBar} onClick={() => setOpen(o => !o)}>
        <span style={s.summaryBadge}>
          δ_x = {fmt(summary.max_ux_mm)} mm
          &nbsp;·&nbsp;
          δ_y = {fmt(summary.max_uy_mm)} mm
          &nbsp;·&nbsp;
          M_max = {fmt(summary.max_moment_kNm)} kNm
        </span>
        <span style={{ flex: 1 }} />
        {onAddBlocks && (
          <button
            onClick={e => { e.stopPropagation(); generateA2() }}
            style={{ fontSize: 11, padding: '3px 10px', background: '#1e3a5f', color: '#fff',
                     border: 'none', cursor: 'pointer', borderRadius: 2, marginRight: 8 }}>
            ✦ Generate A2
          </button>
        )}
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
          {tab === 'Figurer' && figs?.length > 0 && (() => {
            const comboFigs    = summary?.combo_figs ?? []
            const hasComboFigs = comboFigs.length > 0

            // Active figure set
            const isStatic   = comboIdx === null || !hasComboFigs
            const activeFigs = isStatic ? figs : (comboFigs[comboIdx]?.figs ?? [])
            const labels     = isStatic
              ? FIG_LABELS.slice(0, figs.length)
              : COMBO_FIG_LABELS.slice(0, activeFigs.length)
            const idx = Math.min(figIdx, activeFigs.length - 1)

            return (
              <div>
                {/* Combination selector — only when combo mode */}
                {hasComboFigs && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={s.detailLabel}>Lastkombination</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                      <button
                        style={{ ...s.tabBtn, ...(isStatic ? s.tabBtnActive : {}) }}
                        onClick={() => setComboIdx(null)}>
                        Statisk model
                      </button>
                      {comboFigs.map((cf, ci) => (
                        <button key={ci}
                          style={{ ...s.tabBtn, ...(comboIdx === ci ? s.tabBtnActive : {}) }}
                          onClick={() => { setComboIdx(ci); setFigIdx(0) }}>
                          {cf.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Diagram type tabs */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  {labels.map((lbl, i) => (
                    <button key={i}
                      style={{ ...s.tabBtn, ...(idx === i ? s.tabBtnActive : {}) }}
                      onClick={() => setFigIdx(i)}>
                      {lbl}
                    </button>
                  ))}
                </div>
                {activeFigs[idx] && (
                  <img src={`data:image/png;base64,${activeFigs[idx]}`}
                    alt={labels[idx]}
                    style={{ width: '100%', display: 'block' }} />
                )}
              </div>
            )
          })()}

          {/* ── Buckling ── */}
          {tab === 'Stabilitet' && (() => {
            const acr         = summary?.alpha_cr ?? null
            const buckLengths = summary?.buckling_lengths   ?? {}
            const buckRows   = Object.entries(buckLengths)
            const acrColor = !acr ? '#94a3b8'
              : acr.klasse === 'ikke svajfølsom' ? '#15803d'
              : acr.klasse === 'svajfølsom'      ? '#b45309' : '#dc2626'
            return (
              <div>
                {/* Sway stability — EN 1993-1-1 § 5.2.1(4)B */}
                {acr ? (
                  <div style={{ border: '1px solid #e2e8f0', borderLeft: `3px solid ${acrColor}`,
                                background: '#f8fafc', padding: '12px 14px', marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
                        α_cr = {acr.alpha_cr ?? '∞'}
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: acrColor,
                                     textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {acr.klasse}
                      </span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{acr.metode}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.55, marginTop: 7 }}>
                      {acr.konsekvens}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 9, fontFamily: 'var(--font-mono, monospace)' }}>
                      V_Ed = {acr.V_Ed_kN} kN · h = {acr.h_m} m ·
                      {' '}H = φ·V_Ed = {acr.H_probe_kN} kN · δ_H = {acr.delta_H_mm} mm
                      {' '}· φ = {acr.phi} (α_h = {acr.alpha_h}, α_m = {acr.alpha_m}, m = {acr.antal_soejler})
                    </div>
                    {(acr.forbehold ?? []).map((f, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#b45309', marginTop: 6, lineHeight: 1.5 }}>
                        {f}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ ...s.hint, padding: '8px 0' }}>
                    α_cr kunne ikke bestemmes — kræver søjler fra en understøtning og lodret last.
                  </div>
                )}

                {/* Buckling length table */}
                {buckRows.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={s.detailLabel}>
                      Effective buckling lengths — Wood's stiffness-distribution method (EN 1993-1-1 Annex B)
                    </div>
                    <div style={{ ...s.hint, marginBottom: 6 }}>
                      η = relative rotational stiffness at each end (0 = fixed, 1 = pinned).
                      Non-sway: k ∈ [0.5, 1.0] · Sway: k ≥ 1.0.
                      Select the applicable case for the actual frame bracing condition.
                    </div>
                    <Tbl
                      headers={['Elem', 'L (m)', 'N_Ed (kN)', 'η_i', 'η_j',
                                'k (non-sway)', 'L_cr,ns (m)', 'k (sway)', 'L_cr,sw (m)']}
                      rows={buckRows.map(([eid, v]) => [
                        eid,
                        v.L_m.toFixed(3),
                        v.N_Ed_kN.toFixed(1),
                        v.eta_i.toFixed(3),
                        v.eta_j.toFixed(3),
                        v.k_ns.toFixed(3),
                        v.L_cr_ns_m.toFixed(3),
                        v.k_sw.toFixed(3),
                        v.L_cr_sw_m.toFixed(3),
                      ])}
                    />
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Elements ── */}
          {/* ── Envelope (combination mode) ── */}
          {tab === 'Elementer' && summary?.envelope && (
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

          {tab === 'Elementer' && (
            <div>
              <div style={s.detailLabel}>Tværsnit</div>
              <Tbl
                headers={['Elem', 'Type', 'ni→nj', 'L (m)', 'Tværsnit', 'E (GPa)', 'A (cm²)', 'Iz (cm⁴)', 'Release']}
                rows={(summary.ele_force_table ?? []).map(e => [
                  e.id, e.type, `${e.ni}→${e.nj}`, e.L_m.toFixed(2),
                  e.section_resolved?.beskrivelse ?? (e.section ?? 'egne tal'),
                  e.E_GPa, e.A_cm2, e.type === 'beam' ? e.Iz_cm4 : '—', e.release,
                ])}
              />
              {/* A mistyped section falls back to the element's own numbers —
                  say so, or the analysis quietly runs on the wrong stiffness. */}
              {(summary.ele_force_table ?? []).filter(e => e.section_error).map(e => (
                <div key={e.id} style={{ fontSize: 11, color: '#b45309', marginTop: 6 }}>
                  Element {e.id}: {e.section_error} — der er regnet med elementets egne E/A/I.
                </div>
              ))}
              <div style={{ ...s.hint, marginTop: 6 }}>
                Er der valgt et tværsnit, udledes E, A og Iz af det — og eftervisningen
                nedenfor arver samme tværsnit, så de to ikke kan komme til at afvige.
              </div>
              <div style={{ ...s.detailLabel, marginTop: 12 }}>Snitkræfter (lokale akser)</div>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Elem','N_i (kN)','V_i (kN)','M_i (kNm)','N_j (kN)','V_j (kN)','M_j (kNm)',
                      'M_max (kNm)','ved x (m)',''].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(summary.ele_force_table ?? []).map((e, i) => (
                    <tr key={e.id} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
                      <td style={{ ...s.td, fontWeight: 400 }}>{e.id}</td>
                      <td style={s.td}>{e.N_i_kN.toFixed(2)}</td>
                      <td style={s.td}>{e.V_i_kN.toFixed(2)}</td>
                      <td style={s.td}>{e.M_i_kNm.toFixed(2)}</td>
                      <td style={s.td}>{e.N_j_kN.toFixed(2)}</td>
                      <td style={s.td}>{e.V_j_kN.toFixed(2)}</td>
                      <td style={s.td}>{e.M_j_kNm.toFixed(2)}</td>
                      {/* The design moment. On a member with a distributed
                          load it sits between the nodes, so the end columns
                          above can both read zero while this does not. */}
                      <td style={{ ...s.td, fontWeight: 700 }}>
                        {e.M_max_kNm != null ? e.M_max_kNm.toFixed(2) : '—'}
                      </td>
                      <td style={s.td}>
                        {e.x_M_max_m != null ? e.x_M_max_m.toFixed(2) : '—'}
                      </td>
                      <td style={{ ...s.td, padding: '3px 6px' }}>
                        <CreateCheckButton
                          elemId={e.id}
                          elemL={e.L_m}
                          blockId={blockId}
                          onAddBlock={onAddBlock}
                          material={e.material}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Nodes ── */}
          {tab === 'Knuder' && (
            <Tbl
              headers={['Node', 'x (m)', 'y (m)', 'δ_x (mm)', 'δ_y (mm)', 'θ_z (mrad)']}
              rows={(summary.node_disp_table ?? []).map(n => [
                n.id, n.x_m, n.y_m,
                n.ux_mm.toFixed(3), n.uy_mm.toFixed(3), n.rz_mrad.toFixed(3),
              ])}
            />
          )}

          {/* ── Loads ── */}
          {tab === 'Laster' && (
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
          {tab === 'Reaktioner' && (
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

export default function GeneralFrameFemBlock({ block, onChange, blocks = [], onAddBlock, onAddBlocks }) {
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
  const [systemOpen, setSystemOpen] = useState(false)

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
        equal_dofs: equalDofs,
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

  // Equal-DOF constraints
  const equalDofs = d.equal_dofs ?? []
  function updateEqDof(i, v) { const a = [...equalDofs]; a[i] = v; update({ equal_dofs: a }) }
  function addEqDof()        { update({ equal_dofs: [...equalDofs, { r_node: 1, c_node: 2, dofs: [1, 2] }] }) }
  function removeEqDof(i)    { update({ equal_dofs: equalDofs.filter((_, j) => j !== i) }) }

  // Loads
  const loads = d.loads ?? []
  function updateLoad(i, v)  { const a = [...loads]; a[i] = v; update({ loads: a }) }
  function addLoad(type)      { update({ loads: [...loads,
    type === 'udl'
      ? { type: 'udl', target: 'elem', elem_id: elements[0]?.id ?? 1, direction: 'vertical', value_kNm: 10 }
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
        // Combination mode — expand any member_id loads to constituent elem_ids, then pass to backend
        combinations = loadCaseCombos.map(combo => ({
          ...combo,
          loads: expandMemberLoads(combo.loads, elements),
        }))
      } else {
        // Simple mode — resolve combo_udl, expand member UDL to per-element loads
        const resolved = loads.flatMap(ld => {
          if (ld.type === 'combo_udl') {
            const cb = comboBlocks.find(b => b.data.label === ld.combo_label) ?? comboBlocks[0]
            const w  = cb?.data?._exports?.E_d_uls ?? 0
            return [{ type: 'udl', elem_id: ld.elem_id ?? 1, wy_kNm: w, wx_kNm: 0 }]
          }
          if (ld.type === 'udl' && ld.target === 'member' && ld.member_id != null) {
            // Expand member group → one load per element in the group
            const memberElems = elements.filter(e => e.member_id === ld.member_id)
            if (memberElems.length === 0) return [ld]
            return memberElems.map(e => ({ ...ld, target: 'elem', elem_id: e.id, member_id: undefined }))
          }
          return [ld]
        })
        resolvedLoads = resolved
      }

      const res = await calcGeneralFrameFem({
        title:        d.title ?? '2D Frame FEM',
        nodes, elements, supports,
        loads:        resolvedLoads,
        combinations,
        equal_dofs:   equalDofs,
      })

      // Build _exports so capacity check blocks can read element forces.
      //
      // The design action is the worst value *along* the element, which the
      // backend now reports as N/V/M_max. Reading the end values instead
      // understates the moment on every member with a distributed load — on a
      // simply supported span the ends carry none at all. The fallbacks keep
      // results produced by an older backend readable.
      const worstM = e => e.M_max_kNm ?? Math.max(Math.abs(e.M_i_kNm), Math.abs(e.M_j_kNm))
      const worstV = e => e.V_max_kN  ?? Math.max(Math.abs(e.V_i_kN),  Math.abs(e.V_j_kN))
      const worstN = e => e.N_max_kN  ?? Math.max(Math.abs(e.N_i_kN),  Math.abs(e.N_j_kN))

      const eleTable        = res._summary?.ele_force_table ?? []
      const envelope        = res._summary?.envelope        ?? {}
      const timberEnvelope  = res._summary?.timber_envelope ?? {}

      // Member-level entries: worst-case forces across all sub-elements (id = 1000 + member_id)
      const memberIds = [...new Set(elements.filter(e => e.member_id != null).map(e => e.member_id))]
      const memberEntries = memberIds.map(mid => {
        const subElems = eleTable.filter(e => {
          const def = elements.find(el => el.id === e.id)
          return def?.member_id === mid
        })
        if (subElems.length === 0) return null
        const firstE = subElems[0]; const lastE = subElems[subElems.length - 1]
        const totalL = subElems.reduce((s, e) => s + e.L_m, 0)
        // For timber: find sub-element with worst M/k_mod ratio (SC2 as representative)
        // timber_envelope stores this per service class
        let bestTimberSC2 = { M_Ed_kNm: 0, V_Ed_kN: 0, duration: 'short', combo: '' }
        subElems.forEach(e => {
          const te = timberEnvelope[e.id]?.[2]  // SC2
          if (te && te.M_Ed_kNm > bestTimberSC2.M_Ed_kNm) bestTimberSC2 = te
        })
        const memberTimber = subElems.reduce((acc, e) => {
          ;[1, 2, 3].forEach(sc => {
            const te = timberEnvelope[e.id]?.[sc]
            if (!te) return
            const prev = acc[sc]
            if (!prev || te.M_Ed_kNm > prev.M_Ed_kNm) acc[sc] = te
          })
          return acc
        }, {})

        // M_duration: from M/k_mod governing (SC2), fallback to plain M envelope
        const bestMDuration = bestTimberSC2.duration ?? envelope[subElems[0]?.id]?.M_duration ?? 'short'

        return {
          id:             1000 + mid,
          member_id:      mid,
          label:          `Member ${mid}  (Elem ${subElems.map(e => e.id).join('+')}  ${firstE.ni}→${lastE.nj}  L=${totalL.toFixed(2)}m)`,
          // The section reference and the real length. Without them the check
          // generated from this member fell back to a steel IPE300 over a 1 m
          // span — printed, in a document about a C24 roof, as if it meant
          // something. The sub-elements of a member share one section.
          material:       firstE.material,
          section:        firstE.section,
          grade:          firstE.grade,
          L_m:            totalL,
          M_max_kNm:      Math.max(...subElems.map(worstM)),
          V_max_kN:       Math.max(...subElems.map(worstV)),
          N_max_kN:       Math.max(...subElems.map(worstN)),
          M_duration:     bestMDuration,
          timber:         memberTimber,   // {1: {M_Ed_kNm, V_Ed_kN, duration, combo}, 2: ..., 3: ...}
          M_i_kNm: firstE.M_i_kNm, V_i_kN: firstE.V_i_kN, N_i_kN: firstE.N_i_kN,
          M_j_kNm: lastE.M_j_kNm,  V_j_kN: lastE.V_j_kN,  N_j_kN: lastE.N_j_kN,
        }
      }).filter(Boolean)

      const exports_ = {
        elements: [
          ...memberEntries,
          ...eleTable.map(e => ({
            id:         e.id,
            label:      `Elem ${e.id}  (${e.ni}→${e.nj}, L=${e.L_m}m)`,
            material:   e.material,
            section:    e.section,
            grade:      e.grade,
            L_m:        e.L_m,
            M_max_kNm:  worstM(e),
            V_max_kN:   worstV(e),
            N_max_kN:   worstN(e),
            M_duration: envelope[e.id]?.M_duration ?? 'short',
            timber:     timberEnvelope[e.id] ?? {},
            M_i_kNm: e.M_i_kNm, V_i_kN: e.V_i_kN, N_i_kN: e.N_i_kN,
            M_j_kNm: e.M_j_kNm, V_j_kN: e.V_j_kN, N_j_kN: e.N_j_kN,
          })),
        ],
      }

      update({
        _figs_b64:        res._figs_b64,
        _summary:         res._summary,
        _result:          res._result,
        _exports:         exports_,
        _alpha_cr:        res._summary?.alpha_cr ?? null,
        _buckling_lengths:res._summary?.buckling_lengths   ?? {},
      })
    } catch (err) {
      setError(err.message)
      // Drop the previous run's results. Leaving them on screen next to an
      // error message is how a rejected model ends up quoted in a report.
      update({
        _figs_b64: null, _summary: null, _result: null,
        _exports: null, _alpha_cr: null, _buckling_lengths: {},
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={s.wrapper}>

      <input type="text" value={d.title ?? '2D Frame FEM'}
        onChange={e => update({ title: e.target.value })}
        placeholder="Analysetitel" style={s.titleInput} />

      {/* The way in for ordinary work: pick the system, give it its measures.
          The node and element lists below stay for everything else. */}
      <div style={s.systemRow}>
        <button style={s.systemBtn} onClick={() => setSystemOpen(true)}>
          ✦ Vælg statisk system
        </button>
        <span style={s.systemHint}>
          Bjælke · udkraget · kontinuerlig · portalramme · hanebåndsramme
        </span>
      </div>

      {/* Live geometry sketch — instant feedback while editing */}
      <ModelSketch nodes={nodes} elements={elements}
        supports={supports} equalDofs={equalDofs} />

      {systemOpen && (
        <FemSystemModal
          hasModel={nodes.length > 0 || elements.length > 0}
          onClose={() => setSystemOpen(false)}
          onInsert={(model, label) => {
            setSystemOpen(false)
            update({
              nodes: model.nodes, elements: model.elements,
              supports: model.supports, equal_dofs: model.equal_dofs,
              // Loads reference element ids, and the new model renumbers them —
              // keeping them would silently move a load onto another member.
              loads: [],
              title: (d.title && d.title !== '2D Frame FEM') ? d.title : label,
              _figs_b64: null, _summary: null, _result: null,
              _exports: null, _model_b64: null,
            })
          }}
        />
      )}

      {/* Nodes */}
      <div style={s.rowHeader}>
        <SectionLabel text="Knuder" />
        <button style={s.addBtn} onClick={addNode}>+ Knude</button>
      </div>
      {nodes.map((n, i) => (
        <NodeRow key={i} node={n} onChange={v => updateNode(i, v)} onRemove={() => removeNode(i)} />
      ))}

      {/* Elements */}
      <div style={s.rowHeader}>
        <SectionLabel text="Elementer" />
        <button style={s.addBtn} onClick={addElem}>+ Element</button>
      </div>
      {elements.map((el, i) => (
        <ElemRow key={i} elem={el} onChange={v => updateElem(i, v)} onRemove={() => removeElem(i)} />
      ))}

      {/* Supports */}
      <div style={s.rowHeader}>
        <SectionLabel text="Understøtninger" />
        <button style={s.addBtn} onClick={addSup}>+ Understøtning</button>
      </div>
      {supports.map((sup, i) => (
        <SupportRow key={i} sup={sup} onChange={v => updateSup(i, v)} onRemove={() => removeSup(i)} />
      ))}

      {/* Equal-DOF (pin joints) */}
      <div style={s.rowHeader}>
        <SectionLabel text="Charnierer (equalDOF)" />
        <button style={s.addBtn} onClick={addEqDof}>+ Charnier</button>
      </div>
      {equalDofs.map((eq, i) => (
        <EqualDOFRow key={i} eq={eq}
          onChange={v => updateEqDof(i, v)}
          onRemove={() => removeEqDof(i)} />
      ))}

      {/* Load mode selector */}
      <div style={s.rowHeader}>
        <SectionLabel text="Laster" />
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {[['simple', 'Simpel'], ['load_cases', 'Lastkombinationer']].map(([v, l]) => (
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
              Ingen lastkombinations-blok i dokumentet — tilføj en "Frame Load Cases"-blok først.
            </span>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={s.fieldWrap}>
                <label style={s.miniLabel}>Lastkombinationsblok</label>
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
                    ✓ {loadCaseCombos.length} kombinationer klar — FEM kører alle og danner envelope
                  </span>
                : <span style={{ fontSize: 12, color: '#e67e22' }}>
                    ① Kør lastkombinations-blokken ovenfor først — derefter aktiveres "Kør FEM"
                  </span>
              }
            </div>
          )}
        </div>
      )}

      {/* Simple loads list */}
      {loadMode === 'simple' && (<>
        <div style={s.rowHeader}>
          <button style={s.addBtn} onClick={() => addLoad('nodal')}>+ Punktlast</button>
          <button style={s.addBtn} onClick={() => addLoad('udl')}>+ Linjelast</button>
          <button style={s.addBtn} onClick={() => addLoad('combo_udl')}>+ Kombi-linjelast</button>
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
          title={loadMode === 'load_cases' && !loadCasesReady ? 'Kør lastkombinations-blokken først' : 'Ctrl+Enter'}>
          {running ? '⏳  Beregner…' : '▶  Kør FEM'}
        </button>
        <button style={s.btn} onClick={handlePreview} disabled={running || previewing}
          title="Generér modelfigur til rapporten (matplotlib)">
          {previewing ? '⏳ …' : '🔍  Modelfigur'}
        </button>
        {d._summary && (
          <button style={s.btn}
            onClick={() => update({ _figs_b64: null, _summary: null, _result: null, _model_b64: null })}>
            ✕  Ryd
          </button>
        )}
      </div>

      {error && <div style={s.error}>{error}</div>}

      {/* Static model preview */}
      {d._model_b64 && !d._summary && (
        <div style={s.resultPanel}>
          <div style={{ ...s.summaryBar, cursor: 'default' }}>
            <span style={s.summaryBadge}>Statisk model</span>
          </div>
          <div style={{ padding: '12px 14px' }}>
            <img src={`data:image/png;base64,${d._model_b64}`}
              alt="Statisk model" style={{ width: '100%', display: 'block' }} />
          </div>
        </div>
      )}

      {d._summary && d._figs_b64 && (
        <ResultPanel
          figs={d._figs_b64}
          summary={{ ...d._summary, _exports: d._exports }}
          onAddBlock={onAddBlock}
          onAddBlocks={onAddBlocks}
          blockId={block.id}
          title={d.title}
          elements={elements}
        />
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
  sketchWrap:   { border: '1px solid #e8e8e8', background: '#fcfcfb', padding: '8px 10px 6px' },
  sketchLabel:  { fontSize: 9, fontWeight: 700, color: '#bbb', letterSpacing: '0.1em',
                  textTransform: 'uppercase', marginBottom: 4 },
  sketchLegend: { fontSize: 10, color: '#94a3b8', marginTop: 4, fontFamily: 'monospace' },
  sketchEmpty:  { border: '1px dashed #e0e0e0', background: '#fcfcfb', padding: '18px 12px',
                  fontSize: 12, color: '#bbb', textAlign: 'center' },
  systemRow:    { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' },
  systemBtn:    { background: '#fffaf8', color: '#d94a2b', border: '1px solid #f3c9bd',
                  padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit', letterSpacing: '0.02em' },
  systemHint:   { fontSize: 10.5, color: '#b8b8bd' },
  btn:          { background: '#f5f5f7', border: '1px solid #e8e8e8', padding: '7px 14px',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  letterSpacing: '0.04em' },
  btnRun:       { background: '#111', color: '#fff', border: '1px solid #111' },
  dirHint:      { fontSize: 10, color: '#8a8a8e', alignSelf: 'flex-end',
                  paddingBottom: 6, whiteSpace: 'nowrap' },
  // whiteSpace: model-validation errors are a bulleted list, one fault per line
  error:        { background: '#fdf3f2', border: '1px solid #f5c6c6',
                  borderLeft: '3px solid #c0392b', padding: '10px 14px',
                  fontSize: 12, color: '#c0392b', lineHeight: 1.6,
                  whiteSpace: 'pre-line' },
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
