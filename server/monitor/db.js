// Persistência em Postgres (Neon) via `pg`. Guarda cinco coisas:
//   boosts   — catálogo das boosts descobertas (nome do jogo, trava, tipo…)
//   state    — leitura atual de cada item + controle de estagnação
//   readings — histórico: só grava quando a contagem MUDA (mantém o banco leve
//              e ainda permite calcular velocidade e ETA)
//   alerts   — alertas já disparados (evita repetir e alimenta o painel)
//   scan_seen/meta — apoio da varredura e dos timers de descoberta (ver scan.js/monitor.js)
//   event_cache — boosts de cada evento vindas do Altenar (ver discover.js)
//
// Trocado de node:sqlite para Postgres porque o Vercel roda funções serverless
// sem disco persistente compartilhado entre execuções — um arquivo .db local
// não sobreviveria de uma invocação para a outra.

import pg from 'pg';
import { config } from './config.js';

// O driver devolve BIGINT (oid 20) como STRING, para não perder precisão acima
// de 2^53. Aqui isso é veneno silencioso: se a coluna item_id for bigint, o id
// chega como '15958124' e `Map.get(15958124)` não acha — as contagens viram
// zero sem erro nenhum. Os ids da Esportiva têm 8 dígitos e as contagens são
// milhares, tudo muito longe do limite, então converter é seguro.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

let pool;

export function getPool() {
  if (pool) return pool;
  if (!config.databaseUrl) {
    throw new Error(
      'DATABASE_URL não configurada — defina a connection string do Postgres (ex.: Neon via Vercel Marketplace).'
    );
  }
  pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 8,
  });
  return pool;
}

/** Converte `?` posicional (estilo SQLite) para `$1, $2, …` (Postgres). */
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

let schemaReady;

