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
// Styled to match the Omkreds brand (warm off-white + orange-red).
function LoginGate() {
  const BRAND  = '#d94a2b'
  const BORDER = '#e8e4e0'
  return (
    <div style={{
      minHeight:      '100vh',
      background:     '#faf9f8',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            24,
      backgroundImage: `linear-gradient(rgba(26,22,20,0.03) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(26,22,20,0.03) 1px, transparent 1px)`,
      backgroundSize: '64px 64px',
      fontFamily:     "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', height: 64 }}>
        <img src="/logo.png" alt="Omkreds" style={{ height: 140, width: 'auto', marginTop: -38, marginBottom: -38 }} />
      </div>

      <div style={{
        background:  '#ffffff',
        border:      '1px solid ' + BORDER,
        borderTop:   '3px solid ' + BRAND,
        padding:     '40px 36px',
        width:       '100%',
        maxWidth:    380,
        boxShadow:   '0 16px 48px rgba(26,22,20,0.10)',
        textAlign:   'center',
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a1614', marginBottom: 8, letterSpacing: '-0.01em' }}>
          Log ind
        </h1>
        <p style={{ fontSize: 13, color: '#78716c', marginBottom: 28 }}>
          Få adgang til dine projekter og beregninger.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Clerk's SignInButton opens Clerk's hosted sign-in modal */}
          <SignInButton mode="modal">
            <button style={{
              width: '100%', background: BRAND, color: '#fff', border: 'none',
              padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              letterSpacing: '0.02em',
            }}>
              Log ind →
            </button>
          </SignInButton>

          <SignUpButton mode="modal">
            <button style={{
              width: '100%', background: 'transparent', color: '#78716c',
              border: '1px solid ' + BORDER, padding: '11px 0',
              fontSize: 13, cursor: 'pointer',
            }}>
              Opret konto
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
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProtectedRoute><EditorPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
