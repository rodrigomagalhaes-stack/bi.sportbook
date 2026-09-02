// Lógica das rotas do painel, independente de transporte — usada tanto pelo
// servidor HTTP local/VPS (src/server.js) quanto pelas funções serverless do
// Vercel (api/*.js), para não duplicar as regras nos dois lugares.

import { readFileSync } from 'node:fs';
import { buildView, summarize } from './analysis.js';
import { historyFor, recentAlerts } from './db.js';
import { config } from './config.js';

// `new URL(..., import.meta.url)` é o padrão que o bundler de funções do
// Vercel reconhece estaticamente para incluir o arquivo no deploy — um
// `join(dirname(...))` dinâmico poderia não ser empacotado.
const dashboardPath = new URL('../../public/apps/monitor/dashboard.html', import.meta.url);

export async function stateResponse() {
  const rows = await buildView();
  return {
    generatedAt: new Date().toISOString(),
    config: {
      pollSeconds: config.pollSeconds,
      nearLimitPct: config.nearLimitPct,
      stallMinutes: config.stallMinutes,
    },
    resumo: summarize(rows),
    boosts: rows,
  };
}

export async function historyResponse(itemId) {
  return { itemId, pontos: await historyFor(itemId) };
}

export async function alertsResponse(limit) {
  return { alertas: await recentAlerts(limit) };
}

export function dashboardHtml() {
  return readFileSync(dashboardPath);
}
