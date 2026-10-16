/**
 * femLoads.js — line loads on members, placed on the elements under them.
 *
 * A member (one rafter) may be split into several elements at nodes — at the
 * collar tie, at a purlin. A load on the member is measured along the member:
 * "zone G from 0 to e/10" means the first e/10 of the rafter, wherever the
 * elements happen to be split. The solver only knows elements, so each load
 * is cut into the parts that fall on each element, with x measured from that
 * element's own i-end and the intensity interpolated at the cuts.
 *
 * Without x1/x2/value_end the load covers the whole member at one intensity,
 * and it becomes the same full-length load on every element, as it always has.
 */

const EPS = 1e-9

/**
 * The elements of a member in order along it, each with its start and end
 * position on the member and whether it runs backwards (nj first).
 * Returns null when the elements are not one unbranched chain.
 */
export function memberChain(memberElems, nodesById) {
  if (!memberElems.length) return null
  const deg = new Map()
  for (const e of memberElems) for (const n of [e.ni, e.nj]) deg.set(n, (deg.get(n) ?? 0) + 1)
  const ends = [...deg.entries()].filter(([, d]) => d === 1).map(([n]) => n)
  if (memberElems.length > 1 && ends.length !== 2) return null
  // The member starts where its first-drawn element starts, when that is an
  // end of the chain; otherwise at the end an element leaves from.
  const first = [...memberElems].sort((a, b) => a.id - b.id)[0]
  let start = memberElems.length === 1 ? first.ni
    : ends.includes(first.ni) ? first.ni
    : ends.find(n => memberElems.some(e => e.ni === n)) ?? ends[0]
  const out = []
  const left = new Set(memberElems.map(e => e.id))
  let s = 0, at = start
  while (left.size) {
    const e = memberElems.find(x => left.has(x.id) && (x.ni === at || x.nj === at))
    if (!e) return null
    left.delete(e.id)
    const rev = e.nj === at
    const a = nodesById[e.ni], b = nodesById[e.nj]
    if (!a || !b) return null
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    out.push({ el: e, s0: s, s1: s + L, L, rev })
    s += L
    at = rev ? e.ni : e.nj
  }
  return out
}

export const isPartial = (ld) => ld.x1 != null || ld.x2 != null || ld.value_end_kNm != null

/**
 * One member load → element loads. Loads without x1/x2/value_end keep the
 * old behaviour exactly (a copy per element). Returns [] parts for elements
 * the load does not reach.
 */
export function splitMemberLoad(ld, memberElems, nodesById) {
  const plain = (e) => ({ ...ld, target: 'elem', elem_id: e.id, member_id: undefined, elem_ids: undefined })
  if (!isPartial(ld)) return memberElems.map(plain)
  const chain = memberChain(memberElems, nodesById)
  if (!chain) return memberElems.map(plain)
  const Lm = chain[chain.length - 1].s1
  const x1 = Math.max(0, Number(ld.x1 ?? 0))
  const x2 = Math.min(Lm, ld.x2 != null && ld.x2 !== '' ? Number(ld.x2) : Lm)
  if (!(x2 - x1 > EPS)) return []
  const w1 = Number(ld.value_kNm ?? 0)
  const w2 = ld.value_end_kNm != null && ld.value_end_kNm !== '' ? Number(ld.value_end_kNm) : w1
  const wAt = (s) => w1 + (w2 - w1) * (s - x1) / (x2 - x1)
  const out = []
  for (const c of chain) {
    const a = Math.max(x1, c.s0), b = Math.min(x2, c.s1)
    if (b - a <= EPS) continue
    // positions on the element, from its own i-end
    let la = a - c.s0, lb = b - c.s0, va = wAt(a), vb = wAt(b)
    if (c.rev) {
      [la, lb] = [c.L - lb, c.L - la]; [va, vb] = [vb, va]
      // 'perpendicular' acts along the element's own local −y, which turns
      // round with the element: a reversed element needs the opposite sign
      // to push on the same face of the member.
      if (ld.direction === 'perpendicular') { va = -va; vb = -vb }
    }
    const full = la <= EPS && lb >= c.L - EPS
    out.push({
      ...ld, target: 'elem', elem_id: c.el.id, member_id: undefined, elem_ids: undefined,
      value_kNm: round(va),
      x1: full ? undefined : round(la), x2: full ? undefined : round(lb),
      value_end_kNm: Math.abs(vb - va) > 1e-12 ? round(vb) : undefined,
    })
  }
  return out
}

