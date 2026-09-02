import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'public/apps',   // páginas HTML monolíticas, servidas como estão
    '_originais',    // os projetos antes de virarem módulos do portal
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Backend do Monitor Super Odds e funções serverless: rodam em Node.
    files: ['server/**/*.js', 'api/**/*.js', 'vite.config.js', 'vite-plugin-api-dev.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Código herdado dos projetos originais, integrado sem reescrita. As
    // ressalvas abaixo já existiam antes da unificação; ficam como aviso para
    // continuarem visíveis sem transformar `npm run lint` em ruído — mexer
    // nelas é mexer na lógica de quem já roda em produção.
    files: ['src/modules/**/*.{js,jsx}', 'server/**/*.js', 'api/**/*.js'],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'no-empty': 'warn',
      'no-unused-vars': 'warn',
    },
  },
])
