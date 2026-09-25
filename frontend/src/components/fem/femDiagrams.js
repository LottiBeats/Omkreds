/**
 * femDiagrams.js — N, V and M along each element, from a stored result.
 *
 * The backend keeps what it takes to draw every combination again without
 * solving again (`diagram_state`: local end forces, distributed loads as
 * segments, node displacements). These are the same expressions it uses for
 * the report figures (general_frame_fem.section_forces_2d and
 * stanglaster.snitkraefter), so the curves on screen and the curves in the
 * PDF describe one calculation:
 *
 *     N(x) = −N_i − ∫₀ˣ w_x dt
 *     V(x) =  V_i + ∫₀ˣ w_y dt
 *     M(x) = −M_i + V_i·x + ∫₀ˣ (x − t)·w_y dt
 *
 * Segments are [w_start, w_end, a, b] with w linear between a and b.
 */

const GAUSS = [[-Math.sqrt(3 / 5), 5 / 9], [0, 8 / 9], [Math.sqrt(3 / 5), 5 / 9]]

function clip(seg, L) {
  const [w1, w2, oa, ob] = seg.map(Number)
  const a = Math.max(0, oa), b = Math.min(L, ob)
  if (b - a <= 1e-12 || ob - oa <= 1e-12) return null
  const wAt = (x) => w1 + (w2 - w1) * (x - oa) / (ob - oa)
  return [wAt(a), wAt(b), a, b]
}

function integrate(seg, x0, x1, f) {
  if (x1 - x0 <= 1e-15) return 0
  const [w1, w2, a, b] = seg
  const w = (t) => w1 + (w2 - w1) * (t - a) / (b - a)
  const m = 0.5 * (x0 + x1), h = 0.5 * (x1 - x0)
  let s = 0
  for (const [xi, wg] of GAUSS) { const t = m + h * xi; s += wg * w(t) * f(t) }
  return s * h
}

export function sectionForces(pl, x, segsY, segsX, L) {
  const [Ni, Vi, Mi] = pl
  let sumY = 0, momY = 0, sumX = 0
  for (const raw of segsY ?? []) {
    const s = clip(raw, L); if (!s) continue
    const oe = Math.min(x, s[3]); if (oe <= s[2]) continue
    sumY += integrate(s, s[2], oe, () => 1)
    momY += integrate(s, s[2], oe, (t) => x - t)
  }
  for (const raw of segsX ?? []) {
    const s = clip(raw, L); if (!s) continue
    const oe = Math.min(x, s[3]); if (oe > s[2]) sumX += integrate(s, s[2], oe, () => 1)
  }
  return { N: -Ni - sumX, V: Vi + sumY, M: -Mi + Vi * x + momY }
}

/**
 * Samples along one element: [{ x, N, V, M }]. Segment ends are added (just
 * either side) so a jump in V at a partial load shows as a jump.
 */
export function sampleElement(el, L, state, n = 21) {
  const pl = state?.ele_forces?.[String(el.id)]
  if (!pl) return null
  if ((el.type ?? 'beam') === 'truss') {
    const N = -pl[0]
    return [{ x: 0, N, V: 0, M: 0 }, { x: L, N, V: 0, M: 0 }]
  }
  let segs = state.ele_segs?.[String(el.id)]
  if (!segs) {
    const u = state.ele_udl?.[String(el.id)]
    segs = u ? [[[u[0], u[0], 0, L]], [[u[1], u[1], 0, L]]] : [[], []]
  }
  const xs = new Set(Array.from({ length: n }, (_, i) => (L * i) / (n - 1)))
  for (const seg of [...segs[0], ...segs[1]]) {
    for (const x of [seg[2], seg[3]]) {
      if (x > 0 && x < L) { xs.add(Math.max(0, x - 1e-7)); xs.add(Math.min(L, x + 1e-7)) }
    }
  }
  // the stationary point of M under a constant load, so the peak is on the curve
  const [, Vi] = pl
  const wy = segs[0]?.length === 1 && segs[0][0][2] <= 1e-9 && segs[0][0][3] >= L - 1e-9 && segs[0][0][0] === segs[0][0][1] ? segs[0][0][0] : null
  if (wy && Math.abs(wy) > 1e-12) { const xs0 = -Vi / wy; if (xs0 > 0 && xs0 < L) xs.add(xs0) }
  return [...xs].sort((a, b) => a - b).map(x => ({ x, ...sectionForces(pl, x, segs[0], segs[1], L) }))
}

/** All the results a stored FEM block offers, as named states. */
export function resultStates(summary) {
  if (!summary) return []
  const combos = summary.combo_figs ?? []
  if (combos.length) return combos.map(c => ({ name: c.name, state: c.state }))
  return summary.diagram_state ? [{ name: 'Beregning', state: summary.diagram_state }] : []
}

/**
 * Min/max envelope over the given states, point by point, with sign — so the
 * largest sagging and the largest hogging moment are both on the drawing,
 * instead of one |M| that could come from either.
 */
export function envelopeSamples(el, L, states) {
  const per = states.map(s => sampleElement(el, L, s.state)).filter(Boolean)
  if (!per.length) return null
  // resample every curve on the first one's x positions
  const xs = per[0].map(p => p.x)
  const at = (curve, x, k) => {
    for (let i = 1; i < curve.length; i++) {
      if (curve[i].x >= x - 1e-12) {
        const a = curve[i - 1], b = curve[i]
        const t = b.x - a.x > 1e-12 ? (x - a.x) / (b.x - a.x) : 0
        return a[k] + (b[k] - a[k]) * t
      }
    }
    return curve[curve.length - 1][k]
  }
  return xs.map(x => {
    const o = { x }
    for (const k of ['N', 'V', 'M']) {
      let mx = -Infinity, mn = Infinity
      for (const c of per) { const v = at(c, x, k); if (v > mx) mx = v; if (v < mn) mn = v }
      o[k + 'max'] = mx; o[k + 'min'] = mn
    }
    return o
  })
}
