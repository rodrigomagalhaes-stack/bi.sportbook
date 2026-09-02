// Regras de alerta + entrega por webhook (Slack, Discord ou endpoint genérico).
//
// O alerta que importa é o `sold_out`: a trava fechou. Os outros existem para
// dar contexto ao redor dele — `near_limit` avisa que está a ponto de fechar,
// `stalled` avisa que parou de vender sem ter fechado.
//
// Cada alerta dispara uma única vez por item — o controle fica em `state.alerted`,
// então reiniciar o monitor não gera enxurrada de repetição.

import { config } from './config.js';
import { getAlerted, markAlerted, recordAlert } from './db.js';
import { STATUS } from './analysis.js';

const num = (n) => Math.round(n).toLocaleString('pt-BR');
const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR');

const dur = (mins) => {
  if (mins == null) return '—';
  if (mins < 1) return 'menos de 1 min';
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  return `${h}h${String(Math.round(mins % 60)).padStart(2, '0')}`;
};

function tempoDeVenda(row) {
  if (!row.firstTs || !row.esgotadoEm) return null;
  return (Date.parse(row.esgotadoEm) - Date.parse(row.firstTs)) / 60000;
}

/** Monta a mensagem de cada tipo de alerta. */
function message(kind, row) {
  const cab = `${row.kindLabel} · ${row.eventName}${row.champName ? ` (${row.champName})` : ''}`;
  // O par odd original → odd turbinada é o que a boost é, afinal; sem ele o
  // alerta diz que algo esgotou sem dizer o quê.
  const odd = row.basePrice && row.price ? `odd ${row.basePrice} → ${row.price} · ` : '';
  const id = `${odd}item ${row.itemId}`;

  switch (kind) {
    case 'sold_out': {
      if (row.jaEstavaEsgotado) {
        return `🔴 TRAVA ESGOTADA — ${cab}\n${num(row.count)}/${num(row.betsLimit)} bilhetes` +
          `\n(já estava esgotada quando o monitor começou — hora exata desconhecida)\n${id}`;
      }
      const vendeu = tempoDeVenda(row);
      return `🔴 TRAVA ESGOTADA às ${hora(row.esgotadoEm)} — ${cab}\n` +
        `${num(row.count)}/${num(row.betsLimit)} bilhetes` +
        (vendeu > 0 ? ` · fechou em ${dur(vendeu)} de acompanhamento` : '') +
        `\n${id}`;
    }
    case 'near_limit':
      return `🟠 A PONTO DE ESGOTAR — ${cab}\n` +
        `${num(row.count)}/${num(row.betsLimit)} bilhetes (${(row.pct * 100).toFixed(0)}%) · faltam ${num(row.restante)}` +
        (row.rate > 0 ? `\nVelocidade: ${row.rate.toFixed(1)}/min` : '') +
        (row.etaMinutes != null ? ` · fecha em ~${dur(row.etaMinutes)}` : '') +
        `\n${id}`;
    case 'stalled':
      return `⏸️ PAROU DE VENDER — ${cab}\n` +
        `${num(row.count)}${row.betsLimit > 0 ? `/${num(row.betsLimit)}` : ''} bilhetes, sem movimento há ${dur(row.stalledMinutes)}` +
        `\nNão esgotou — ou saiu do ar, ou o mercado suspendeu. Vale conferir no site.\n${id}`;
    case 'new_boost':
      // O par de odds já vem no rodapé (`id`), não repete aqui.
      return `🆕 NOVA BOOST — ${cab}\n` +
        `Trava: ${row.betsLimit > 0 ? `${num(row.betsLimit)} bilhetes` : 'sem trava'}\n${id}`;
    default:
      return `${cab} — ${kind}`;
  }
}

/**
 * Telegram. A API é um POST simples em /bot<token>/sendMessage — não é um
 * webhook genérico, por isso tem caminho próprio em vez de entrar no `deliver`
 * pela URL.
 *
 * Cuidado com o "200 mentiroso": o Telegram responde HTTP 200 com
 * `{ok:false, description:…}` para erros de aplicação (chat errado, bot
 * bloqueado, token revogado). Checar só o status esconderia a falha justamente
 * no caso que importa — alerta que não chegou.
 */
async function enviarTelegram(chatId, text) {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      }
    );
    const dados = await res.json().catch(() => ({}));
    if (!res.ok || dados.ok !== true) {
      throw new Error(dados.description || `HTTP ${res.status}`);
    }
    return true;
  } catch (err) {
    console.error(`  ! falha ao entregar no Telegram (chat ${chatId}): ${err.message}`);
    return false;
  }
}

async function deliverTelegram(text) {
  if (!config.telegramEnabled) return false;

  // Um destino que falha (alguém que bloqueou o bot, grupo que virou
  // supergrupo e mudou de id) não pode calar os outros — por isso cada chat é
  // avaliado por si, e basta um aceitar para o alerta contar como entregue.
  const res = await Promise.all(
    config.telegramChatIdList.map((chatId) => enviarTelegram(chatId, text))
  );
  return res.some(Boolean);
}