const round = (v) => Math.round(v * 1e6) / 1e6

/**
 * En punktlast P [kN] på en stang, a [m] fra dens start, som løseren kan
 * regne: en linjelast P/ε over et stykke ε omkring a. Resten af kæden
 * (fastindspænding, snitkræfter, ekstremer, bøjningslinje, diagrammer) kender
 * allerede afsnit, så den regner punktlasten med uden egen kode. Fejlen i
 * momentet under lasten er P·ε/4 — med ε = L/20000 langt under afrundingen.
 * punkt_kN og punkt_x følger med, så tabel og figurer kan skrive den som P.
 */
export function pointToElement(ld, memberElems, nodesById) {
  const chain = memberChain(memberElems, nodesById)
  if (!chain) return []
  const Lm = chain[chain.length - 1].s1
  const P = Number(ld.value_kN ?? 0)
  const eps = Math.max(Lm / 20000, 1e-5)
  const a = Math.min(Math.max(Number(ld.a ?? Lm / 2), eps), Lm - eps)
  const c = chain.find(x => a >= x.s0 - 1e-12 && a <= x.s1 + 1e-12) ?? chain[chain.length - 1]
  let xe = a - c.s0
  let v = P
  if (c.rev) {
    xe = c.L - xe
    if (ld.direction === 'perpendicular') v = -v
  }
  xe = Math.min(Math.max(xe, eps / 2), c.L - eps / 2)
  return [{
    type: 'udl', target: 'elem', elem_id: c.el.id, direction: ld.direction ?? 'vertical',
    value_kNm: v / eps, x1: round(xe - eps / 2), x2: round(xe + eps / 2),
    lc: ld.lc, virkning: ld.virkning, variant: ld.variant,
    punkt_kN: v, punkt_x: round(xe),
  }]
}

/** Every member load in a list expanded to element loads. */
export function expandLoads(loads, elements, nodes) {
  const nodesById = Object.fromEntries(nodes.map(n => [n.id, n]))
  return loads.flatMap(ld => {
    if (ld.type === 'point') {
      const els = (ld.target ?? 'elem') === 'member'
        ? elements.filter(e => e.member_id === ld.member_id)
        : elements.filter(e => e.id === ld.elem_id)
      return els.length ? pointToElement(ld, els, nodesById) : []
    }
    if (ld.type !== 'udl' || (ld.target ?? 'elem') !== 'member' || ld.member_id == null) return [ld]
    const els = elements.filter(e => e.member_id === ld.member_id)
    if (!els.length) return [ld]
    return splitMemberLoad(ld, els, nodesById)
  })
}

/** Length of a member along its chain (or of the element for an element load). */
export function loadSpan(ld, elements, nodes) {
  const nodesById = Object.fromEntries(nodes.map(n => [n.id, n]))
  const els = (ld.target ?? 'elem') === 'member'
    ? elements.filter(e => e.member_id === ld.member_id)
    : elements.filter(e => e.id === ld.elem_id)
  const ch = memberChain(els, nodesById)
  return ch ? ch[ch.length - 1].s1 : 0
}

const r6 = (v) => Math.round(v * 1e6) / 1e6

/**
 * Turn members (or loose elements) end for end: i and j swap, and so does
 * the local y axis. That is the whole point: "vinkelret på stangen" presses
 * from the local +y side, and which side that is depended on the direction
 * the member happened to be drawn in.
 *
 * The loads must not move with it. A load on a turned element is mirrored
 * along it (x1/x2, start/end intensity), and one that acts in local axes
 * (perpendicular, wy/wx) changes sign so it still pushes the same way.
 * A member load changes only if the member's start actually moved to the
 * other end.
 */
