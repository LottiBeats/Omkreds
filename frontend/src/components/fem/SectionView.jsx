/**
 * SectionView — tværsnittet tegnet i målestok med dets konstanter, som
 * tværsnitsvisningen i FEM-Design og RFEM. y er den stærke akse (bøjning i
 * rammens plan), z den svage.
 */
import React, { useEffect, useState } from 'react'
import { getSectionProperties } from '../../api/client.js'

const fmt = (v, d = 1) => (Number.isFinite(v) ? Number(v).toFixed(d).replace('.', ',') : '—')
const cache = new Map()

export default function SectionView({ material, section, grade }) {
  const key = `${material}|${section}|${grade}`
  const [p, setP] = useState(cache.get(key) ?? null)
  const [fejl, setFejl] = useState(null)
  useEffect(() => {
    if (!material || !section) return
    if (cache.has(key)) { setP(cache.get(key)); setFejl(null); return }
    let aktiv = true
    setFejl(null)
    getSectionProperties(material, section, grade)
      .then(r => { cache.set(key, r); if (aktiv) setP(r) })
      .catch(e => { if (aktiv) { setP(null); setFejl(e.message) } })
    return () => { aktiv = false }
  }, [key])

  if (!material || !section) return null
  if (fejl) return <p style={{ fontSize: 12, color: 'var(--fail, #b91c1c)' }}>{fejl}</p>
  if (!p) return <p style={{ fontSize: 12, color: 'var(--muted)' }}>Henter tværsnit…</p>

  // Tegning: største mål fylder 120 px.
  const W = 240, H = 200, S = 120 / Math.max(p.h_mm, p.b_mm)
  const cx = 96, cy = 88
  const h = p.h_mm * S, b = p.b_mm * S
  let form
  if (p.form === 'I') {
    const tf = Math.max(p.tf_mm * S, 1.5), tw = Math.max(p.tw_mm * S, 1.2)
    const x0 = cx - b / 2, y0 = cy - h / 2
    const d = [
      `M${x0},${y0}h${b}v${tf}h${-(b - tw) / 2}v${h - 2 * tf}h${(b - tw) / 2}v${tf}h${-b}v${-tf}`,
      `h${(b - tw) / 2}v${-(h - 2 * tf)}h${-(b - tw) / 2}z`,
    ].join('')
    form = <path d={d} fill="#cbd5e1" stroke="#334155" strokeWidth="1.2" />
  } else {
    form = <rect x={cx - b / 2} y={cy - h / 2} width={b} height={h} fill="#fde7c7" stroke="#92400e" strokeWidth="1.2" />
  }
  const mal = (x1, y1, x2, y2, txt, tx, ty, anchor = 'middle') => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748b" strokeWidth="0.8" />
      <text x={tx} y={ty} fontSize="10" fill="#475569" textAnchor={anchor} fontFamily="var(--font-mono)">{txt}</text>
    </g>
  )
  const raekker = [
    ['A', `${fmt(p.A_cm2, 1)} cm²`],
    ['I_y', `${fmt(p.Iy_cm4, 0)} cm⁴`], ['I_z', `${fmt(p.Iz_cm4, 0)} cm⁴`],
    ['W_el,y', `${fmt(p.Wel_y_cm3, 0)} cm³`],
    ...(p.Wpl_y_cm3 != null ? [['W_pl,y', `${fmt(p.Wpl_y_cm3, 0)} cm³`]] : []),
    ['W_el,z', `${fmt(p.Wel_z_cm3, 0)} cm³`],
    ['i_y · i_z', `${fmt(p.i_y_mm)} · ${fmt(p.i_z_mm)} mm`],
    ...(p.vaegt_kg_m != null ? [['Vægt', `${fmt(p.vaegt_kg_m)} kg/m`]] : []),
    ['E', `${fmt(p.E_GPa, 1)} GPa`],
  ]
  return (
    <div className="fem-secview">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Tværsnit ${p.betegnelse}`}>
        {/* akser */}
        <line x1={cx - b / 2 - 14} y1={cy} x2={cx + b / 2 + 14} y2={cy} stroke="#0369a1" strokeWidth="0.8" strokeDasharray="4 3" />
        <text x={cx + b / 2 + 16} y={cy + 3} fontSize="10" fill="#0369a1" fontWeight="700">y</text>
        <line x1={cx} y1={cy - h / 2 - 12} x2={cx} y2={cy + h / 2 + 12} stroke="#b45309" strokeWidth="0.8" strokeDasharray="4 3" />
        <text x={cx + 3} y={cy - h / 2 - 5} fontSize="10" fill="#b45309" fontWeight="700">z</text>
        {form}
        {mal(cx + b / 2 + 30, cy - h / 2, cx + b / 2 + 30, cy + h / 2, `h ${fmt(p.h_mm, 0)}`, cx + b / 2 + 34, cy + 3, 'start')}
        {mal(cx - b / 2, cy + h / 2 + 16, cx + b / 2, cy + h / 2 + 16, `b ${fmt(p.b_mm, 0)}`, cx, cy + h / 2 + 28)}
        {p.form === 'I' && (
          <text x={W / 2} y={H - 4} fontSize="10" fill="#475569" textAnchor="middle" fontFamily="var(--font-mono)">t_w {fmt(p.tw_mm)} · t_f {fmt(p.tf_mm)}{p.r_mm ? ` · r ${fmt(p.r_mm, 0)}` : ''}</text>
        )}
      </svg>
      <div className="fem-kv">
        {raekker.map(([k, v]) => <React.Fragment key={k}><span>{k}</span><span>{v}</span></React.Fragment>)}
      </div>
    </div>
  )
}
