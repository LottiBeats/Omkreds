/**
 * FrameFemResults.jsx — SVG-based results viewer for 2D Frame FEM
 *
 * Renders model, deformed shape, N/V/M diagrams and tables as crisp,
 * interactive SVG — no matplotlib PNG required.
 *
 * Props:
 *   result   — API response: { node_disps, reactions, element_results, summary }
 *   nodes    — [{id, x, y}]
 *   elements — [{id, ni, nj, type, ...}]
 *   supports — [{node_id, ux, uy, rz}]
 *   loads    — [{type:'nodal'|'udl', ...}]
 */
import React, { useState, useRef, useCallback } from 'react'

// ── Palette ───────────────────────────────────────────────────────────────────
const PAL = {
  navy:    '#1e3a5f',
  N: { stroke: '#b7410e', fill: '#fff1e6' },   // axial   — deep amber
  V: { stroke: '#1a56a0', fill: '#ebf4ff' },   // shear   — steel blue
  M: { stroke: '#1a6640', fill: '#e6f7ee' },   // moment  — engineering green
  support: '#64748b',
  load:    '#dc2626',
  deform:  '#7c3aed',
}

// ── Coordinate transform ──────────────────────────────────────────────────────
// Fits the STRUCTURE (nodes only) into the viewport.  Diagrams are drawn in
// SVG-pixel space afterwards — no world-unit expansion needed here.
function makeXform(nodes, W, H, PAD = 52) {
  if (!nodes.length) return null

  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const n of nodes) {
    x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x)
    y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y)
  }

  const bw = Math.max(x1 - x0, 0.5), bh = Math.max(y1 - y0, 0.5)
  x0 -= bw * 0.10; x1 += bw * 0.10
  y0 -= bh * 0.10; y1 += bh * 0.10

  const scale = Math.min((W - 2 * PAD) / (x1 - x0), (H - 2 * PAD) / (y1 - y0))
  const dw = (x1 - x0) * scale, dh = (y1 - y0) * scale
  const ox = (W - dw) / 2, oy = (H - dh) / 2

  return {
    toSvg: (x, y) => [ox + (x - x0) * scale, H - oy - (y - y0) * scale],
    scale,
    span: Math.max(bw, bh),
  }
}

// ── Support symbols ───────────────────────────────────────────────────────────
function SupportSymbol({ x, y, ux, uy, rz, sz = 14 }) {
  const isFixed  = ux && uy && rz
  const isPin    = ux && uy && !rz
  const isRoller = !ux && uy && !rz

  if (isFixed) {
    return (
      <g>
        <rect x={x - sz} y={y} width={sz * 2} height={sz * 0.6}
          fill={PAL.support} stroke="none" />
        {[-sz * 0.7, -sz * 0.2, sz * 0.3].map((dx, i) => (
          <line key={i} x1={x + dx} y1={y} x2={x + dx - 5} y2={y + 9}
            stroke={PAL.support} strokeWidth={1.2} />
        ))}
      </g>
    )
  }
  if (isPin) {
    return (
      <g>
        <polygon points={`${x},${y} ${x - sz},${y + sz} ${x + sz},${y + sz}`}
          fill={PAL.support} stroke="none" />
        <line x1={x - sz} y1={y + sz} x2={x + sz} y2={y + sz}
          stroke={PAL.support} strokeWidth={1.5} />
      </g>
    )
  }
  if (isRoller) {
    return (
      <g>
        <polygon points={`${x},${y} ${x - sz},${y + sz} ${x + sz},${y + sz}`}
          fill="#fff" stroke={PAL.support} strokeWidth={1.5} />
        <circle cx={x} cy={y + sz + 5} r={4} fill={PAL.support} />
        <line x1={x - sz} y1={y + sz + 10} x2={x + sz} y2={y + sz + 10}
          stroke={PAL.support} strokeWidth={1.5} />
      </g>
    )
  }
  // custom
  return (
    <circle cx={x} cy={y} r={6} fill="none" stroke={PAL.support} strokeWidth={1.5} />
  )
}

