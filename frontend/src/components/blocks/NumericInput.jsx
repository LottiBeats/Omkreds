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
 */
import React, { useState, useEffect, useRef } from 'react'

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
  const [local, setLocal]   = useState(value != null ? String(value) : '')
  const focusedRef           = useRef(false)

  // Sync from parent when NOT focused (e.g. after a calculation resets state)
  useEffect(() => {
    if (!focusedRef.current) {
      setLocal(value != null ? String(value) : '')
    }
  }, [value])

  function handleFocus() {
    focusedRef.current = true
  }

  function handleChange(e) {
    const raw = e.target.value
    setLocal(raw)
    // Commit immediately for complete numbers (not mid-decimal or mid-negative)
    const v = parseFloat(raw)
    if (!isNaN(v) && raw !== '' && !raw.endsWith('.') && !raw.endsWith('-')) {
      onChange(v)
    }
  }

  function handleBlur() {
    focusedRef.current = false
    const v = parseFloat(local)
    if (!isNaN(v)) {
      onChange(v)
      setLocal(String(v))    // tidy up: "4." → "4", "-0" → "0"
    } else {
      setLocal(value != null ? String(value) : '')  // revert to parent value
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  return (
    <input
      {...rest}
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
    />
  )
}
