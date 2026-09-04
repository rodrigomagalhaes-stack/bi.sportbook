// Acesso às duas APIs públicas por trás das Super Odds da Esportiva.
//
// 1) multiplas.esportiva.bet.br (app Nuxt da própria Esportiva)
//    /api/superodds-betcards  — os cards da vitrine, com itemId (betCardId),
//    jogo, campeonato, tipo e `slipBoostPayloadFull.betsLimit`. Aberto, sem
//    sessão. PORÉM devolve no máximo 100 cards e ignora take/skip/page/eventId
//    (testados) — boosts vivas ficam de fora.
//    /api/superodds-counts?itemIds=… — bilhetes já usados de cada trava.
//
// 2) sb2frontend-altenar2.biahosted.com (o sportsbook que roda o site)
//    /api/widget/GetEventDetails?eventId=… — traz um array `boosts` com TODAS
//    as boosts do evento, sem corte: trava (`boostInfo.betsLimit`), odd
//    original (`price`) e odd turbinada (`boostInfo.price`), mais os ids de
//    mercado/seleção que dão para resolver no mesmo payload.
//
// Por que as duas: a lista da Esportiva é o índice barato de quais eventos
// estão em promoção agora; o Altenar completa cada evento. No Real Bétis x
// Real Sociedad a lista devolvia 8 boosts com trava e o Altenar, 11 — uma das
// omitidas (15997514, trava 1900) já estava esgotada no site.

import { config } from './config.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export async function getJson(url, { timeoutMs = 20000, retries = 2, referer = config.baseUrl + '/' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        // Referer nulo é intencional em algumas chamadas: o Altenar devolve 403
        // quando o Referer é o domínio da Esportiva, e 200 quando não vai nenhum.
        headers: { 'User-Agent': UA, Accept: 'application/json', ...(referer ? { Referer: referer } : {}) },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

function normalizeCard(card) {
  const boost = card.slipBoostPayloadFull || {};
  const legs = (card.legs || []).map((l) => ({
    market: clean(l.marketLabel),
    selection: clean(l.selectionText),
    price: l.displayPrice ?? null,
    basePrice: l.basePrice ?? null,
    boosted: !!l.legBoosted,
  }));
  return {
    itemId: card.betCardId,
    ribbonKind: card.ribbonKind || 'desconhecido',
    betsLimit: Number(boost.betsLimit || 0),
    isWelcome: !!boost.isWelcome,
    isLimitedTime: !!boost.isLimitedTime,
    endDate: boost.endDate || null,
    eventId: card.eventId ?? null,
    eventName: clean(card.eventName),
    sportName: clean(card.sportName),
    champName: clean(card.champName),
    categoryName: clean(card.categoryName),
    startDate: card.startDate || null,
    price: card.combinedPrice ?? null,
    basePrice: card.combinedBasePrice ?? null,
    legs,
  };
}

/** Lista todas as boosts ativas, já normalizadas. */
export async function fetchBoosts() {
  const data = await getJson(`${config.baseUrl}/api/superodds-betcards`);
  const cards = Array.isArray(data?.cards) ? data.cards : [];
  return {
    listId: data?.betCardListId ?? null,
    listName: clean(data?.betCardListName),
    boosts: cards.filter((c) => c?.betCardId).map(normalizeCard),
  };
}

