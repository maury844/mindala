import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Separated from vite.config.ts: this project pins Vite 8 (rolldown), whose
// UserConfig type can't be augmented by Vitest's bundled Vite, so the inline
// `test` key won't type-check. mergeConfig layers test settings over the shared
// base instead.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // jsdom so engine state-machine + React component tests run headless.
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  }),
)
