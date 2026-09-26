/**
 * GammaMField.jsx — γ_M for træ, med DK NA som standard.
 *
 * Tomt felt betyder "efter materialet": 1,35 for konstruktionstræ og 1,30 for
 * limtræ (DS/EN 1995-1-1 DK NA). Et tal i feltet er et bevidst valg, fx γ_3
 * ved skærpet eller lempet kontrolklasse.
 *
 * Blokke fra før stod med 1,3 gemt, fordi det var standardværdien. Står der
 * 1,3 på konstruktionstræ, vises en genvej tilbage til DK NA's værdi.
 */
import React, { useEffect, useState } from 'react'
import Field from './Field.jsx'

export const gammaMAuto = (grade) => (/^GL/i.test(String(grade ?? '')) ? 1.30 : 1.35)

export default function GammaMField({ value, grade, onChange, style }) {
  const auto = gammaMAuto(grade)
  const show = (v) => (v == null ? '' : String(v).replace('.', ','))
  const [txt, setTxt] = useState(show(value))
  useEffect(() => { setTxt(show(value)) }, [value])
  const oldDefault = value != null && Math.abs(value - 1.3) < 1e-9 && auto !== 1.3
  return (
    <Field label="γ_M" hint={value == null ? `DK NA: ${show(auto)}` : 'angivet'}>
      <input style={style} inputMode="decimal" value={txt}
        placeholder={`${show(auto)} (DK NA)`}
        onChange={e => setTxt(e.target.value)}
        onBlur={() => {
          const t = txt.trim().replace(',', '.')
          if (t === '') { onChange(null); return }
          const v = Number(t)
          if (Number.isFinite(v) && v > 0) onChange(v); else setTxt(show(value))
        }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      {oldDefault && (
        <button type="button" onClick={() => onChange(null)}
          style={{ marginTop: 4, border: 0, background: 'none', padding: 0, textAlign: 'left',
                   color: 'var(--brand-ink, #b23a1f)', fontSize: 12, cursor: 'pointer' }}>
          DK NA siger {show(auto)} for konstruktionstræ — brug den
        </button>
      )}
    </Field>
  )
}
