/**
 * ModelSketch.jsx — pure-SVG drawing of the current frame geometry
 *
 * Updates on every keystroke with no server round-trip. The matplotlib figure
 * is still there for the report; this one is for *editing* — and for previewing
 * a parametric system before it is inserted.
 */
import React from 'react'

// ── Live model sketch ─────────────────────────────────────────────────────────
// Pure-SVG drawing of the current geometry: updates on every keystroke with no
// server round-trip.  The matplotlib "Forhåndsvis model" figure is still there
// for the report — this sketch is for *editing* feedback.

const MEMBER_COLORS = ['#1e3a5f', '#d94a2b', '#0f766e', '#7c3aed', '#b45309', '#be185d']
const LOAD = '#dc2626'

/**
 * Loads as they will actually be applied.
 *
 * A load aimed at a member covers every element in it, and that expansion
 * happens on the way to the solver — so the sketch has to do it too, or a
 * rafter looks like it carries snow on one half.
 */
function expandLoads(loads, elements) {
  const out = []
  for (const ld of loads ?? []) {
    if (ld.type === 'udl' && ld.target === 'member' && ld.member_id != null) {
      const inMember = (elements ?? []).filter(e => e.member_id === ld.member_id)
      if (inMember.length) {
        // The arrows cover the whole member, but the value is written once —
        // "1,85 kN/m" repeated over every slice of a rafter is noise, and it
        // reads as four different loads.
        const mid = Math.floor(inMember.length / 2)
        inMember.forEach((e, i) => out.push({
          ...ld, target: 'elem', elem_id: e.id, _label: i === mid,
        }))
        continue
      }
    }
    out.push({ ...ld, _label: true })
  }
  return out
}

const fmt = (v) => {
  const a = Math.abs(v)
  return (a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2))
    .replace('.', ',')
}