/** Contagem de bilhetes usados por itemId. Quebra em lotes por causa do tamanho da URL. */
export async function fetchCounts(itemIds) {
  const out = new Map();
  for (let i = 0; i < itemIds.length; i += config.chunkSize) {
    const chunk = itemIds.slice(i, i + config.chunkSize);
    // A CDN cacheia a resposta por 45s. Como o ponto do monitor é pegar o
    // esgotamento no instante em que acontece, o parâmetro descartável força
    // MISS e leva a leitura até a origem.
    const buster = config.cacheBuster ? `&_t=${Date.now()}` : '';
    const data = await getJson(
      `${config.baseUrl}/api/superodds-counts?itemIds=${chunk.join(',')}${buster}`
    );
    for (const [id, n] of Object.entries(data?.itemCounts || {})) out.set(Number(id), Number(n));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Altenar — a lista completa de boosts de um evento
// ---------------------------------------------------------------------------

// Parâmetros que o widget do site manda em toda chamada. `culture`/`numFormat`
// mudam só o idioma e o formato dos números; o resto identifica o operador.
const ALTENAR_QS =
  `culture=pt-BR&countryCode=BR&deviceType=1&numFormat=en-GB&timezoneOffset=180`;

/** Índice id → objeto, tolerando as listas que o payload separa em pai/filho. */
function indexar(...listas) {
  const m = new Map();
  for (const lista of listas) for (const item of lista || []) m.set(item.id, item);
  return m;
}

/**
 * Todas as boosts de um evento, no mesmo formato de `fetchBoosts`.
 *
 * `boost.price` é a odd original e `boost.boostInfo.price` é a turbinada — a
 * resposta traz o par pronto, sem precisar cruzar com nada. As pernas vêm como
 * pares (marketId, selectionId) que se resolvem nas listas `markets`/`odds` do
 * próprio payload.
 */
export async function fetchEventBoosts(eventId) {
  const url =
    `${config.altenarUrl}/api/widget/GetEventDetails` +
    `?integration=${encodeURIComponent(config.altenarIntegration)}&${ALTENAR_QS}&eventId=${eventId}`;
  // A resposta passa de 2 MB (todos os mercados do jogo vêm junto), daí o
  // timeout mais folgado que o das outras chamadas.
  const d = await getJson(url, { timeoutMs: 45000, referer: null });

  if (!d || !Array.isArray(d.boosts)) return [];

  const mercados = indexar(d.markets, d.childMarkets);
  const odds = indexar(d.odds, d.childOdds);
  const evento = {
    eventId: d.id ?? Number(eventId),
    eventName: clean(d.name) || clean([d.competitors?.[0]?.name, d.competitors?.[1]?.name].filter(Boolean).join(' vs. ')),
    sportName: clean(d.sport?.name),
    champName: clean(d.champ?.name),
    categoryName: clean(d.category?.name),
    startDate: d.startDate || null,
  };

  return d.boosts.map((b) => {
    const info = b.boostInfo || {};
    return {
      ...evento,
      itemId: b.id,
      ribbonKind: info.isWelcome ? 'welcome' : 'golden',
      betsLimit: Number(info.betsLimit || 0),
      isWelcome: !!info.isWelcome,
      isLimitedTime: !!info.isLimitedTime,
      endDate: info.endDate || null,
      price: info.price ?? null,      // odd turbinada
      basePrice: b.price ?? null,     // odd antes da turbinada
      legs: (b.odds || []).map((o) => {
        const odd = odds.get(o.selectionId);
        return {
          market: clean(mercados.get(o.marketId)?.name),
          selection: clean(odd?.name),
          price: odd?.price ?? null,
          basePrice: null,
          boosted: false,
        };
      }),
    };
  });
}

/**
 * Eventos que o sportsbook marca como tendo promoção — a segunda fonte de
 * enumeração, para o caso de a vitrine da Esportiva não citar um jogo.
 *
 * `GetEvents` devolve, por evento, uma lista `offers`. Comparando os eventos
 * que TÊM boost com trava contra os que não têm, o marcador que separa é o
 * `type: 5`: num levantamento de 1.502 jogos de futebol, os 4 eventos com trava
 * estavam todos entre os 42 marcados com 5. Ele é necessário, não suficiente —
 * a maioria dos 42 não tem trava nenhuma —, então serve como lista de
 * candidatos a conferir, nunca como resposta pronta.
 *
 * A resposta tem teto de 1.500 eventos por esporte e ignora `hoursRange`, então
 * ela enxerga só os jogos mais próximos: é complemento da vitrine (que alcança
 * mais longe), não substituta.
 */
export async function fetchBoostedEventIds(sportIds = config.altenarSportIds) {
  const ids = new Set();
  for (const sportId of sportIds) {
    try {
      const d = await getJson(
        `${config.altenarUrl}/api/widget/GetEvents` +
          `?integration=${encodeURIComponent(config.altenarIntegration)}&${ALTENAR_QS}&sportId=${sportId}`,
        { timeoutMs: 45000, referer: null }
      );
      for (const e of d?.events || []) {
        if ((e.offers || []).some((o) => o.type === 5)) ids.add(e.id);
      }
    } catch {
      // Fonte secundária: se cair, a vitrine sozinha continua montando o catálogo.
    }
  }
  return ids;
}
