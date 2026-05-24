import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vite configuration.
 *
 * The proxy block is important: any fetch() call the frontend makes to
 * /api/... gets forwarded to the Python backend on port 8000.
 * This means the frontend never has to hardcode "http://localhost:8000".
 */
export default defineConfig({
  plugins: [react()],
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
