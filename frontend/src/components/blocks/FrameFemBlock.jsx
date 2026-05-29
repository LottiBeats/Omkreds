/**
 * FrameFemBlock.jsx — 2D Frame / Truss FEM analysis (OpenSeesPy)
 *
 * Define a 2D structural model with:
 *   • Nodes          (x, y coordinates in metres)
 *   • Elements       (beam or truss, with E / A / I — or pick a section preset)
 *   • Supports       (pin, roller, fixed — or custom DOF combination)
 *   • Loads          (nodal forces / moments, or UDL on an element)
 *
 * Results: matplotlib figure (model · deformed shape · N · V · M diagrams)
 *          + reaction table + element force table
 */
import React, { useState } from 'react'
import { calcFrameFem } from '../../api/client.js'
import FrameFemResults from './FrameFemResults.jsx'

// ── Section presets ───────────────────────────────────────────────────────────
const SECTION_PRESETS = {
  '— Custom —':          null,
  // Steel IPE
  'IPE 100 (S235)':      { E_GPa: 210, A_cm2: 10.3,  I_cm4: 171    },
  'IPE 160 (S235)':      { E_GPa: 210, A_cm2: 20.1,  I_cm4: 869    },
  'IPE 200 (S235)':      { E_GPa: 210, A_cm2: 28.5,  I_cm4: 1943   },
  'IPE 240 (S235)':      { E_GPa: 210, A_cm2: 39.1,  I_cm4: 3892   },
  'IPE 270 (S235)':      { E_GPa: 210, A_cm2: 45.9,  I_cm4: 5790   },
  'IPE 300 (S235)':      { E_GPa: 210, A_cm2: 53.8,  I_cm4: 8356   },
  'IPE 360 (S355)':      { E_GPa: 210, A_cm2: 72.7,  I_cm4: 16270  },
  'IPE 400 (S355)':      { E_GPa: 210, A_cm2: 84.5,  I_cm4: 23130  },
  'IPE 500 (S355)':      { E_GPa: 210, A_cm2: 116,   I_cm4: 48200  },
  // Steel HEB
  'HEB 200 (S355)':      { E_GPa: 210, A_cm2: 78.1,  I_cm4: 5696   },
  'HEB 300 (S355)':      { E_GPa: 210, A_cm2: 149,   I_cm4: 25170  },
  // Timber beams (EN 338 C24)
  'C24  90×220 mm':      { E_GPa: 11.0, A_cm2: 198,  I_cm4: 7986   },
  'C24  140×240 mm':     { E_GPa: 11.0, A_cm2: 336,  I_cm4: 16128  },
  'C24  140×360 mm':     { E_GPa: 11.0, A_cm2: 504,  I_cm4: 54432  },
  // GL24h glulam
  'GL24h 90×360 mm':     { E_GPa: 11.5, A_cm2: 324,  I_cm4: 34992  },
  'GL24h 140×400 mm':    { E_GPa: 11.5, A_cm2: 560,  I_cm4: 74667  },
}

