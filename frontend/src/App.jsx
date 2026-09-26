/**
 * App.jsx — top-level routing + Clerk auth guards
 *
 * Routes:
 *   /                     → ProjectsPage  (landing page, or the dashboard when signed in)
 *   /projects/:id/*       → EditorPage    (requires login; the rest of the path is
 *                                           the open document, e.g. /A2 or /A2/2)
 *
 * Both pages are loaded on demand, so the editor's code isn't part of the
 * landing page download and vice versa.
 *
 * Clerk handles everything else: login UI, forgot-password, sessions.
 * Users are managed at dashboard.clerk.com.
 */
import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Show, SignInButton, SignUpButton } from '@clerk/react'

import { ClerkTokenBridge } from './api/clerkToken.js'
import { ToastProvider, ConfirmProvider } from './ui/index.js'

const ProjectsPage = lazy(() => import('./pages/ProjectsPage.jsx'))
const EditorPage   = lazy(() => import('./pages/EditorPage.jsx'))


// ── Login gate shown when the user is not authenticated ───────────────────────
function LoginGate() {
  return (
    <div style={{
      minHeight:      '100vh',
      background:     'var(--bg)',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            24,
      padding:        16,
      backgroundImage: `linear-gradient(rgba(28,25,23,0.03) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(28,25,23,0.03) 1px, transparent 1px)`,
      backgroundSize: '64px 64px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', height: 64 }}>
        <img src="/logo.png" alt="Omkreds" style={{ height: 140, width: 'auto', marginTop: -38, marginBottom: -38 }} />
      </div>

      <div style={{
        background:   'var(--surface)',
        border:       '1px solid var(--line)',
        borderTop:    '3px solid var(--brand)',
        borderRadius: 8,
        padding:      '36px 32px',
        width:        '100%',
        maxWidth:     380,
        boxShadow:    'var(--shadow-pop)',
        textAlign:    'center',
        display:      'grid',
        gap:          10,
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
          Log ind
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 16 }}>
          Få adgang til dine projekter og beregninger.
        </p>
        <SignInButton mode="modal">
          <button className="ui-btn ui-btn--primary" style={{ width: '100%', height: 40 }}>Log ind</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="ui-btn" style={{ width: '100%', height: 38 }}>Opret konto</button>
        </SignUpButton>
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

function PageLoading() {
  return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />
}

/**
 * The providers every page needs (toasts, confirm dialogs). Split out so the
 * development harness (devapp.jsx) can render the editor without Clerk.
 */
export function AppProviders({ children }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
      </ConfirmProvider>
    </ToastProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Keeps the Clerk session token available to api/client.js */}
      <ClerkTokenBridge />

      <AppProviders>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:id/*" element={<ProtectedRoute><EditorPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppProviders>
    </BrowserRouter>
  )
}
