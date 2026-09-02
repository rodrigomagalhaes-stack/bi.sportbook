// Segunda fonte de descoberta: varredura de vizinhança.
//
// POR QUE ISSO EXISTE
// `/api/superodds-betcards` devolve exatamente 100 cards e ignora qualquer
// parâmetro de paginação — é teto do servidor, não o total. Varrendo a faixa de
// ids apareceram boosts VIVAS que a lista não devolve: um cluster de ids vizinho
// ao único Welcome Boost exposto, com contagens altas e subindo em tempo real.
//
// A varredura contorna isso lendo `superodds-counts` diretamente na vizinhança
// dos ids conhecidos. O endpoint devolve 0 tanto para id inexistente quanto para
// boost sem aposta, então contagem > 0 sozinha não prova nada: a contagem de uma
// boost encerrada continua lá para sempre. Na varredura completa, 193 dos 194
// achados eram resíduo de boosts velhas.
//
// O que separa vivo de resíduo é MOVIMENTO. Um id só entra no monitoramento
// depois que a contagem dele muda entre duas varreduras.
//
// Esses itens entram sem metadados — sem nome de jogo e, principalmente, SEM
// `betsLimit`. Para eles não dá para dizer "esgotou": dá para dizer que pararam
// de vender, e em que número pararam.

import { fetchCounts } from './api.js';
import { nowIso, activeBoosts, withTransaction, dbGet, dbRun, dbAll } from './db.js';
import { config } from './config.js';

/** Ids a sondar: vizinhança de cada id conhecido (cards costumam vir em blocos). */
function candidatos(conhecidos, raio) {
  const set = new Set();
  for (const id of conhecidos) {
    for (let d = -raio; d <= raio; d++) set.add(id + d);
  }
  for (const id of conhecidos) set.delete(id);
  return [...set].sort((a, b) => a - b);
}

/**
 * Uma passada de varredura. Devolve os ids que se moveram desde a passada
 * anterior — esses são boosts vivas fora da lista oficial.
 */
export async function scanOnce({ quiet = false } = {}) {
  const conhecidos = (await activeBoosts()).map((b) => b.item_id);
  if (!conhecidos.length) return { sondados: 0, comBilhetes: 0, moveram: [], promovidos: [] };

  const ids = candidatos(conhecidos, config.scanRadius);
  const counts = await fetchCounts(ids);
  const ts = nowIso();

  const moveram = [];
  let comBilhetes = 0;

  await withTransaction(async (tx) => {
    for (const [id, n] of counts) {
      if (n <= 0) continue;
      comBilhetes++;
      const antes = await tx.get('SELECT count, moveu, promovido FROM scan_seen WHERE item_id = ?', [id]);
      if (!antes) {
        await tx.run(
          'INSERT INTO scan_seen (item_id, count, first_ts, last_ts, moveu, promovido) VALUES (?,?,?,?,0,0)',
          [id, n, ts, ts]
        );
        continue;
      }
      if (n !== antes.count) {
        await tx.run('UPDATE scan_seen SET count = ?, last_ts = ?, moveu = ? WHERE item_id = ?', [n, ts, 1, id]);
        // Só interessa promover uma vez.
        if (!antes.promovido) moveram.push({ itemId: id, de: antes.count, para: n });
      } else {
        await tx.run('UPDATE scan_seen SET count = ?, last_ts = ?, moveu = ? WHERE item_id = ?', [n, ts, antes.moveu, id]);
      }
    }
  });

  const promovidos = await promover(moveram, ts);

  if (!quiet) {
    console.log(
      `  varredura: ${ids.length} ids sondados · ${comBilhetes} com bilhetes · ` +
        `${moveram.length} em movimento fora da lista` +
        (promovidos.length ? ` · ${promovidos.length} adicionad(o/a)s ao monitor` : '')
    );
  }

  return { sondados: ids.length, comBilhetes, moveram, promovidos };
}

/**
 * Palpite de qual jogo é, pelos vizinhos numéricos.
 *
 * Os cards de um mesmo evento são criados em bloco e recebem ids consecutivos:
 * 15505621, 22, [23 fora da lista], 24, 25, 26 são todos Ponte Preta × Náutico.
 * Se os ids logo antes e logo depois pertencem ao MESMO evento, o do meio quase
 * certamente é do mesmo jogo. É inferência, não dado — por isso vai rotulada
 * como "provável" e nunca sobrescreve nome vindo da API.
 */
async function palpitarEvento(itemId) {
  const antes = await dbGet(
    `SELECT event_id, event_name FROM boosts
     WHERE item_id < ? AND event_id IS NOT NULL ORDER BY item_id DESC LIMIT 1`,
    [itemId]
  );
  const depois = await dbGet(
    `SELECT event_id, event_name FROM boosts
     WHERE item_id > ? AND event_id IS NOT NULL ORDER BY item_id ASC LIMIT 1`,
    [itemId]
  );

  if (antes && depois && antes.event_id === depois.event_id) {
    return { eventId: antes.event_id, nome: antes.event_name };
  }
  return null;
}

/** Entra no catálogo como boost sem metadados — vive só de contagem. */
async function promover(moveram, ts) {
  if (!moveram.length) return [];

  const out = [];
  for (const m of moveram) {
    const palpite = await palpitarEvento(m.itemId);
    const nome = palpite
      ? `provável: ${palpite.nome} (item ${m.itemId})`
      : `Boost fora da lista (item ${m.itemId})`;
    await dbRun(
      `INSERT INTO boosts (item_id, ribbon_kind, bets_limit, event_id, event_name, sport_name,
                          champ_name, start_date, end_date, price, base_price, legs_json,
                          first_seen, last_seen, active)
       VALUES (?, 'oculta', 0, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, '[]', ?, ?, 1)
       ON CONFLICT(item_id) DO UPDATE SET active = 1, last_seen = excluded.last_seen`,
      [m.itemId, nome, ts, ts]
    );
    await dbRun('UPDATE scan_seen SET promovido = 1 WHERE item_id = ?', [m.itemId]);
    out.push(m.itemId);
  }
  return out;
}

export const idsOcultos = async () =>
  (await dbAll("SELECT item_id FROM boosts WHERE ribbon_kind = 'oculta' AND active = 1")).map((r) => r.item_id);
