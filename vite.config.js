import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import prefixSelector from 'postcss-prefix-selector'
import apiDev from './vite-plugin-api-dev.js'

// Cada módulo trazia seu próprio CSS global: o Pick'em pinta `:root` de tema
// escuro e o Welcome Boost de tema claro, e os dois declaram `.app-header`.
// Num bundle único o último a carregar venceria e quebraria o outro. Em vez de
// reescrever os CSS na mão (e arriscar a aparência de cada um), o PostCSS
// prefixa automaticamente todo seletor do módulo com a classe do wrapper que
// envolve a rota — o CSS-fonte continua idêntico ao do projeto original.
const escopos = [
  { match: /modules[\\/]pickem[\\/]/, prefixo: '.m-pickem' },
  { match: /modules[\\/]welcome-boost[\\/]/, prefixo: '.m-welcome-boost' },
]

const escopar = prefixSelector({
  prefix: '',
  transform(_prefix, selector, _prefixed, filePath, rule) {
    const escopo = escopos.find((e) => e.match.test(filePath || ''))
    if (!escopo) return selector

    // `from`/`to`/`50%` dentro de @keyframes não são seletores de elemento.
    const pai = rule?.parent
    if (pai?.type === 'atrule' && /keyframes$/.test(pai.name)) return selector

    // O wrapper faz o papel de `:root`/`body` do módulo: é nele que as
    // variáveis CSS precisam pousar para cascatear até os filhos (inclusive
    // os estilos inline de styles.js, que leem `var(--t1)` e afins).
    const s = selector.trim()
    if (s === ':root' || s === 'html' || s === 'body' || s === 'html body') return escopo.prefixo

    return `${escopo.prefixo} ${s}`
  },
})

export default defineConfig({
  plugins: [react(), apiDev()],
  resolve: {
    // Ver o comentário dentro do próprio atalho: ele tira do bundle as ~470 KB
    // de tabelas de codepage que o xlsx-js-style arrasta e que a versão
    // anterior da lib (build ESM do xlsx) nunca trouxe.
    alias: [
      {
        // O casamento cobre a especificação inteira de propósito: o alias por
        // regex troca só o trecho casado, e casar apenas o fim deixaria o
        // "./" do require grudado no caminho novo.
        find: /^.*[\\/]cpexcel\.js$/,
        replacement: fileURLToPath(new URL('./vite-shim-cpexcel.cjs', import.meta.url)).replace(
          /\\/g,
          '/',
        ),
      },
    ],
  },
  define: {
    // Id novo a cada build. A moldura acrescenta ele na URL do iframe, para
    // uma versão antiga de uma página embutida não ficar presa no cache do
    // navegador depois de um deploy — foi assim que um painel do Monitor
    // continuou chamando a API antiga por um bom tempo.
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(Date.now().toString(36)),
  },
  css: {
    postcss: { plugins: [escopar] },
  },
  server: {
    port: parseInt(process.env.PORT || '5173'),
    watch: {
      // Planilha aberta no Excel fica travada pelo Windows, e o watcher do
      // Vite morre com EBUSY ao tentar observá-la — derrubando o servidor
      // inteiro. Nenhum csv/xlsx faz parte do bundle: são arquivos de trabalho
      // que caem na pasta, então ficam fora da vigilância.
      ignored: ['**/*.csv', '**/*.xlsx', '**/*.xls'],
    },
  },
  test: {
    // _originais guarda os projetos como eram antes de virarem módulos; rodar
    // os testes de lá acusaria sucesso sobre código que ninguém mais executa.
    exclude: ['**/node_modules/**', '**/dist/**', '_originais/**'],
  },
})