// ── Load arrows ───────────────────────────────────────────────────────────────
function LoadArrows({ loads, elements, xform }) {
  const elemMap = Object.fromEntries(elements.map(e => [e.id, e]))
  const arrows  = []

  for (const ld of loads) {
    if (ld.type === 'nodal') {
      // already handled separately
    } else if (ld.type === 'udl') {
      const elem = elemMap[ld.elem_id]
      if (!elem) continue
      // 5 arrows uniformly along element
      const ni  = elements.find(e => e.id === elem.id) ? null : null
    }
  }
  return null  // handled inline in ModelSvg
}

// ── Model SVG ─────────────────────────────────────────────────────────────────
function ModelSvg({ nodes, elements, supports, loads, W = 680, H = 320 }) {
  const xf = makeXform(nodes, W, H)
  if (!xf) return null
  const { toSvg, scale, span } = xf
  const sz = Math.max(6, Math.min(14, span * scale * 0.04))
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))

  return (
    <svg width={W} height={H} style={{ display: 'block', background: '#fafbfc' }}>
      {/* Subtle grid */}
      <defs>
        <pattern id="grid" width={40} height={40} patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f0f0f0" strokeWidth={0.5} />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" />

      {/* Elements */}
      {elements.map(elem => {
        const ni = nodeMap[elem.ni], nj = nodeMap[elem.nj]
        if (!ni || !nj) return null
        const [x1, y1] = toSvg(ni.x, ni.y)
        const [x2, y2] = toSvg(nj.x, nj.y)
        const isDashed = elem.type === 'truss'
        return (
          <line key={elem.id} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={PAL.navy} strokeWidth={3} strokeLinecap="round"
            strokeDasharray={isDashed ? '6,4' : undefined} />
        )
      })}

      {/* Element labels */}
      {elements.map(elem => {
        const ni = nodeMap[elem.ni], nj = nodeMap[elem.nj]
        if (!ni || !nj) return null
        const [x1, y1] = toSvg(ni.x, ni.y)
        const [x2, y2] = toSvg(nj.x, nj.y)
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
        return (
          <g key={`lbl-${elem.id}`}>
            <rect x={mx - 10} y={my - 8} width={20} height={14}
              rx={3} fill="white" fillOpacity={0.85} stroke="#e8e8e8" strokeWidth={0.5} />
            <text x={mx} y={my + 3} textAnchor="middle"
              fontSize={9} fill="#64748b" fontFamily="monospace">
              E{elem.id}
            </text>
          </g>
        )
      })}

      {/* UDL arrows */}
      {loads.filter(l => l.type === 'udl').map((ld, i) => {
        const elem = elements.find(e => e.id === ld.elem_id)
        if (!elem) return null
        const ni = nodeMap[elem.ni], nj = nodeMap[elem.nj]
        if (!ni || !nj) return null
        const dx = nj.x - ni.x, dy = nj.y - ni.y
        const L  = Math.hypot(dx, dy)
        const wy = ld.wy_kNm || 0
        if (Math.abs(wy) < 0.01) return null
        const arrowLen = sz * 1.4
        const pts = [0.15, 0.35, 0.5, 0.65, 0.85]
        return pts.map((t, j) => {
          const wx  = ni.x + t * dx, wy2 = ni.y + t * dy
          const [ax, ay] = toSvg(wx, wy2)
          const dir = wy > 0 ? 1 : -1   // positive wy = downward = positive SVG y
          const tx  = ax, ty = ay - dir * arrowLen
          return (
            <g key={`udl-${i}-${j}`}>
              <line x1={tx} y1={ty} x2={ax} y2={ay}
                stroke={PAL.load} strokeWidth={1.5}
                markerEnd="url(#arrowRed)" />
            </g>
          )
        })
      })}

      {/* Nodal loads */}
      {loads.filter(l => l.type === 'nodal').map((ld, i) => {
        const n = nodeMap[ld.node_id]
        if (!n) return null
        const [nx, ny] = toSvg(n.x, n.y)
        const Fx = ld.Fx_kN || 0, Fy = ld.Fy_kN || 0
        const mag = Math.hypot(Fx, Fy)
        if (mag < 0.01) return null
        const aLen = sz * 2.5
        // Arrow tip at node, tail at offset
        const tx = nx - (Fx / mag) * aLen
        const ty = ny + (Fy / mag) * aLen   // Fy positive = upward world = negative SVG
        return (
          <line key={`nl-${i}`} x1={tx} y1={ty} x2={nx} y2={ny}
            stroke={PAL.load} strokeWidth={2}
            markerEnd="url(#arrowRed)" />
        )
      })}

      {/* Supports */}
      {supports.map((sup, i) => {
        const n = nodeMap[sup.node_id]
        if (!n) return null
        const [nx, ny] = toSvg(n.x, n.y)
        return (
          <SupportSymbol key={i} x={nx} y={ny}
            ux={sup.ux} uy={sup.uy} rz={sup.rz} sz={sz} />
        )
      })}

      {/* Nodes */}
      {nodes.map(n => {
        const [nx, ny] = toSvg(n.x, n.y)
        return (
          <g key={n.id}>
            <circle cx={nx} cy={ny} r={5} fill="#fff" stroke={PAL.navy} strokeWidth={2} />
            <text x={nx + 7} y={ny - 5} fontSize={9} fill="#475569" fontFamily="monospace">
              N{n.id}
            </text>
          </g>
        )
      })}

      {/* Arrow marker */}
      <defs>
        <marker id="arrowRed" markerWidth={8} markerHeight={8}
          refX={6} refY={3} orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill={PAL.load} />
        </marker>
      </defs>
    </svg>
  )
}

