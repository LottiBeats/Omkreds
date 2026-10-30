/**
 * clerkStub.jsx — @clerk/react i det lokale program (Omkreds på computeren).
 *
 * Skrivebordsprogrammet kører appen mod en backend på 127.0.0.1 uden login
 * (backend/desktop_app.py sætter én lokal bruger). vite.config.js peger
 * @clerk/react hertil, når OMKREDS_DESKTOP=1, så App.jsx, forsiden og
 * editoren er de samme filer som på omkreds.dk -- bare altid "logget ind".
 *
 * Kun det, appen bruger, findes her.
 */
import React from 'react'

const BRUGER = {
  id: 'lokal',
  fullName: 'Lokal bruger',
  firstName: 'Lokal',
  primaryEmailAddress: { emailAddress: 'lokal@omkreds' },
}

export const ClerkProvider = ({ children }) => <>{children}</>
export const useUser = () => ({ user: BRUGER, isSignedIn: true, isLoaded: true })
export const useAuth = () => ({ getToken: async () => null, isSignedIn: true, isLoaded: true, userId: BRUGER.id })
export const useClerk = () => ({ openSignIn: () => {}, openSignUp: () => {}, signOut: async () => {} })

/** <Show when="signed-in">…</Show>: lokalt er man altid logget ind. */
export function Show({ when, children }) {
  return when === 'signed-out' ? null : <>{children}</>
}

// Knapper til login og konto giver ingen mening lokalt.
export const SignInButton = () => null
export const SignUpButton = () => null
export function UserButton() {
  return <span style={{ fontSize: 12.5, color: 'var(--muted)' }} title="Projekterne gemmes på denne computer">Lokalt</span>
}