export function ensureSchema() {
  if (schemaReady) return schemaReady;
  // Se a criação do schema falhar (ex.: banco fora do ar num cold start), não
  // trava as próximas tentativas — sem isso, uma falha transitória deixaria a
  // função serverless quebrada pelo resto da vida do container.
  schemaReady = getPool().query(`
    CREATE TABLE IF NOT EXISTS boosts (
      item_id     INTEGER PRIMARY KEY,
      ribbon_kind TEXT NOT NULL,
      bets_limit  INTEGER NOT NULL DEFAULT 0,
      event_id    INTEGER,
      event_name  TEXT,
      sport_name  TEXT,
      champ_name  TEXT,
      start_date  TEXT,
      end_date    TEXT,
      price       DOUBLE PRECISION,
      base_price  DOUBLE PRECISION,
      legs_json   TEXT,
      first_seen  TEXT NOT NULL,
      last_seen   TEXT NOT NULL,
      active      INTEGER NOT NULL DEFAULT 1,
      left_list_at TEXT
    );

    CREATE TABLE IF NOT EXISTS state (
      item_id        INTEGER PRIMARY KEY,
      count          INTEGER NOT NULL DEFAULT 0,
      prev_count     INTEGER NOT NULL DEFAULT 0,
      reads          INTEGER NOT NULL DEFAULT 0,
      stall_reads    INTEGER NOT NULL DEFAULT 0,
      first_ts       TEXT,
      last_ts        TEXT,
      last_change_ts TEXT,
      alerted        TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS readings (
      item_id INTEGER NOT NULL,
      ts      TEXT NOT NULL,
      count   INTEGER NOT NULL,
      PRIMARY KEY (item_id, ts)
    );
    CREATE INDEX IF NOT EXISTS idx_readings_item_ts ON readings (item_id, ts);

    CREATE TABLE IF NOT EXISTS alerts (
      id         SERIAL PRIMARY KEY,
      item_id    INTEGER NOT NULL,
      kind       TEXT NOT NULL,
      ts         TEXT NOT NULL,
      message    TEXT NOT NULL,
      count      INTEGER,
      bets_limit INTEGER,
      delivered  INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts (ts DESC);

    CREATE TABLE IF NOT EXISTS scan_seen (
      item_id    INTEGER PRIMARY KEY,
      count      INTEGER NOT NULL,
      first_ts   TEXT NOT NULL,
      last_ts    TEXT NOT NULL,
      moveu      INTEGER NOT NULL DEFAULT 0,
      promovido  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Boosts de cada evento, já normalizadas, como vieram do Altenar. A
    -- resposta original passa de 2 MB por evento e a trava não muda depois de
    -- publicada, então o catálogo é remontado a partir daqui a cada ciclo e a
    -- chamada cara só se repete quando o cache vence. Ver src/discover.js.
    CREATE TABLE IF NOT EXISTS event_cache (
      event_id    INTEGER PRIMARY KEY,
      fetched_ts  TEXT NOT NULL,
      start_date  TEXT,
      boosts_json TEXT NOT NULL
    );

    ALTER TABLE boosts ADD COLUMN IF NOT EXISTS left_list_at TEXT;

    -- Resumo derivado de boosts_json, gravado junto com ele. Existe para que o
    -- ciclo de descoberta possa decidir o que fazer com cada evento SEM baixar
    -- o boosts_json de todos eles: era a maior leitura que sobrava depois que a
    -- cota de transferencia do Neon estourou. Ver cachedEventIndex.
    --   aberto_ate — maior endDate entre as boosts COM trava (sentinela
    --                distante quando alguma não tem fim); NULL = evento sem
    --                trava nenhuma, que nunca entra no catálogo.
    --   item_ids   — itemIds do evento, para achar card novo que a vitrine já
    --                anuncia e o cache ainda não conhece.
    -- NULL nas duas = linha gravada antes destas colunas existirem; quem lê
    -- cai no boosts_json daquela linha até ela ser rebuscada.
    ALTER TABLE event_cache ADD COLUMN IF NOT EXISTS aberto_ate TEXT;
    ALTER TABLE event_cache ADD COLUMN IF NOT EXISTS item_ids   TEXT;

    -- Alinhamento de tipos com o que o código usa.
    --
    -- CREATE TABLE IF NOT EXISTS nao toca em tabela que ja existe, entao um
    -- banco criado à mão (pelo painel do Supabase, por exemplo) fica com tipos
    -- diferentes e o codigo quebra: foi o que aconteceu com 'active', que
    -- estava BOOLEAN e derrubava toda consulta 'WHERE active = 1' com
    -- "operator does not exist: boolean = integer". O bloco abaixo conserta e
    -- não faz nada quando os tipos já estão certos.
    DO $mig$
    DECLARE
      t TEXT;
    BEGIN
      SELECT data_type INTO t FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'boosts' AND column_name = 'active';
      IF t = 'boolean' THEN
        ALTER TABLE boosts ALTER COLUMN active DROP DEFAULT;
        ALTER TABLE boosts ALTER COLUMN active TYPE INTEGER USING (CASE WHEN active THEN 1 ELSE 0 END);
        ALTER TABLE boosts ALTER COLUMN active SET DEFAULT 1;
        ALTER TABLE boosts ALTER COLUMN active SET NOT NULL;
      END IF;

      SELECT data_type INTO t FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'alerts' AND column_name = 'delivered';
      IF t = 'boolean' THEN
        ALTER TABLE alerts ALTER COLUMN delivered DROP DEFAULT;
        ALTER TABLE alerts ALTER COLUMN delivered TYPE INTEGER USING (CASE WHEN delivered THEN 1 ELSE 0 END);
        ALTER TABLE alerts ALTER COLUMN delivered SET DEFAULT 0;
        ALTER TABLE alerts ALTER COLUMN delivered SET NOT NULL;
      END IF;

      SELECT data_type INTO t FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'scan_seen' AND column_name = 'moveu';
      IF t = 'boolean' THEN
        ALTER TABLE scan_seen ALTER COLUMN moveu DROP DEFAULT;
        ALTER TABLE scan_seen ALTER COLUMN moveu TYPE INTEGER USING (CASE WHEN moveu THEN 1 ELSE 0 END);
        ALTER TABLE scan_seen ALTER COLUMN moveu SET DEFAULT 0;
        ALTER TABLE scan_seen ALTER COLUMN moveu SET NOT NULL;
      END IF;

      SELECT data_type INTO t FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'scan_seen' AND column_name = 'promovido';
      IF t = 'boolean' THEN
        ALTER TABLE scan_seen ALTER COLUMN promovido DROP DEFAULT;
        ALTER TABLE scan_seen ALTER COLUMN promovido TYPE INTEGER USING (CASE WHEN promovido THEN 1 ELSE 0 END);
        ALTER TABLE scan_seen ALTER COLUMN promovido SET DEFAULT 0;
        ALTER TABLE scan_seen ALTER COLUMN promovido SET NOT NULL;
      END IF;

      -- 'alerted' guarda um array JSON que o codigo le com JSON.parse e grava
      -- com JSON.stringify; como jsonb ele volta ja desserializado e o parse
      -- estoura (silenciosamente, num catch): o controle de ja-alertei
      -- se perde e o mesmo alerta pode repetir.
      SELECT data_type INTO t FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'state' AND column_name = 'alerted';
      IF t = 'jsonb' OR t = 'json' THEN
        ALTER TABLE state ALTER COLUMN alerted DROP DEFAULT;
        ALTER TABLE state ALTER COLUMN alerted TYPE TEXT USING alerted::text;
        ALTER TABLE state ALTER COLUMN alerted SET DEFAULT '[]';
        ALTER TABLE state ALTER COLUMN alerted SET NOT NULL;
      END IF;
    END
    $mig$;
  `).catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

export async function dbAll(sql, params = []) {
  await ensureSchema();
  const { rows } = await getPool().query(toPg(sql), params);
  return rows;
}

export async function dbGet(sql, params = []) {
  const rows = await dbAll(sql, params);
  return rows[0];
}

export async function dbRun(sql, params = []) {
  await ensureSchema();
  const res = await getPool().query(toPg(sql), params);
  return { changes: res.rowCount };
}

/** Executa `fn` dentro de uma transação, numa única conexão do pool. */
export async function withTransaction(fn) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const tx = {
      all: async (sql, params = []) => (await client.query(toPg(sql), params)).rows,
      get: async (sql, params = []) => (await client.query(toPg(sql), params)).rows[0],
      run: async (sql, params = []) => {
        const res = await client.query(toPg(sql), params);
        return { changes: res.rowCount };
      },
    };
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export const nowIso = () => new Date().toISOString();

/** Apaga o rastro (alertas) de boosts que acabaram de sair do monitor. */
async function apagarRastro(runner, ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await runner(`DELETE FROM alerts WHERE item_id IN (${placeholders})`, ids);
}

/** Insere/atualiza o catálogo e marca como inativas as boosts que sumiram da lista. */
export async function upsertBoosts(boosts, ts = nowIso()) {
  const seenBefore = new Set((await dbAll('SELECT item_id FROM boosts')).map((r) => Number(r.item_id)));
  const novos = [];

  await withTransaction(async (tx) => {
    for (const b of boosts) {
      if (!seenBefore.has(b.itemId)) novos.push(b);
      await tx.run(
        `INSERT INTO boosts (item_id, ribbon_kind, bets_limit, event_id, event_name, sport_name,
                            champ_name, start_date, end_date, price, base_price, legs_json,
                            first_seen, last_seen, active)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
         ON CONFLICT(item_id) DO UPDATE SET
           ribbon_kind = excluded.ribbon_kind,
           bets_limit  = excluded.bets_limit,
           event_name  = excluded.event_name,
           champ_name  = excluded.champ_name,
           start_date  = excluded.start_date,
           end_date    = excluded.end_date,
           price       = excluded.price,
           base_price  = excluded.base_price,
           legs_json   = excluded.legs_json,
           last_seen   = excluded.last_seen,
           active      = 1,
           left_list_at = NULL`,
        [b.itemId, b.ribbonKind, b.betsLimit, b.eventId, b.eventName, b.sportName,
          b.champName, b.startDate, b.endDate, b.price, b.basePrice,
          JSON.stringify(b.legs), ts, ts]
      );
    }

    // Desativa só o que veio da lista oficial e sumiu dela. As boosts achadas
    // pela varredura (`oculta`) nunca aparecem nessa lista — desativá-las aqui
    // as apagaria do monitor a cada redescoberta.
    const ids = boosts.map((b) => b.itemId);
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      // A lista só devolve boosts com janela aberta: quando uma expira, ela
      // some inteira (nome, trava, tudo) — o monitor acompanha o mesmo
      // princípio e apaga o rastro dela junto (catálogo e alertas).
      const saidas = await tx.all(
        `UPDATE boosts SET active = 0, left_list_at = ?
         WHERE active = 1 AND ribbon_kind != 'oculta' AND item_id NOT IN (${placeholders})
         RETURNING item_id`,
        [ts, ...ids]
      );
      await apagarRastro(tx.run, saidas.map((r) => Number(r.item_id)));
    }
  });

  // Primeira execução com o banco vazio: tudo é "novo", mas nada disso é
  // notícia. Quem chama usa isso para não disparar 35 alertas de estreia.
  return { total: boosts.length, novos, bootstrap: seenBefore.size === 0 };
}

