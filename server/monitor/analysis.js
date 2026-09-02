// Camada de cálculo: junta catálogo + estado + histórico e produz a visão
// enriquecida que alimenta tanto os alertas quanto o painel.
//
// O objetivo do sistema é um só: saber, no instante em que acontece, que a
// trava de bilhetes de uma boost esgotou. Tudo aqui gira em torno disso —
// quanto falta, quanto tempo falta, e quando esgotou.

import { config, KINDS } from './config.js';
import { monitoredBoosts, statesFor, ratesSince } from './db.js';

export const STATUS = {
  ESGOTADO: 'esgotado',   // bateu a trava
  QUASE: 'quase',         // a ponto de bater
  PARADO: 'parado',       // sem vender há muito tempo, mas longe da trava
  ENCERRADA: 'encerrada', // saiu da lista (janela fechou) sem ter batido a trava
  ATIVO: 'ativo',
  SEM_USO: 'sem_uso',
};

const minutesBetween = (a, b) =>
  !a || !b ? null : Math.max(0, (Date.parse(b) - Date.parse(a)) / 60000);

/**
 * Monta a visão de todas as boosts ativas com métricas derivadas.
 * `now` é injetável para facilitar teste.
 *
 * `boosts` é injetável porque o ciclo do monitor já carregou o catálogo para
 * fazer a leitura — buscá-lo de novo aqui era ler a mesma tabela duas vezes
 * por ciclo, sem que nada pudesse ter mudado entre uma e outra.
 *
 * `comLegs` só é ligado pelo painel, o único que desenha as pernas da boost;
 * `legs_json` é a maior coluna do catálogo e não tem uso no ciclo.
 */
export async function buildView(now = new Date(), { boosts: boostsDados, comLegs = false } = {}) {
  const boosts = boostsDados ?? (await monitoredBoosts({ comLegs }));
  const states = await statesFor(boosts.map((b) => b.item_id));
  const rates = await ratesSince(new Date(now.getTime() - config.rateWindowMinutes * 60000).toISOString());
  const nowIso = now.toISOString();

  const rows = boosts.map((b) => {
    const s = states.get(b.item_id);
    const count = s?.count ?? 0;
    const limit = b.bets_limit || 0;
    const pct = limit > 0 ? count / limit : null;
    const rate = rates.get(b.item_id) ?? 0;                    // bilhetes/min
    const stalledMinutes = s ? minutesBetween(s.last_change_ts, nowIso) : null;
    const restante = limit > 0 ? Math.max(0, limit - count) : null;
    const etaMinutes = limit > 0 && rate > 0 && restante > 0 ? restante / rate : null;

    const esgotado = limit > 0 && count >= limit;
    const quase = !esgotado && pct !== null && pct >= config.nearLimitPct;
    const parado =
      !esgotado &&
      count >= config.stallMinCount &&
      stalledMinutes !== null &&
      stalledMinutes >= config.stallMinutes;

    // Saiu da lista = a Esportiva encerrou a janela dela. Vale mais que
    // "parado": não é suspeita, é fato registrado.
    const saiuDaLista = !!b.left_list_at;

    let status = STATUS.SEM_USO;
    if (esgotado) status = STATUS.ESGOTADO;
    else if (saiuDaLista) status = STATUS.ENCERRADA;
    else if (parado) status = STATUS.PARADO;
    else if (quase) status = STATUS.QUASE;
    else if (count > 0) status = STATUS.ATIVO;

    // Quando a trava fechou: a última vez que a contagem se moveu foi o momento
    // em que ela bateu o teto. Só vale se acompanhamos a subida — se a boost já
    // estava esgotada na primeira leitura, não temos como saber a hora.
    const acompanhouSubida = !!(s && s.first_ts !== s.last_change_ts);
    const esgotadoEm = esgotado && acompanhouSubida ? s.last_change_ts : null;
    const esgotadoHaMin = esgotadoEm ? minutesBetween(esgotadoEm, nowIso) : null;

    return {
      itemId: b.item_id,
      kind: b.ribbon_kind,
      kindLabel: KINDS[b.ribbon_kind] || b.ribbon_kind,
      eventName: b.event_name,
      champName: b.champ_name,
      sportName: b.sport_name,
      startDate: b.start_date,
      endDate: b.end_date,
      price: b.price,
      basePrice: b.base_price,
      // Só sai quando quem chamou pediu `comLegs`. A chave some em vez de vir
      // `[]` para ninguém confundir "não carreguei" com "boost sem pernas".
      ...(b.legs_json === undefined ? {} : { legs: safeJson(b.legs_json) }),
      count,
      prevCount: s?.prev_count ?? 0,
      delta: s ? s.count - s.prev_count : 0,
      betsLimit: limit,
      restante,
      pct,
      rate,
      etaMinutes,
      stalledMinutes,
      stallReads: s?.stall_reads ?? 0,
      reads: s?.reads ?? 0,
      firstTs: s?.first_ts ?? null,
      lastTs: s?.last_ts ?? null,
      lastChangeTs: s?.last_change_ts ?? null,
      status,
      esgotadoEm,
      esgotadoHaMin,
      saiuDaLista,
      saiuDaListaEm: b.left_list_at || null,
      jaEstavaEsgotado: esgotado && !acompanhouSubida,
    };
  });

  rows.sort((a, b) => {
    const pa = a.pct ?? -1;
    const pb = b.pct ?? -1;
    return pb - pa || b.count - a.count;
  });

  return rows;
}

/** Mediana simples — resistente ao item que leu uma vez e parou. */
function mediana(xs) {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function summarize(rows, now = new Date()) {
  // Quando o monitor leu de verdade pela última vez, e de quanto em quanto ele
  // vem lendo. Sem isso o painel não tem como saber se está olhando dado de
  // agora ou de uma semana atrás: a resposta da API sempre chega "recém-feita".
  const ultimos = rows.map((r) => r.lastTs).filter(Boolean).sort();
  const ultimaLeitura = ultimos.length ? ultimos[ultimos.length - 1] : null;

  // Intervalo típico entre leituras, medido pelo próprio histórico de cada
  // item: (última - primeira) / (nº de leituras - 1).
  const intervalos = rows
    .filter((r) => r.reads > 1 && r.firstTs && r.lastTs)
    .map((r) => (Date.parse(r.lastTs) - Date.parse(r.firstTs)) / 1000 / (r.reads - 1))
    .filter((x) => x > 0);

  return {
    ultimaLeitura,
    idadeSegundos: ultimaLeitura ? Math.max(0, (now.getTime() - Date.parse(ultimaLeitura)) / 1000) : null,
    intervaloMedioSegundos: mediana(intervalos),
    total: rows.length,
    comTrava: rows.filter((r) => r.betsLimit > 0).length,
    comBilhetes: rows.filter((r) => r.count > 0).length,
    // "Vendendo" é medido: a contagem mexeu na janela recente. Ter bilhete
    // acumulado não quer dizer que ainda está vendendo.
    vendendo: rows.filter((r) => r.rate > 0).length,
    esgotados: rows.filter((r) => r.status === STATUS.ESGOTADO).length,
    encerradas: rows.filter((r) => r.status === STATUS.ENCERRADA).length,
    quase: rows.filter((r) => r.status === STATUS.QUASE).length,
    parados: rows.filter((r) => r.status === STATUS.PARADO).length,
    bilhetesTotal: rows.reduce((a, r) => a + r.count, 0),
  };
}

function safeJson(s) {
  try {
    return JSON.parse(s || '[]');
  } catch {
    return [];
  }
}
