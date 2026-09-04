// Os candidatos de um jogo, vindos do sportsbook ao vivo.
//
// Reaproveita o acesso que o Monitor já tinha ao Altenar (server/monitor/api.js),
// mas guarda o que ele descarta: a lista completa de MERCADOS e ODDS do evento.
// É ela que permite de-vigar (ver margem.js) — sem as outras seleções do
// mercado não dá para saber quanta margem a odd embute, e a conta inteira do
// recomendador depende disso.
//
// A resposta do Altenar passa de 2 MB (354 mercados e 8.716 odds num PSG x
// Monaco). Nada disso vai para o navegador: aqui ela vira algumas dezenas de
// KB — as boosts que existem, com o grupo de de-vig de cada perna, mais os
// mercados principais do jogo para as boosts que ainda não existem.
//
// ── O GRUPO DE DE-VIG É A COLUNA, NÃO O MERCADO ──────────────────────────────
// `desktopOddIds` é uma GRADE, do jeito que o site desenha: cada linha é um
// desfecho e cada COLUNA é um conjunto complementar. No 1x2 são três linhas de
// uma coluna só ([[casa],[empate],[fora]]) e a coluna é o mercado inteiro. Já
// em "Total (mais/menos) Chutes a Gol PSG" são duas linhas (Mais / Menos) e
// cinco colunas (4.5, 5.5, 6.5, 7.5, 8.5): a coluna do 7.5 é {Mais de 7.5,
// Menos de 7.5}, e só ela soma ~1.
//
// Somar o mercado inteiro daria 5,4 de probabilidade implícita — cinco pares
// empilhados — e o de-vig cuspiria uma probabilidade cinco vezes menor que a
// real. A coluna do 7.5 dá 1/2.375 + 1/1.52 = 1.079, os 7,9% de margem que
// realmente existem ali.

import { getJson, fetchBoosts } from '../monitor/api.js';
import { config } from '../monitor/config.js';

const ALTENAR_QS = 'culture=pt-BR&countryCode=BR&deviceType=1&numFormat=en-GB&timezoneOffset=180';
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// Quantos mercados do jogo viram sugestão. O evento tem centenas, a maioria
// derivada (por minuto, por jogador, por intervalo); passar de algumas dezenas
// só enche a tela de linha que ninguém turbina.
const TETO_MERCADOS = 40;
// Linhas por mercado. "Total de gols" traz 20 (0.5, 2, 2.25 … 7.5); as
// escolhidas são as mais equilibradas, que é onde a boost costuma ir.
const TETO_LINHAS = 3;
// Odd fora desta faixa não vira sugestão: abaixo não paga a atenção de
// ninguém, acima o bilhete quase nunca ganha e a boost não move volume.
const ODD_MIN = 1.15;
const ODD_MAX = 15;

// Mercados que existem só durante o jogo e nunca viram boost planejada: "o que
// acontece no próximo minuto", as janelas de 5/10/15 minutos e o intervalo do
// primeiro gol. São dezenas por evento e ocupariam a lista inteira.
const MERCADO_AO_VIVO =
  /pr[óo]ximo[s]? \d+ minutos|seguinte minuto|\d+:\d{2} ?- ?\d+:\d{2}|quando ser[áa] marcado/i;

/** Índice id → objeto, juntando as listas que o payload separa em pai/filho. */
function indexar(...listas) {
  const m = new Map();
  for (const lista of listas) for (const item of lista || []) m.set(item.id, item);
  return m;
}

/**
 * As colunas de um mercado — cada uma um conjunto complementar de seleções.
 * Preços zerados (seleção suspensa) saem DEPOIS de montar a coluna: tirá-los
 * antes desalinharia a grade e pareariam odds de linhas diferentes.
 */
export function colunasDoMercado(mercado, odds) {
  const grade = (mercado?.desktopOddIds || mercado?.mobileOddIds || []).filter(Array.isArray);
  if (!grade.length) return [];
  const largura = Math.max(...grade.map((linha) => linha.length));
  const colunas = [];
  for (let c = 0; c < largura; c++) {
    const selecoes = grade
      .map((linha) => odds.get(linha[c]))
      .filter((o) => o && Number(o.price) > 1)
      .map((o) => ({ selectionId: o.id, selection: clean(o.name), price: Number(o.price) }));
    if (selecoes.length >= 2) colunas.push(selecoes);
  }
  return colunas;
}