// Colunas que o cálculo da visão realmente usa. `legs_json` fica de fora de
// propósito: é de longe a maior coluna da tabela (a perna a perna de cada
// boost) e só o painel a mostra — o ciclo do monitor não olha para ela.
// `SELECT *` aqui saía caro porque esta consulta roda a cada leitura E a cada
// carregada do painel. Ver o comentário de `statesFor`.
const COLUNAS_BOOST = `item_id, ribbon_kind, bets_limit, event_id, event_name,
    sport_name, champ_name, start_date, end_date, price, base_price, left_list_at`;

/** Só os ids no ar — quem chama (a varredura) não usa mais nada da linha. */
export const activeBoosts = () => dbAll('SELECT item_id FROM boosts WHERE active = 1');

/**
 * O que o monitor acompanha: só o que está no ar agora. Uma boost sai daqui
 * no mesmo ciclo em que sai da lista oficial (ou, para as achadas pela
 * varredura, no ciclo em que `deactivateStaleHidden` a considera encerrada) —
 * o objetivo é espelhar o que está no site, não guardar histórico na tela.
 *
 * `comLegs` só é ligado por quem vai desenhar a boost na tela.
 */
export const monitoredBoosts = ({ comLegs = false } = {}) =>
  dbAll(`SELECT ${COLUNAS_BOOST}${comLegs ? ', legs_json' : ''} FROM boosts WHERE active = 1`);