export function flipElements(m, elemIds) {
  const ids = new Set(elemIds)
  const nodesById = Object.fromEntries(m.nodes.map(n => [n.id, n]))
  const byMember = (els, mid) => els.filter(e => e.member_id === mid)
  const mids = new Set(m.elements.filter(e => ids.has(e.id) && e.member_id != null).map(e => e.member_id))
  const swapRel = { start: 'end', end: 'start', both: 'both', none: 'none' }
  const elements = m.elements.map(e => (ids.has(e.id)
    ? { ...e, ni: e.nj, nj: e.ni, release: swapRel[e.release ?? 'none'] ?? e.release }
    : e))

  const lengthOf = (els) => { const c = memberChain(els, nodesById); return c ? c[c.length - 1].s1 : 0 }
  const memberInfo = {}
  for (const mid of mids) {
    const before = memberChain(byMember(m.elements, mid), nodesById)
    const after = memberChain(byMember(elements, mid), nodesById)
    const startOf = (c) => (c ? (c[0].rev ? c[0].el.nj : c[0].el.ni) : null)
    memberInfo[mid] = { flip: startOf(before) !== startOf(after), L: lengthOf(byMember(m.elements, mid)) }
  }

  const mirror = (ld, L) => {
    const out = { ...ld }
    if (ld.direction === 'perpendicular') {
      out.value_kNm = -(ld.value_kNm ?? 0)
      if (ld.value_end_kNm != null) out.value_end_kNm = -ld.value_end_kNm
    }
    if (ld.direction == null) {
      if (ld.wy_kNm != null) out.wy_kNm = -ld.wy_kNm
      if (ld.wx_kNm != null) out.wx_kNm = -ld.wx_kNm
    }
    if (isPartial(ld) && L > 0) {
      const x1 = Number(ld.x1 ?? 0), x2 = ld.x2 != null && ld.x2 !== '' ? Number(ld.x2) : L
      const n1 = r6(L - x2), n2 = r6(L - x1)
      out.x1 = n1 > 1e-9 ? n1 : undefined
      out.x2 = n2 < L - 1e-9 ? n2 : undefined
      if (ld.value_end_kNm != null) {
        out.value_kNm = out.value_end_kNm
        out.value_end_kNm = ld.direction === 'perpendicular' ? -(ld.value_kNm ?? 0) : ld.value_kNm
      }
    }
    return out
  }

  const spejlPunkt = (ld, L) => ({
    ...ld, a: r6(L - Number(ld.a ?? L / 2)),
    value_kN: ld.direction === 'perpendicular' ? -(ld.value_kN ?? 0) : ld.value_kN,
  })
  const loads = m.loads.map(ld => {
    if (ld.type === 'point') {
      if ((ld.target ?? 'elem') === 'member') {
        const info = memberInfo[ld.member_id]
        return info?.flip ? spejlPunkt(ld, info.L) : ld
      }
      if (!ids.has(ld.elem_id)) return ld
      const e = m.elements.find(x => x.id === ld.elem_id)
      const a = nodesById[e?.ni], b = nodesById[e?.nj]
      return a && b ? spejlPunkt(ld, Math.hypot(b.x - a.x, b.y - a.y)) : ld
    }
    if (ld.type !== 'udl') return ld
    if ((ld.target ?? 'elem') === 'member') {
      const info = memberInfo[ld.member_id]
      return info?.flip ? mirror(ld, info.L) : ld
    }
    if (!ids.has(ld.elem_id)) return ld
    const e = m.elements.find(x => x.id === ld.elem_id)
    const a = nodesById[e?.ni], b = nodesById[e?.nj]
    return mirror(ld, a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0)
  })
  return { ...m, elements, loads }
}