export default function ModelSketch({ nodes, elements, supports, equalDofs, loads }) {
  const valid = (nodes ?? []).filter(n => Number.isFinite(n.x) && Number.isFinite(n.y))
  if (valid.length < 2) {
    return (
      <div style={s.sketchEmpty}>
        Tilføj mindst 2 knuder for at se modelskitsen
      </div>
    )
  }

  const W = 700, H = 280, PAD = 42
  const xs = valid.map(n => n.x), ys = valid.map(n => n.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const spanX = Math.max(maxX - minX, 0.5)
  const spanY = Math.max(maxY - minY, 0.5)
  const sc = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY)
  // Centre the drawing in both directions
  const offX = (W - spanX * sc) / 2
  const offY = (H - spanY * sc) / 2
  const X = x => offX + (x - minX) * sc
  const Y = y => H - offY - (y - minY) * sc

  const nodeById = Object.fromEntries(valid.map(n => [n.id, n]))
  const elemById = Object.fromEntries((elements ?? []).map(e => [e.id, e]))

  // ── Loads ───────────────────────────────────────────────────────────────────
  const applied = expandLoads(loads, elements)
  const udls  = applied.filter(l => l.type === 'udl' || l.type === 'combo_udl')
  const nodal = applied.filter(l => l.type === 'nodal')

  const magnitude = (ld) => ld.type === 'combo_udl'
    ? 1
    : Math.abs(Number(ld.value_kNm ?? ld.wy_kNm ?? 0))
  const wMax = Math.max(...udls.map(magnitude), 1e-9)
  const fMax = Math.max(...nodal.map(l =>
    Math.hypot(Number(l.Fx_kN ?? 0), Number(l.Fy_kN ?? 0))), 1e-9)

  // Length in pixels, so a small load still reads and a large one cannot
  // swallow the structure.
  const arrowLen = (v, max) => 11 + 13 * Math.min(1, Math.abs(v) / max)

  return (
    <div style={s.sketchWrap}>
      <div style={s.sketchLabel}>Modelskitse — opdateres live</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        <defs>
          <marker id="ms-arrow" viewBox="0 0 8 8" refX="7" refY="4"
                  markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 8 4 L 0 8 z" fill={LOAD} />
          </marker>
        </defs>

        {/* Elements */}
        {(elements ?? []).map((el, i) => {
          const n1 = nodeById[el.ni], n2 = nodeById[el.nj]
          if (!n1 || !n2) return null
          const pinned = el.type === 'truss' || el.release === 'both'
          const color  = el.member_id != null
            ? MEMBER_COLORS[(el.member_id - 1) % MEMBER_COLORS.length]
            : '#1e3a5f'
          const mx = (X(n1.x) + X(n2.x)) / 2
          const my = (Y(n1.y) + Y(n2.y)) / 2
          // Perpendicular offset for the label so it doesn't sit on the line
          const dx = X(n2.x) - X(n1.x), dy = Y(n2.y) - Y(n1.y)
          const len = Math.hypot(dx, dy) || 1
          const ox = -dy / len * 11, oy = dx / len * 11
          return (
            <g key={`e${i}`}>
              <line x1={X(n1.x)} y1={Y(n1.y)} x2={X(n2.x)} y2={Y(n2.y)}
                stroke={color} strokeWidth={3}
                strokeDasharray={pinned ? '7 5' : undefined} strokeLinecap="round" />
              {/* End releases (single pin) */}
              {(el.release === 'start' || el.release === 'both') && (
                <circle cx={X(n1.x) + dx / len * 9} cy={Y(n1.y) + dy / len * 9} r={3.5}
                  fill="#fff" stroke={color} strokeWidth={1.5} />
              )}
              {(el.release === 'end' || el.release === 'both') && (
                <circle cx={X(n2.x) - dx / len * 9} cy={Y(n2.y) - dy / len * 9} r={3.5}
                  fill="#fff" stroke={color} strokeWidth={1.5} />
              )}
              <text x={mx + ox} y={my + oy} fontSize={10} fill={color}
                fontFamily="monospace" textAnchor="middle" dominantBaseline="middle">
                {el.id}
              </text>
            </g>
          )
        })}

        {/* Supports */}
        {(supports ?? []).map((sp, i) => {
          const n = nodeById[sp.node_id]
          if (!n) return null
          const x = X(n.x), y = Y(n.y)
          const fixed  = sp.ux && sp.uy && sp.rz
          const roller = sp.uy && !sp.ux
          return (
            <g key={`s${i}`} stroke="#475569" strokeWidth={1.6} fill="none">
              {fixed ? (
                <>
                  <line x1={x - 10} y1={y + 5} x2={x + 10} y2={y + 5} />
                  {[-8, -4, 0, 4].map(o => (
                    <line key={o} x1={x + o} y1={y + 5} x2={x + o + 5} y2={y + 11} />
                  ))}
                </>
              ) : (
                <>
                  <path d={`M ${x} ${y} L ${x - 9} ${y + 13} L ${x + 9} ${y + 13} Z`} />
                  {roller
                    ? <line x1={x - 11} y1={y + 17} x2={x + 11} y2={y + 17} />
                    : <>{[-9, -3, 3, 9].map(o => (
                        <line key={o} x1={x + o} y1={y + 13} x2={x + o - 4} y2={y + 18} />
                      ))}</>
                  }
                </>
              )}
            </g>
          )
        })}

        {/* Pin joints (equalDOF) — orange ring at the shared location */}
        {(equalDofs ?? []).map((eq, i) => {
          const n = nodeById[eq.r_node]
          if (!n) return null
          return (
            <circle key={`q${i}`} cx={X(n.x)} cy={Y(n.y)} r={7}
              fill="none" stroke="#ea580c" strokeWidth={2} />
          )
        })}

        {/* Distributed loads — arrows point the way the load acts */}
        {udls.map((ld, i) => {
          const el = elemById[ld.elem_id]
          if (!el) return null
          const n1 = nodeById[el.ni], n2 = nodeById[el.nj]
          if (!n1 || !n2) return null

          const x1 = X(n1.x), y1 = Y(n1.y), x2 = X(n2.x), y2 = Y(n2.y)
          const dxs = x2 - x1, dys = y2 - y1
          const len = Math.hypot(dxs, dys) || 1

          const combo = ld.type === 'combo_udl'
          const w = combo ? 1 : Number(ld.value_kNm ?? ld.wy_kNm ?? 0)
          if (!w) return null
          const dir = ld.direction ?? (combo ? 'vertical' : null)

          // The direction the load acts, in screen coordinates. The element's
          // local +y is (dys, -dxs)/len once the y-flip is taken into account,
          // so a perpendicular load pressing into the surface is its negative.
          let ax, ay
          if (dir === 'vertical' || dir === 'projected') { ax = 0;           ay = 1          }
          else if (dir === 'horizontal')                 { ax = 1;           ay = 0          }
          else                                           { ax = -dys / len;  ay = dxs / len  }
          const sgn = w < 0 ? -1 : 1
          const L = arrowLen(w, wMax) * sgn

          const n = Math.max(3, Math.min(10, Math.round(len / 26)))
          const tail = t => [x1 + t * dxs - ax * L, y1 + t * dys - ay * L]

          const [tx0, ty0] = tail(0), [tx1, ty1] = tail(1)
          const [lx, ly]   = tail(0.5)

          return (
            <g key={`w${i}`} stroke={LOAD} strokeWidth={1.1} opacity={0.9}>
              <line x1={tx0} y1={ty0} x2={tx1} y2={ty1} strokeWidth={1.4} />
              {Array.from({ length: n + 1 }, (_, k) => {
                const t = k / n
                const [sx, sy] = tail(t)
                return <line key={k} x1={sx} y1={sy}
                             x2={x1 + t * dxs} y2={y1 + t * dys}
                             markerEnd="url(#ms-arrow)" />
              })}
              {ld._label && (
                <text x={lx - ax * 11} y={ly - ay * 11} fontSize={9.5} fill={LOAD}
                      stroke="none" fontFamily="monospace" textAnchor="middle"
                      dominantBaseline="middle">
                  {combo ? 'w_Ed' : `${fmt(Math.abs(w))} kN/m`}
                </text>
              )}
            </g>
          )
        })}

        {/* Nodal loads */}
        {nodal.map((ld, i) => {
          const n = nodeById[ld.node_id]
          if (!n) return null
          const Fx = Number(ld.Fx_kN ?? 0), Fy = Number(ld.Fy_kN ?? 0)
          const Mz = Number(ld.Mz_kNm ?? 0)
          const F  = Math.hypot(Fx, Fy)
          const x = X(n.x), y = Y(n.y)

          return (
            <g key={`f${i}`} stroke={LOAD} strokeWidth={1.8}>
              {F > 0 && (() => {
                const L = arrowLen(F, fMax) + 8
                // Model (Fx, Fy) becomes (Fx, -Fy) on screen — y points down
                const ux = Fx / F, uy = -Fy / F
                return (
                  <>
                    <line x1={x - ux * L} y1={y - uy * L} x2={x} y2={y}
                          markerEnd="url(#ms-arrow)" />
                    <text x={x - ux * (L + 13)} y={y - uy * (L + 13)}
                          fontSize={9.5} fill={LOAD} stroke="none"
                          fontFamily="monospace" textAnchor="middle"
                          dominantBaseline="middle">
                      {fmt(F)} kN
                    </text>
                  </>
                )
              })()}
              {Mz !== 0 && (
                <path d={`M ${x + 13} ${y} A 13 13 0 ${Mz > 0 ? 1 : 0} ${Mz > 0 ? 1 : 0} ${x} ${y - 13}`}
                      fill="none" markerEnd="url(#ms-arrow)" />
              )}
            </g>
          )
        })}

        {/* Nodes */}
        {valid.map((n, i) => (
          <g key={`n${i}`}>
            <circle cx={X(n.x)} cy={Y(n.y)} r={3.5} fill="#0f172a" />
            <text x={X(n.x) + 7} y={Y(n.y) - 7} fontSize={10} fill="#64748b"
              fontFamily="monospace">{n.id}</text>
          </g>
        ))}
      </svg>
      <div style={s.sketchLegend}>
        ── bjælke &nbsp;·&nbsp; ╌╌ charnier i begge ender / gitterstang &nbsp;·&nbsp;
        ○ charnier &nbsp;·&nbsp; △ understøtning &nbsp;·&nbsp;
        <span style={{ color: LOAD }}>→ last</span> &nbsp;·&nbsp; farve = gruppe (member)
      </div>
    </div>
  )
}


const s = {
  sketchWrap:   { border: '1px solid #e8e8e8', background: '#fcfcfb', padding: '8px 10px 6px' },
  sketchLabel:  { fontSize: 9, fontWeight: 700, color: '#bbb', letterSpacing: '0.1em',
                  textTransform: 'uppercase', marginBottom: 4 },
  sketchLegend: { fontSize: 10, color: '#94a3b8', marginTop: 4, fontFamily: 'monospace' },
  sketchEmpty:  { border: '1px dashed #e0e0e0', background: '#fcfcfb', padding: '18px 12px',
                  fontSize: 12, color: '#bbb', textAlign: 'center' },
}
