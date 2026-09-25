/**
 * Menu — a button that opens a list of actions.
 *
 *   <Menu trigger={(open) => <Button>Eksportér ▾</Button>} align="right">
 *     <MenuItem onSelect={…} hint="Forhåndsvis i browseren">Forhåndsvisning</MenuItem>
 *     <MenuSeparator />
 *   </Menu>
 *
 * Closes on selection, outside click and Escape. Arrow keys move between items.
 */
import React, { useState, useRef, useEffect, createContext, useContext } from 'react'

const CloseCtx = createContext(() => {})

export default function Menu({ trigger, align = 'right', children, width }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey  = e => {
      if (e.key === 'Escape') { setOpen(false); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const items = [...(listRef.current?.querySelectorAll('.ui-menu-item:not(:disabled)') ?? [])]
      if (!items.length) return
      e.preventDefault()
      const i = items.indexOf(document.activeElement)
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
      items[next].focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const triggerEl = trigger(open)
  return (
    <div className="ui-menu-anchor" ref={ref}>
      {React.cloneElement(triggerEl, {
        onClick: (e) => { triggerEl.props.onClick?.(e); setOpen(o => !o) },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
      })}
      {open && (
        <div className={`ui-menu ui-menu--${align}`} role="menu" ref={listRef} style={width ? { minWidth: width } : undefined}>
          <CloseCtx.Provider value={() => setOpen(false)}>{children}</CloseCtx.Provider>
        </div>
      )}
    </div>
  )
}

export function MenuItem({ onSelect, hint, kbd, danger, disabled, children }) {
  const close = useContext(CloseCtx)
  return (
    <button
      type="button" role="menuitem" disabled={disabled}
      className={`ui-menu-item${danger ? ' ui-menu-item--danger' : ''}`}
      onClick={() => { close(); onSelect?.() }}
    >
      <span>{children}</span>
      {kbd ? <kbd>{kbd}</kbd> : <span />}
      {hint && <small>{hint}</small>}
    </button>
  )
}

export function MenuSeparator() { return <div className="ui-menu-sep" role="separator" /> }
export function MenuLabel({ children }) { return <div className="ui-menu-label">{children}</div> }
