/**
 * clerkToken.js — bridges Clerk's React hook into our plain-JS api/client.js
 *
 * Problem: api/client.js is a plain module (not a React component), so it
 * can't call React hooks like useAuth().  This module solves that with a
 * simple module-level setter pattern:
 *
 *   1. <ClerkTokenBridge /> (a tiny React component) calls useAuth() and
 *      stores the getToken function here with setTokenGetter().
 *   2. client.js calls getAuthToken() which calls that stored function.
 *
 * This is the standard pattern recommended for using Clerk tokens in
 * non-component code (service layers, API clients, etc.).
 */
import { useEffect } from 'react'
import { useAuth } from '@clerk/react'

// ── Token getter storage ──────────────────────────────────────────────────────

let _getToken = null

export function setTokenGetter(fn) {
  _getToken = fn
}

/**
 * Returns the current Clerk session token (async).
 * Returns null if not signed in.
 */
export async function getAuthToken() {
  if (!_getToken) return null
  try {
    return await _getToken()
  } catch {
    return null
  }
}

// ── React component (mount once at the app root) ──────────────────────────────

/**
 * ClerkTokenBridge — invisible component, mount it once near the root.
 * It keeps the token getter in sync with the current Clerk session.
 *
 * Usage in App.jsx:
 *   import { ClerkTokenBridge } from './api/clerkToken.js'
 *   ...
 *   <ClerkTokenBridge />
 */
export function ClerkTokenBridge() {
  const { getToken } = useAuth()

  useEffect(() => {
    setTokenGetter(getToken)
    return () => setTokenGetter(null)
  }, [getToken])

  return null   // renders nothing
}
