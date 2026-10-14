import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Anrop till /api skickas vidare till backend under utveckling.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