export const boostById = (id) => dbGet('SELECT * FROM boosts WHERE item_id = ?', [id]);

/**
 * As boosts "fora da lista" (achadas pela varredura, ver scan.js) não têm uma
 * lista oficial para sair dela — o único sinal de que acabaram é parar de
 * vender. Sem isso elas ficariam no catálogo para sempre: uma chegou a passar
 * 5 dias parada. Aplica a mesma regra da lista oficial (sumir quando o jogo
 * acabou), usando estagnação como proxy.
 */
export async function deactivateStaleHidden(hours, ts = nowIso()) {
  const limite = new Date(Date.now() - hours * 3600000).toISOString();
  const saidas = await dbAll(
    `UPDATE boosts SET active = 0, left_list_at = ?
     WHERE active = 1 AND ribbon_kind = 'oculta'
       AND item_id IN (
         SELECT item_id FROM state WHERE last_change_ts IS NOT NULL AND last_change_ts < ?
       )
     RETURNING item_id`,
    [ts, limite]
  );
  const ids = saidas.map((r) => Number(r.item_id));
  await apagarRastro(dbRun, ids);
  return ids.length;
}

/**
 * Aplica uma leitura de contagem. Só grava linha de histórico quando o número
 * muda — leituras repetidas viram apenas contador de estagnação.
 */
