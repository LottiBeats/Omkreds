/**
 * App.jsx — top-level routing + Clerk auth guards
 *
 * Routes:
 *   /              → ProjectsPage  (requires login)
 *   /projects/:id  → EditorPage    (requires login)
 *
 * Clerk handles everything else: login UI, forgot-password, sessions.
 * Users are managed at dashboard.clerk.com.
 */
import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Show, SignInButton, SignUpButton } from '@clerk/react'

import ProjectsPage from './pages/ProjectsPage.jsx'
import EditorPage   from './pages/EditorPage.jsx'
import { ClerkTokenBridge } from './api/clerkToken.js'


// ── Login gate shown when the user is not authenticated ───────────────────────
// Styled to match the app's dark theme.
function LoginGate() {
  return (
    <div style={{
      minHeight:      '100vh',
      background:     '#0a0f1a',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            24,
      backgroundImage: `linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)`,
      backgroundSize: '64px 64px',
      fontFamily:     "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 28, height: 28, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 12, height: 12, background: '#0a0f1a', clipPath: 'polygon(50% 0%,100% 100%,0% 100%)' }} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '0.01em' }}>
          Structural Calc
        </span>
      </div>

      <div style={{
        background:  '#ffffff',
        padding:     '40px 36px',
        width:       '100%',
        maxWidth:    380,
        boxShadow:   '0 24px 64px rgba(0,0,0,0.5)',
        textAlign:   'center',
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0a0f1a', marginBottom: 8, letterSpacing: '-0.01em' }}>
          Sign in
        </h1>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 28 }}>
          Access your structural calculation workspace.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Clerk's SignInButton opens Clerk's hosted sign-in modal */}
          <SignInButton mode="modal">
            <button style={{
              width: '100%', background: '#1e3a5f', color: '#fff', border: 'none',
              padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              letterSpacing: '0.02em',
            }}>
              Sign in →
            </button>
          </SignInButton>

          <SignUpButton mode="modal">
            <button style={{
              width: '100%', background: 'transparent', color: '#64748b',
              border: '1px solid #e2e8f0', padding: '11px 0',
              fontSize: 13, cursor: 'pointer',
            }}>
              Create account
            </button>
          </SignUpButton>
        </div>
      </div>
    </div>
  )
}


// ── Route that requires sign-in ────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out"><LoginGate /></Show>
    </>
  )
}


export default function App() {
  return (
    <BrowserRouter>
      {/* Keeps the Clerk session token available to api/client.js */}
      <ClerkTokenBridge />

      <Routes>
        <Route path="/" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
        <Route path="/projects/:id" element={<ProtectedRoute><EditorPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
