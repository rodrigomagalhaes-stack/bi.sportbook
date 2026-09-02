// Descoberta das boosts ativas.
//
// COMO O CATÁLOGO É MONTADO
// 1. `/api/superodds-betcards` (Esportiva) diz QUAIS EVENTOS estão com Super
//    Odds no ar. É barato (~200 KB) e traz o `ribbonKind` de cada card.
// 2. Para cada um desses eventos, `GetEventDetails` (Altenar) devolve TODAS as
//    boosts do jogo — a lista da Esportiva corta em 100 cards no total e come
//    boosts vivas. No Real Bétis x Real Sociedad ela dava 8 das 11 com trava,
//    e a 15997514 que ficou de fora já estava esgotada (1900/1900) no site.
//
// O QUE ENTRA NO CATÁLOGO
// Só boost COM TRAVA (`betsLimit > 0`) e com a janela ainda aberta. Card
// `turbo` vem sempre com `betsLimit: 0` — sem trava não existe esgotamento
// para detectar, então ele não é monitorado. Quando a janela fecha (o jogo
// começa), a boost sai da lista, `upsertBoosts` desativa e apaga o rastro.
//
// CUSTO
// A resposta do Altenar passa de 2 MB por evento, então cada evento fica em
// cache no banco (`event_cache`) e só é rebuscado a cada `EVENT_TTL_MINUTES`,
// no máximo `EVENTS_PER_TICK` por ciclo. O catálogo é remontado do cache todo
// ciclo, sem chamada nova.
//
// Uso:
//   node src/discover.js            → atualiza o catálogo e imprime resumo
//   node src/discover.js --json     → despeja o catálogo em JSON
//   node src/discover.js --ids      → só a lista de itemIds (compatível com o HTML antigo)

import { fetchBoosts, fetchCounts, fetchEventBoosts, fetchBoostedEventIds } from './api.js';
import { upsertBoosts, nowIso, cachedEventIndex, eventBoosts, abertoAteDe,
  saveEventBoosts, purgeEventCache } from './db.js';
import { config, KINDS } from './config.js';
import { pathToFileURL } from 'node:url';

/** Boost que vale monitorar: tem trava e a promoção ainda não expirou. */
function valeMonitorar(b, agora) {
  if (!(b.betsLimit > 0)) return false;
  if (b.endDate && Date.parse(b.endDate) <= agora) return false;
  return true;
}

/**
 * Garante que cada evento em `eventIds` esteja no cache e razoavelmente fresco,
 * respeitando o teto de chamadas por ciclo. Atualiza `indice` no lugar e
 * devolve o que buscou agora, já desserializado.
 *
 * `itensDaVitrine` (eventId → itemIds que a vitrine mostra) serve de gatilho:
 * card que a vitrine já anuncia e o cache não conhece é boost publicada agora,
 * e esperar o TTL de uma hora poderia perder o esgotamento dela inteiro.
 */
async function completarEventos(indice, eventIds, itensDaVitrine, agora, { quiet }) {
  const vencido = (id) => {
    const e = indice.get(id);
    if (!e) return true;
    // Evento que já se mostrou sem trava nenhuma espera bem mais para ser
    // reconferido: é a maioria dos candidatos vindos do GetEvents, e a 2 MB
    // cada eles custariam caro para não trazer nada. `abertoAte` nulo é
    // exatamente isso: nenhuma boost com trava no evento.
    const ttl = e.abertoAte ? config.eventTtlMinutes : config.eventIdleTtlMinutes;
    if (agora - Date.parse(e.fetchedTs) >= ttl * 60000) return true;
    for (const item of itensDaVitrine.get(id) || []) if (!e.itemIds.has(item)) return true;
    return false;
  };

  // Ordem de prioridade quando o teto por ciclo aperta: primeiro quem a vitrine
  // está anunciando (é onde as travas moram), depois quem nunca foi buscado,
  // por último os candidatos que só vieram do GetEvents.
  const prioridade = (id) =>
    (itensDaVitrine.has(id) ? 0 : 2) + (indice.has(id) ? 1 : 0);
  const pendentes = eventIds
    .filter(vencido)
    .sort((a, b) => prioridade(a) - prioridade(b))
    .slice(0, config.eventsPerTick);

  let falhas = 0;
  // O que acabou de ser buscado já está na mão: guardado aqui, o catálogo é
  // montado sem reler do banco o que a rede acabou de trazer.
  const recemBuscados = new Map();
  for (const eventId of pendentes) {
    try {
      const boosts = await fetchEventBoosts(eventId);
      const startDate = boosts[0]?.startDate ?? indice.get(eventId)?.startDate ?? null;
      const iso = new Date(agora).toISOString();
      await saveEventBoosts(eventId, startDate, boosts, iso);
      indice.set(eventId, {
        fetchedTs: iso, startDate,
        abertoAte: abertoAteDe(boosts),
        itemIds: new Set(boosts.map((b) => b.itemId)),
      });
      recemBuscados.set(eventId, boosts);
    } catch (err) {
      // Um evento que falhou continua valendo pelo que já está em cache — o
      // catálogo não pode encolher por causa de uma chamada que caiu.
      falhas++;
      if (!quiet) console.error(`  evento ${eventId}: ${err.message}`);
    }
  }

  if (!quiet && pendentes.length) {
    const restantes = eventIds.filter(vencido).length;
    console.log(
      `  ${pendentes.length - falhas}/${pendentes.length} evento(s) atualizado(s) no Altenar` +
        (restantes ? ` · ${restantes} para o próximo ciclo` : '')
    );
  }

  return recemBuscados;
}

