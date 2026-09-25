/**
 * Button — the one button in the app.
 *
 *   variant: 'secondary' (default) · 'primary' · 'ghost' · 'danger'
 *   size:    'md' (default) · 'sm'
 *   icon:    square icon-only button (give it a title for the tooltip)
 *   busy:    shows a spinner and disables the button
 *
 * One primary button per view. That is the whole rule.
 */
import React from 'react'

export default function Button({
  variant = 'secondary', size = 'md', icon = false, busy = false,
  className = '', children, disabled, type = 'button', ...rest
}) {
  const cls = [
    'ui-btn',
    variant !== 'secondary' && `ui-btn--${variant}`,
    size === 'sm' && 'ui-btn--sm',
    icon && 'ui-btn--icon',
    className,
  ].filter(Boolean).join(' ')
  return (
    <button type={type} className={cls} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy && <span className="ui-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
