/**
 * NumericInput.jsx
 *
 * A controlled-style number input that keeps a local string state so the user
 * can type "4." or "-3" or "1e6" without React immediately overwriting them.
 *
 * Rules:
 *  - While the user is typing, the raw string is kept locally (no parent update).
 *  - On blur (or Enter), the string is parsed; if valid, parent onChange(number)
 *    is called; otherwise the field reverts to the parent's current value.
 *  - While NOT focused, any external change to `value` (e.g. after a calc run
 *    resets fields) is picked up immediately.
 *  - "=" først i feltet viser regnearksbogens navngivne celler (udgange).
 *    Vælges en, sættes dens værdi, og feltet kobles til den, så det følger
 *    med, når regnearket ændres (lib/koblinger.js).
 */
import React, { useState, useEffect, useRef } from 'react'
import { useUdgangsVaelger } from '../bog/UdgangsVaelger.jsx'
import './NumericInput.css'

/** Tallet som feltet viser det: lange tal (fx regnet i regnearket) med 6 betydende cifre. */
function vis(value) {
  if (value == null) return ''
  const t = String(value)
  return typeof value === 'number' && t.length > 10 && Number.isFinite(value) ? String(Number(value.toPrecision(6))) : t
}

export default function NumericInput({
  value,
  onChange,
  style,
  placeholder,
  disabled,
  min,
  max,
  step,
  ...rest
}) {
  // Local display string — avoids the controlled-input decimal-dot problem
  const [local, setLocal]   = useState(vis(value))
  const focusedRef           = useRef(false)
  const inputRef             = useRef(null)
  const valg = useUdgangsVaelger({
    tekst: local, inputRef,
    onVaelg: (v) => {
      onChange(v)
      setLocal(vis(v))
      focusedRef.current = false
      inputRef.current?.blur()
    },
  })

  // Sync from parent when NOT focused (e.g. after a calculation resets state)
  useEffect(() => {
    if (!focusedRef.current) {
      setLocal(vis(value))
    }
  }, [value])

  function handleFocus() {
    focusedRef.current = true
    // Det fulde tal, mens man retter (fx en værdi hentet fra regnearket)
    if (value != null && String(value) !== local && !local.startsWith('=')) setLocal(String(value))
  }

  function handleChange(e) {
    const raw = e.target.value
    setLocal(raw)
    if (raw.startsWith('=')) { valg.nulstil(); return }
    // Commit immediately for complete numbers (not mid-decimal or mid-negative)
    const v = parseFloat(raw)
    if (!isNaN(v) && raw !== '' && !raw.endsWith('.') && !raw.endsWith('-')) {
      onChange(v)
    }
  }

  function handleBlur() {
    focusedRef.current = false
    if (local.startsWith('=')) {
      if (!valg.vedBlur()) setLocal(vis(value))
      return
    }
    const v = parseFloat(local)
    if (!isNaN(v)) {
      onChange(v)
      setLocal(vis(v))    // tidy up: "4." → "4", "-0" → "0"
    } else {
      setLocal(vis(value))  // revert to parent value
    }
  }

  function handleKeyDown(e) {
    if (valg.tast(e)) return
    if (e.key === 'Escape' && local.startsWith('=')) { e.preventDefault(); setLocal(vis(value)); return }
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  return (
    <>
      <input
        {...rest}
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={local}
        style={style}
        placeholder={placeholder}
        disabled={disabled}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        title={rest.title ?? (valg.kanKoble ? 'Skriv = for at hente en værdi fra regnearket' : undefined)}
      />
      {valg.liste}
    </>
  )
}
