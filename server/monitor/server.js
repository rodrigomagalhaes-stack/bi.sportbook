// Painel web + API de leitura, para uso local/VPS (http nativo). No Vercel,
// as mesmas rotas viram funções serverless em /api/*.js — ambas reusam a
// lógica de src/handlers.js.
//
//   GET /                      → painel (public/dashboard.html)
//   GET /api/state             → visão completa + resumo  (idem /api/monitor/state)
//   GET /api/history?itemId=…  → série histórica de um item
//   GET /api/alerts            → últimos alertas

import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { stateResponse, historyResponse, alertsResponse, dashboardHtml } from './handlers.js';
import { config } from './config.js';

const json = (res, data, status = 200) => {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
};

export function startServer(port = config.port, host = config.host) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    // No portal as rotas ganharam o prefixo do módulo (/api/monitor/state).
    // Normalizar aqui deixa o servidor local atender aos dois formatos, então
    // o mesmo public/apps/monitor/dashboard.html serve local e Vercel.
    const rota = url.pathname.replace(/^\/api\/monitor(?=\/|$)/, '/api');

    try {
      if (rota === '/api/state') {
        return json(res, await stateResponse());
      }

      if (rota === '/api/history') {
        const itemId = Number(url.searchParams.get('itemId'));
        if (!Number.isFinite(itemId)) return json(res, { erro: 'itemId inválido' }, 400);
        return json(res, await historyResponse(itemId));
      }

      if (rota === '/api/alerts') {
        const limit = Number(url.searchParams.get('limit')) || 50;
        return json(res, await alertsResponse(limit));
      }

      if (rota === '/' || rota === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(dashboardHtml());
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('não encontrado');
    } catch (err) {
      console.error('erro no servidor:', err);
      json(res, { erro: err.message }, 500);
    }
  });

  server.listen(port, host, () => {
    console.log(`Painel em http://localhost:${port}`);
    console.log(`  acesso livre (sem senha) · escutando em ${host}:${port}`);
    console.log('');
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
