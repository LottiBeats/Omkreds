/**
 * FemWorkspace.jsx — the frame model as a workspace, in the manner of RFEM and
 * FEM-Design: navigator on the left, the model in the middle, properties on
 * the right and editable tables underneath.
 *
 * It edits the FEM block's own data (see femModel.js for the shape) and runs
 * the block's own calculation, so a model drawn here is the same model the
 * block, the checks and the report already understand — and every existing
 * model opens here as it is.
 *
 * Tools (keyboard in brackets):
 *   Vælg (V)          select, shift-click to add; drag a node to move it
 *   Knude (N)         click to place a node; on a member it splits the member
 *   Stang (S)         click node to node; the chain continues until Esc
 *   Understøtning (U) click a node to cycle fast charnier → rulle → indspændt → vandret rulle → ingen
 *   Charnier (C)      click a node for a hinge there, or near a member end for that end only
 *   Last (L)          click a member for a line load, a node for a point load, in the active load case
 * Also: Delete removes the selection, F fits the view, wheel zooms, middle
 * mouse or space+drag pans, Ctrl+Z undoes (the document's own undo).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Dialog } from '../../ui/index.js'
import {
  pick, addNode, addElement, splitElement, projectOnElement, toggleRelease,
  toggleNodeHinge, hasNodeHinge, cycleSupport, setSupport, supportType, SUPPORT_TYPES,
  deleteSelection, updateNode, updateElements, elementLength, bounds, round,
} from './femModel.js'
import { GENERATORS } from './femGenerators.js'
import { resultStates, sampleElement, envelopeSamples } from './femDiagrams.js'
import './fem.css'

// ── Vocabulary ────────────────────────────────────────────────────────────────

const TOOLS = [
  { key: 'select',  label: 'Vælg',         kbd: 'V' },
  { key: 'node',    label: 'Knude',        kbd: 'N' },
  { key: 'member',  label: 'Stang',        kbd: 'S' },
  { key: 'support', label: 'Understøtning', kbd: 'U' },
  { key: 'hinge',   label: 'Charnier',     kbd: 'C' },
  { key: 'load',    label: 'Last',         kbd: 'L' },
]

const TOOL_HINT = {
  select:  'Klik for at vælge · Shift+klik for flere · træk en knude for at flytte den',
  node:    'Klik for at sætte en knude · på en stang deles stangen',
  member:  'Klik fra knude til knude · Esc afslutter kæden',
  support: 'Klik på en knude: fast charnier → rulle → indspændt → vandret rulle → ingen',
  hinge:   'Klik på en knude for charnier dér · klik tæt på en stangende for kun den ende',
  load:    'Klik på en stang for linjelast, på en knude for punktlast — i det aktive lasttilfælde',
}

const MATERIALS = [
  { key: 'timber', label: 'Træ', grades: ['C18', 'C24', 'C30', 'GL24c', 'GL24h', 'GL28c', 'GL28h', 'GL30c'], def: '45x195', grade: 'C24' },
  { key: 'steel',  label: 'Stål', grades: ['S235', 'S275', 'S355', 'S420'], def: 'IPE300', grade: 'S355' },
]
const STEEL_SECTIONS = [
  'IPE160', 'IPE180', 'IPE200', 'IPE220', 'IPE240', 'IPE270', 'IPE300', 'IPE330', 'IPE360', 'IPE400', 'IPE450', 'IPE500',
  'HEA160', 'HEA180', 'HEA200', 'HEA220', 'HEA240', 'HEA260', 'HEA300', 'HEB160', 'HEB200', 'HEB240', 'HEB300',
]

const KATEGORIER = [
  { value: 'permanent', label: 'G  Permanent' },
  { value: 'imposed',   label: 'Q  Nyttelast' },
  { value: 'snow',      label: 'S  Sne' },
  { value: 'wind',      label: 'W  Vind' },
]

const DIRECTIONS = [
  { value: 'vertical',      label: 'Lodret ↓',                hint: '+ nedad, pr. m stang' },
  { value: 'projected',     label: 'Lodret, projiceret ↓',    hint: '+ nedad, pr. m vandret (sne)' },
  { value: 'perpendicular', label: 'Vinkelret på stangen',     hint: '+ trykker ind på fladen (vind)' },
  { value: 'horizontal',    label: 'Vandret →',               hint: '+ mod højre' },
]

const MAT_COLOR = { timber: '#9a5b1e', steel: '#3b5b7a' }
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—')
const num = (s) => {
  const v = parseFloat(String(s).replace(',', '.'))
  return Number.isFinite(v) ? v : null
}
function etaColor(eta) { return eta > 1 ? '#b91c1c' : eta > 0.9 ? '#d97706' : '#15803d' }

// ── Small inputs ──────────────────────────────────────────────────────────────

/** A number field that commits on blur/Enter, so "4," or "-" can be typed. */
function Num({ value, onCommit, unit, width, title }) {
  const [txt, setTxt] = useState(value == null ? '' : String(value).replace('.', ','))
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setTxt(value == null ? '' : String(value).replace('.', ',')) }, [value])
  const commit = () => {
    focused.current = false
    const v = num(txt)
    if (v === null) setTxt(value == null ? '' : String(value).replace('.', ','))
    else if (v !== value) onCommit(v)
  }
  const input = (
    <input value={txt} title={title} inputMode="decimal" style={width ? { width } : undefined}
      onFocus={() => { focused.current = true }}
      onChange={e => setTxt(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setTxt(String(value ?? '')); e.currentTarget.blur() } }} />
  )
  return unit ? <span className="fem-unit">{input}<i>{unit}</i></span> : input
}

function F({ label, children }) {
  return <label className="fem-f"><span>{label}</span>{children}</label>
}

// ── Generator dialog ──────────────────────────────────────────────────────────

