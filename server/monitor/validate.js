// Validação de cobertura: o monitor está vendo tudo que o site vê?
//
// A pergunta que isso responde: `/api/superodds-betcards` devolve no máximo 100
// cards e ignora paginação. Isso é o total real de boosts, ou um corte?
//
// O jeito de saber é olhar o que o PRÓPRIO SITE pede. Este script abre a seção
// Super Odds num Chrome de verdade, escuta a rede desde antes da navegação e
// captura os `itemIds` que a aplicação manda para `superodds-counts`. Se o site
// pedir contagem de ids que a lista não devolveu, esses ids são boosts que
// existem e o monitor estaria perdendo.
//
// Sem dependências: fala direto o Chrome DevTools Protocol pelo WebSocket nativo
// do Node. Use `npm run validate`.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchBoosts } from './api.js';
import { dbAll } from './db.js';

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const acharChrome = () => CHROMES.find((p) => p && existsSync(p));

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarDevTools(porta, tentativas = 40) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/json/version`);
      if (r.ok) return await r.json();
    } catch {}
    await espera(250);
  }
  throw new Error('Chrome não subiu o DevTools a tempo');
}

/** Cliente CDP mínimo sobre o WebSocket nativo. */
function cdp(ws) {
  let id = 0;
  const pend = new Map();
  const ouvintes = [];

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pend.has(msg.id)) {
      const { resolve, reject } = pend.get(msg.id);
      pend.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      for (const fn of ouvintes) fn(msg);
    }
  });

  return {
    send(method, params = {}, sessionId) {
      const msgId = ++id;
      return new Promise((resolve, reject) => {
        pend.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    on(fn) {
      ouvintes.push(fn);
    },
  };
}

/**
 * Abre a página e devolve todos os itemIds que o site pediu ao superodds-counts,
 * mais as URLs de API que ele chamou.
 */
export async function capturarDoSite(url, segundos = 25) {
  const chrome = acharChrome();
  if (!chrome) throw new Error('Chrome/Edge não encontrado — instale um dos dois para validar.');

  const perfil = mkdtempSync(join(tmpdir(), 'monitor-chrome-'));
  const porta = 9333;
  const proc = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${porta}`,
    `--user-data-dir=${perfil}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    'about:blank',
  ], { stdio: 'ignore' });

  const idsPedidos = new Set();
  const chamadas = new Set();

  try {
    await esperarDevTools(porta);

    // Alvo de página novo, para escutar a rede ANTES de navegar.
    let alvo;
    for (const metodo of ['PUT', 'GET']) {
      try {
        const r = await fetch(`http://127.0.0.1:${porta}/json/new?about:blank`, { method: metodo });
        if (r.ok) { alvo = await r.json(); break; }
      } catch {}
    }
    if (!alvo) {
      const lista = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json();
      alvo = lista.find((t) => t.type === 'page');
    }
    if (!alvo?.webSocketDebuggerUrl) throw new Error('não consegui abrir uma aba no Chrome');

    const ws = new WebSocket(alvo.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error('WebSocket do Chrome falhou')), { once: true });
    });

    const c = cdp(ws);
    const registrar = (u) => {
      if (!u || !u.includes('superodds')) return;
      chamadas.add(u.split('?')[0]);
      const m = u.match(/itemIds=([0-9,]+)/);
      if (m) for (const id of m[1].split(',')) if (id) idsPedidos.add(Number(id));
    };

    c.on((msg) => {
      if (msg.method === 'Network.requestWillBeSent') registrar(msg.params?.request?.url);
      // Iframes que viram alvo próprio: liga a rede neles também.
      if (msg.method === 'Target.attachedToTarget') {
        const sid = msg.params.sessionId;
        c.send('Network.enable', {}, sid).catch(() => {});
        c.send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => {});
      }
    });

    await c.send('Network.enable');
    await c.send('Page.enable');
    await c.send('Target.setAutoAttach', {
      autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
    });
    await c.send('Page.navigate', { url });

    // Rola a página: parte das seções só dispara a chamada ao entrar na tela.
    const passos = Math.max(1, Math.floor((segundos * 1000 - 8000) / 1200));
    await espera(8000);
    for (let i = 0; i < passos; i++) {
      await c.send('Runtime.evaluate', { expression: 'window.scrollBy(0, 1000)' }).catch(() => {});
      await espera(1200);
    }
    ws.close();
  } finally {
    proc.kill();
    try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  }

  return { idsPedidos, chamadas };
}

async function main() {
  // A seção Super Odds vive nesta rota — a home do multiplas e o /sports do site
  // principal (widget Altenar) não a carregam.
  const url = process.argv.find((a) => a.startsWith('http')) || 'https://multiplas.esportiva.bet.br/sports';
  const segundos = Number(process.argv.find((a) => /^\d+$/.test(a))) || 25;

  console.log(`Abrindo ${url} num Chrome de verdade e escutando a rede por ${segundos}s…\n`);
  const { idsPedidos, chamadas } = await capturarDoSite(url, segundos);

  console.log('Chamadas de API que o site fez:');
  for (const u of chamadas) console.log('  ', u);

  if (!idsPedidos.size) {
    console.log('\nO site não pediu nenhum itemId nessa janela.');
    console.log('Tente aumentar o tempo (ex.: `npm run validate -- 45`) ou apontar para outra URL.');
    return;
  }

  const { boosts } = await fetchBoosts();
  const daLista = new Set(boosts.map((b) => b.itemId));

  let monitorados = new Set(daLista);
  try {
    for (const r of await dbAll('SELECT item_id FROM boosts WHERE active = 1')) {
      monitorados.add(r.item_id);
    }
  } catch {}

  const foraDaLista = [...idsPedidos].filter((id) => !daLista.has(id)).sort((a, b) => a - b);
  const foraDoMonitor = [...idsPedidos].filter((id) => !monitorados.has(id)).sort((a, b) => a - b);

  console.log(`\nO site pediu contagem de ${idsPedidos.size} itemIds.`);
  console.log(`A lista oficial (superodds-betcards) devolve ${daLista.size}.`);
  console.log(`O monitor acompanha ${monitorados.size} (lista + achados pela varredura).`);

  console.log(`\n→ Pedidos pelo site mas FORA da lista oficial: ${foraDaLista.length}`);
  if (foraDaLista.length) console.log('   ' + foraDaLista.join(', '));

  console.log(`→ Pedidos pelo site mas FORA do monitor: ${foraDoMonitor.length}`);
  if (foraDoMonitor.length) console.log('   ' + foraDoMonitor.join(', '));

  console.log('');
  if (foraDoMonitor.length === 0) {
    console.log('✅ VALIDADO: tudo que o site consulta está sob monitoramento.');
  } else {
    console.log('❌ FALHA DE COBERTURA: o site conhece ids que o monitor não acompanha.');
    console.log('   Aumente SCAN_RADIUS ou acrescente esses ids à varredura.');
  }
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Falha na validação:', err.message);
    process.exit(1);
  });
}
