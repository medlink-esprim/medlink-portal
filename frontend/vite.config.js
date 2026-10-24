import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Le navigateur ne parle qu'au serveur Vite ; Vite relaie /api vers l'API Express.
// Une seule origine => cookies SameSite=Strict et aucune configuration CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    watch: { usePolling: true },          // nécessaire avec Docker sous Windows
    proxy: {
      '/api': { target: process.env.API_URL || 'http://localhost:3000' },
    },
  },
})
