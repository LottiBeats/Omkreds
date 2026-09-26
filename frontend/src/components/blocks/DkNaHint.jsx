/**
 * DkNaHint.jsx — en genvej tilbage til DK NA's værdi.
 *
 * Blokke fra før gemte EN-standardens anbefalede partialkoefficienter som
 * standardværdier (γ_M0 = γ_M1 = 1,0). Står sådan en værdi, vises DK NA's tal
 * med ét klik til at skifte. Er værdien et bevidst valg, kan den blive.
 */
import React from 'react'

export default function DkNaHint({ value, dk, onUse }) {
  if (value == null || Math.abs(Number(value) - dk) < 1e-9) return null
  const fmt = (v) => String(v).replace('.', ',')
  return (
    <button type="button" onClick={() => onUse(dk)}
      style={{ marginTop: 4, border: 0, background: 'none', padding: 0, textAlign: 'left',
               color: 'var(--brand-ink, #b23a1f)', fontSize: 12, cursor: 'pointer' }}>
      DK NA: {fmt(dk)} — brug den
    </button>
  )
}