// ── Deformed shape SVG ────────────────────────────────────────────────────────
function DeformedSvg({ nodes, elements, nodeDisps, W = 680, H = 320 }) {
  const xf = makeXform(nodes, W, H)
  if (!xf || !nodeDisps?.length) return null
  const { toSvg, scale, span } = xf
  const nodeMap  = Object.fromEntries(nodes.map(n => [n.id, n]))
  const dispMap  = Object.fromEntries(nodeDisps.map(d => [d.node_id, d]))

  // Scale factor: max displacement → 10% of span
  const maxDisp = Math.max(
    ...nodeDisps.map(d => Math.hypot(d.ux_mm || 0, d.uy_mm || 0)),
    0.001
  )
  const defScale = (span * 0.10 * 1000) / maxDisp   // mm → world units

  return (
    <svg width={W} height={H} style={{ display: 'block', background: '#fafbfc' }}>
      <defs>
        <pattern id="grid2" width={40} height={40} patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f0f0f0" strokeWidth={0.5} />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#grid2)" />

      {/* Undeformed (dashed) */}
      {elements.map(elem => {
        const ni = nodeMap[elem.ni], nj = nodeMap[elem.nj]
        if (!ni || !nj) return null
        const [x1, y1] = toSvg(ni.x, ni.y)
        const [x2, y2] = toSvg(nj.x, nj.y)
        return (
          <line key={elem.id} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="5,4" />
        )
      })}

      {/* Deformed (coloured) */}
      {elements.map(elem => {
        const ni = nodeMap[elem.ni], nj = nodeMap[elem.nj]
        if (!ni || !nj) return null
        const di = dispMap[elem.ni] || { ux_mm: 0, uy_mm: 0 }
        const dj = dispMap[elem.nj] || { ux_mm: 0, uy_mm: 0 }
        const [x1, y1] = toSvg(
          ni.x + di.ux_mm / 1000 * defScale,
          ni.y + di.uy_mm / 1000 * defScale
        )
        const [x2, y2] = toSvg(
          nj.x + dj.ux_mm / 1000 * defScale,
          nj.y + dj.uy_mm / 1000 * defScale
        )
        return (
          <line key={elem.id} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={PAL.deform} strokeWidth={2.5} strokeLinecap="round" />
        )
      })}

      {/* Deformed nodes */}
      {nodes.map(n => {
        const d = dispMap[n.id] || { ux_mm: 0, uy_mm: 0 }
        const [nx, ny] = toSvg(
          n.x + d.ux_mm / 1000 * defScale,
          n.y + d.uy_mm / 1000 * defScale
        )
        return <circle key={n.id} cx={nx} cy={ny} r={4} fill={PAL.deform} />
      })}

      {/* Scale legend */}
      <text x={12} y={H - 10} fontSize={9} fill="#94a3b8">
        Deformation scale ×{defScale.toFixed(0)}  |  max δ = {maxDisp.toFixed(3)} mm
      </text>
    </svg>
  )
}

