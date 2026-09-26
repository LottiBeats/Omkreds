/**
 * femModel.js — editing operations on a 2D frame model.
 *
 * The model is the FEM block's own data, unchanged:
 *   nodes      [{ id, x, y }]                                   metres, y up
 *   elements   [{ id, ni, nj, type: 'beam'|'truss',
 *                 release: 'none'|'start'|'end'|'both',
 *                 member_id, material, section, grade }]       or raw E_GPa/A_cm2/Iz_cm4
 *   supports   [{ node_id, ux, uy, rz }]
 *   loads      [{ type: 'nodal', node_id, Fx_kN, Fy_kN, Mz_kNm, lc }
 *               { type: 'udl', target: 'member'|'elem', member_id|elem_id,
 *                 direction, value_kNm, x1?, x2?, value_end_kNm?, lc }]
 *   load_cases [{ nr, navn, kategori, gruppe? }]
 *   equal_dofs [{ r_node, c_node, dofs }]
 *
 * Every function takes a model and returns a new one; nothing is mutated, so
 * the editor's undo (which keeps previous block data) just works.
 */

export const EPS = 1e-6

const nextId = (list, key = 'id') => list.reduce((m, x) => Math.max(m, Number(x[key]) || 0), 0) + 1

export function emptyModel() {
  return { nodes: [], elements: [], supports: [], loads: [], load_cases: [], equal_dofs: [] }
}

export function pick(d) {
  return {
    nodes:      d.nodes      ?? [],
    elements:   d.elements   ?? [],
    supports:   d.supports   ?? [],
    loads:      d.loads      ?? [],
    load_cases: d.load_cases ?? [],
    equal_dofs: d.equal_dofs ?? [],
  }
}

export const round = (v, step = 1e-4) => Math.round(v / step) * step

export function nodeAt(m, x, y, tol = 1e-4) {
  return m.nodes.find(n => Math.abs(n.x - x) < tol && Math.abs(n.y - y) < tol) ?? null
}

/** Add a node, or return the one already at that point. */
export function addNode(m, x, y) {
  const hit = nodeAt(m, x, y)
  if (hit) return { model: m, id: hit.id }
  const id = nextId(m.nodes)
  return { model: { ...m, nodes: [...m.nodes, { id, x: round(x), y: round(y) }] }, id }
}

export function elementLength(m, el) {
  const a = m.nodes.find(n => n.id === el.ni), b = m.nodes.find(n => n.id === el.nj)
  return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0
}

/**
 * Add a member between two nodes. A drawn member is one member (its own
 * member_id); it may later be split into several elements at nodes, which
 * keeps the member_id so design and reporting still see one rafter.
 */
export function addElement(m, ni, nj, props = {}) {
  if (ni === nj) return { model: m, id: null }
  const dup = m.elements.find(e => (e.ni === ni && e.nj === nj) || (e.ni === nj && e.nj === ni))
  if (dup) return { model: m, id: dup.id }
  const id = nextId(m.elements)
  const member_id = nextId(m.elements, 'member_id')
  const el = { id, ni, nj, type: 'beam', release: 'none', member_id, ...props }
  return { model: { ...m, elements: [...m.elements, el] }, id }
}

/** Parameter t ∈ (0,1) of the closest point on an element, and the distance to it. */
export function projectOnElement(m, el, x, y) {
  const a = m.nodes.find(n => n.id === el.ni), b = m.nodes.find(n => n.id === el.nj)
  if (!a || !b) return null
  const dx = b.x - a.x, dy = b.y - a.y
  const L2 = dx * dx + dy * dy
  if (L2 < EPS) return null
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2))
  const px = a.x + t * dx, py = a.y + t * dy
  return { t, x: px, y: py, dist: Math.hypot(x - px, y - py) }
}

const releaseAt = (rel, end) => rel === 'both' || rel === end
const releaseOf = (s, e) => (s && e ? 'both' : s ? 'start' : e ? 'end' : 'none')

/**
 * Split an element at the point (x, y) on it: the first part keeps the id and
 * the start release, the second gets a new id and the end release. Both keep
 * the member_id, section and material. Loads aimed at the old element follow
 * both parts.
 */
export function splitElement(m, elemId, x, y) {
  const el = m.elements.find(e => e.id === elemId)
  if (!el) return { model: m, nodeId: null }
  const { model: m1, id: k } = addNode(m, x, y)
  if (k === el.ni || k === el.nj) return { model: m1, nodeId: k }
  const newId = nextId(m1.elements)
  const first  = { ...el, nj: k, release: releaseOf(releaseAt(el.release, 'start'), false) }
  const second = { ...el, id: newId, ni: k, release: releaseOf(false, releaseAt(el.release, 'end')) }
  const elements = m1.elements.flatMap(e => (e.id === el.id ? [first, second] : [e]))
  const loads = m1.loads.flatMap(l =>
    ((l.target ?? 'elem') === 'elem' && l.elem_id === el.id && l.type !== 'nodal')
      ? [l, { ...l, elem_id: newId }]
      : [l])
  return { model: { ...m1, elements, loads }, nodeId: k }
}

/** Toggle a moment release at one end of an element, by the node it touches. */
export function toggleRelease(m, elemId, nodeId) {
  return {
    ...m,
    elements: m.elements.map(e => {
      if (e.id !== elemId) return e
      const s = releaseAt(e.release, 'start'), en = releaseAt(e.release, 'end')
      if (e.ni === nodeId) return { ...e, release: releaseOf(!s, en) }
      if (e.nj === nodeId) return { ...e, release: releaseOf(s, !en) }
      return e
    }),
  }
}

