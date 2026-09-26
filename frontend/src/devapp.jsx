/**
 * devapp.jsx — the editor without Clerk.
 *
 * Søskende til devdokument.jsx og devblocks.jsx. Clerk-nøglen i .env.local er
 * låst til omkreds.dk, så den rigtige app kan ikke logge ind lokalt. Den her
 * side viser en simpel projektliste og hele editoren mod en lokal backend.
 *
 * Backenden skal køre uden login, fx med test-brugeren fra tests/conftest.py:
 *
 *   python -c "import main, auth, uvicorn; \
 *     main.app.dependency_overrides[auth.get_current_user] = \
 *       lambda: {'id': 'dev', 'email': 'dev@example.com'}; \
 *     uvicorn.run(main.app, port=8000)"
 *
 * Bruger HashRouter (/devapp.html#/projects/…), fordi Vite sender alle andre
 * stier til index.html. Bygges ikke ind i appen. Nås via `npm run dev` på
 * /devapp.html.
 */
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'

import './index.css'
import { AppProviders } from './App.jsx'
import EditorPage from './pages/EditorPage.jsx'
import { getProjects, createProject } from './api/client.js'
import { Button } from './ui/index.js'

function DevList() {
  const [projects, setProjects] = useState(null)
  const [err, setErr] = useState(null)
  const navigate = useNavigate()
  useEffect(() => { getProjects().then(setProjects).catch(e => setErr(e.message)) }, [])
  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 16px', display: 'grid', gap: 12 }}>
      <h1 style={{ fontSize: 20 }}>Projekter (lokal backend)</h1>
      {err && <p style={{ color: 'var(--fail)' }}>{err}</p>}
      <Button variant="primary" onClick={async () => {
        const p = await createProject('Nyt testprojekt', 'DEV-001', 'team')
        navigate(`/projects/${p.id}`)
      }}>Nyt projekt</Button>
      {(projects ?? []).map(p => (
        <Link key={p.id} to={`/projects/${p.id}`} style={{ padding: 10, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6 }}>
          {p.metadata?.project_name} <span className="mono" style={{ color: 'var(--muted)' }}>{p.metadata?.project_ref}</span>
        </Link>
      ))}
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AppProviders>
        <Routes>
          <Route path="/" element={<DevList />} />
          <Route path="/projects/:id/*" element={<EditorPage />} />
        </Routes>
      </AppProviders>
    </HashRouter>
  </React.StrictMode>
)
