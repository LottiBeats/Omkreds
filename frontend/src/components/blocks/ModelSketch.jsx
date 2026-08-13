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

export default function ModelSketch({ nodes, elements, supports, equalDofs }) {
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

  return (
    <div style={s.sketchWrap}>
      <div style={s.sketchLabel}>Modelskitse — opdateres live</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>

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
        ○ charnier &nbsp;·&nbsp; △ understøtning &nbsp;·&nbsp; farve = gruppe (member)
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
