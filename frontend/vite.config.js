import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const DESKTOP = !!process.env.OMKREDS_DESKTOP

/**
 * Vite configuration.
 *
 * The proxy block is important: any fetch() call the frontend makes to
 * /api/... gets forwarded to the Python backend on port 8000.
 * This means the frontend never has to hardcode "http://localhost:8000".
 */
export default defineConfig({
  plugins: [react()],
  // word.html er Word-tilføjelsesprogrammet (src/word/, public/word/manifest.xml).
  //
  // OMKREDS_DESKTOP=1 bygger skrivebordsprogrammerne (backend/desktop_app.py og
  // desktop/): fem.html er Omkreds FEM, og index.html er hele Omkreds lokalt.
  // Der er intet login på computeren, så @clerk/react peger på en lokal
  // erstatning (src/lokal/clerkStub.jsx), der altid er logget ind. fem.html
  // bygges ikke til omkreds.dk: dér ville den hverken have login eller sit
  // PDF-endpoint.
  resolve: DESKTOP
    ? { alias: { '@clerk/react': fileURLToPath(new URL('./src/lokal/clerkStub.jsx', import.meta.url)) } }
    : {},
  build: {
    rollupOptions: {
      input: DESKTOP
        ? { fem: 'fem.html', main: 'index.html' }
        : { main: 'index.html', word: 'word.html' },
    },
  },
  server: {
    proxy: {
      // Forward /api/* to the FastAPI backend
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