/** Is there a hinge at this node (some, but not all, beam ends released)? */
export function hasNodeHinge(m, nodeId) {
  const ends = m.elements.filter(e => (e.type ?? 'beam') === 'beam' && (e.ni === nodeId || e.nj === nodeId))
  return ends.some(e => releaseAt(e.release, e.ni === nodeId ? 'start' : 'end'))
}

/**
 * Hinge at a node, as RFEM models it: every beam end at the node is released
 * except one, which keeps the node's rotation stiff. Releasing all of them
 * leaves the rotation undefined and the backend rejects the model.
 * Toggling again removes every release at the node.
 */
export function toggleNodeHinge(m, nodeId) {
  const touching = m.elements.filter(e => (e.type ?? 'beam') === 'beam' && (e.ni === nodeId || e.nj === nodeId))
  if (touching.length < 2) return m
  const on = hasNodeHinge(m, nodeId)
  const keep = touching[0].id
  return {
    ...m,
    elements: m.elements.map(e => {
      if (!touching.some(t => t.id === e.id)) return e
      const atStart = e.ni === nodeId
      const s = releaseAt(e.release, 'start'), en = releaseAt(e.release, 'end')
      const want = on ? false : e.id !== keep
      return { ...e, release: atStart ? releaseOf(want, en) : releaseOf(s, want) }
    }),
  }
}

export const SUPPORT_TYPES = [
  { key: 'fixed',  label: 'Indspændt',        ux: true,  uy: true,  rz: true },
  { key: 'pinned', label: 'Charnier (fast)',  ux: true,  uy: true,  rz: false },
  { key: 'roller', label: 'Rulle (lodret)',   ux: false, uy: true,  rz: false },
  { key: 'rollerx',label: 'Rulle (vandret)',  ux: true,  uy: false, rz: false },
]

export function supportType(s) {
  if (!s) return null
  return SUPPORT_TYPES.find(t => t.ux === !!s.ux && t.uy === !!s.uy && t.rz === !!s.rz)?.key ?? 'custom'
}

export function setSupport(m, nodeId, typeKey) {
  const others = m.supports.filter(s => s.node_id !== nodeId)
  if (!typeKey) return { ...m, supports: others }
  const t = SUPPORT_TYPES.find(x => x.key === typeKey)
  return { ...m, supports: [...others, { node_id: nodeId, ux: t.ux, uy: t.uy, rz: t.rz }] }
}

/** Next support type in the cycle, for clicking a node repeatedly. */
export function cycleSupport(m, nodeId) {
  const cur = supportType(m.supports.find(s => s.node_id === nodeId))
  const order = ['pinned', 'roller', 'fixed', 'rollerx', null]
  const i = cur ? order.indexOf(cur) : -1
  return setSupport(m, nodeId, order[(i + 1) % order.length])
}

/** Delete nodes, elements and loads — and everything that pointed at them. */
export function deleteSelection(m, sel) {
  const nodeIds = new Set(sel.filter(s => s.kind === 'node').map(s => s.id))
  const elemIds = new Set(sel.filter(s => s.kind === 'elem').map(s => s.id))
  const loadIdx = new Set(sel.filter(s => s.kind === 'load').map(s => s.id))
  const elements = m.elements.filter(e => !elemIds.has(e.id) && !nodeIds.has(e.ni) && !nodeIds.has(e.nj))
  const alive = new Set(elements.map(e => e.id))
  const members = new Set(elements.map(e => e.member_id))
  // A node left with no element and no support is debris — take it too.
  const used = new Set(elements.flatMap(e => [e.ni, e.nj]))
  const nodes = m.nodes.filter(n => !nodeIds.has(n.id) && (used.has(n.id) || m.supports.some(s => s.node_id === n.id && !nodeIds.has(n.id))))
  const liveNode = new Set(nodes.map(n => n.id))
  const loads = m.loads.filter((l, i) => {
    // Loads from "Laster på rammen" are removed there, not here.
    if (loadIdx.has(i)) return l.kilde === 'rammelaster'
    if (l.type === 'nodal') return liveNode.has(l.node_id)
    if ((l.target ?? 'elem') === 'member') return members.has(l.member_id)
    return alive.has(l.elem_id)
  })
  return {
    ...m, nodes, elements, loads,
    supports: m.supports.filter(s => liveNode.has(s.node_id)),
    equal_dofs: m.equal_dofs.filter(q => liveNode.has(q.r_node) && liveNode.has(q.c_node)),
  }
}

export function updateNode(m, id, patch) {
  return { ...m, nodes: m.nodes.map(n => (n.id === id ? { ...n, ...patch } : n)) }
}

export function updateElements(m, ids, patch) {
  const set = new Set(ids)
  return { ...m, elements: m.elements.map(e => (set.has(e.id) ? { ...e, ...patch } : e)) }
}

/** Everything in a member, for "select the whole rafter". */
export function memberElements(m, memberId) {
  return m.elements.filter(e => e.member_id === memberId)
}

export function bounds(m) {
  if (!m.nodes.length) return { minX: 0, minY: 0, maxX: 10, maxY: 5 }
  const xs = m.nodes.map(n => n.x), ys = m.nodes.map(n => n.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}
