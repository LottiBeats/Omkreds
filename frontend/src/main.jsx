/**
 * main.jsx — entry point
 *
 * Wraps the app in <ClerkProvider>.
 * Clerk reads VITE_CLERK_PUBLISHABLE_KEY from the environment automatically —
 * do NOT pass publishableKey as a prop.
 *
 * Add your key to frontend/.env:
 *   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
 * Get it from https://dashboard.clerk.com → API Keys → React.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider afterSignOutUrl="/">
      <App />
    </ClerkProvider>
  </React.StrictMode>
)
