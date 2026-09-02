import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Em produção quem atende /api/** é a Vercel. Sem isto, `npm run dev` devolvia
// o index.html do portal para /api/monitor/state — e o painel do Monitor
// quebrava em desenvolvimento por um motivo que não tinha nada a ver com ele.
// O plugin abaixo roda as mesmas funções de api/**.js dentro do Vite, com um
// arremedo do req/res que o runtime da Vercel oferece.

// As funções leem DATABASE_URL e companhia de process.env; o Vite só carrega
// as VITE_* (e para import.meta.env, não para process.env).
function carregarEnv(raiz) {
  const arquivo = resolve(raiz, '.env')
  if (!existsSync(arquivo)) return
  for (const linha of readFileSync(arquivo, 'utf-8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const [, chave, bruto] = m
    if (process.env[chave] !== undefined) continue
    process.env[chave] = bruto.trim().replace(/^["']|["']$/g, '')
  }
}

function comoResposta(res) {
  res.status = (codigo) => {
    res.statusCode = codigo
    return res
  }
  res.json = (dados) => {
    const corpo = JSON.stringify(dados)
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
    }
    res.end(corpo)
    return res
  }
  res.send = (corpo) => {
    res.end(corpo)
    return res
  }
  return res
}

async function lerCorpo(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  const pedacos = []
  for await (const p of req) pedacos.push(p)
  const texto = Buffer.concat(pedacos).toString('utf-8')
  if (!texto) return undefined
  try {
    return JSON.parse(texto)
  } catch {
    return texto
  }
}

export default function apiDev() {
  return {
    name: 'api-dev',
    apply: 'serve',
    configureServer(server) {
      const raiz = server.config.root
      carregarEnv(raiz)

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()

        const url = new URL(req.url, 'http://localhost')
        // "/api/monitor/state" → "api/monitor/state.js"
        const arquivo = resolve(raiz, url.pathname.replace(/^\//, '') + '.js')
        if (!arquivo.startsWith(resolve(raiz, 'api')) || !existsSync(arquivo)) {
          res.statusCode = 404
          return res.end(JSON.stringify({ erro: 'função não encontrada: ' + url.pathname }))
        }

        try {
          // `?t=` derruba o cache de módulos do Node a cada requisição, para
          // editar uma função e ver o efeito sem reiniciar o servidor.
          const mod = await import(pathToFileURL(arquivo).href + '?t=' + Date.now())
          req.query = Object.fromEntries(url.searchParams)
          req.body = await lerCorpo(req)
          await mod.default(req, comoResposta(res))
        } catch (err) {
          server.config.logger.error(`[api-dev] ${url.pathname}: ${err.stack || err.message}`)
          if (!res.writableEnded) {
            res.statusCode = 500
            res.end(JSON.stringify({ erro: err.message }))
          }
        }
      })
    },
  }
}