async function deliverWebhook(text, row, kind) {
  if (!config.webhookUrl) return false;
  const url = config.webhookUrl;

  let body;
  if (url.includes('discord.com') || url.includes('discordapp.com')) {
    body = { content: text };
  } else if (url.includes('hooks.slack.com')) {
    body = { text };
  } else {
    body = {
      text,
      kind,
      itemId: row.itemId,
      eventName: row.eventName,
      count: row.count,
      betsLimit: row.betsLimit,
      pct: row.pct,
      esgotadoEm: row.esgotadoEm ?? null,
      ts: new Date().toISOString(),
    };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (err) {
    console.error(`  ! falha ao entregar webhook: ${err.message}`);
    return false;
  }
}

/**
 * Entrega por todos os canais configurados. `delivered` fica true se ao menos
 * um aceitou — os dois são independentes, e um Telegram fora do ar não pode
 * apagar o registro de que o Slack recebeu.
 */
async function deliver(text, row, kind) {
  const [webhook, telegram] = await Promise.all([
    deliverWebhook(text, row, kind),
    deliverTelegram(text),
  ]);
  return webhook || telegram;
}

/** Quais alertas esta linha merece agora (ignorando os já disparados). */
function pending(row) {
  const out = [];
  if (row.status === STATUS.ESGOTADO) out.push('sold_out');
  else if (row.status === STATUS.QUASE) out.push('near_limit');
  if (row.status === STATUS.PARADO && config.alertOnStalled) out.push('stalled');
  return out;
}

/**
 * Avalia todas as linhas e dispara o que for novo.
 * `novosIds` vem da descoberta — sinaliza boosts que apareceram agora.
 */
export async function evaluateAndAlert(rows, novosIds = new Set()) {
  const disparados = [];

  for (const row of rows) {
    const jaAlertado = await getAlerted(row.itemId);
    const kinds = pending(row);

    if (config.alertOnNewBoost && novosIds.has(row.itemId) && row.betsLimit > 0) {
      kinds.unshift('new_boost');
    }

    for (const kind of kinds) {
      if (jaAlertado.has(kind)) continue;

      const text = message(kind, row);
      console.log(`\n${text}\n`);
      // O webhook (Slack/Discord) só leva o que fecha de vez — os outros tipos
      // continuam gravados e visíveis no painel, só não tocam o celular de ninguém.
      const delivered = kind === 'sold_out' ? await deliver(text, row, kind) : false;

      await recordAlert({
        itemId: row.itemId,
        kind,
        message: text,
        count: row.count,
        betsLimit: row.betsLimit,
        delivered,
      });
      await markAlerted(row.itemId, kind);
      // Esgotar implica ter passado do "quase" — não faz sentido alertar depois.
      if (kind === 'sold_out') await markAlerted(row.itemId, 'near_limit');

      disparados.push({ itemId: row.itemId, kind, delivered });
    }
  }

  return disparados;
}

/** Usado pelo `--test-alert` para validar os canais de entrega. */
export async function sendTestAlert() {
  const row = { itemId: 0, eventName: 'Alerta de teste', count: 0, betsLimit: 0, pct: 0 };
  const text = '✅ Teste do monitor de bilhetes — canal de alerta configurado corretamente.';
  console.log(text);

  // Testa cada canal separado, para o relatório dizer qual funcionou.
  const webhook = config.webhookUrl ? await deliverWebhook(text, row, 'test') : null;
  const telegram = config.telegramEnabled ? await deliverTelegram(text) : null;

  const diag = (nome, r, dica) =>
    console.log(`  ${nome}: ${r === null ? `não configurado (${dica})` : r ? 'OK, mensagem entregue' : 'FALHOU (veja o erro acima)'}`);
  diag('webhook ', webhook, 'ALERT_WEBHOOK_URL');
  diag('telegram', telegram, 'TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID');

  if (webhook === null && telegram === null) {
    console.log('\nNenhum canal configurado — os alertas ficam só no console e no painel.');
  }
  return webhook === true || telegram === true;
}

/**
 * Ajuda a achar o TELEGRAM_CHAT_ID, que é a parte chata da configuração: o
 * Telegram não mostra o id do chat em lugar nenhum do app. O caminho é mandar
 * qualquer mensagem ao bot e ler de `getUpdates` quem falou com ele.
 *
 * Só precisa do TELEGRAM_BOT_TOKEN. Usado por `--telegram-chat-id`.
 */
export async function telegramChatIds() {
  if (!config.telegramBotToken) {
    console.log('Defina TELEGRAM_BOT_TOKEN primeiro (o token que o @BotFather te deu).');
    return [];
  }

  const res = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/getUpdates`);
  const dados = await res.json().catch(() => ({}));
  if (dados.ok !== true) {
    console.log(`Telegram recusou: ${dados.description || `HTTP ${res.status}`}`);
    return [];
  }

  // Um mesmo chat aparece em várias updates; o Map deduplica pelo id.
  //
  // `my_chat_member` é o que salva o caso do grupo: com o modo privacidade
  // ligado (padrão do @BotFather), o bot não recebe as mensagens comuns do
  // grupo, então esperar por `message` acharia nada. Mas a update de "fui
  // adicionado ao grupo" chega sempre.
  const chats = new Map();
  for (const up of dados.result || []) {
    const msg = up.message || up.channel_post || up.edited_message;
    if (msg?.chat) chats.set(msg.chat.id, msg.chat);
    const membro = up.my_chat_member || up.chat_member;
    if (membro?.chat) chats.set(membro.chat.id, membro.chat);
  }

  if (!chats.size) {
    console.log(
      'Nenhuma conversa encontrada.\n' +
      'Abra o Telegram, mande um /start (ou qualquer mensagem) para o seu bot e rode de novo.\n' +
      'Se for para um grupo, basta adicionar o bot ao grupo.\n' +
      'Obs.: o getUpdates só enxerga as últimas ~24h.'
    );
    return [];
  }

  console.log('Chats que falaram com o bot:\n');
  for (const c of chats.values()) {
    const nome = c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username || '(sem nome)';
    console.log(`  TELEGRAM_CHAT_ID=${c.id}   ${nome} (${c.type})`);
  }
  console.log('\nCopie o id para TELEGRAM_CHAT_ID. Mais de um destino: separe por vírgula.');
  console.log('Grupo tem id negativo — e o alerta chega a todo mundo que estiver nele.');
  return [...chats.values()];
}

export const _internal = { message, pending };