/** A coluna que contém uma seleção — o grupo com que ela é de-vigada. */
function colunaDaSelecao(mercado, odds, selectionId) {
  for (const coluna of colunasDoMercado(mercado, odds))
    if (coluna.some((s) => s.selectionId === selectionId)) return coluna;
  return [];
}

/** Quão equilibrada é a coluna: 0 = todas as seleções com a mesma chance. */
function desequilibrio(coluna) {
  const probs = coluna.map((s) => 1 / s.price);
  const media = probs.reduce((a, b) => a + b, 0) / probs.length;
  return Math.max(...probs.map((p) => Math.abs(p - media)));
}

/** Quantas boosts cada evento já tem no ar, pela vitrine da Esportiva. */
async function boostsPorEvento() {
  const porEvento = new Map();
  try {
    const { boosts } = await fetchBoosts();
    for (const b of boosts) {
      if (!b.eventId) continue;
      const e = porEvento.get(b.eventId) || { qtdBoosts: 0, comTrava: 0 };
      e.qtdBoosts++;
      if (b.betsLimit > 0) e.comTrava++;
      porEvento.set(b.eventId, e);
    }
  } catch {
    // A vitrine é enfeite aqui: sem ela o catálogo continua inteiro, só sem a
    // marca de quais jogos já têm boost.
  }
  return porEvento;
}

/**
 * O catálogo de jogos para o seletor da tela.
 *
 * ── POR QUE NÃO É A VITRINE ──────────────────────────────────────────────────
 * A primeira versão listava `/api/superodds-betcards`, e ela só conhece jogo que
 * JÁ tem Super Odds publicada — 14 num dia normal. Quem vai montar a boost de
 * amanhã não achava o jogo, que é exatamente quando a tela serviria. O corte não
 * era decisão de projeto, era a fonte errada.
 *
 * `GetEvents` do Altenar devolve o calendário: 1.665 jogos de futebol cobrindo
 * umas seis semanas, com nome, campeonato e horário. A vitrine continua sendo
 * consultada, mas só para marcar quais desses já têm boost no ar.
 *
 * ── CUSTO ────────────────────────────────────────────────────────────────────
 * A resposta bruta é de 3,9 MB por esporte e leva ~0,6s; enxuta aqui, vira 189
 * KB. Calendário muda em horas, não em minutos, daí o cache mais longo no
 * endpoint que chama esta função.
 */
export async function catalogoDeJogos() {
  const comBoost = await boostsPorEvento();
  const jogos = [];

  for (const sportId of config.altenarSportIds) {
    const d = await getJson(
      `${config.altenarUrl}/api/widget/GetEvents` +
        `?integration=${encodeURIComponent(config.altenarIntegration)}&${ALTENAR_QS}&sportId=${sportId}`,
      { timeoutMs: 20000, retries: 1, referer: null },
    );
    const champs = new Map((d?.champs || []).map((c) => [c.id, clean(c.name)]));
    const categorias = new Map((d?.categories || []).map((c) => [c.id, clean(c.name)]));
    const esportes = new Map((d?.sports || []).map((s) => [s.id, clean(s.name)]));

    for (const e of d?.events || []) {
      if (!e.id || !e.name) continue;
      const marca = comBoost.get(e.id);
      jogos.push({
        eventId: e.id,
        eventName: clean(e.name),
        champName: champs.get(e.champId) || '',
        categoryName: categorias.get(e.catId) || '',
        sportName: esportes.get(e.sportId) || '',
        startDate: e.startDate || null,
        qtdBoosts: marca?.qtdBoosts || 0,
        comTrava: marca?.comTrava || 0,
      });
    }
  }

  // Um jogo com boost no ar que o calendário não trouxe (o `GetEvents` tem teto
  // e ignora janela de horas) ainda precisa aparecer na lista.
  const conhecidos = new Set(jogos.map((j) => j.eventId));
  for (const [eventId, marca] of comBoost) {
    if (conhecidos.has(eventId)) continue;
    jogos.push({ eventId, eventName: `Evento ${eventId}`, champName: '', categoryName: '', sportName: '', startDate: null, ...marca });
  }

  return jogos.sort((a, b) => String(a.startDate || '9999').localeCompare(String(b.startDate || '9999')));
}