/** Busca a lista atual e grava no catálogo. Devolve boosts + ids novos. */
export async function discover({ quiet = false } = {}) {
  const agora = Date.now();
  const { boosts: cards, listName } = await fetchBoosts();

  // A vitrine da Esportiva serve de índice de eventos e de fonte do ribbonKind;
  // os números (trava, odds) vêm do Altenar, que enxerga o jogo inteiro.
  const ribbonPorItem = new Map(cards.map((c) => [c.itemId, c.ribbonKind]));
  const itensDaVitrine = new Map();
  for (const c of cards) {
    if (!c.eventId) continue;
    if (!itensDaVitrine.has(c.eventId)) itensDaVitrine.set(c.eventId, new Set());
    itensDaVitrine.get(c.eventId).add(c.itemId);
  }
  const daVitrine = [...itensDaVitrine.keys()];

  const indice = await cachedEventIndex();

  // Linhas gravadas antes das colunas de resumo existirem: o resumo delas é
  // reconstruído do boosts_json desta vez, e some na próxima — quando o TTL
  // vencer, `saveEventBoosts` grava as colunas. Migração sem passo manual e
  // sem um UPDATE em massa que poderia falhar numa linha ilegível.
  const legadas = [...indice.entries()].filter(([, e]) => e.itemIds === null).map(([id]) => id);
  if (legadas.length) {
    for (const [id, boosts] of await eventBoosts(legadas)) {
      const e = indice.get(id);
      e.itemIds = new Set(boosts.map((b) => b.itemId));
      e.abertoAte = abertoAteDe(boosts);
    }
    // Evento cuja linha nem desserializa: trata como desconhecido e rebusca.
    for (const id of legadas) {
      const e = indice.get(id);
      if (e.itemIds === null) { e.itemIds = new Set(); e.abertoAte = null; }
    }
  }

  // Evento que saiu da vitrine (empurrado pelo corte de 100) mas ainda tem boost
  // com a janela aberta continua valendo: elas seguem à venda no site.
  const aberto = (e) => !!e?.abertoAte && Date.parse(e.abertoAte) > agora;
  const aindaAbertos = [...indice.entries()].filter(([, e]) => aberto(e)).map(([id]) => id);

  // Terceira fonte de eventos: quem a vitrine enumera é ela mesma, e ela corta
  // em 100 cards — um jogo cujos cards todos caiam fora do corte nunca seria
  // visto. O `GetEvents` do Altenar marca os eventos em promoção e fecha esse
  // furo. Levantamento de 21/08: 42 candidatos, 4 com trava, todos já na
  // vitrine — ou seja, hoje o furo não está sangrando, mas custa pouco tapá-lo.
  const candidatos = await fetchBoostedEventIds();

  const eventIds = [...new Set([...daVitrine, ...aindaAbertos, ...candidatos])];

  const recemBuscados = await completarEventos(indice, eventIds, itensDaVitrine, agora, { quiet });

  // Só desce do banco o boosts_json de quem ainda pode ter boost valendo. Os
  // outros — a maioria dos candidatos do GetEvents — não contribuiriam com
  // nada para o catálogo, e antes eram baixados inteiros a cada descoberta.
  const faltam = eventIds.filter((id) => aberto(indice.get(id)) && !recemBuscados.has(id));
  const doBanco = await eventBoosts(faltam);
  const boostsDe = (id) => recemBuscados.get(id) ?? doBanco.get(id) ?? [];

  const boosts = [];
  const vistos = new Set();
  for (const eventId of eventIds) {
    for (const b of boostsDe(eventId)) {
      if (!valeMonitorar(b, agora) || vistos.has(b.itemId)) continue;
      vistos.add(b.itemId);
      boosts.push({ ...b, ribbonKind: ribbonPorItem.get(b.itemId) || b.ribbonKind });
    }
  }

  const { novos, bootstrap } = await upsertBoosts(boosts, nowIso());
  await purgeEventCache(6);

  if (!quiet && novos.length) {
    console.log(
      bootstrap
        ? `  catálogo inicial: ${boosts.length} boosts (sem alerta de estreia na primeira carga)`
        : `  + ${novos.length} boost(s) nova(s): ${novos.map((b) => b.itemId).join(', ')}`
    );
  }

  return {
    boosts,
    listName,
    eventos: eventIds.length,
    eventosComTrava: new Set(boosts.map((b) => b.eventId)).size,
    foraDaVitrine: boosts.filter((b) => !ribbonPorItem.has(b.itemId)).length,
    novos: bootstrap ? [] : novos,
    novosIds: new Set(bootstrap ? [] : novos.map((b) => b.itemId)),
  };
}

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

