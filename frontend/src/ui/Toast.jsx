/**
 * Toasts — short confirmations and errors, bottom right.
 *
 *   const toast = useToast()
 *   toast.ok('A2 udstedt som revision B')
 *   toast.fail('PDF-generering fejlede: …')          // stays until closed
 *   toast.warn('Gemt uden billeder', { action: { label: 'Vis', onClick } })
 *
 * Replaces the editor's single `error` string, which carried both successes
 * (prefixed "✓") and failures and could only show one of them at a time.
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const ToastCtx = createContext(null)
const ICON = { ok: '✓', warn: '!', fail: '✕', info: 'i' }

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const nextId = useRef(1)

  const dismiss = useCallback(id => setItems(xs => xs.filter(t => t.id !== id)), [])

  const push = useCallback((tone, message, opts = {}) => {
    const id = nextId.current++
    // Errors stay until dismissed — they usually need reading. The rest fade.
    const ttl = opts.ttl ?? (tone === 'fail' ? 0 : tone === 'warn' ? 8000 : 4000)
    setItems(xs => [...xs.slice(-3), { id, tone, message, action: opts.action }])
    if (ttl) setTimeout(() => dismiss(id), ttl)
    return id
  }, [dismiss])

  const api = useMemo(() => ({
    ok:   (m, o) => push('ok', m, o),
    warn: (m, o) => push('warn', m, o),
    fail: (m, o) => push('fail', m, o),
    info: (m, o) => push('info', m, o),
    dismiss,
  }), [push, dismiss])

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="ui-toasts" role="status" aria-live="polite">
        {items.map(t => (
          <div key={t.id} className={`ui-toast ui-toast--${t.tone}`}>
            <span className="ui-toast-icon" aria-hidden="true">{ICON[t.tone]}</span>
            <span>
              {t.message}
              {t.action && (
                <>{' '}<button className="ui-toast-action" onClick={() => { t.action.onClick(); dismiss(t.id) }}>{t.action.label}</button></>
              )}
            </span>
            <button onClick={() => dismiss(t.id)} aria-label="Luk">✕</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

const FALLBACK = {
  ok: (m) => console.info(m), warn: (m) => console.warn(m),
  fail: (m) => console.error(m), info: (m) => console.info(m), dismiss: () => {},
}

export function useToast() {
  return useContext(ToastCtx) ?? FALLBACK
}