export async function applyReading(itemId, count, ts = nowIso()) {
  const prev = await dbGet('SELECT * FROM state WHERE item_id = ?', [itemId]);

  if (!prev) {
    await dbRun(
      `INSERT INTO state (item_id, count, prev_count, reads, stall_reads,
                          first_ts, last_ts, last_change_ts, alerted)
       VALUES (?,?,?,1,0,?,?,?,'[]')`,
      [itemId, count, count, ts, ts, ts]
    );
    await dbRun(
      `INSERT INTO readings (item_id, ts, count) VALUES (?,?,?)
       ON CONFLICT (item_id, ts) DO UPDATE SET count = excluded.count`,
      [itemId, ts, count]
    );
    return { itemId, count, prevCount: count, changed: false, isFirst: true,
      stallReads: 0, reads: 1, lastChangeTs: ts, firstTs: ts };
  }

  const changed = count !== prev.count;
  const stallReads = changed ? 0 : prev.stall_reads + 1;
  const lastChangeTs = changed ? ts : prev.last_change_ts;

  await dbRun(
    `UPDATE state SET count = ?, prev_count = ?, reads = reads + 1,
                      stall_reads = ?, last_ts = ?, last_change_ts = ?
     WHERE item_id = ?`,
    [count, prev.count, stallReads, ts, lastChangeTs, itemId]
  );

  if (changed) {
    await dbRun(
      `INSERT INTO readings (item_id, ts, count) VALUES (?,?,?)
       ON CONFLICT (item_id, ts) DO UPDATE SET count = excluded.count`,
      [itemId, ts, count]
    );
  }

  return { itemId, count, prevCount: prev.count, changed, isFirst: false,
    stallReads, reads: prev.reads + 1, lastChangeTs, firstTs: prev.first_ts };
}

export async function getAlerted(itemId) {
  const row = await dbGet('SELECT alerted FROM state WHERE item_id = ?', [itemId]);
  try {
    return new Set(JSON.parse(row?.alerted || '[]'));
  } catch {
    return new Set();
  }
}

export async function markAlerted(itemId, kind) {
  const set = await getAlerted(itemId);
  set.add(kind);
  await dbRun('UPDATE state SET alerted = ? WHERE item_id = ?', [JSON.stringify([...set]), itemId]);
}

export async function recordAlert({ itemId, kind, message, count, betsLimit, delivered }, ts = nowIso()) {
  await dbRun(
    `INSERT INTO alerts (item_id, kind, ts, message, count, bets_limit, delivered)
     VALUES (?,?,?,?,?,?,?)`,
    [itemId, kind, ts, message, count ?? null, betsLimit ?? null, delivered ? 1 : 0]
  );
}

export const recentAlerts = (limit = 50) =>
  dbAll(
    `SELECT a.*, b.event_name, b.ribbon_kind
     FROM alerts a LEFT JOIN boosts b ON b.item_id = a.item_id
     ORDER BY a.ts DESC LIMIT ?`,
    [limit]
  );

/** Velocidade (bilhetes/min) na janela recente, por item. */
export async function ratesSince(sinceIso) {
  const rows = await dbAll(
    `SELECT item_id, MIN(ts) AS t0, MAX(ts) AS t1, MIN(count) AS c0, MAX(count) AS c1
     FROM readings WHERE ts >= ? GROUP BY item_id`,
    [sinceIso]
  );

  const map = new Map();
  for (const r of rows) {
    const mins = (Date.parse(r.t1) - Date.parse(r.t0)) / 60000;
    map.set(Number(r.item_id), mins > 0 ? (r.c1 - r.c0) / mins : 0);
  }
  return map;
}

export const historyFor = async (itemId, limit = 500) =>
  (await dbAll('SELECT ts, count FROM readings WHERE item_id = ? ORDER BY ts DESC LIMIT ?', [itemId, limit])).reverse();

