/**
 * femRoles.js — which member is a wall and which is a roof face.
 *
 * "Laster på rammen" needs to know where the wind pushes. A frame drawn with
 * the generator, or by hand, is recognised from its geometry:
 *
 *   wall      a (nearly) vertical member at the left or right edge
 *   roof      a member nobody else lies above — the outer skin seen from the
 *             sky. Rising to the right is the left face, falling the right,
 *             level is a flat roof.
 *   anything else (a collar tie, an inner column) carries no surface load.
 *
 * It is a suggestion; the block shows it and each role can be changed.
 */
import { memberChain } from './femLoads.js'

export const ROLES = [
  { value: 'vaeg_v',   label: 'Væg, venstre' },
  { value: 'tag_v',    label: 'Tag, venstre' },
  { value: 'tag_h',    label: 'Tag, højre' },
  { value: 'vaeg_h',   label: 'Væg, højre' },
  { value: 'tag_flad', label: 'Tag, fladt' },
  { value: 'ingen',    label: 'Ingen fladelast' },
]

/** Each member as one straight line from its start to its end. */
export function memberLines(model) {
  const nodesById = Object.fromEntries(model.nodes.map(n => [n.id, n]))
  const groups = {}
  for (const e of model.elements) if (e.member_id != null) (groups[e.member_id] ??= []).push(e)
  const out = []
  for (const [mid, els] of Object.entries(groups)) {
    const ch = memberChain(els, nodesById)
    if (!ch) continue
    const f = ch[0], l = ch[ch.length - 1]
    const a = nodesById[f.rev ? f.el.nj : f.el.ni], b = nodesById[l.rev ? l.el.ni : l.el.nj]
    if (!a || !b) continue
    out.push({ member_id: Number(mid), x0: a.x, y0: a.y, x1: b.x, y1: b.y, L: ch[ch.length - 1].s1 })
  }
  return out
}

export function detectRoles(model) {
  const lines = memberLines(model)
  if (!lines.length) return {}
  const xs = lines.flatMap(l => [l.x0, l.x1])
  const xmin = Math.min(...xs), xmax = Math.max(...xs)
  const tol = Math.max(1e-3, (xmax - xmin) * 0.01)
  const yAt = (l, x) => {
    const dx = l.x1 - l.x0
    if (Math.abs(dx) < 1e-9) return null
    const t = (x - l.x0) / dx
    return t < -1e-6 || t > 1 + 1e-6 ? null : l.y0 + t * (l.y1 - l.y0)
  }
  const roles = {}
  for (const l of lines) {
    const dx = l.x1 - l.x0, dy = l.y1 - l.y0
    if (Math.abs(dx) < 0.2 * Math.abs(dy)) {
      const x = (l.x0 + l.x1) / 2
      roles[l.member_id] = Math.abs(x - xmin) < tol ? 'vaeg_v' : Math.abs(x - xmax) < tol ? 'vaeg_h' : 'ingen'
      continue
    }
    const mx = (l.x0 + l.x1) / 2, my = (l.y0 + l.y1) / 2
    const covered = lines.some(o => o !== l && Math.abs(o.x1 - o.x0) >= 0.2 * Math.abs(o.y1 - o.y0)
      && (yAt(o, mx) ?? -Infinity) > my + tol)
    if (covered) { roles[l.member_id] = 'ingen'; continue }
    const rise = (dx > 0 ? dy : -dy)          // rise when walking left → right
    roles[l.member_id] = Math.abs(rise) < 0.02 * Math.abs(dx) ? 'tag_flad' : rise > 0 ? 'tag_v' : 'tag_h'
  }
  return roles
}

/**
 * Put the load cases and loads from "Laster på rammen" into a FEM block's
 * data. What came from the module before is replaced; the user's own load
 * cases and loads stay, and the module's cases are numbered after them.
 */
export function applyFrameLoads(femData, exports_, sourceId) {
  const ownCases = (femData.load_cases ?? []).filter(t => t.kilde !== 'rammelaster')
  const ownLoads = (femData.loads ?? []).filter(l => l.kilde !== 'rammelaster')
  const start = ownCases.reduce((m, t) => Math.max(m, Number(t.nr) || 0), 0)
  const map = {}
  const cases = (exports_?.load_cases ?? []).map((t, i) => {
    map[t.nr] = start + i + 1
    return { ...t, nr: start + i + 1 }
  })
  const loads = (exports_?.loads ?? []).map(l => ({ ...l, lc: map[l.lc] ?? l.lc }))
  return {
    ...femData,
    load_cases: [...ownCases, ...cases],
    loads: [...ownLoads, ...loads],
    rammelaster_block_id: sourceId,
  }
}