// ── Support presets ───────────────────────────────────────────────────────────
const SUPPORT_PRESETS = {
  'Pin (ux+uy)':    { ux: true,  uy: true,  rz: false },
  'Roller (uy)':    { ux: false, uy: true,  rz: false },
  'Fixed (all)':    { ux: true,  uy: true,  rz: true  },
  'Roller-x (ux)':  { ux: true,  uy: false, rz: false },
  'Custom':         null,
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-row components
// ─────────────────────────────────────────────────────────────────────────────

function NodeRow({ node, nodes, onChange, onRemove }) {
  return (
    <div style={s.row}>
      <span style={s.rowId}>N{node.id}</span>
      <LabelledInput label="x (m)" width={72}>
        <input style={s.inp} type="number" step="0.1"
          value={node.x} onChange={e => onChange({ ...node, x: parseFloat(e.target.value) || 0 })} />
      </LabelledInput>
      <LabelledInput label="y (m)" width={72}>
        <input style={s.inp} type="number" step="0.1"
          value={node.y} onChange={e => onChange({ ...node, y: parseFloat(e.target.value) || 0 })} />
      </LabelledInput>
      <button style={s.rmBtn} onClick={onRemove} title="Remove node">✕</button>
    </div>
  )
}

function ElemRow({ elem, nodes, onChange, onRemove }) {
  const nodeIds = nodes.map(n => n.id)

  function applyPreset(name) {
    const p = SECTION_PRESETS[name]
    if (!p) return
    onChange({ ...elem, preset: name, E_GPa: p.E_GPa, A_cm2: p.A_cm2, I_cm4: p.I_cm4 })
  }

  return (
    <div style={{ ...s.row, flexWrap: 'wrap', gap: 6 }}>
      <span style={s.rowId}>E{elem.id}</span>

      <LabelledInput label="Type" width={72}>
        <select style={s.inp} value={elem.type ?? 'beam'}
          onChange={e => onChange({ ...elem, type: e.target.value })}>
          <option value="beam">Beam</option>
          <option value="truss">Truss</option>
        </select>
      </LabelledInput>

      {(elem.type ?? 'beam') === 'beam' && (
        <LabelledInput label="Releases" width={100}>
          <select style={s.inp} value={elem.releases ?? 'none'}
            onChange={e => onChange({ ...elem, releases: e.target.value })}>
            <option value="none">Rigid</option>
            <option value="both">Pin–Pin</option>
            <option value="start">Pin–Rigid</option>
            <option value="end">Rigid–Pin</option>
          </select>
        </LabelledInput>
      )}

      <LabelledInput label="From" width={60}>
        <select style={s.inp} value={elem.ni}
          onChange={e => onChange({ ...elem, ni: Number(e.target.value) })}>
          {nodeIds.map(nid => <option key={nid} value={nid}>{nid}</option>)}
        </select>
      </LabelledInput>

      <LabelledInput label="To" width={60}>
        <select style={s.inp} value={elem.nj}
          onChange={e => onChange({ ...elem, nj: Number(e.target.value) })}>
          {nodeIds.map(nid => <option key={nid} value={nid}>{nid}</option>)}
        </select>
      </LabelledInput>

      <LabelledInput label="Preset" width={160}>
        <select style={{ ...s.inp, width: '100%' }}
          value={elem.preset ?? '— Custom —'}
          onChange={e => applyPreset(e.target.value)}>
          {Object.keys(SECTION_PRESETS).map(k => <option key={k}>{k}</option>)}
        </select>
      </LabelledInput>

      <LabelledInput label="E (GPa)" width={72}>
        <input style={s.inp} type="number" step="1"
          value={elem.E_GPa ?? 210}
          onChange={e => onChange({ ...elem, preset: '— Custom —', E_GPa: parseFloat(e.target.value) || 0 })} />
      </LabelledInput>

      <LabelledInput label="A (cm²)" width={80}>
        <input style={s.inp} type="number" step="0.1"
          value={elem.A_cm2 ?? 28.5}
          onChange={e => onChange({ ...elem, preset: '— Custom —', A_cm2: parseFloat(e.target.value) || 0 })} />
      </LabelledInput>

      {(elem.type ?? 'beam') === 'beam' && (
        <LabelledInput label="I (cm⁴)" width={88}>
          <input style={s.inp} type="number" step="1"
            value={elem.I_cm4 ?? 1943}
            onChange={e => onChange({ ...elem, preset: '— Custom —', I_cm4: parseFloat(e.target.value) || 0 })} />
        </LabelledInput>
      )}

      <button style={{ ...s.rmBtn, alignSelf: 'flex-end', marginBottom: 1 }}
        onClick={onRemove} title="Remove element">✕</button>
    </div>
  )
}

function SupportRow({ sup, nodes, onChange, onRemove }) {
  const nodeIds = nodes.map(n => n.id)

  function detectPreset(sup) {
    for (const [name, p] of Object.entries(SUPPORT_PRESETS)) {
      if (!p) continue
      if (p.ux === sup.ux && p.uy === sup.uy && p.rz === sup.rz) return name
    }
    return 'Custom'
  }

  function applyPreset(name) {
    const p = SUPPORT_PRESETS[name]
    if (!p) return
    onChange({ ...sup, ux: p.ux, uy: p.uy, rz: p.rz })
  }

  return (
    <div style={s.row}>
      <LabelledInput label="Node" width={60}>
        <select style={s.inp} value={sup.node_id}
          onChange={e => onChange({ ...sup, node_id: Number(e.target.value) })}>
          {nodeIds.map(nid => <option key={nid} value={nid}>{nid}</option>)}
        </select>
      </LabelledInput>

      <LabelledInput label="Type" width={130}>
        <select style={{ ...s.inp, width: '100%' }}
          value={detectPreset(sup)}
          onChange={e => applyPreset(e.target.value)}>
          {Object.keys(SUPPORT_PRESETS).map(k => <option key={k}>{k}</option>)}
        </select>
      </LabelledInput>

      {/* Manual DOF toggles */}
      {['ux', 'uy', 'rz'].map(dof => (
        <label key={dof} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
          <input type="checkbox" checked={sup[dof] ?? false}
            onChange={e => onChange({ ...sup, [dof]: e.target.checked })} />
          {dof}
        </label>
      ))}

      <button style={s.rmBtn} onClick={onRemove} title="Remove support">✕</button>
    </div>
  )
}

function LoadRow({ load, nodes, elements, onChange, onRemove }) {
  const ltype    = load.type ?? 'nodal'
  const nodeIds  = nodes.map(n => n.id)
  const elemIds  = elements.map(e => e.id)
  // UDL is only valid on beam elements (not truss — OpenSeesPy doesn't support eleLoad on Truss)
  const beamElems = elements.filter(e => (e.type ?? 'beam') === 'beam')
  const beamIds   = beamElems.map(e => e.id)

  // Auto-heal null ids — happens when a load was switched type or saved before an id was set
  React.useEffect(() => {
    if (ltype === 'udl'   && load.elem_id == null && beamIds[0] != null)
      onChange({ ...load, elem_id: beamIds[0] })
    if (ltype === 'nodal' && load.node_id == null && nodeIds[0] != null)
      onChange({ ...load, node_id: nodeIds[0] })
  }, [ltype, load.elem_id, load.node_id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ ...s.row, flexWrap: 'wrap', gap: 6 }}>
      <LabelledInput label="Type" width={80}>
        <select style={s.inp} value={ltype}
          onChange={e => {
            const t = e.target.value
            // Ensure the id field is always populated when switching type
            if (t === 'udl' && (load.elem_id == null) && beamIds.length > 0)
              return onChange({ ...load, type: t, elem_id: beamIds[0] })
            if (t === 'nodal' && (load.node_id == null) && nodeIds.length > 0)
              return onChange({ ...load, type: t, node_id: nodeIds[0] })
            onChange({ ...load, type: t })
          }}>
          <option value="nodal">Nodal</option>
          <option value="udl">UDL</option>
        </select>
      </LabelledInput>

      {ltype === 'nodal' && <>
        <LabelledInput label="Node" width={60}>
          <select style={s.inp} value={load.node_id ?? nodeIds[0]}
            onChange={e => onChange({ ...load, node_id: Number(e.target.value) })}>
            {nodeIds.map(nid => <option key={nid} value={nid}>{nid}</option>)}
          </select>
        </LabelledInput>
        <LabelledInput label="Fx (kN)" width={80}>
          <input style={s.inp} type="number" step="1"
            value={load.Fx_kN ?? 0}
            onChange={e => onChange({ ...load, Fx_kN: parseFloat(e.target.value) || 0 })} />
        </LabelledInput>
        <LabelledInput label="Fy (kN)" hint="↑ pos" width={80}>
          <input style={s.inp} type="number" step="1"
            value={load.Fy_kN ?? 0}
            onChange={e => onChange({ ...load, Fy_kN: parseFloat(e.target.value) || 0 })} />
        </LabelledInput>
        <LabelledInput label="Mz (kNm)" hint="↺ pos" width={88}>
          <input style={s.inp} type="number" step="1"
            value={load.Mz_kNm ?? 0}
            onChange={e => onChange({ ...load, Mz_kNm: parseFloat(e.target.value) || 0 })} />
        </LabelledInput>
      </>}

      {ltype === 'udl' && <>
        <LabelledInput label="Beam elem." width={80}>
          <select style={s.inp}
            value={load.elem_id != null && beamIds.includes(load.elem_id) ? load.elem_id : (beamIds[0] ?? '')}
            onChange={e => onChange({ ...load, elem_id: Number(e.target.value) })}>
            {beamElems.map(el => <option key={el.id} value={el.id}>E{el.id} ({el.preset ?? 'custom'})</option>)}
          </select>
        </LabelledInput>
        <LabelledInput label="wy (kN/m)" hint="↓ pos" width={88}>
          <input style={s.inp} type="number" step="0.5"
            value={load.wy_kNm ?? 10}
            onChange={e => onChange({ ...load, wy_kNm: parseFloat(e.target.value) || 0 })} />
        </LabelledInput>
        <LabelledInput label="wx (kN/m)" hint="→ pos" width={88}>
          <input style={s.inp} type="number" step="0.5"
            value={load.wx_kNm ?? 0}
            onChange={e => onChange({ ...load, wx_kNm: parseFloat(e.target.value) || 0 })} />
        </LabelledInput>
      </>}

      <button style={{ ...s.rmBtn, alignSelf: 'flex-end', marginBottom: 1 }}
        onClick={onRemove} title="Remove load">✕</button>
    </div>
  )
}

