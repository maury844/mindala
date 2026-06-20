import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Test config lives in vitest.config.ts (this project uses Vite 8 / rolldown,
// whose UserConfig type can't be augmented by Vitest's bundled Vite).
export default defineConfig({
  plugins: [react()],
})