/**
 * Higiene para operação contínua: o histórico só grava mudanças, mas em semanas
 * de operação ainda acumula. Mantém os últimos `dias` e descarta o resto.
 *
 * `boosts` e `state` também são podadas. Antes não eram, e as duas cresciam
 * para sempre: uma boost de um jogo de três semanas atrás continuava ocupando
 * linha nas duas tabelas. Só isso já bastaria, mas o efeito colateral é que
 * era a tabela `state` inteira que ia pela rede a cada leitura do painel.
 * Uma boost só sai depois de `dias` fora da lista — dentro desse prazo ela
 * ainda dá contexto ao histórico que sobrou.
 */
export async function purgeOld(dias = 30) {
  const limite = new Date(Date.now() - dias * 86400000).toISOString();
  const r1 = await dbRun('DELETE FROM readings WHERE ts < ?', [limite]);
  const r2 = await dbRun('DELETE FROM alerts WHERE ts < ?', [limite]);
  const r3 = await dbRun('DELETE FROM scan_seen WHERE promovido = 0 AND last_ts < ?', [limite]);
  const r4 = await dbRun(
    `DELETE FROM boosts
     WHERE active = 0 AND COALESCE(left_list_at, last_seen) < ?`,
    [limite]
  );
  // Órfãs: estado de boost que não está mais no catálogo não é lido por
  // ninguém e nunca mais volta a ser.
  const r5 = await dbRun('DELETE FROM state WHERE item_id NOT IN (SELECT item_id FROM boosts)');
  return {
    readings: r1.changes || 0,
    alerts: r2.changes || 0,
    scan: r3.changes || 0,
    boosts: r4.changes || 0,
    state: r5.changes || 0,
  };
}

/**
 * Estado das boosts pedidas — e só delas.
 *
 * Isto era `SELECT * FROM state`, a tabela inteira. Como `state` nunca era
 * podada (ver `purgeOld`) e ganha uma linha por boost que já passou pelo
 * monitor, a consulta crescia para sempre; e ela roda tanto a cada ciclo
 * quanto a cada carregada do painel, que se recarrega de 10 em 10 segundos.
 * Um painel aberto arrastava a tabela toda do banco 8.640 vezes por dia. Foi
 * isso que estourou a cota de transferência do Neon e derrubou o monitor:
 * o banco passou a recusar conexão e todas as rotas viraram 500.
 *
 * Agora vêm só as linhas das boosts que estão no ar e só as colunas que
 * `buildView` usa — `alerted` fica de fora, quem precisa dela usa `getAlerted`.
 */
export const statesFor = async (ids) => {
  const map = new Map();
  if (!ids.length) return map;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await dbAll(
    `SELECT item_id, count, prev_count, reads, stall_reads, first_ts, last_ts, last_change_ts
     FROM state WHERE item_id IN (${placeholders})`,
    ids
  );
  for (const r of rows) map.set(Number(r.item_id), r);
  return map;
};

/** Pares chave/valor simples — usados pelo monitor para lembrar quando rodou a
 * última descoberta/varredura sem depender de estado em memória (que não
 * sobrevive entre invocações de função serverless). */