// ── Force / moment diagram SVG ────────────────────────────────────────────────
// All perpendicular offsets are computed in SVG pixel space so the diagram
// height is always a fixed number of pixels regardless of model scale.
// MAX_PX = the pixel offset for the largest force value.
const MAX_PX = 55

function DiagramSvg({ nodes, elements, elemResults, type, W = 680, H = 400 }) {
  const col = PAL[type]

  // Fit structure in viewport with generous padding for diagram bleed
  const xf = makeXform(nodes, W, H, 80)
  if (!xf || !elemResults?.length) return null

  const { toSvg } = xf
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))

  const allVals = elemResults.flatMap(er => er[`${type}_arr`] || [])
  const maxAbs  = Math.max(...allVals.map(Math.abs), 0.001)
  const allZero = maxAbs < 0.005

  // px per force unit — max force maps to MAX_PX pixels
  const dscale = MAX_PX / maxAbs

  const unit = type === 'M' ? 'kNm' : 'kN'

  // Build diagram polygons entirely in SVG pixel space
  const diagData = elemResults.map(er => {
    const ni = nodeMap[er.ni], nj = nodeMap[er.nj]
    if (!ni || !nj) return null
    const vals = er[`${type}_arr`] || []
    const xs   = er.xs || []
    if (!xs.length) return null

    // SVG pixel endpoints
    const [sx1, sy1] = toSvg(ni.x, ni.y)
    const [sx2, sy2] = toSvg(nj.x, nj.y)
    const elen = Math.hypot(sx2 - sx1, sy2 - sy1)
    if (elen < 1) return null

    // Unit vector along element (SVG space)
    const eUx = (sx2 - sx1) / elen
    const eUy = (sy2 - sy1) / elen

    // Perpendicular (90° CCW): rotates (ux,uy) → (−uy, ux)
    // Positive force → offset in this direction
    const pUx = -eUy
    const pUy =  eUx

    const L_m = er.L_m || 1

    // Positions along axis in SVG pixels
    const axisPts = xs.map(x => {
      const t = x / L_m
      return [sx1 + t * (sx2 - sx1), sy1 + t * (sy2 - sy1)]
    })

    // Diagram tip positions
    const diagPts = xs.map((x, k) => {
      const [ax, ay] = axisPts[k]
      const F = (vals[k] || 0) * dscale
      return [ax + pUx * F, ay + pUy * F]
    })

    const poly = [...axisPts, ...[...diagPts].reverse()]
      .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')

    const path = 'M ' + diagPts
      .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' L ')

    // Peak label — one per element, at maximum absolute value
    const peakK   = vals.reduce((b, v, i) => Math.abs(v) > Math.abs(vals[b]) ? i : b, 0)
    const peakVal = vals[peakK]
    const [ax, ay] = axisPts[peakK]
    const [dx, dy] = diagPts[peakK]
    // Place label at 110% of offset from axis (just beyond the tip)
    const lx = ax + (dx - ax) * 1.18
    const ly = ay + (dy - ay) * 1.18

    // End values for beam-type elements (linear N/V/M variation)
    const startVal = vals[0]
    const endVal   = vals[vals.length - 1]
    const [eax0, eay0] = diagPts[0]
    const [eaxN, eayN] = diagPts[diagPts.length - 1]

    return {
      er, axisPts, diagPts, poly, path,
      peakVal, lx, ly,
      startVal, endVal,
      eax0, eay0, eaxN, eayN,
    }
  }).filter(Boolean)

  return (
    <svg width={W} height={H}
      style={{ display: 'block', background: '#fafbfc', overflow: 'visible' }}>
      <defs>
        <pattern id={`grid-${type}`} width={40} height={40} patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f0f0f0" strokeWidth={0.5} />
        </pattern>
      </defs>
      <rect width={W} height={H} fill={`url(#grid-${type})`} />

      {/* Structure skeleton (dashed) */}
      {elements.map(elem => {
        const ni = nodeMap[elem.ni], nj = nodeMap[elem.nj]
        if (!ni || !nj) return null
        const [x1, y1] = toSvg(ni.x, ni.y)
        const [x2, y2] = toSvg(nj.x, nj.y)
        return (
          <line key={elem.id} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4,3" />
        )
      })}

      {/* All-zero notice */}
      {allZero && (
        <text x={W / 2} y={H / 2} fontSize={13} textAnchor="middle"
          fill="#94a3b8" fontFamily="inherit">
          all {unit === 'kNm' ? 'M' : type} values ≈ 0
        </text>
      )}

      {!allZero && <>
        {/* Filled polygons */}
        {diagData.map(({ poly }, i) => (
          <polygon key={i} points={poly}
            fill={col.fill} stroke="none" fillOpacity={0.88} />
        ))}

        {/* Envelope lines */}
        {diagData.map(({ path }, i) => (
          <path key={i} d={path} fill="none" stroke={col.stroke} strokeWidth={2} />
        ))}

        {/* Close lines at element ends */}
        {diagData.map(({ axisPts, diagPts }, i) => (
          <g key={i}>
            <line x1={axisPts[0][0]}  y1={axisPts[0][1]}
                  x2={diagPts[0][0]}  y2={diagPts[0][1]}
              stroke={col.stroke} strokeWidth={1} />
            <line x1={axisPts[axisPts.length-1][0]} y1={axisPts[axisPts.length-1][1]}
                  x2={diagPts[diagPts.length-1][0]} y2={diagPts[diagPts.length-1][1]}
              stroke={col.stroke} strokeWidth={1} />
          </g>
        ))}

        {/* Peak value labels — one per element */}
        {diagData.map(({ peakVal, lx, ly, startVal, endVal,
                         eax0, eay0, eaxN, eayN, axisPts, diagPts }, i) => {
          const showPeak = Math.abs(peakVal) > maxAbs * 0.02
          // Show end-values for elements with significant variation (beams)
          // Skip if very similar to peak to avoid clutter
          const showStart = Math.abs(startVal) > maxAbs * 0.02 &&
                            Math.abs(startVal - peakVal) > maxAbs * 0.08
          const showEnd   = Math.abs(endVal) > maxAbs * 0.02 &&
                            Math.abs(endVal - peakVal) > maxAbs * 0.08

          return (
            <g key={i}>
              {showPeak && (
                <g>
                  <rect x={lx - 24} y={ly - 9} width={48} height={15}
                    rx={2} fill="white" fillOpacity={0.92}
                    stroke={col.stroke} strokeWidth={0.6} />
                  <text x={lx} y={ly + 3}
                    textAnchor="middle" fontSize={9.5}
                    fontFamily="'Courier New', monospace"
                    fontWeight="700" fill={col.stroke}>
                    {peakVal.toFixed(2)}
                  </text>
                </g>
              )}
              {showStart && (
                <text x={eax0 + 3} y={eay0 - 3}
                  fontSize={8} fontFamily="monospace"
                  fill={col.stroke} fontWeight="600">
                  {startVal.toFixed(2)}
                </text>
              )}
              {showEnd && (
                <text x={eaxN + 3} y={eayN - 3}
                  fontSize={8} fontFamily="monospace"
                  fill={col.stroke} fontWeight="600">
                  {endVal.toFixed(2)}
                </text>
              )}
            </g>
          )
        })}
      </>}

      {/* Structure axes on top of diagrams */}
      {elements.map(elem => {
        const ni = nodeMap[elem.ni], nj = nodeMap[elem.nj]
        if (!ni || !nj) return null
        const [x1, y1] = toSvg(ni.x, ni.y)
        const [x2, y2] = toSvg(nj.x, nj.y)
        return (
          <line key={elem.id} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={PAL.navy} strokeWidth={2.5} strokeLinecap="round" />
        )
      })}

      {/* Nodes */}
      {nodes.map(n => {
        const [nx, ny] = toSvg(n.x, n.y)
        return <circle key={n.id} cx={nx} cy={ny} r={4}
          fill="#fff" stroke={PAL.navy} strokeWidth={2} />
      })}

      {/* Legend */}
      <text x={W - 10} y={H - 8} fontSize={10} textAnchor="end"
        fill="#94a3b8" fontFamily="monospace">[{unit}]</text>
      <text x={10} y={H - 8} fontSize={9} fill="#94a3b8">
        {type === 'N' ? 'tension (+)  compression (−)'
          : type === 'V' ? 'upward on left face (+)'
          : 'sagging (+)  hogging (−)'}
      </text>
    </svg>
  )
}

