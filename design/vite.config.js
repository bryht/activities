import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from the root of the custom domain kidgo.bryht.net
export default defineConfig({
  base: '/',
  plugins: [react()],
})
