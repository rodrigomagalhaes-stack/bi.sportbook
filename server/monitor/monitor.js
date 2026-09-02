// Loop de monitoramento.
//
//   node src/monitor.js              → roda continuamente
//   node src/monitor.js --serve      → roda o loop E sobe o painel web
//   node src/monitor.js --once       → uma única leitura (para cron / Agendador)
//   node src/monitor.js --test-alert → só testa os canais de alerta e sai
//   node src/monitor.js --telegram-chat-id → lista os chats que falaram com o bot
//
// A cada ciclo: lê as contagens de todos os itens ativos, grava o que mudou,
// recalcula a visão e dispara os alertas pendentes.

import { pathToFileURL } from 'node:url';
import { appendFileSync, statSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fetchCounts } from './api.js';
import { applyReading, monitoredBoosts, nowIso, purgeOld, getMeta, setMeta, deactivateStaleHidden, deactivateHidden } from './db.js';
import { discover } from './discover.js';
import { scanOnce } from './scan.js';
import { buildView, summarize } from './analysis.js';
import { evaluateAndAlert, sendTestAlert, telegramChatIds } from './alerts.js';
import { config } from './config.js';

const hora = () => new Date().toLocaleTimeString('pt-BR');

/**
 * Para operação 24/7: espelha o console num arquivo, girando quando passa de
 * 5 MB (guarda uma geração anterior). Ativado por LOG_FILE.
 */
function ligarLog(caminho) {
  if (!caminho) return;
  mkdirSync(dirname(caminho), { recursive: true });
  const escrever = (nivel, args) => {
    const linha = `[${new Date().toISOString()}] ${nivel} ` +
      args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ') + '\n';
    try {
      try {
        if (statSync(caminho).size > 5 * 1024 * 1024) renameSync(caminho, caminho + '.1');
      } catch {}
      appendFileSync(caminho, linha);
    } catch {}
  };
  for (const nivel of ['log', 'error', 'warn']) {
    const orig = console[nivel].bind(console);
    console[nivel] = (...args) => { orig(...args); escrever(nivel.toUpperCase(), args); };
  }
}

let parar = false;

/** De quanto em quanto tempo a higiene do banco roda. Ver `purgeOld`. */
const LIMPEZA_MINUTOS = 6 * 60;

/**
 * Timers de redescoberta/varredura ficam no banco, não em variável de módulo:
 * numa função serverless cada invocação pode subir num processo novo (cold
 * start), então estado só em memória seria esquecido e a descoberta rodaria
 * toda hora. Ver src/db.js `getMeta`/`setMeta`.
 */
async function devidoAgora(chaveMeta, minutos, agora, force) {
  if (force) return true;
  const ultima = Number((await getMeta(chaveMeta)) || 0);
  return agora - ultima >= minutos * 60000;
}

