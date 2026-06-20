import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import importX from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      'import-x': importX,
    },
    languageOptions: {
      globals: globals.browser,
    },
  },

  // ── Engine boundary (HARD RULE) ────────────────────────────────────────────
  // `src/engine/**` is React-free for portability to a future mobile/Svelte
  // shell (CLAUDE.md hard rule). Any `import ... from 'react'` / 'react-dom'
  // inside the engine fails lint. We also block deep imports into the React
  // app layer so engine logic can't leak the other way.
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: 'engine/ must not import React (portability hard rule).',
            },
            {
              name: 'react-dom',
              message:
                'engine/ must not import react-dom (portability hard rule).',
            },
          ],
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'engine/ must not import React (portability hard rule).',
            },
          ],
        },
      ],
      // Path-based zone guard: nothing in engine/ may import from the React
      // app layer (src/app).
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/engine',
              from: './src/app',
              message:
                'engine/ is React-free and must not import from the app shell.',
            },
          ],
        },
      ],
    },
  },
])