async function main() {
  const args = process.argv.slice(2);
  const { boosts, listName, eventos, eventosComTrava, foraDaVitrine } = await discover({ quiet: true });

  if (args.includes('--ids')) {
    console.log(boosts.map((b) => b.itemId).join(','));
    return;
  }
  if (args.includes('--json')) {
    console.log(JSON.stringify(boosts, null, 2));
    return;
  }

  const counts = await fetchCounts(boosts.map((b) => b.itemId));
  const porTipo = {};
  for (const b of boosts) porTipo[b.ribbonKind] = (porTipo[b.ribbonKind] || 0) + 1;

  console.log(
    `\nLista: ${listName} · ${eventos} evento(s) vasculhado(s) · ` +
      `${eventosComTrava} com trava · ${boosts.length} boosts monitoradas`
  );
  console.log(
    Object.entries(porTipo)
      .map(([k, v]) => `  ${KINDS[k] || k}: ${v}`)
      .join('\n')
  );
  if (foraDaVitrine) {
    console.log(`  ${foraDaVitrine} delas o /superodds-betcards não devolve (corte de 100 cards)`);
  }

  const comTrava = boosts
    .map((b) => ({ ...b, count: counts.get(b.itemId) ?? 0 }))
    .sort((a, b) => b.count / b.betsLimit - a.count / a.betsLimit);

  console.log(`\nBoosts monitoradas (${comTrava.length}):\n`);
  console.log(
    `${pad('ITEM', 10)}${pad('TIPO', 8)}${padL('ODD', 13)} ${padL('USADO', 6)} ${padL('TRAVA', 6)} ${padL('%', 7)} ${padL('FALTAM', 8)}  JOGO`
  );
  for (const b of comTrava) {
    const pct = (b.count / b.betsLimit) * 100;
    const faltam = Math.max(0, b.betsLimit - b.count);
    console.log(
      pad(b.itemId, 10) +
        pad(b.ribbonKind, 8) +
        padL(`${b.basePrice ?? '?'}→${b.price ?? '?'}`, 13) +
        ' ' +
        padL(b.count, 6) +
        ' ' +
        padL(b.betsLimit, 6) +
        ' ' +
        padL(pct.toFixed(1) + '%', 7) +
        ' ' +
        padL(faltam === 0 ? 'ESGOTADA' : faltam, 8) +
        '  ' +
        b.eventName.slice(0, 34)
    );
  }

  const esgotadas = comTrava.filter((b) => b.count >= b.betsLimit).length;
  console.log(`\n${esgotadas} de ${comTrava.length} travas já esgotadas neste instante.`);
  console.log('Catálogo gravado no Postgres (DATABASE_URL)\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Falha na descoberta:', err.message);
    process.exit(1);
  });
}