function GeneratorDialog({ hasModel, onApply, onClose }) {
  const [key, setKey] = useState(GENERATORS[0].key)
  const gen = GENERATORS.find(g => g.key === key)
  const [vals, setVals] = useState(() => Object.fromEntries(GENERATORS.map(g => [g.key, Object.fromEntries(g.params.map(p => [p.key, p.def]))])))
  const v = vals[key]
  const set = (k, x) => setVals(all => ({ ...all, [key]: { ...all[key], [k]: x } }))
  return (
    <Dialog title="Generér system" width={640} onClose={onClose} actions={<>
      <Button onClick={onClose}>Annullér</Button>
      <Button variant="primary" onClick={() => onApply(gen.make(v))}>{hasModel ? 'Erstat modellen' : 'Indsæt'}</Button>
    </>}>
      <div className="fem-gen">
        <div className="fem-gen-list">
          {GENERATORS.map(g => (
            <button key={g.key} className={g.key === key ? 'on' : ''} onClick={() => setKey(g.key)}>{g.label}</button>
          ))}
        </div>
        <div className="fem-gen-form">
          <p>{gen.hint}{hasModel ? ' Den nuværende geometri erstattes; laster og lasttilfælde bevares. Ctrl+Z fortryder.' : ''}</p>
          {gen.params.map(p => (
            <F key={p.key} label={p.label}>
              {p.bool ? (
                <span className="fem-check"><input type="checkbox" checked={!!v[p.key]} onChange={e => set(p.key, e.target.checked)} /> Ja</span>
              ) : p.choice ? (
                <select value={v[p.key]} onChange={e => set(p.key, e.target.value)}>
                  {p.choice.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              ) : p.steel ? (
                <select value={v[p.key]} onChange={e => set(p.key, e.target.value)}>
                  {STEEL_SECTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              ) : p.text ? (
                <span className="fem-unit"><input value={v[p.key]} onChange={e => set(p.key, e.target.value)} />{p.unit && <i>{p.unit}</i>}</span>
              ) : (
                <Num value={v[p.key]} unit={p.unit} onCommit={x => set(p.key, x)} />
              )}
            </F>
          ))}
        </div>
      </div>
    </Dialog>
  )
}

// ── Drawing helpers (screen space) ────────────────────────────────────────────

function Arrow({ x1, y1, x2, y2, color }) {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 6
  return (
    <g stroke={color} fill={color}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="1.3" />
      <path d={`M${x2},${y2} L${x2 - h * Math.cos(a - 0.4)},${y2 - h * Math.sin(a - 0.4)} L${x2 - h * Math.cos(a + 0.4)},${y2 - h * Math.sin(a + 0.4)} Z`} stroke="none" />
    </g>
  )
}

function SupportGlyph({ x, y, type }) {
  const c = '#44403c'
  if (type === 'fixed') {
    return (
      <g stroke={c} strokeWidth="1.5">
        <line x1={x - 14} y1={y + 2} x2={x + 14} y2={y + 2} />
        {[-12, -6, 0, 6, 12].map(d => <line key={d} x1={x + d} y1={y + 2} x2={x + d - 5} y2={y + 9} strokeWidth="1" />)}
      </g>
    )
  }
  if (type === 'rollerx') {
    return (
      <g stroke={c} strokeWidth="1.5" fill="none">
        <path d={`M${x},${y} l-16,-10 v20 z`} />
        <line x1={x - 22} y1={y - 12} x2={x - 22} y2={y + 12} />
      </g>
    )
  }
  return (
    <g stroke={c} strokeWidth="1.5" fill="none">
      <path d={`M${x},${y} l-10,16 h20 z`} />
      {type === 'roller'
        ? <><circle cx={x - 5} cy={y + 20} r="3" /><circle cx={x + 5} cy={y + 20} r="3" /><line x1={x - 13} y1={y + 24} x2={x + 13} y2={y + 24} /></>
        : <line x1={x - 14} y1={y + 17} x2={x + 14} y2={y + 17} />}
    </g>
  )
}

// ── Workspace ─────────────────────────────────────────────────────────────────

export default function FemWorkspace({
  title, data, onModelChange, onClose, onRun, running, error, stale,
  memberChecks, reactions, hasResult, summary,
}) {
  const model = useMemo(() => pick(data), [data])
  const commit = useCallback((m) => onModelChange(m), [onModelChange])

  const [tool, setTool] = useState('select')
  const [sel, setSel] = useState([])                   // [{ kind: 'node'|'elem'|'load', id }]
  const [chainFrom, setChainFrom] = useState(null)     // node id while drawing members
  const [hover, setHover] = useState(null)             // { x, y, sx, sy } snapped world point
  const [snap, setSnap] = useState(0.1)
  const [tab, setTab] = useState('nodes')
  const [genOpen, setGenOpen] = useState(false)
  const [showIds, setShowIds] = useState(true)
  const [view, setView] = useState({ cx: 3, cy: 1.5, scale: 60 })
  const [size, setSize] = useState({ w: 800, h: 500 })
  const [drag, setDrag] = useState(null)               // node drag or pan
  const [dragModel, setDragModel] = useState(null)     // live model while dragging a node
  const [section, setSection] = useState({ material: 'timber', section: '45x195', grade: 'C24' })
  const [loadCfg, setLoadCfg] = useState({ direction: 'vertical', value: 1.0, pointDir: 'down', P: 5.0 })
  const [activeLc, setActiveLc] = useState(model.load_cases[0]?.nr ?? null)
  const [showAllLoads, setShowAllLoads] = useState(false)
  const [spaceDown, setSpaceDown] = useState(false)
  const [resView, setResView] = useState('eta')        // 'model' | 'u' | 'M' | 'V' | 'N' | 'eta'
  const [resIdx, setResIdx] = useState('auto')         // index into result states, 'env' or 'auto'
  const [ordScale, setOrdScale] = useState(1)
  const [probe, setProbe] = useState(null)             // hover readout in result views
  const wrapRef = useRef(null)
  const svgRef = useRef(null)

  const m = dragModel ?? model
  const nodesById = useMemo(() => Object.fromEntries(m.nodes.map(n => [n.id, n])), [m.nodes])

  // Keep the active load case valid as load cases come and go
  useEffect(() => {
    if (activeLc != null && !m.load_cases.some(t => t.nr === activeLc)) setActiveLc(m.load_cases[0]?.nr ?? null)
    if (activeLc == null && m.load_cases.length) setActiveLc(m.load_cases[0].nr)
  }, [m.load_cases, activeLc])

  // ── View ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fit = useCallback(() => {
    const b = bounds(model)
    const w = Math.max(b.maxX - b.minX, 1), h = Math.max(b.maxY - b.minY, 1)
    const scale = Math.max(8, Math.min(400, Math.min((size.w - 160) / w, (size.h - 140) / h)))
    setView({ cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, scale })
  }, [model, size])

  const fitted = useRef(false)
  useEffect(() => {
    if (!fitted.current && size.w > 100) { fitted.current = true; fit() }
  }, [size, fit])

  const toS = (x, y) => [size.w / 2 + (x - view.cx) * view.scale, size.h / 2 - (y - view.cy) * view.scale]
  const toW = (sx, sy) => [view.cx + (sx - size.w / 2) / view.scale, view.cy - (sy - size.h / 2) / view.scale]

  function eventPoint(e) {
    const r = svgRef.current.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  // ── Hit testing ─────────────────────────────────────────────────────────
  function hitNode(sx, sy, mm = m) {
    let best = null, bd = 9
    for (const n of mm.nodes) {
      const [x, y] = toS(n.x, n.y)
      const d = Math.hypot(x - sx, y - sy)
      if (d < bd) { bd = d; best = n }
    }
    return best
  }
  function hitElem(sx, sy) {
    const [wx, wy] = toW(sx, sy)
    let best = null, bd = 7 / view.scale
    for (const el of m.elements) {
      const p = projectOnElement(m, el, wx, wy)
      if (p && p.dist < bd) { bd = p.dist; best = { el, p } }
    }
    return best
  }
  function snapped(sx, sy) {
    const n = hitNode(sx, sy)
    if (n) return { x: n.x, y: n.y, node: n }
    const [wx, wy] = toW(sx, sy)
    const e = hitElem(sx, sy)
    if (e) {
      // On a member: snap along it, to the grid step measured from its start
      const L = elementLength(m, e.el)
      const s = Math.round((e.p.t * L) / snap) * snap
      const t = Math.min(Math.max(s / L, 0), 1)
      const a = nodesById[e.el.ni], b = nodesById[e.el.nj]
      return { x: round(a.x + t * (b.x - a.x)), y: round(a.y + t * (b.y - a.y)), elem: e.el }
    }
    return { x: round(Math.round(wx / snap) * snap), y: round(Math.round(wy / snap) * snap) }
  }

  /** A node at a snapped point: the existing one, a split of a member, or a new one. */
  function nodeFor(pt, mm) {
    if (pt.node) return { model: mm, id: pt.node.id }
    if (pt.elem) {
      const r = splitElement(mm, pt.elem.id, pt.x, pt.y)
      return { model: r.model, id: r.nodeId }
    }
    return addNode(mm, pt.x, pt.y)
  }

  // ── Pointer ─────────────────────────────────────────────────────────────
  function onPointerDown(e) {
    const [sx, sy] = eventPoint(e)
    if (e.button === 1 || e.button === 2 || spaceDown) {
      e.preventDefault()
      setDrag({ kind: 'pan', sx, sy, view })
      return
    }
    if (e.button !== 0) return
    const pt = snapped(sx, sy)

    if (tool === 'select') {
      const n = hitNode(sx, sy)
      if (n) {
        toggleSel({ kind: 'node', id: n.id }, e.shiftKey)
        setDrag({ kind: 'node', id: n.id, moved: false })
        return
      }
      const h = hitElem(sx, sy)
      if (h) { toggleSel({ kind: 'elem', id: h.el.id }, e.shiftKey); setTab('elements'); return }
      if (!e.shiftKey) setSel([])
      setDrag({ kind: 'pan', sx, sy, view })
      return
    }

    if (tool === 'node') {
      const r = nodeFor(pt, model)
      if (r.model !== model) commit(r.model)
      setSel([{ kind: 'node', id: r.id }])
      return
    }

    if (tool === 'member') {
      const r = nodeFor(pt, model)
      if (chainFrom == null) {
        if (r.model !== model) commit(r.model)
        setChainFrom(r.id)
        return
      }
      if (r.id === chainFrom) { setChainFrom(null); return }
      const added = addElement(r.model, chainFrom, r.id, {
        material: section.material, section: section.section, grade: section.grade,
      })
      commit(added.model)
      setSel(added.id != null ? [{ kind: 'elem', id: added.id }] : [])
      setChainFrom(r.id)
      return
    }

    if (tool === 'support') {
      const n = hitNode(sx, sy)
      if (n) { commit(cycleSupport(model, n.id)); setSel([{ kind: 'node', id: n.id }]) }
      return
    }

    if (tool === 'hinge') {
      const n = hitNode(sx, sy)
      if (n) { commit(toggleNodeHinge(model, n.id)); return }
      const h = hitElem(sx, sy)
      if (h) {
        const node = h.p.t < 0.5 ? h.el.ni : h.el.nj
        commit(toggleRelease(model, h.el.id, node))
      }
      return
    }

    if (tool === 'load') {
      const lc = m.load_cases.length ? activeLc : undefined
      const n = hitNode(sx, sy)
      if (n) {
        const P = loadCfg.P
        const ld = { type: 'nodal', node_id: n.id, Fx_kN: loadCfg.pointDir === 'right' ? P : loadCfg.pointDir === 'left' ? -P : 0,
                     Fy_kN: loadCfg.pointDir === 'down' ? -P : loadCfg.pointDir === 'up' ? P : 0, Mz_kNm: 0, lc }
        commit({ ...model, loads: [...model.loads, ld] })
        setSel([{ kind: 'load', id: model.loads.length }]); setTab('loads')
        return
      }
      const h = hitElem(sx, sy)
      if (h) {
        const ld = h.el.member_id != null
          ? { type: 'udl', target: 'member', member_id: h.el.member_id, direction: loadCfg.direction, value_kNm: loadCfg.value, lc }
          : { type: 'udl', target: 'elem', elem_id: h.el.id, direction: loadCfg.direction, value_kNm: loadCfg.value, lc }
        commit({ ...model, loads: [...model.loads, ld] })
        setSel([{ kind: 'load', id: model.loads.length }]); setTab('loads')
      }
    }
  }

  function onPointerMove(e) {
    const [sx, sy] = eventPoint(e)
    if (drag?.kind === 'pan') {
      setView({ ...drag.view, cx: drag.view.cx - (sx - drag.sx) / drag.view.scale, cy: drag.view.cy + (sy - drag.sy) / drag.view.scale })
      return
    }
    if (drag?.kind === 'node') {
      const [wx, wy] = toW(sx, sy)
      const x = round(Math.round(wx / snap) * snap), y = round(Math.round(wy / snap) * snap)
      setDragModel(updateNode(model, drag.id, { x, y }))
      if (!drag.moved) setDrag({ ...drag, moved: true })
      setHover({ x, y })
      return
    }
    const pt = snapped(sx, sy)
    setHover(pt)
    if (diagramView) setProbe(probeAt(sx, sy))
    else if (probe) setProbe(null)
  }

  function onPointerUp() {
    if (drag?.kind === 'node' && drag.moved && dragModel) {
      // Moving a node onto another merges nothing — refuse silently, keep the move otherwise
      commit(dragModel)
    }
    setDrag(null)
    setDragModel(null)
  }

  function onWheel(e) {
    const [sx, sy] = eventPoint(e)
    const [wx, wy] = toW(sx, sy)
    const k = Math.exp(-e.deltaY * 0.0015)
    const scale = Math.max(4, Math.min(800, view.scale * k))
    // keep the point under the cursor fixed
    setView({ scale, cx: wx - (sx - size.w / 2) / scale, cy: wy + (sy - size.h / 2) / scale })
  }

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const block = (e) => e.preventDefault()
    el.addEventListener('wheel', block, { passive: false })
    return () => el.removeEventListener('wheel', block)
  }, [])

  function toggleSel(item, add) {
    setSel(cur => {
      const has = cur.some(s => s.kind === item.kind && s.id === item.id)
      if (!add) return [item]
      return has ? cur.filter(s => !(s.kind === item.kind && s.id === item.id)) : [...cur, item]
    })
  }
  const isSel = (kind, id) => sel.some(s => s.kind === kind && s.id === id)

  // ── Keyboard ────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
      if (e.key === ' ') { setSpaceDown(e.type === 'keydown'); if (e.type === 'keydown') e.preventDefault(); return }
      if (e.type !== 'keydown' || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'escape') { if (chainFrom != null) setChainFrom(null); else if (sel.length) setSel([]); else setTool('select') }
      else if (k === 'delete' || k === 'backspace') {
        if (sel.length) { e.preventDefault(); commit(deleteSelection(model, sel)); setSel([]) }
      }
      else if (k === 'f') fit()
      else if (k === 'f5') { e.preventDefault(); onRun() }
      else {
        const tl = TOOLS.find(x => x.kbd.toLowerCase() === k)
        if (tl) { setTool(tl.key); setChainFrom(null) }
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey) }
  }, [chainFrom, sel, model, commit, fit, onRun])

  // ── Load cases ──────────────────────────────────────────────────────────
  function addLoadCase() {
    const nr = m.load_cases.reduce((mx, t) => Math.max(mx, t.nr ?? 0), 0) + 1
    const kat = m.load_cases.length === 0 ? 'permanent' : 'imposed'
    const lc = { nr, navn: kat === 'permanent' ? 'Egenlast' : `Lasttilfælde ${nr}`, kategori: kat }
    // The first load case adopts the loads that had none, so nothing drops out of the combinations
    const loads = m.load_cases.length === 0 ? model.loads.map(l => (l.lc == null ? { ...l, lc: nr } : l)) : model.loads
    commit({ ...model, load_cases: [...model.load_cases, lc], loads })
    setActiveLc(nr)
  }
  function updateLoadCase(nr, patch) {
    commit({ ...model, load_cases: model.load_cases.map(t => (t.nr === nr ? { ...t, ...patch } : t)) })
  }
  function removeLoadCase(nr) {
    commit({
      ...model,
      load_cases: model.load_cases.filter(t => t.nr !== nr),
      loads: model.loads.map(l => (l.lc === nr ? { ...l, lc: undefined } : l)),
    })
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const supportsByNode = useMemo(() => Object.fromEntries(m.supports.map(s => [s.node_id, s])), [m.supports])
  const members = useMemo(() => {
    const g = {}
    for (const el of m.elements) if (el.member_id != null) (g[el.member_id] ??= []).push(el)
    return g
  }, [m.elements])
  const resultsOk = !!(hasResult && !stale)
  const showResults = resultsOk && resView === 'eta' && memberChecks
  const states = useMemo(() => (resultsOk ? resultStates(summary) : []), [resultsOk, summary])
  // Which result is drawn: a combination, the envelope over all of them, or —
  // by default — the governing one (the one the report figures use).
  const governingIdx = useMemo(() => {
    const envName = summary?.envelope ? Object.values(summary.envelope).reduce((a, b) => (b.M_max_kNm > (a?.M_max_kNm ?? -1) ? b : a), null)?.M_combo : null
    const i = states.findIndex(st => st.name === envName)
    return i >= 0 ? i : 0
  }, [states, summary])
  const curIdx = resIdx === 'auto' ? governingIdx : resIdx
  const diagramView = resultsOk && ['u', 'M', 'V', 'N'].includes(resView) && states.length > 0
  useEffect(() => {
    if (resultsOk && resView === 'eta' && !memberChecks) setResView('M')
  }, [resultsOk, resView, memberChecks])

  const visibleLoads = m.loads.map((l, i) => ({ l, i }))
    .filter(({ l }) => showAllLoads || !m.load_cases.length || l.lc === activeLc || (l.lc == null && activeLc == null))

  const selNode = sel.length === 1 && sel[0].kind === 'node' ? m.nodes.find(n => n.id === sel[0].id) : null
  const selElems = sel.filter(s => s.kind === 'elem').map(s => m.elements.find(e => e.id === s.id)).filter(Boolean)
  const selLoadIdx = sel.length === 1 && sel[0].kind === 'load' ? sel[0].id : null
  const selLoad = selLoadIdx != null ? m.loads[selLoadIdx] : null

  // ── Render: model ───────────────────────────────────────────────────────
  function elemColor(el) {
    if (diagramView) return '#a8a29e'
    if (showResults) {
      const c = memberChecks[el.member_id]
      if (c && typeof c.eta === 'number') return c.N_kN != null && c.eta <= 1 ? '#d97706' : etaColor(c.eta)
    }
    return MAT_COLOR[el.material] ?? '#57534e'
  }

  function renderGrid() {
    const step = [0.1, 0.25, 0.5, 1, 2, 5, 10].find(s => s * view.scale >= 18) ?? 10
    const [x0, y1] = toW(0, 0), [x1, y0] = toW(size.w, size.h)
    const lines = []
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
      const [sx] = toS(x, 0)
      const major = Math.abs(Math.round(x / (step * 5)) * step * 5 - x) < 1e-9
      lines.push(<line key={`x${x.toFixed(3)}`} x1={sx} y1={0} x2={sx} y2={size.h} stroke={Math.abs(x) < 1e-9 ? '#d6cfc8' : major ? '#ebe6e1' : '#f3f0ed'} />)
    }
    for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
      const [, sy] = toS(0, y)
      const major = Math.abs(Math.round(y / (step * 5)) * step * 5 - y) < 1e-9
      lines.push(<line key={`y${y.toFixed(3)}`} x1={0} y1={sy} x2={size.w} y2={sy} stroke={Math.abs(y) < 1e-9 ? '#d6cfc8' : major ? '#ebe6e1' : '#f3f0ed'} />)
    }
    return <g>{lines}</g>
  }

  function renderLoad({ l, i }) {
    const color = isSel('load', i) ? 'var(--brand)' : '#b91c1c'
    const pick = (e) => { if (tool === 'select') { e.stopPropagation(); toggleSel({ kind: 'load', id: i }, e.shiftKey); setTab('loads') } }
    if (l.type === 'nodal') {
      const n = nodesById[l.node_id]; if (!n) return null
      const [x, y] = toS(n.x, n.y)
      const out = []
      const Fx = l.Fx_kN ?? 0, Fy = l.Fy_kN ?? 0
      if (Fy) out.push(<Arrow key="y" x1={x} y1={y + (Fy < 0 ? -44 : 44)} x2={x} y2={y + (Fy < 0 ? -6 : 6)} color={color} />)
      if (Fx) out.push(<Arrow key="x" x1={x + (Fx > 0 ? -44 : 44)} y1={y} x2={x + (Fx > 0 ? -6 : 6)} y2={y} color={color} />)
      return (
        <g key={`l${i}`} onPointerDown={pick} style={{ cursor: tool === 'select' ? 'pointer' : undefined }}>
          {out}
          <text x={x + 6} y={y - 30} fontSize="11" fill={color} fontFamily="var(--font-mono)">
            {[Fy ? `${fmt(Math.abs(Fy), 1)} kN` : null, Fx ? `H ${fmt(Fx, 1)}` : null].filter(Boolean).join(' · ')}
          </text>
        </g>
      )
    }
    if (l.type !== 'udl') return null
    const targets = (l.target ?? 'elem') === 'member' ? (members[l.member_id] ?? []) : m.elements.filter(e => e.id === l.elem_id)
    const w = l.value_kNm ?? l.wy_kNm ?? 0
    const dir = l.direction ?? 'vertical'
    const parts = targets.map((el, k) => {
      const a = nodesById[el.ni], b = nodesById[el.nj]; if (!a || !b) return null
      const [ax, ay] = toS(a.x, a.y), [bx, by] = toS(b.x, b.y)
      const Ls = Math.hypot(bx - ax, by - ay); if (Ls < 4) return null
      // arrow direction in screen space (unit vector the load acts along)
      let ux = 0, uy = 1
      if (dir === 'horizontal') { ux = 1; uy = 0 }
      if (dir === 'perpendicular') { ux = -(by - ay) / Ls; uy = (bx - ax) / Ls; if (uy < 0) { ux = -ux; uy = -uy } }
      const sgn = w < 0 ? -1 : 1
      ux *= sgn; uy *= sgn
      const len = 26, n = Math.max(2, Math.round(Ls / 22))
      const arrows = []
      for (let j = 0; j <= n; j++) {
        const px = ax + (bx - ax) * (j / n), py = ay + (by - ay) * (j / n)
        arrows.push(<Arrow key={j} x1={px - ux * len} y1={py - uy * len} x2={px - ux * 3} y2={py - uy * 3} color={color} />)
      }
      return (
        <g key={k}>
          <line x1={ax - ux * len} y1={ay - uy * len} x2={bx - ux * len} y2={by - uy * len} stroke={color} strokeWidth="1" />
          {arrows}
          {k === Math.floor(targets.length / 2) && (
            <text x={(ax + bx) / 2 - ux * (len + 8)} y={(ay + by) / 2 - uy * (len + 8)} fontSize="11" fill={color}
                  textAnchor="middle" fontFamily="var(--font-mono)">{fmt(Math.abs(w), 2)} kN/m</text>
          )}
        </g>
      )
    })
    return <g key={`l${i}`} onPointerDown={pick} style={{ cursor: tool === 'select' ? 'pointer' : undefined }}>{parts}</g>
  }

  function renderModel() {
    const out = []
    // members
    for (const el of m.elements) {
      const a = nodesById[el.ni], b = nodesById[el.nj]; if (!a || !b) continue
      const [ax, ay] = toS(a.x, a.y), [bx, by] = toS(b.x, b.y)
      const on = isSel('elem', el.id)
      const col = elemColor(el)
      if (on) out.push(<line key={`h${el.id}`} x1={ax} y1={ay} x2={bx} y2={by} stroke="var(--brand)" strokeOpacity=".22" strokeWidth="13" strokeLinecap="round" />)
      out.push(<line key={`e${el.id}`} x1={ax} y1={ay} x2={bx} y2={by} stroke={col}
        strokeWidth={el.type === 'truss' ? 2 : showResults ? 5 : 3} strokeDasharray={el.type === 'truss' ? '6 4' : undefined} strokeLinecap="round" />)
      // releases: small circles just inside the released ends
      const Ls = Math.hypot(bx - ax, by - ay) || 1
      const ex = (bx - ax) / Ls, ey = (by - ay) / Ls
      if (el.release === 'start' || el.release === 'both') out.push(<circle key={`rs${el.id}`} cx={ax + ex * 9} cy={ay + ey * 9} r="4" fill="#fbfaf9" stroke={col} strokeWidth="1.6" />)
      if (el.release === 'end' || el.release === 'both') out.push(<circle key={`re${el.id}`} cx={bx - ex * 9} cy={by - ey * 9} r="4" fill="#fbfaf9" stroke={col} strokeWidth="1.6" />)
      if (showIds || showResults) {
        const mx = (ax + bx) / 2, my = (ay + by) / 2
        const nx = -ey, ny = ex
        const c = showResults ? memberChecks[el.member_id] : null
        const label = showResults && c && typeof c.eta === 'number'
          ? `η ${fmt(c.eta)}` : showIds ? `${el.id}` : null
        // one η label per member, on its middle element
        const group = members[el.member_id] ?? [el]
        const isMid = group[Math.floor(group.length / 2)]?.id === el.id
        if (label && (!showResults || isMid)) {
          out.push(<text key={`t${el.id}`} x={mx + nx * 12} y={my + ny * 12} fontSize="11" textAnchor="middle"
            fill={showResults && c ? etaColor(c.eta) : '#78716c'} fontFamily="var(--font-mono)" fontWeight={showResults ? 600 : 400}>{label}</text>)
        }
      }
    }
    // supports
    for (const s of m.supports) {
      const n = nodesById[s.node_id]; if (!n) continue
      const [x, y] = toS(n.x, n.y)
      out.push(<SupportGlyph key={`s${s.node_id}`} x={x} y={y} type={supportType(s)} />)
      const R = showResults ? reactions?.[String(s.node_id)] : null
      if (R) {
        out.push(<text key={`r${s.node_id}`} x={x} y={y + 40} fontSize="11" textAnchor="middle" fill="#0f766e" fontFamily="var(--font-mono)">
          {`V ${fmt(R.Fy_kN, 1)}${Math.abs(R.Fx_kN) > 0.005 ? ` · H ${fmt(R.Fx_kN, 1)}` : ''}${Math.abs(R.Mz_kNm) > 0.005 ? ` · M ${fmt(R.Mz_kNm, 1)}` : ''}`}
        </text>)
      }
    }
    // nodes
    for (const n of m.nodes) {
      const [x, y] = toS(n.x, n.y)
      const on = isSel('node', n.id) || n.id === chainFrom
      out.push(<rect key={`n${n.id}`} x={x - 3.5} y={y - 3.5} width="7" height="7" fill={on ? 'var(--brand)' : '#fff'} stroke={on ? 'var(--brand)' : '#1c1917'} strokeWidth="1.4" />)
      // A node hinge proper — not a member released at both ends (that one
      // already shows its own end circles).
      const nodeHinge = m.elements.some(e => (e.type ?? 'beam') === 'beam' && e.release !== 'both'
        && ((e.ni === n.id && e.release === 'start') || (e.nj === n.id && e.release === 'end')))
      if (nodeHinge) out.push(<circle key={`hn${n.id}`} cx={x} cy={y} r="6.5" fill="none" stroke="#1c1917" strokeWidth="1.2" />)
      if (showIds) out.push(<text key={`nt${n.id}`} x={x + 7} y={y - 7} fontSize="10.5" fill="#57534e" fontFamily="var(--font-mono)">{n.id}</text>)
    }
    return out
  }

  // ── Result diagrams ─────────────────────────────────────────────────────
  const DIAG = {
    M: { pos: '#1d4ed8', neg: '#1d4ed8', unit: 'kNm', flip: -1, label: 'M' },   // tegnet på trækside
    V: { pos: '#0f766e', neg: '#0f766e', unit: 'kN',  flip: 1,  label: 'V' },
    N: { pos: '#2563eb', neg: '#dc2626', unit: 'kN',  flip: 1,  label: 'N' },   // + træk / − tryk
  }

  const curves = useMemo(() => {
    if (!diagramView || resView === 'u') return null
    const out = {}
    for (const el of model.elements) {
      const L = elementLength(model, el)
      if (curIdx === 'env') {
        const env = envelopeSamples(el, L, states)
        if (env) out[el.id] = { env }
      } else {
        const st = states[curIdx]
        const pts = st && sampleElement(el, L, st.state)
        if (pts) out[el.id] = { pts }
      }
    }
    return out
  }, [diagramView, resView, curIdx, states, model])

  const extent = useMemo(() => {
    const b = bounds(model)
    return Math.max(b.maxX - b.minX, b.maxY - b.minY, 1)
  }, [model])

  function renderDiagrams() {
    if (resView === 'u') return renderDeformation()
    const k = resView, st = DIAG[k]
    let vmax = 0
    for (const c of Object.values(curves ?? {})) {
      for (const p of c.pts ?? []) vmax = Math.max(vmax, Math.abs(p[k]))
      for (const p of c.env ?? []) vmax = Math.max(vmax, Math.abs(p[k + 'max']), Math.abs(p[k + 'min']))
    }
    if (vmax < 1e-9) return <text x={size.w / 2} y={size.h - 40} textAnchor="middle" fontSize="12" fill="#78716c">{k} er nul overalt</text>
    const fac = (0.12 * extent * ordScale) / vmax    // world metres per kN(m)
    const out = []
    const labels = []
    for (const el of model.elements) {
      const c = curves?.[el.id]; if (!c) continue
      const a = nodesById[el.ni], b = nodesById[el.nj]; if (!a || !b) continue
      const L = elementLength(model, el) || 1
      const ca = (b.x - a.x) / L, sa = (b.y - a.y) / L
      const ox = -sa * st.flip, oy = ca * st.flip
      const series = c.pts ? [c.pts.map(p => [p.x, p[k]])] : [c.env.map(p => [p.x, p[k + 'max']]), c.env.map(p => [p.x, p[k + 'min']])]
      series.forEach((ser, si) => {
        // A member with nothing of this kind gets no curve — a line lying on
        // the member reads as the member itself.
        if (ser.every(([, v]) => Math.abs(v) < vmax * 1e-4)) return
        const base = ser.map(([x]) => toS(a.x + ca * x, a.y + sa * x))
        const tip = ser.map(([x, v]) => toS(a.x + ca * x + ox * v * fac, a.y + sa * x + oy * v * fac))
        const poly = [...base, ...tip.slice().reverse()].map(p => p.join(',')).join(' ')
        const col = (v) => (v >= 0 ? st.pos : st.neg)
        const mean = ser.reduce((s2, [, v]) => s2 + v, 0) / ser.length
        out.push(<polygon key={`f${el.id}-${si}`} points={poly} fill={col(mean)} fillOpacity=".12" stroke="none" />)
        out.push(<polyline key={`c${el.id}-${si}`} points={tip.map(p => p.join(',')).join(' ')} fill="none" stroke={col(mean)} strokeWidth="1.6" />)
        // the extreme of this series on this element, labelled once
        let bi = 0
        ser.forEach(([, v], i) => { if (Math.abs(v) > Math.abs(ser[bi][1])) bi = i })
        const [bx, by] = tip[bi]
        if (Math.abs(ser[bi][1]) > vmax * 0.02) labels.push({ key: `l${el.id}-${si}`, x: bx, y: by, v: ser[bi][1], col: col(ser[bi][1]), member: el.member_id ?? el.id })
      })
    }
    // one label per member and sign, the largest — the rest is noise
    const best = {}
    for (const l of labels) {
      const key = `${l.member}:${l.v >= 0 ? '+' : '-'}`
      if (!best[key] || Math.abs(l.v) > Math.abs(best[key].v)) best[key] = l
    }
    for (const l of Object.values(best)) {
      out.push(<text key={l.key} x={l.x + 4} y={l.y - 4} fontSize="11" fontWeight="600" fill={l.col} fontFamily="var(--font-mono)">{fmt(l.v)} {st.unit}</text>)
    }
    return <g pointerEvents="none">{out}</g>
  }

  function renderDeformation() {
    const st = curIdx === 'env' ? states[governingIdx] : states[curIdx]
    const nd = st?.state?.node_disps
    if (!nd) return null
    let umax = 0
    for (const v of Object.values(nd)) umax = Math.max(umax, Math.hypot(v[0], v[1]))
    if (umax < 1e-12) return null
    const fac = (0.08 * extent * ordScale) / umax
    const out = []
    for (const el of model.elements) {
      const a = nodesById[el.ni], b = nodesById[el.nj]; if (!a || !b) continue
      const da = nd[String(el.ni)] ?? [0, 0], db = nd[String(el.nj)] ?? [0, 0]
      const [x1, y1] = toS(a.x + da[0] * fac, a.y + da[1] * fac)
      const [x2, y2] = toS(b.x + db[0] * fac, b.y + db[1] * fac)
      out.push(<line key={`d${el.id}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#7c3aed" strokeWidth="2.2" strokeLinecap="round" />)
    }
    let worst = null
    for (const [id, v] of Object.entries(nd)) if (!worst || Math.hypot(v[0], v[1]) > Math.hypot(worst.v[0], worst.v[1])) worst = { id, v }
    const n = nodesById[Number(worst.id)]
    if (n) {
      const [x, y] = toS(n.x + worst.v[0] * fac, n.y + worst.v[1] * fac)
      out.push(<text key="dl" x={Math.min(x + 6, size.w - 210)} y={Math.max(y - 6, 16)} fontSize="11" fontWeight="600" fill="#7c3aed" fontFamily="var(--font-mono)">
        {`u = ${fmt(Math.hypot(worst.v[0], worst.v[1]) * 1000, 1)} mm (knude ${worst.id})`}</text>)
    }
    return <g pointerEvents="none">{out}</g>
  }

  /** N, V and M at the point of the nearest member under the cursor. */
  function probeAt(sx, sy) {
    const h = hitElem(sx, sy)
    if (!h) return null
    const L = elementLength(model, h.el)
    const x = h.p.t * L
    if (curIdx === 'env') {
      const env = envelopeSamples(h.el, L, states)
      if (!env) return null
      let best = env[0]; for (const p of env) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p
      return { sx, sy, el: h.el, x: best.x, env: best, name: 'Indhyldning' }
    }
    const st = states[curIdx]; if (!st) return null
    const pts = sampleElement(h.el, L, st.state)
    if (!pts) return null
    let best = pts[0]; for (const p of pts) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p
    return { sx, sy, el: h.el, x: best.x, p: best, name: st.name }
  }

  // rubber band while drawing members, and the hover marker
  function renderOverlay() {
    if (!hover) return null
    const [hx, hy] = toS(hover.x, hover.y)
    const out = []
    if (tool === 'member' && chainFrom != null) {
      const a = nodesById[chainFrom]
      if (a) {
        const [ax, ay] = toS(a.x, a.y)
        out.push(<line key="rb" x1={ax} y1={ay} x2={hx} y2={hy} stroke="var(--brand)" strokeWidth="2" strokeDasharray="5 4" />)
        const L = Math.hypot(hover.x - a.x, hover.y - a.y)
        out.push(<text key="rbl" x={(ax + hx) / 2 + 8} y={(ay + hy) / 2 - 8} fontSize="11" fill="var(--brand-ink)" fontFamily="var(--font-mono)">{fmt(L)} m</text>)
      }
    }
    if (tool === 'node' || tool === 'member') {
      out.push(<circle key="hv" cx={hx} cy={hy} r={hover.node ? 7 : 4} fill="none" stroke="var(--brand)" strokeWidth="1.5" />)
    }
    return out
  }

  // ── Render: panels ──────────────────────────────────────────────────────
  const counts = {
    nodes: m.nodes.length, elements: m.elements.length, supports: m.supports.length, loads: m.loads.length,
  }
  const rated = showResults ? Object.entries(memberChecks).filter(([, c]) => c && typeof c.eta === 'number') : []

  function applySection(patch) {
    const ids = selElems.flatMap(e => (e.member_id != null ? (members[e.member_id] ?? [e]) : [e])).map(e => e.id)
    commit(updateElements(model, ids, patch))
  }

  function setMaterial(key, target = 'selection') {
    const def = MATERIALS.find(x => x.key === key)
    const patch = key
      ? { material: key, section: def.def, grade: def.grade }
      : { material: undefined, section: undefined, grade: undefined, E_GPa: 210, A_cm2: 39.1, Iz_cm4: 3892 }
    if (target === 'default') setSection({ material: key || 'timber', section: def?.def ?? '45x195', grade: def?.grade ?? 'C24' })
    else applySection(patch)
  }

  function SectionFields({ value, onChange }) {
    const def = MATERIALS.find(x => x.key === value.material)
    return (
      <>
        <F label="Materiale">
          <select value={value.material ?? ''} onChange={e => onChange('material', e.target.value)}>
            {MATERIALS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
            <option value="">Egne tal (E, A, I)</option>
          </select>
        </F>
        {value.material && (
          <div className="fem-row">
            <F label="Tværsnit">
              {value.material === 'steel'
                ? <select value={value.section} onChange={e => onChange('section', e.target.value)}>{STEEL_SECTIONS.map(s => <option key={s}>{s}</option>)}</select>
                : <input defaultValue={value.section} key={value.section} placeholder="b×h mm" onBlur={e => onChange('section', e.target.value.replace('×', 'x'))} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />}
            </F>
            <F label="Kvalitet">
              <select value={value.grade} onChange={e => onChange('grade', e.target.value)}>{(def?.grades ?? []).map(g => <option key={g}>{g}</option>)}</select>
            </F>
          </div>
        )}
      </>
    )
  }

  function renderProps() {
    if (selNode) {
      const s = supportsByNode[selNode.id]
      const touching = m.elements.filter(e => e.ni === selNode.id || e.nj === selNode.id)
      return (
        <>
          <div className="fem-ph"><small>Knude</small><b>Knude {selNode.id}</b></div>
          <div className="fem-ps">
            <div className="fem-row">
              <F label="x"><Num value={selNode.x} unit="m" onCommit={v => commit(updateNode(model, selNode.id, { x: round(v) }))} /></F>
              <F label="y"><Num value={selNode.y} unit="m" onCommit={v => commit(updateNode(model, selNode.id, { y: round(v) }))} /></F>
            </div>
            <F label="Understøtning">
              <select value={s ? supportType(s) : ''} onChange={e => commit(setSupport(model, selNode.id, e.target.value || null))}>
                <option value="">Ingen</option>
                {SUPPORT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                {s && supportType(s) === 'custom' && <option value="custom">Brugerdefineret</option>}
              </select>
            </F>
            {touching.filter(e => (e.type ?? 'beam') === 'beam').length >= 2 && (
              <label className="fem-check">
                <input type="checkbox" checked={hasNodeHinge(m, selNode.id)} onChange={() => commit(toggleNodeHinge(model, selNode.id))} />
                Charnier i knuden
              </label>
            )}
            <div className="fem-kv"><span>Stænger</span><span>{touching.map(e => e.id).join(', ') || '—'}</span></div>
          </div>
          {showResults && reactions?.[String(selNode.id)] && (
            <div className="fem-ps">
              <div className="t">Reaktion (dimensionerende)</div>
              <div className="fem-kv">
                <span>R_x</span><span>{fmt(reactions[String(selNode.id)].Fx_kN)} kN</span>
                <span>R_y</span><span>{fmt(reactions[String(selNode.id)].Fy_kN)} kN</span>
                <span>M</span><span>{fmt(reactions[String(selNode.id)].Mz_kNm)} kNm</span>
              </div>
            </div>
          )}
          <div className="fem-ps"><Button size="sm" variant="ghost" onClick={() => { commit(deleteSelection(model, sel)); setSel([]) }}>Slet knude (Delete)</Button></div>
        </>
      )
    }

    if (selElems.length) {
      const el = selElems[0]
      const group = el.member_id != null ? members[el.member_id] ?? [el] : [el]
      const L = group.reduce((s, e) => s + elementLength(m, e), 0)
      const a = nodesById[el.ni], b = nodesById[el.nj]
      const ang = a && b ? (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI : 0
      const c = showResults ? memberChecks[el.member_id] : null
      const rs = el.release === 'start' || el.release === 'both', re = el.release === 'end' || el.release === 'both'
      return (
        <>
          <div className="fem-ph">
            <small>{selElems.length > 1 ? `${selElems.length} stænger` : `Stang ${el.id}${el.member_id != null ? ` · led ${el.member_id}` : ''}`}</small>
            <b>{el.material === 'timber' ? `Træ ${el.section ?? ''} ${el.grade ?? ''}` : el.material === 'steel' ? `${el.section ?? ''} ${el.grade ?? ''}` : 'Egne tal'}</b>
          </div>
          {c && typeof c.eta === 'number' && (
            <div className="fem-ps">
              <div className="t">Udnyttelse · led {el.member_id}</div>
              <div className="fem-eta"><span className="track"><i style={{ width: `${Math.min(100, c.eta * 100)}%`, background: etaColor(c.eta) }} /></span>η = {fmt(c.eta)}</div>
              {c.N_kN != null && <p>Kun bøjning og forskydning. N = {fmt(Math.abs(c.N_kN), 1)} kN er ikke medregnet — eftervis leddet som søjle eller bjælke-søjle.</p>}
            </div>
          )}
          <div className="fem-ps">
            <div className="t">Tværsnit {group.length > 1 && <span className="fem-status">gælder hele leddet ({group.length} elementer)</span>}</div>
            <SectionFields value={el} onChange={(k, v) => (k === 'material' ? setMaterial(v) : applySection({ [k]: v }))} />
            {!el.material && (
              <div className="fem-row">
                <F label="E"><Num value={el.E_GPa ?? 210} unit="GPa" onCommit={v => applySection({ E_GPa: v })} /></F>
                <F label="A"><Num value={el.A_cm2 ?? 39.1} unit="cm²" onCommit={v => applySection({ A_cm2: v })} /></F>
                <F label="I"><Num value={el.Iz_cm4 ?? 3892} unit="cm⁴" onCommit={v => applySection({ Iz_cm4: v })} /></F>
              </div>
            )}
          </div>
          {selElems.length === 1 && (
            <div className="fem-ps">
              <div className="t">Stang</div>
              <div className="fem-kv">
                <span>Knuder</span><span>{el.ni} → {el.nj}</span>
                <span>Længde</span><span>{fmt(elementLength(m, el))} m</span>
                {group.length > 1 && <><span>Leddets længde</span><span>{fmt(L)} m</span></>}
                <span>Hældning</span><span>{fmt(ang, 1)}°</span>
              </div>
              <F label="Type">
                <select value={el.type ?? 'beam'} onChange={e => commit(updateElements(model, [el.id], { type: e.target.value }))}>
                  <option value="beam">Bjælke (M, V, N)</option>
                  <option value="truss">Gitterstang (kun N)</option>
                </select>
              </F>
              {(el.type ?? 'beam') === 'beam' && (
                <div className="fem-row">
                  <label className="fem-check"><input type="checkbox" checked={rs}
                    onChange={() => commit(toggleRelease(model, el.id, el.ni))} /> Charnier ved {el.ni}</label>
                  <label className="fem-check"><input type="checkbox" checked={re}
                    onChange={() => commit(toggleRelease(model, el.id, el.nj))} /> Charnier ved {el.nj}</label>
                </div>
              )}
              <F label="Led (samler elementer til ét spær, én søjle …)">
                <Num value={el.member_id ?? null} onCommit={v => commit(updateElements(model, [el.id], { member_id: v > 0 ? Math.round(v) : undefined }))} />
              </F>
            </div>
          )}
          <div className="fem-ps"><Button size="sm" variant="ghost" onClick={() => { commit(deleteSelection(model, sel)); setSel([]) }}>Slet (Delete)</Button></div>
        </>
      )
    }

    if (selLoad) {
      const patchLoad = (p) => commit({ ...model, loads: model.loads.map((l, i) => (i === selLoadIdx ? { ...l, ...p } : l)) })
      return (
        <>
          <div className="fem-ph"><small>Last</small><b>{selLoad.type === 'nodal' ? `Punktlast i knude ${selLoad.node_id}` : `Linjelast på ${(selLoad.target ?? 'elem') === 'member' ? `led ${selLoad.member_id}` : `stang ${selLoad.elem_id}`}`}</b></div>
          <div className="fem-ps">
            {m.load_cases.length > 0 && (
              <F label="Lasttilfælde">
                <select value={selLoad.lc ?? ''} onChange={e => patchLoad({ lc: e.target.value === '' ? undefined : Number(e.target.value) })}>
                  <option value="">— intet (indgår ikke)</option>
                  {m.load_cases.map(t => <option key={t.nr} value={t.nr}>LC{t.nr} {t.navn}</option>)}
                </select>
              </F>
            )}
            {selLoad.type === 'nodal' ? (
              <div className="fem-row">
                <F label="F_x (+ mod højre)"><Num value={selLoad.Fx_kN ?? 0} unit="kN" onCommit={v => patchLoad({ Fx_kN: v })} /></F>
                <F label="F_y (+ opad)"><Num value={selLoad.Fy_kN ?? 0} unit="kN" onCommit={v => patchLoad({ Fy_kN: v })} /></F>
              </div>
            ) : selLoad.type === 'udl' ? (
              <>
                <F label="Retning">
                  <select value={selLoad.direction ?? 'vertical'} onChange={e => patchLoad({ direction: e.target.value })}>
                    {DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </F>
                <F label={`w (${DIRECTIONS.find(d => d.value === (selLoad.direction ?? 'vertical'))?.hint})`}>
                  <Num value={selLoad.value_kNm ?? selLoad.wy_kNm ?? 0} unit="kN/m" onCommit={v => patchLoad({ value_kNm: v })} />
                </F>
              </>
            ) : <p>Denne lasttype redigeres i blokken.</p>}
          </div>
          <div className="fem-ps"><Button size="sm" variant="ghost" onClick={() => { commit(deleteSelection(model, sel)); setSel([]) }}>Slet last (Delete)</Button></div>
        </>
      )
    }

    // Nothing selected: settings for the active tool
    return (
      <>
        <div className="fem-ph"><small>Værktøj</small><b>{TOOLS.find(t => t.key === tool)?.label}</b></div>
        <div className="fem-ps"><p>{TOOL_HINT[tool]}</p></div>
        {tool === 'member' && (
          <div className="fem-ps">
            <div className="t">Nye stænger får</div>
            <SectionFields value={section} onChange={(k, v) => (k === 'material' ? setMaterial(v, 'default') : setSection(s => ({ ...s, [k]: v })))} />
          </div>
        )}
        {tool === 'load' && (
          <div className="fem-ps">
            <div className="t">Ny last i {m.load_cases.length ? `LC${activeLc} ${m.load_cases.find(t => t.nr === activeLc)?.navn ?? ''}` : 'modellen (ingen lasttilfælde)'}</div>
            <F label="Linjelast, retning">
              <select value={loadCfg.direction} onChange={e => setLoadCfg(c => ({ ...c, direction: e.target.value }))}>
                {DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </F>
            <F label={`w (${DIRECTIONS.find(d => d.value === loadCfg.direction)?.hint})`}><Num value={loadCfg.value} unit="kN/m" onCommit={v => setLoadCfg(c => ({ ...c, value: v }))} /></F>
            <div className="fem-row">
              <F label="Punktlast">
                <select value={loadCfg.pointDir} onChange={e => setLoadCfg(c => ({ ...c, pointDir: e.target.value }))}>
                  <option value="down">Nedad ↓</option><option value="up">Opad ↑</option>
                  <option value="right">Mod højre →</option><option value="left">Mod venstre ←</option>
                </select>
              </F>
              <F label="P"><Num value={loadCfg.P} unit="kN" onCommit={v => setLoadCfg(c => ({ ...c, P: v }))} /></F>
            </div>
            {!m.load_cases.length && <p>Opret lasttilfælde i navigatoren, så lasterne kombineres efter DK NA.</p>}
          </div>
        )}
        <div className="fem-ps">
          <div className="t">Tastatur</div>
          <div className="fem-keys">
            {TOOLS.map(t => <React.Fragment key={t.key}><kbd>{t.kbd}</kbd><span>{t.label}</span></React.Fragment>)}
            <kbd>Delete</kbd><span>Slet det valgte</span>
            <kbd>F</kbd><span>Vis hele modellen</span>
            <kbd>F5</kbd><span>Regn</span>
            <kbd>Mellemknap</kbd><span>Panorér (eller mellemrum + træk)</span>
            <kbd>Ctrl+Z</kbd><span>Fortryd</span>
          </div>
        </div>
      </>
    )
  }

  // ── Tables ──────────────────────────────────────────────────────────────
  const nodeIds = new Set(m.nodes.map(n => n.id))

  function renderTable() {
    if (tab === 'nodes') {
      if (!m.nodes.length) return <div className="fem-tbl-empty">Ingen knuder endnu. Brug Knude- eller Stang-værktøjet, eller generér et system.</div>
      return (
        <table><thead><tr><th>Knude</th><th>x [m]</th><th>y [m]</th><th>Understøtning</th><th /></tr></thead><tbody>
          {m.nodes.map(n => (
            <tr key={n.id} className={isSel('node', n.id) ? 'sel' : ''}>
              <td className="id" onClick={() => setSel([{ kind: 'node', id: n.id }])}>{n.id}</td>
              <td><Num value={n.x} onCommit={v => commit(updateNode(model, n.id, { x: round(v) }))} /></td>
              <td><Num value={n.y} onCommit={v => commit(updateNode(model, n.id, { y: round(v) }))} /></td>
              <td>
                <select value={supportsByNode[n.id] ? supportType(supportsByNode[n.id]) : ''} onChange={e => commit(setSupport(model, n.id, e.target.value || null))}>
                  <option value="">—</option>
                  {SUPPORT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  {supportsByNode[n.id] && supportType(supportsByNode[n.id]) === 'custom' && <option value="custom">Brugerdefineret</option>}
                </select>
              </td>
              <td><button className="x" title="Slet knuden og dens stænger" onClick={() => commit(deleteSelection(model, [{ kind: 'node', id: n.id }]))}>✕</button></td>
            </tr>
          ))}
        </tbody></table>
      )
    }
    if (tab === 'elements') {
      if (!m.elements.length) return <div className="fem-tbl-empty">Ingen stænger endnu.</div>
      return (
        <table><thead><tr><th>Stang</th><th>Led</th><th>Fra</th><th>Til</th><th>L [m]</th><th>Type</th><th>Charnier</th><th>Materiale</th><th>Tværsnit</th><th>Kvalitet</th>{showResults && <th>η</th>}<th /></tr></thead><tbody>
          {m.elements.map(el => {
            const c = showResults ? memberChecks[el.member_id] : null
            return (
              <tr key={el.id} className={isSel('elem', el.id) ? 'sel' : ''}>
                <td className="id" onClick={() => setSel([{ kind: 'elem', id: el.id }])}>{el.id}</td>
                <td><Num value={el.member_id ?? null} onCommit={v => commit(updateElements(model, [el.id], { member_id: v > 0 ? Math.round(v) : undefined }))} /></td>
                <td className={nodeIds.has(el.ni) ? '' : 'bad'}><Num value={el.ni} onCommit={v => commit(updateElements(model, [el.id], { ni: Math.round(v) }))} /></td>
                <td className={nodeIds.has(el.nj) ? '' : 'bad'}><Num value={el.nj} onCommit={v => commit(updateElements(model, [el.id], { nj: Math.round(v) }))} /></td>
                <td style={{ fontFamily: 'var(--font-mono)', padding: '0 8px' }}>{fmt(elementLength(m, el))}</td>
                <td><select value={el.type ?? 'beam'} onChange={e => commit(updateElements(model, [el.id], { type: e.target.value }))}><option value="beam">Bjælke</option><option value="truss">Gitter</option></select></td>
                <td><select value={el.release ?? 'none'} onChange={e => commit(updateElements(model, [el.id], { release: e.target.value }))}>
                  <option value="none">—</option><option value="start">Start</option><option value="end">Slut</option><option value="both">Begge</option></select></td>
                <td><select value={el.material ?? ''} onChange={e => {
                  const def = MATERIALS.find(x => x.key === e.target.value)
                  commit(updateElements(model, [el.id], def ? { material: def.key, section: def.def, grade: def.grade } : { material: undefined, section: undefined, grade: undefined }))
                }}>{MATERIALS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}<option value="">Egne tal</option></select></td>
                <td>{el.material === 'steel'
                  ? <select value={el.section} onChange={e => commit(updateElements(model, [el.id], { section: e.target.value }))}>{STEEL_SECTIONS.map(s => <option key={s}>{s}</option>)}</select>
                  : el.material ? <input defaultValue={el.section} key={el.section} onBlur={e => commit(updateElements(model, [el.id], { section: e.target.value }))} /> : <span className="fem-status">E/A/I</span>}</td>
                <td>{el.material ? <select value={el.grade} onChange={e => commit(updateElements(model, [el.id], { grade: e.target.value }))}>{(MATERIALS.find(x => x.key === el.material)?.grades ?? []).map(g => <option key={g}>{g}</option>)}</select> : null}</td>
                {showResults && <td style={{ fontFamily: 'var(--font-mono)', color: c ? etaColor(c.eta) : undefined, padding: '0 8px' }}>{c && typeof c.eta === 'number' ? fmt(c.eta) : '—'}</td>}
                <td><button className="x" title="Slet stangen" onClick={() => commit(deleteSelection(model, [{ kind: 'elem', id: el.id }]))}>✕</button></td>
              </tr>
            )
          })}
        </tbody></table>
      )
    }
    if (tab === 'loads') {
      if (!m.loads.length) return <div className="fem-tbl-empty">Ingen laster endnu. Vælg Last-værktøjet og klik på en stang eller en knude.</div>
      return (
        <table><thead><tr><th>#</th><th>Lasttilfælde</th><th>Type</th><th>Virker på</th><th>Retning</th><th>Værdi</th><th /></tr></thead><tbody>
          {m.loads.map((l, i) => {
            const patch = (p) => commit({ ...model, loads: model.loads.map((x, j) => (j === i ? { ...x, ...p } : x)) })
            return (
              <tr key={i} className={isSel('load', i) ? 'sel' : ''}>
                <td className="id" onClick={() => setSel([{ kind: 'load', id: i }])}>{i + 1}</td>
                <td>{m.load_cases.length
                  ? <select value={l.lc ?? ''} onChange={e => patch({ lc: e.target.value === '' ? undefined : Number(e.target.value) })}>
                      <option value="">— intet</option>{m.load_cases.map(t => <option key={t.nr} value={t.nr}>LC{t.nr} {t.navn}</option>)}</select>
                  : <span className="fem-status">—</span>}</td>
                <td style={{ padding: '0 8px' }}>{l.type === 'nodal' ? 'Punktlast' : l.type === 'udl' ? 'Linjelast' : l.type === 'vind_udl' ? 'Vind (zone)' : l.type}</td>
                <td style={{ padding: '0 8px', fontFamily: 'var(--font-mono)' }}>{l.type === 'nodal' ? `knude ${l.node_id}` : (l.target ?? 'elem') === 'member' ? `led ${l.member_id}` : `stang ${l.elem_id}`}</td>
                <td>{l.type === 'udl'
                  ? <select value={l.direction ?? 'vertical'} onChange={e => patch({ direction: e.target.value })}>{DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
                  : l.type === 'nodal' ? <span className="fem-status">F_x / F_y</span> : null}</td>
                <td>{l.type === 'udl'
                  ? <Num value={l.value_kNm ?? l.wy_kNm ?? 0} onCommit={v => patch({ value_kNm: v })} />
                  : l.type === 'nodal' ? <span style={{ display: 'flex', gap: 4 }}><Num value={l.Fx_kN ?? 0} onCommit={v => patch({ Fx_kN: v })} /><Num value={l.Fy_kN ?? 0} onCommit={v => patch({ Fy_kN: v })} /></span> : null}</td>
                <td><button className="x" title="Slet lasten" onClick={() => commit(deleteSelection(model, [{ kind: 'load', id: i }]))}>✕</button></td>
              </tr>
            )
          })}
        </tbody></table>
      )
    }
    return null
  }

  // ── Status ──────────────────────────────────────────────────────────────
  const status = running ? { cls: '', text: 'Regner…' }
    : error ? { cls: 'err', text: 'Beregningen fejlede — se fejlen i blokken' }
    : !hasResult ? { cls: '', text: 'Ikke regnet' }
    : stale ? { cls: 'warn', text: 'Modellen er ændret — regn igen' }
    : { cls: '', text: 'Regnet · resultaterne vises på modellen' }

  const empty = m.nodes.length === 0

  return (
    <div className="fem-ws" role="dialog" aria-modal="true" aria-label={`Model: ${title}`}>
      <header className="fem-bar">
        <h1>{title}</h1>
        <span className="sub">Rammeberegning · 2D</span>
        <span className="fem-sp" />
        <span className={`fem-status ${status.cls}`}>{status.text}</span>
        <Button size="sm" onClick={() => setGenOpen(true)}>Generér system…</Button>
        <Button size="sm" onClick={onClose}>Tilbage til dokumentet</Button>
        <Button size="sm" variant="primary" busy={running} onClick={onRun} title="F5">▶ Regn</Button>
      </header>

      <div className="fem-tools" role="toolbar" aria-label="Værktøjer">
        {TOOLS.map(t => (
          <button key={t.key} className={'fem-tool' + (tool === t.key ? ' on' : '')} onClick={() => { setTool(t.key); setChainFrom(null) }} title={TOOL_HINT[t.key]}>
            {t.label} <kbd>{t.kbd}</kbd>
          </button>
        ))}
        <span className="fem-sep" />
        <span className="fem-status">Gitter</span>
        <select className="fem-sel" value={snap} onChange={e => setSnap(Number(e.target.value))} aria-label="Gitterafstand">
          {[0.01, 0.05, 0.1, 0.25, 0.5, 1].map(s => <option key={s} value={s}>{String(s).replace('.', ',')} m</option>)}
        </select>
        <button className="fem-tool" onClick={fit} title="F">Vis alt</button>
        <label className="fem-check" style={{ marginLeft: 6 }}><input type="checkbox" checked={showIds} onChange={e => setShowIds(e.target.checked)} /> Numre</label>
        {resultsOk && (
          <>
            <span className="fem-sep" />
            <span className="fem-seg" role="group" aria-label="Resultatvisning">
              {[['model', 'Model'], ['u', 'Deformation'], ['M', 'M'], ['V', 'V'], ['N', 'N'], ['eta', 'Udnyttelse']].map(([k, l]) => (
                <button key={k} className={resView === k ? 'on' : ''} onClick={() => {
                  setResView(k)
                  // Reading results with the Last tool still active would add
                  // a load on the next click.
                  if (k !== 'model') { setTool('select'); setChainFrom(null) }
                }}
                        disabled={k === 'eta' && !memberChecks}>{l}</button>
              ))}
            </span>
            {['u', 'M', 'V', 'N'].includes(resView) && states.length > 0 && (
              <>
                <select className="fem-sel" value={String(curIdx)} onChange={e => setResIdx(e.target.value === 'env' ? 'env' : Number(e.target.value))} aria-label="Kombination" style={{ maxWidth: 260 }}>
                  {states.map((st, i) => <option key={i} value={i}>{st.name}{i === governingIdx && states.length > 1 ? ' (dimensionerende)' : ''}</option>)}
                  {states.length > 1 && resView !== 'u' && <option value="env">Indhyldning, alle kombinationer (min/max)</option>}
                </select>
                <span className="fem-status">Skala</span>
                <input type="range" min="0.25" max="3" step="0.05" value={ordScale} onChange={e => setOrdScale(Number(e.target.value))} aria-label="Ordinatskala" style={{ width: 90 }} />
              </>
            )}
          </>
        )}
        {m.load_cases.length > 0 && (
          <>
            <span className="fem-sep" />
            <span className="fem-status">Viser laster</span>
            <select className="fem-sel" value={showAllLoads ? 'all' : String(activeLc ?? '')} onChange={e => {
              if (e.target.value === 'all') setShowAllLoads(true)
              else { setShowAllLoads(false); setActiveLc(Number(e.target.value)) }
            }}>
              {m.load_cases.map(t => <option key={t.nr} value={t.nr}>LC{t.nr} {t.navn}</option>)}
              <option value="all">Alle lasttilfælde</option>
            </select>
          </>
        )}
      </div>

      <nav className="fem-nav" aria-label="Navigator">
        <div className="fem-nav-g">Model</div>
        {[['nodes', 'Knuder'], ['elements', 'Stænger'], ['loads', 'Laster']].map(([k, l]) => (
          <button key={k} className={'fem-nav-i' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}<small>{counts[k]}</small></button>
        ))}
        <button className="fem-nav-i" onClick={() => setTab('nodes')}>Understøtninger<small>{counts.supports}</small></button>
        <button className="fem-nav-i" onClick={() => setTab('elements')}>Led<small>{Object.keys(members).length}</small></button>

        <div className="fem-nav-g">Lasttilfælde <button onClick={addLoadCase} title="Nyt lasttilfælde">+ Nyt</button></div>
        {m.load_cases.length === 0 && <div className="fem-nav-i" style={{ color: 'var(--muted)' }}>Ingen — lasterne regnes som de står</div>}
        {m.load_cases.map(t => (
          <div key={t.nr} className={'fem-nav-i' + (!showAllLoads && activeLc === t.nr ? ' on' : '')} onClick={() => { setActiveLc(t.nr); setShowAllLoads(false) }} style={{ cursor: 'pointer' }}>
            <span className="lc">LC{t.nr}</span>
            <input value={t.navn ?? ''} onChange={e => updateLoadCase(t.nr, { navn: e.target.value })} onClick={e => e.stopPropagation()}
              style={{ border: 0, background: 'transparent', font: 'inherit', color: 'inherit', minWidth: 0, flex: 1 }} aria-label="Navn" />
            <select value={t.kategori ?? 'permanent'} onChange={e => updateLoadCase(t.nr, { kategori: e.target.value })} onClick={e => e.stopPropagation()}
              style={{ border: 0, background: 'transparent', font: '500 11px var(--font-mono)', color: 'var(--muted)', width: 36 }} title="Kategori" aria-label="Kategori">
              {KATEGORIER.map(k => <option key={k.value} value={k.value}>{k.label.slice(0, 1)}</option>)}
            </select>
            <button onClick={e => { e.stopPropagation(); removeLoadCase(t.nr) }} title="Slet lasttilfældet (lasterne bliver stående uden tilfælde)"
              style={{ border: 0, background: 'none', color: 'var(--faint)' }}>✕</button>
          </div>
        ))}

        {rated.length > 0 && (
          <>
            <div className="fem-nav-g">Eftervisning</div>
            {rated.map(([id, c]) => (
              <button key={id} className="fem-nav-i" onClick={() => {
                const els = members[id] ?? []
                setSel(els.map(e => ({ kind: 'elem', id: e.id }))); setTab('elements')
              }}>
                Led {id}
                <small style={{ color: c.N_kN != null && c.eta <= 1 ? '#b45309' : etaColor(c.eta), fontWeight: 600 }}>
                  {fmt(c.eta)}{c.N_kN != null && c.eta <= 1 ? ' · kun M+V' : ''}
                </small>
              </button>
            ))}
          </>
        )}
      </nav>

      <div className={`fem-canvas t-${tool}${drag?.kind === 'pan' ? ' panning' : ''}`} ref={wrapRef}>
        <svg ref={svgRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
             onPointerLeave={() => { setHover(null) }} onWheel={onWheel} onContextMenu={e => { e.preventDefault(); setChainFrom(null) }}>
          {renderGrid()}
          {(!resultsOk || resView === 'model') && visibleLoads.map(renderLoad)}
          {renderModel()}
          {diagramView && renderDiagrams()}
          {renderOverlay()}
        </svg>
        {hover && <div className="fem-coord">x = {fmt(hover.x)} m · y = {fmt(hover.y)} m</div>}
        {probe && (
          <div className="fem-probe" style={{ left: Math.min(probe.sx + 14, size.w - 230), top: Math.max(probe.sy - 70, 8) }}>
            <b>Stang {probe.el.id}{probe.el.member_id != null ? ` · led ${probe.el.member_id}` : ''} · x = {fmt(probe.x)} m</b>
            {probe.p
              ? <span>N = {fmt(probe.p.N)} kN · V = {fmt(probe.p.V)} kN · M = {fmt(probe.p.M)} kNm</span>
              : <span>M {fmt(probe.env.Mmin)} … {fmt(probe.env.Mmax)} kNm · N {fmt(probe.env.Nmin)} … {fmt(probe.env.Nmax)} kN</span>}
            <small>{probe.name}</small>
          </div>
        )}
        {diagramView && resView !== 'u' && (
          <div className="fem-legend">
            {resView === 'M' && <span>M tegnet på trækside</span>}
            {resView === 'N' && <><span><i style={{ background: '#2563eb' }} />træk</span><span><i style={{ background: '#dc2626' }} />tryk</span></>}
            {resView === 'V' && <span>V · + efter stangens lokale akse</span>}
          </div>
        )}
        <div className="fem-hint">{chainFrom != null ? `Stang fra knude ${chainFrom} — klik næste punkt · Esc afslutter` : TOOL_HINT[tool]}</div>
        {showResults && (
          <div className="fem-legend">
            <span><i style={{ background: '#15803d' }} />η ≤ 0,90</span>
            <span><i style={{ background: '#d97706' }} />0,90–1,00 / kun M+V</span>
            <span><i style={{ background: '#b91c1c' }} />&gt; 1,00</span>
          </div>
        )}
        {empty && (
          <div className="fem-empty">
            <b style={{ color: 'var(--ink)', fontSize: 15 }}>Tom model</b>
            <span>Tegn med Stang-værktøjet (S), eller start fra et standardsystem.</span>
            <div>
              <Button variant="primary" onClick={() => setGenOpen(true)}>Generér system…</Button>
              <Button onClick={() => setTool('member')}>Tegn selv</Button>
            </div>
          </div>
        )}
      </div>

      <aside className="fem-props" aria-label="Egenskaber">{renderProps()}</aside>

      <div className="fem-tables">
        <div className="fem-tabs" role="tablist">
          {[['nodes', 'Knuder'], ['elements', 'Stænger'], ['loads', 'Laster']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} <span className="fem-status">{counts[k]}</span></button>
          ))}
          <span className="fem-sp" />
          {tab === 'nodes' && <button className="add" onClick={() => {
            const b = bounds(m); const r = addNode(model, round(m.nodes.length ? b.maxX + 1 : 0), 0); commit(r.model); setSel([{ kind: 'node', id: r.id }])
          }}>+ Knude</button>}
        </div>
        <div className="fem-tbl">{renderTable()}</div>
      </div>

      {genOpen && (
        <GeneratorDialog hasModel={!empty} onClose={() => setGenOpen(false)} onApply={(g) => {
          setGenOpen(false)
          if (!g) return
          // Loads keep their load cases; loads pointing at geometry that no longer exists are dropped
          const next = { ...model, ...g }
          const ids = new Set(g.elements.map(e => e.id)), mids = new Set(g.elements.map(e => e.member_id)), nids = new Set(g.nodes.map(n => n.id))
          next.loads = model.loads.filter(l => l.type === 'nodal' ? nids.has(l.node_id) : (l.target ?? 'elem') === 'member' ? mids.has(l.member_id) : ids.has(l.elem_id))
          commit(next)
          setSel([])
          fitted.current = false
          requestAnimationFrame(() => { fitted.current = false })
          setTimeout(() => {
            const b = bounds(next)
            const w = Math.max(b.maxX - b.minX, 1), h = Math.max(b.maxY - b.minY, 1)
            const scale = Math.max(8, Math.min(400, Math.min((size.w - 160) / w, (size.h - 140) / h)))
            setView({ cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, scale })
          }, 0)
        }} />
      )}
    </div>
  )
}