// Small labelled wrapper
function LabelledInput({ label, hint, width, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: '#888', letterSpacing: '0.03em' }}>
        {label}{hint && <span style={{ color: '#bbb', fontWeight: 400 }}> {hint}</span>}
      </span>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Result panels
// ─────────────────────────────────────────────────────────────────────────────

function ResultPanel({ result }) {
  const [open, setOpen] = useState(true)
  const sum = result.summary ?? {}

  return (
    <div style={s.resultPanel}>
      {/* Summary bar */}
      <button style={s.summaryBar} onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: 11, color: '#666', flex: 1 }}>
          max M = <strong>{sum.max_M_kNm?.toFixed(2)} kNm</strong>
          &ensp;·&ensp;
          max V = <strong>{sum.max_V_kN?.toFixed(2)} kN</strong>
          &ensp;·&ensp;
          max N = <strong>{sum.max_N_kN?.toFixed(2)} kN</strong>
          &ensp;·&ensp;
          max δ = <strong>{sum.max_disp_mm?.toFixed(3)} mm</strong>
        </span>
        <span style={{ fontSize: 9, color: '#aaa' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '10px 12px' }}>
          {/* Figure */}
          {result.fig_b64 && (
            <img
              src={`data:image/png;base64,${result.fig_b64}`}
              alt="Frame FEM results"
              style={{ width: '100%', display: 'block', marginBottom: 12 }}
            />
          )}

          {/* Reactions table */}
          {result.reactions?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={s.tblTitle}>Reactions</div>
              <table style={s.tbl}>
                <thead>
                  <tr>
                    {['Node', 'Rx (kN)', 'Ry (kN)', 'Mz (kNm)'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.reactions.map(r => (
                    <tr key={r.node_id}>
                      <td style={s.td}>N{r.node_id}</td>
                      <td style={s.td}>{r.Rx_kN?.toFixed(3)}</td>
                      <td style={s.td}>{r.Ry_kN?.toFixed(3)}</td>
                      <td style={s.td}>{r.Mz_kNm?.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Element forces table */}
          {result.element_results?.length > 0 && (
            <div>
              <div style={s.tblTitle}>Element forces  (at start / end / max)</div>
              <table style={s.tbl}>
                <thead>
                  <tr>
                    {['Elem', 'Type', 'N start', 'N end', 'V start', 'V end', 'M start', 'M end', '|M| max'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.element_results.map(er => (
                    <tr key={er.elem_id}>
                      <td style={s.td}>E{er.elem_id}</td>
                      <td style={s.td}>{er.type}</td>
                      <td style={s.td}>{er.N_start_kN?.toFixed(2)}</td>
                      <td style={s.td}>{er.N_end_kN?.toFixed(2)}</td>
                      <td style={s.td}>{er.V_start_kN?.toFixed(2)}</td>
                      <td style={s.td}>{er.V_end_kN?.toFixed(2)}</td>
                      <td style={s.td}>{er.M_start_kNm?.toFixed(2)}</td>
                      <td style={s.td}>{er.M_end_kNm?.toFixed(2)}</td>
                      <td style={{ ...s.td, fontWeight: 700 }}>{er.M_max_kNm?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main block
// ─────────────────────────────────────────────────────────────────────────────

export default function FrameFemBlock({ block, onChange }) {
  const d = block.data
  const [running, setRunning] = useState(false)
  const [error,   setError]   = useState(null)

  function update(changes) {
    onChange({ ...block, data: { ...d, ...changes } })
  }

  // ── Helpers for list mutation ─────────────────────────────────────────────

  const nodes    = d.nodes    ?? _defaultNodes()
  const elements = d.elements ?? _defaultElements(nodes)
  const supports = d.supports ?? _defaultSupports(nodes)
  const loads    = d.loads    ?? _defaultLoads(elements)

  function nextNodeId()    { return Math.max(0, ...nodes.map(n => n.id))    + 1 }
  function nextElemId()    { return Math.max(0, ...elements.map(e => e.id)) + 1 }

  function updateNode(i, n)   { const a = [...nodes];    a[i] = n;   update({ nodes: a }) }
  function removeNode(i)      { update({ nodes: nodes.filter((_, j) => j !== i) }) }
  function addNode()          {
    const last = nodes[nodes.length - 1] ?? { x: 0, y: 0 }
    update({ nodes: [...nodes, { id: nextNodeId(), x: last.x + 1.0, y: last.y }] })
  }

  function updateElem(i, e)   { const a = [...elements]; a[i] = e;   update({ elements: a }) }
  function removeElem(i)      { update({ elements: elements.filter((_, j) => j !== i) }) }
  function addElem()          {
    const ni = nodes[nodes.length - 2]?.id ?? 1
    const nj = nodes[nodes.length - 1]?.id ?? 2
    update({ elements: [...elements, {
      id: nextElemId(), ni, nj, type: 'beam',
      E_GPa: 210, A_cm2: 28.5, I_cm4: 1943, preset: 'IPE 200 (S235)',
    }]})
  }

  function updateSup(i, s)    { const a = [...supports]; a[i] = s;   update({ supports: a }) }
  function removeSup(i)       { update({ supports: supports.filter((_, j) => j !== i) }) }
  function addSupport()       {
    const nid = nodes[0]?.id ?? 1
    update({ supports: [...supports, { node_id: nid, ux: true, uy: true, rz: false }] })
  }

  function updateLoad(i, ld)  { const a = [...loads]; a[i] = ld;     update({ loads: a }) }
  function removeLoad(i)      { update({ loads: loads.filter((_, j) => j !== i) }) }
  function addLoad(type = 'nodal') {
    if (type === 'udl') {
      const firstBeam = elements.find(e => (e.type ?? 'beam') === 'beam')
      update({ loads: [...loads, { type: 'udl', elem_id: firstBeam?.id ?? null, wy_kNm: 10, wx_kNm: 0 }] })
    } else {
      update({ loads: [...loads, { type: 'nodal', node_id: nodes[0]?.id ?? 1, Fx_kN: 0, Fy_kN: -10, Mz_kNm: 0 }] })
    }
  }

  // ── Run ───────────────────────────────────────────────────────────────────

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const res = await calcFrameFem({
        title:    d.title ?? '2D Frame Analysis',
        nodes,
        elements: elements.map(({ preset, ...rest }) => rest),   // strip UI-only field
        supports,
        loads,
      })
      // Keep xs/N_arr/V_arr/M_arr for SVG diagrams; drop fig_b64 (matplotlib PNG)
      // so the stored document stays within the nginx body limit.
      const { fig_b64: _dropped, ...lean } = res
      update({ _result: lean })
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={s.wrapper}>

      {/* Title */}
      <input type="text" value={d.title ?? '2D Frame Analysis'}
        onChange={e => update({ title: e.target.value })}
        placeholder="Analysis title"
        style={s.titleInput} />

      {/* ── Nodes ── */}
      <SectionHeader label="Nodes" count={nodes.length} />
      {nodes.map((node, i) => (
        <NodeRow key={node.id} node={node} nodes={nodes}
          onChange={n => updateNode(i, n)}
          onRemove={() => removeNode(i)} />
      ))}
      <button style={s.addBtn} onClick={addNode}>+ Add node</button>

      {/* ── Elements ── */}
      <SectionHeader label="Elements" count={elements.length} />
      {elements.map((elem, i) => (
        <ElemRow key={elem.id} elem={elem} nodes={nodes}
          onChange={e => updateElem(i, e)}
          onRemove={() => removeElem(i)} />
      ))}
      <button style={s.addBtn} onClick={addElem}>+ Add element</button>

      {/* ── Supports ── */}
      <SectionHeader label="Supports" count={supports.length} />
      {supports.map((sup, i) => (
        <SupportRow key={i} sup={sup} nodes={nodes}
          onChange={s => updateSup(i, s)}
          onRemove={() => removeSup(i)} />
      ))}
      <button style={s.addBtn} onClick={addSupport}>+ Add support</button>

      {/* ── Loads ── */}
      <SectionHeader label="Loads" count={loads.length} />
      {loads.map((ld, i) => (
        <LoadRow key={i} load={ld} nodes={nodes} elements={elements}
          onChange={l => updateLoad(i, l)}
          onRemove={() => removeLoad(i)} />
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={s.addBtn} onClick={() => addLoad('nodal')}>+ Nodal load</button>
        <button style={s.addBtn} onClick={() => addLoad('udl')}>+ UDL</button>
      </div>

      {/* ── Actions ── */}
      <div style={s.actionRow}>
        <button
          style={{ ...s.btn, ...s.btnRun }}
          onClick={handleRun}
          disabled={running || nodes.length < 2 || elements.length < 1}
        >
          {running ? '⏳  Analysing…' : '▶  Run analysis'}
        </button>
        {d._result && (
          <button style={s.btn} onClick={() => update({ _result: null })}>
            ✕  Clear
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={s.error}>
          <span style={{ flexShrink: 0, fontWeight: 700 }}>⚠</span>
          {error}
        </div>
      )}

      {/* Results */}
      {d._result && (
        <FrameFemResults
          result={d._result}
          nodes={nodes}
          elements={elements}
          supports={supports}
          loads={loads}
        />
      )}

    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

function _defaultNodes() {
  return [
    { id: 1, x: 0.0, y: 0.0 },
    { id: 2, x: 5.0, y: 0.0 },
  ]
}
function _defaultElements(nodes) {
  const ni = nodes[0]?.id ?? 1
  const nj = nodes[1]?.id ?? 2
  return [
    { id: 1, ni, nj, type: 'beam', E_GPa: 210, A_cm2: 53.8, I_cm4: 8356, preset: 'IPE 300 (S235)' },
  ]
}
function _defaultSupports(nodes) {
  return [
    { node_id: nodes[0]?.id ?? 1, ux: true,  uy: true,  rz: false },
    { node_id: nodes[1]?.id ?? 2, ux: false, uy: true,  rz: false },
  ]
}
function _defaultLoads(elements) {
  return [
    { type: 'udl', elem_id: elements[0]?.id ?? 1, wy_kNm: 10.0, wx_kNm: 0.0 },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ label, count }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginTop: 10, marginBottom: 2,
    }}>
      <span style={s.sectionLabel}>{label}</span>
      <span style={{ fontSize: 10, color: '#bbb' }}>{count}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const s = {
  wrapper: {
    display:       'flex',
    flexDirection: 'column',
    gap:           6,
  },
  titleInput: {
    border:     '1px solid #e8e8e8',
    padding:    '6px 10px',
    fontSize:   13,
    fontWeight: 600,
    outline:    'none',
    fontFamily: 'inherit',
    width:      '100%',
    boxSizing:  'border-box',
  },
  sectionLabel: {
    fontSize:      10,
    fontWeight:    700,
    color:         '#aaa',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  row: {
    display:      'flex',
    alignItems:   'flex-end',
    gap:          6,
    background:   '#fafafa',
    border:       '1px solid #f0f0f0',
    padding:      '7px 9px',
    borderRadius: 2,
    flexWrap:     'nowrap',
  },
  rowId: {
    fontSize:    10,
    fontWeight:  700,
    color:       '#bbb',
    fontFamily:  'monospace',
    minWidth:    22,
    paddingBottom: 3,
  },
  inp: {
    border:     '1px solid #e0e0e0',
    padding:    '4px 6px',
    fontSize:   12,
    fontFamily: 'inherit',
    outline:    'none',
    width:      '100%',
    boxSizing:  'border-box',
    background: '#fff',
  },
  rmBtn: {
    background: 'none',
    border:     'none',
    color:      '#ccc',
    cursor:     'pointer',
    fontSize:   13,
    padding:    '4px 4px',
    lineHeight: 1,
    alignSelf:  'flex-start',
    marginTop:  14,
  },
  addBtn: {
    background:    '#f5f5f7',
    border:        '1px solid #e8e8e8',
    padding:       '4px 10px',
    fontSize:      11,
    fontWeight:    600,
    cursor:        'pointer',
    fontFamily:    'inherit',
    letterSpacing: '0.04em',
    color:         '#555',
    alignSelf:     'flex-start',
  },
  actionRow: {
    display:   'flex',
    gap:       8,
    marginTop: 6,
  },
  btn: {
    background:    '#f5f5f7',
    border:        '1px solid #e8e8e8',
    padding:       '7px 14px',
    fontSize:      12,
    fontWeight:    600,
    cursor:        'pointer',
    fontFamily:    'inherit',
    letterSpacing: '0.04em',
    color:         '#475569',
  },
  btnRun: {
    background: '#1e3a5f',
    color:      '#fff',
    border:     '1px solid #1e3a5f',
  },
  error: {
    background:  '#fdf3f2',
    border:      '1px solid #f5c6c6',
    padding:     '8px 12px',
    fontSize:    12,
    color:       '#c0392b',
    display:     'flex',
    gap:         8,
    alignItems:  'flex-start',
  },
  resultPanel: {
    border:    '1px solid #e8e8e8',
    marginTop: 4,
  },
  summaryBar: {
    display:      'flex',
    alignItems:   'center',
    gap:          8,
    width:        '100%',
    background:   '#f5f5f7',
    border:       'none',
    borderBottom: '1px solid #e8e8e8',
    padding:      '7px 12px',
    cursor:       'pointer',
    fontFamily:   'inherit',
    textAlign:    'left',
  },
  tblTitle: {
    fontSize:      10,
    fontWeight:    700,
    color:         '#aaa',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    marginBottom:  4,
  },
  tbl: {
    width:          '100%',
    borderCollapse: 'collapse',
    fontSize:       11,
    fontFamily:     'monospace',
    marginBottom:   6,
  },
  th: {
    textAlign:    'left',
    fontWeight:   600,
    color:        '#555',
    padding:      '4px 8px',
    borderBottom: '2px solid #e8e8e8',
    background:   '#fafafa',
    fontSize:     10,
  },
  td: {
    padding:      '3px 8px',
    borderBottom: '1px solid #f0f0f0',
    color:        '#333',
    fontSize:     11,
  },
}