export async function getMeta(key) {
  const row = await dbGet('SELECT value FROM meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setMeta(key, value) {
  await dbRun(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

// --- cache de eventos (fonte Altenar) -------------------------------------

// Boost com trava mas sem fim declarado não expira sozinha; a sentinela deixa
// a comparação de datas ser uma só, sem caso especial em quem lê.
const SEM_FIM = '9999-12-31T23:59:59.999Z';

/**
 * Até quando este evento ainda pode ter boost valendo — o maior `endDate`
 * entre as que TÊM trava. `null` quer dizer que o evento não tem trava
 * nenhuma, e portanto nunca vai contribuir com nada para o catálogo.
 *
 * Normaliza para ISO em UTC de propósito: o valor é comparado como texto no
 * banco, e datas com fusos diferentes não se comparam direito como string.
 */
export function abertoAteDe(boosts) {
  let maxMs = -Infinity;
  let semFim = false;
  for (const b of boosts) {
    if (!(b.betsLimit > 0)) continue;
    const t = b.endDate ? Date.parse(b.endDate) : NaN;
    if (Number.isFinite(t)) maxMs = Math.max(maxMs, t);
    else semFim = true;                 // sem fim, ou fim ilegível: não expira
  }
  if (semFim) return SEM_FIM;
  return maxMs > -Infinity ? new Date(maxMs).toISOString() : null;
}

export async function saveEventBoosts(eventId, startDate, boosts, ts = nowIso()) {
  await dbRun(
    `INSERT INTO event_cache (event_id, fetched_ts, start_date, boosts_json, aberto_ate, item_ids)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT (event_id) DO UPDATE SET
       fetched_ts = excluded.fetched_ts,
       start_date = excluded.start_date,
       boosts_json = excluded.boosts_json,
       aberto_ate = excluded.aberto_ate,
       item_ids = excluded.item_ids`,
    [eventId, ts, startDate, JSON.stringify(boosts), abertoAteDe(boosts),
      boosts.map((b) => b.itemId).join(',')]
  );
}

/**
 * Índice barato do cache: uma linha por evento, sem o `boosts_json`.
 *
 * A descoberta roda a cada 10min e lia o cache inteiro — boosts_json de todos
 * os eventos — só para descobrir quais deles interessavam. A maioria não
 * interessa: um levantamento no próprio projeto achou 42 eventos candidatos
 * com 4 travas entre eles. Agora o `boosts_json` só é baixado para os eventos
 * que vão mesmo entrar no catálogo (ver `eventBoosts`).
 */
export async function cachedEventIndex() {
  const rows = await dbAll(
    'SELECT event_id, fetched_ts, start_date, aberto_ate, item_ids FROM event_cache'
  );
  const m = new Map();
  for (const r of rows) {
    m.set(Number(r.event_id), {
      fetchedTs: r.fetched_ts,
      startDate: r.start_date,
      abertoAte: r.aberto_ate,
      // null (e não conjunto vazio) marca linha antiga, ainda sem o resumo.
      itemIds: r.item_ids === null ? null
        : new Set(r.item_ids ? r.item_ids.split(',').map(Number) : []),
    });
  }
  return m;
}

/** As boosts de eventos específicos, já desserializadas. */
export async function eventBoosts(ids) {
  const m = new Map();
  if (!ids.length) return m;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await dbAll(
    `SELECT event_id, boosts_json FROM event_cache WHERE event_id IN (${placeholders})`, ids
  );
  for (const r of rows) {
    try {
      m.set(Number(r.event_id), JSON.parse(r.boosts_json));
    } catch {
      m.set(Number(r.event_id), []);
    }
  }
  return m;
}

/**
 * Joga fora o cache de eventos que já começaram há mais de `horas`. O segundo
 * critério é rede de segurança: evento sem data de início não tem como
 * envelhecer pelo primeiro, e sem isso ficaria no cache para sempre.
 */
export async function purgeEventCache(horas = 6) {
  const limite = new Date(Date.now() - horas * 3600000).toISOString();
  const antigo = new Date(Date.now() - 3 * 86400000).toISOString();
  const r = await dbRun(
    `DELETE FROM event_cache
     WHERE (start_date IS NOT NULL AND start_date < ?)
        OR (start_date IS NULL AND fetched_ts < ?)`,
    [limite, antigo]
  );
  return r.changes || 0;
}

/**
 * Tira do monitor as boosts achadas pela varredura de ids. Elas entram sem
 * trava, e sem trava não há esgotamento para detectar — quando a varredura
 * está desligada (o padrão, desde que o Altenar passou a completar o
 * catálogo), o que sobrou delas no banco precisa sair junto.
 */
export async function deactivateHidden(ts = nowIso()) {
  const saidas = await dbAll(
    `UPDATE boosts SET active = 0, left_list_at = COALESCE(left_list_at, ?)
     WHERE active = 1 AND ribbon_kind = 'oculta' RETURNING item_id`,
    [ts]
  );
  const ids = saidas.map((r) => Number(r.item_id));
  await apagarRastro(dbRun, ids);
  return ids.length;
}