/**
 * Tudo que o recomendador precisa de um jogo.
 *
 * `boosts` são as que já existem, cada perna acompanhada do grupo de de-vig
 * dela (`precosDoMercado`). `mercados` são os principais do jogo, cada seleção
 * já com o próprio grupo — a matéria-prima para sugerir boost onde ainda não
 * tem nenhuma.
 */
export async function candidatosDoEvento(eventId) {
  const url =
    `${config.altenarUrl}/api/widget/GetEventDetails` +
    `?integration=${encodeURIComponent(config.altenarIntegration)}&${ALTENAR_QS}&eventId=${eventId}`;
  // O monitor espera 45s e tenta três vezes porque roda de fundo, num cron. Aqui
  // tem gente olhando a tela depois de um clique: no pior caso aquela paciência
  // daria mais de dois minutos e a função serverless morreria antes, trocando um
  // erro explicado por um timeout da plataforma. Em condições normais a chamada
  // volta em ~0,3s.
  const d = await getJson(url, { timeoutMs: 15000, retries: 1, referer: null });
  if (!d || !d.id) throw new Error(`evento ${eventId} não encontrado no Altenar`);

  const mercados = indexar(d.markets, d.childMarkets);
  const odds = indexar(d.odds, d.childOdds);

  const evento = {
    eventId: d.id,
    eventName:
      clean(d.name) ||
      clean([d.competitors?.[0]?.name, d.competitors?.[1]?.name].filter(Boolean).join(' vs. ')),
    competidores: (d.competitors || []).map((c) => clean(c.name)).filter(Boolean),
    sportName: clean(d.sport?.name),
    champName: clean(d.champ?.name),
    categoryName: clean(d.category?.name),
    startDate: d.startDate || null,
  };

  const listaBoosts = (d.boosts || []).map((b) => {
    const info = b.boostInfo || {};
    return {
      itemId: b.id,
      isWelcome: !!info.isWelcome,
      isLimitedTime: !!info.isLimitedTime,
      betsLimit: Number(info.betsLimit || 0),
      endDate: info.endDate || null,
      basePrice: b.price ?? null,
      price: info.price ?? null,
      legs: (b.odds || []).map((o) => {
        const mercado = mercados.get(o.marketId);
        const odd = odds.get(o.selectionId);
        return {
          market: clean(mercado?.name),
          selection: clean(odd?.name),
          price: odd?.price ?? null,
          precosDoMercado: colunaDaSelecao(mercado, odds, o.selectionId).map((x) => x.price),
        };
      }),
    };
  });

  // Mercados que valem virar sugestão. `so` é a ordem de exibição do próprio
  // site — 0 é o balde dos que não têm posição definida, e vai para o fim.
  const ordem = (m) => (Number(m.so) > 0 ? Number(m.so) : 9999);
  const listaMercados = (d.markets || [])
    .filter((m) => !MERCADO_AO_VIVO.test(clean(m.name)))
    .map((m) => {
      const linhas = colunasDoMercado(m, odds)
        .filter((coluna) => coluna.every((s) => s.price >= ODD_MIN && s.price <= ODD_MAX))
        .sort((a, b) => desequilibrio(a) - desequilibrio(b))
        .slice(0, TETO_LINHAS);
      return { mercado: m, linhas };
    })
    .filter(({ linhas }) => linhas.length)
    .sort(
      (a, b) => ordem(a.mercado) - ordem(b.mercado) || a.mercado.name.localeCompare(b.mercado.name),
    )
    .slice(0, TETO_MERCADOS)
    .map(({ mercado, linhas }) => ({
      marketId: mercado.id,
      market: clean(mercado.name),
      // Cada seleção já sai com o grupo de de-vig dela: o cliente não precisa
      // saber que existe uma grade por trás.
      selecoes: linhas.flatMap((coluna) =>
        coluna.map((s) => ({ ...s, precosDoMercado: coluna.map((x) => x.price) })),
      ),
    }));

  return { evento, boosts: listaBoosts, mercados: listaMercados, lidoEm: new Date().toISOString() };
}
