/**
 * Dialog + useConfirm — in-app replacements for window.confirm().
 *
 * Native confirm() dialogs can't be styled, show "localhost says…" above the
 * question and block the whole tab. These render in the page, say what will
 * happen on the button itself ("Flyt til papirkurv", not "OK"), and close on
 * Escape.
 *
 *   const confirm = useConfirm()
 *   if (!(await confirm({ title: 'Slet blokken?', confirmLabel: 'Slet', danger: true }))) return
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import Button from './Button.jsx'

export function Dialog({ title, children, actions, onClose, width, labelledBy = 'ui-dialog-title' }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    // Focus the first focusable control, preferring the primary action
    const el = ref.current?.querySelector('[data-autofocus]') ??
               ref.current?.querySelector('button, input, select, textarea')
    el?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="ui-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy}
           ref={ref} style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        {title && <h2 id={labelledBy}>{title}</h2>}
        <div className="ui-dialog-body">{children}</div>
        {actions && <div className="ui-dialog-actions">{actions}</div>}
      </div>
    </div>
  )
}

const ConfirmCtx = createContext(null)

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null)   // { opts, resolve }

  const confirm = useCallback((opts) => new Promise(resolve => {
    setReq({ opts: typeof opts === 'string' ? { title: opts } : opts, resolve })
  }), [])

  const close = (answer) => { req?.resolve(answer); setReq(null) }
  const o = req?.opts ?? {}

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {req && (
        <Dialog
          title={o.title}
          onClose={() => close(false)}
          actions={<>
            <Button onClick={() => close(false)}>{o.cancelLabel ?? 'Annullér'}</Button>
            <Button variant={o.danger ? 'danger' : 'primary'} data-autofocus onClick={() => close(true)}>
              {o.confirmLabel ?? 'Fortsæt'}
            </Button>
          </>}
        >
          {o.body && (typeof o.body === 'string' ? <p>{o.body}</p> : o.body)}
        </Dialog>
      )}
    </ConfirmCtx.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx)
  // Outside a provider (dev harnesses) fall back to the browser dialog rather
  // than silently answering "no".
  return ctx ?? (async (o) => window.confirm(typeof o === 'string' ? o : [o.title, o.bodyText].filter(Boolean).join('\n\n')))
}