/** Um ciclo completo: (re)descobrir se for hora, ler contagens, alertar. */
export async function tick({ force = false } = {}) {
  const agora = Date.now();
  let novosIds = new Set();

  if (await devidoAgora('ultima_descoberta', config.discoverMinutes, agora, force)) {
    try {
      const r = await discover();
      novosIds = r.novosIds;
      await setMeta('ultima_descoberta', String(agora));
    } catch (err) {
      console.error(`[${hora()}] descoberta falhou: ${err.message} (segue com o catálogo atual)`);
    }
  }

  // Varredura de ids: desligada por padrão desde que a descoberta passou a
  // completar cada evento pelo Altenar, que devolve as mesmas boosts fora da
  // vitrine só que COM trava e nome. Ver src/discover.js e src/scan.js.
  if (config.scanEnabled && (await devidoAgora('ultima_varredura', config.scanMinutes, agora, force))) {
    try {
      await scanOnce();
      await setMeta('ultima_varredura', String(agora));
    } catch (err) {
      console.error(`[${hora()}] varredura falhou: ${err.message}`);
    }
  }

  try {
    // Com a varredura desligada, o que ela deixou no banco sai de uma vez: são
    // itens sem trava, e sem trava não há esgotamento a detectar.
    if (config.scanEnabled) await deactivateStaleHidden(config.hiddenStaleHours);
    else await deactivateHidden();
  } catch (err) {
    console.error(`[${hora()}] limpeza de boosts ocultas falhou: ${err.message}`);
  }

  // A limpeza morava no laço do `main()`, que só existe quando o monitor roda
  // como processo. Na Vercel quem chama é /api/cron, uma função que nasce e
  // morre a cada ciclo: `purgeOld` nunca rodava lá, e readings/alerts/boosts/
  // state cresciam sem teto desde o primeiro dia. Aqui ela roda nos dois.
  if (await devidoAgora('ultima_limpeza', LIMPEZA_MINUTOS, agora, force)) {
    try {
      const r = await purgeOld(config.retentionDays);
      await setMeta('ultima_limpeza', String(agora));
      if (r.readings || r.alerts || r.scan || r.boosts || r.state) {
        console.log(
          `[${hora()}] limpeza: ${r.readings} leituras, ${r.alerts} alertas, ` +
            `${r.boosts} boosts, ${r.state} estados, ${r.scan} ids de varredura descartados`
        );
      }
    } catch (err) {
      console.error(`[${hora()}] limpeza falhou: ${err.message}`);
    }
  }

  const boosts = await monitoredBoosts();
  if (!boosts.length) {
    // Catálogo vazio é situação legítima de madrugada, quando nenhuma boost com
    // trava está no ar. Não é falha — mas quem chamou precisa saber que este
    // ciclo não mediu nada.
    console.error(`[${hora()}] nenhuma boost ativa no catálogo.`);
    return { ok: false, motivo: 'catálogo vazio', falha: false };
  }

  const ts = nowIso();
  let counts;
  try {
    counts = await fetchCounts(boosts.map((b) => b.item_id));
  } catch (err) {
    // Isto é falha de verdade: sem contagem não há monitoramento. Quem chamou
    // tem de conseguir distinguir isso de um ciclo bem-sucedido, senão um
    // agendador vê "sucesso" enquanto o sistema está cego — foi exatamente
    // assim que uma semana de silêncio passou despercebida.
    console.error(`[${hora()}] leitura falhou: ${err.message}`);
    return { ok: false, motivo: `leitura falhou: ${err.message}`, falha: true };
  }

  const aplicadas = await Promise.all(
    boosts.map((b) => {
      const c = counts.get(b.item_id);
      return c === undefined ? null : applyReading(b.item_id, c, ts);
    })
  );
  const mudaram = aplicadas.filter((a) => a?.changed).length;

  const rows = await buildView(new Date(ts), { boosts });
  const resumo = summarize(rows);
  const disparados = await evaluateAndAlert(rows, novosIds);

  console.log(
    `[${hora()}] ${boosts.length} itens · ${mudaram} mudaram · ` +
      `${resumo.esgotados} esgotadas · ${resumo.quase} quase · ${resumo.parados} paradas · ` +
      `${resumo.bilhetesTotal.toLocaleString('pt-BR')} bilhetes` +
      (disparados.length ? ` · ${disparados.length} alerta(s)` : '')
  );

  return { ok: true, rows, resumo, disparados };
}

function topo(rows, n = 8) {
  const linhas = rows.filter((r) => r.betsLimit > 0 && r.count > 0).slice(0, n);
  if (!linhas.length) return;
  console.log('\n  Mais perto da trava:');
  for (const r of linhas) {
    const barra = '█'.repeat(Math.round((r.pct || 0) * 20)).padEnd(20, '·');
    const eta = r.etaMinutes != null ? ` · esgota em ~${Math.round(r.etaMinutes)}min` : '';
    console.log(
      `   ${barra} ${String(r.count).padStart(5)}/${String(r.betsLimit).padEnd(5)} ` +
        `${((r.pct || 0) * 100).toFixed(0).padStart(3)}% [${r.status}] ${r.eventName.slice(0, 32)}${eta}`
    );
  }
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  ligarLog(process.env.LOG_FILE);

  if (args.includes('--test-alert')) {
    await sendTestAlert();
    return;
  }

  if (args.includes('--telegram-chat-id')) {
    await telegramChatIds();
    return;
  }

  console.log(
    `Monitor de bilhetes — Super Odds\n` +
      `  leitura a cada ${config.pollSeconds}s${config.cacheBuster ? ' (direto na origem, sem cache da CDN)' : ' (com cache de 45s da CDN)'}` +
      ` · redescoberta a cada ${config.discoverMinutes}min\n` +
      `  catálogo: vitrine da Esportiva + boosts completas por evento no Altenar (cache de ${config.eventTtlMinutes}min)\n` +
      `  aviso de "quase" em ${(config.nearLimitPct * 100).toFixed(0)}% da trava · parou de vender em ${config.stallMinutes}min\n` +
      `  alertas — webhook: ${config.webhookUrl ? 'configurado' : 'não'} · telegram: ${config.telegramEnabled ? 'configurado' : 'não'}${!config.webhookUrl && !config.telegramEnabled ? ' (só no console e no painel)' : ''}\n` +
      `  banco: ${config.databaseUrl ? 'Postgres (DATABASE_URL configurada)' : 'DATABASE_URL não configurada!'}\n`
  );

  if (args.includes('--serve')) {
    const { startServer } = await import('./server.js');
    startServer();
  }

  const primeiro = await tick({ force: true });
  if (primeiro?.ok) topo(primeiro.rows);

  if (args.includes('--once')) return;

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      console.log('\nEncerrando…');
      parar = true;
      process.exit(0);
    });
  }

  while (!parar) {
    await new Promise((r) => setTimeout(r, config.pollSeconds * 1000));
    if (parar) break;
    try {
      await tick();
    } catch (err) {
      console.error(`[${hora()}] erro no ciclo: ${err.message}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Falha no monitor:', err);
    process.exit(1);
  });
}