// ── Summary header ────────────────────────────────────────────────────────────
function SummaryRow({ summary }) {
  const items = [
    { label: 'M max', val: summary.max_M_kNm?.toFixed(2), unit: 'kNm', col: PAL.M.stroke },
    { label: 'V max', val: summary.max_V_kN?.toFixed(2),  unit: 'kN',  col: PAL.V.stroke },
    { label: 'N max', val: summary.max_N_kN?.toFixed(2),  unit: 'kN',  col: PAL.N.stroke },
    { label: 'δ max', val: summary.max_disp_mm?.toFixed(3), unit: 'mm', col: PAL.deform },
  ]
  return (
    <div style={{
      display: 'flex', gap: 0,
      borderBottom: '1px solid #e2e8f0',
      background: '#fff',
    }}>
      {items.map(({ label, val, unit, col }) => (
        <div key={label} style={{
          flex: 1, padding: '10px 14px',
          borderRight: '1px solid #e2e8f0',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.06em',
            textTransform: 'uppercase', marginBottom: 2 }}>
            {label}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: col, fontFamily: 'monospace' }}>
            {val}
            <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8',
              marginLeft: 3, fontFamily: 'inherit' }}>{unit}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tables ────────────────────────────────────────────────────────────────────
function ResultTables({ reactions, elemResults }) {
  return (
    <div style={{ padding: '16px 16px' }}>

      {/* Reactions */}
      {reactions?.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={ss.tblHdr}>Reactions</div>
          <table style={ss.tbl}>
            <thead>
              <tr>
                {['Node', 'Rx [kN]', 'Ry [kN]', 'Mz [kNm]'].map(h => (
                  <th key={h} style={ss.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reactions.map(r => (
                <tr key={r.node_id} style={{ background: '#fff' }}>
                  <td style={{ ...ss.td, fontWeight: 600 }}>N{r.node_id}</td>
                  <td style={ss.td}>{fmt(r.Rx_kN)}</td>
                  <td style={ss.td}>{fmt(r.Ry_kN)}</td>
                  <td style={ss.td}>{fmt(r.Mz_kNm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Element forces */}
      {elemResults?.length > 0 && (
        <div>
          <div style={ss.tblHdr}>Element forces</div>
          <table style={ss.tbl}>
            <thead>
              <tr>
                {['Elem', 'L [m]', 'N i [kN]', 'N j [kN]',
                  'V i [kN]', 'V j [kN]',
                  'M i [kNm]', 'M j [kNm]', '|M| max'].map(h => (
                  <th key={h} style={ss.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {elemResults.map((er, i) => (
                <tr key={er.elem_id}
                  style={{ background: i % 2 === 0 ? '#fafbfc' : '#fff' }}>
                  <td style={{ ...ss.td, fontWeight: 600 }}>E{er.elem_id}</td>
                  <td style={ss.td}>{er.L_m?.toFixed(2)}</td>
                  <td style={ss.td}>{fmt(er.N_start_kN)}</td>
                  <td style={ss.td}>{fmt(er.N_end_kN)}</td>
                  <td style={ss.td}>{fmt(er.V_start_kN)}</td>
                  <td style={ss.td}>{fmt(er.V_end_kN)}</td>
                  <td style={ss.td}>{fmt(er.M_start_kNm)}</td>
                  <td style={ss.td}>{fmt(er.M_end_kNm)}</td>
                  <td style={{ ...ss.td, fontWeight: 700, color: PAL.M.stroke }}>
                    {fmt(er.M_max_kNm)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function fmt(v) {
  if (v == null) return '—'
  const n = parseFloat(v)
  return isNaN(n) ? '—' : (Math.abs(n) < 0.001 ? '0' : n.toFixed(3))
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'model',    label: 'Model' },
  { key: 'deformed', label: 'Deflection' },
  { key: 'N',        label: 'Axial  N',  col: PAL.N.stroke },
  { key: 'V',        label: 'Shear  V',  col: PAL.V.stroke },
  { key: 'M',        label: 'Moment M',  col: PAL.M.stroke },
  { key: 'tables',   label: 'Tables' },
]

// ── Main export ───────────────────────────────────────────────────────────────
export default function FrameFemResults({ result, nodes, elements, supports, loads }) {
  const [tab, setTab] = useState('M')  // default to moment — most useful
  const ers = result.element_results || []

  return (
    <div style={{
      border: '1px solid #e2e8f0',
      borderRadius: 4,
      overflow: 'hidden',
      background: '#fff',
      marginTop: 6,
    }}>
      {/* Summary */}
      {result.summary && <SummaryRow summary={result.summary} />}

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #e2e8f0',
        background: '#f8fafc',
        overflowX: 'auto',
      }}>
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              border: 'none',
              borderBottom: tab === t.key
                ? `2.5px solid ${t.col || PAL.navy}`
                : '2.5px solid transparent',
              background: 'none',
              padding: '9px 16px',
              fontSize: 11,
              fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? (t.col || PAL.navy) : '#64748b',
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
              transition: 'all 0.1s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div style={{ overflowX: 'auto' }}>
        {tab === 'model' && (
          <ModelSvg nodes={nodes} elements={elements}
            supports={supports} loads={loads} W={680} H={340} />
        )}
        {tab === 'deformed' && (
          <DeformedSvg nodes={nodes} elements={elements}
            nodeDisps={result.node_disps} W={680} H={340} />
        )}
        {(tab === 'N' || tab === 'V' || tab === 'M') && (
          <DiagramSvg nodes={nodes} elements={elements}
            elemResults={ers} type={tab} W={680} H={400} />
        )}
        {tab === 'tables' && (
          <ResultTables reactions={result.reactions} elemResults={ers} />
        )}
      </div>
    </div>
  )
}

// ── Table styles ──────────────────────────────────────────────────────────────
const ss = {
  tblHdr: {
    fontSize: 10, fontWeight: 700, color: '#94a3b8',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    marginBottom: 6,
  },
  tbl: {
    width: '100%', borderCollapse: 'collapse',
    fontSize: 11, fontFamily: "'Courier New', monospace",
    marginBottom: 4,
  },
  th: {
    textAlign: 'left', padding: '5px 10px',
    borderBottom: '2px solid #e2e8f0',
    background: '#f8fafc', fontSize: 10,
    fontWeight: 700, color: '#475569',
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  td: {
    padding: '4px 10px', borderBottom: '1px solid #f1f5f9',
    color: '#1e293b', fontSize: 11,
  },
}
