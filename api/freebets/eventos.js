// API serverless: histórico de eventos pagos (Upstash Redis via REST).
// GET    -> lista todos os eventos pagos
// POST   -> marca um evento como pago   { id, nome, qtd }
// DELETE -> desmarca um evento          { id }
//
// Dados ficam em um hash Redis "eventos_pagos":
//   campo = id (nome-base do arquivo) | valor = JSON {nome, data, qtd}

const REDIS_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const HASH = "eventos_pagos";

async function redis(command) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error("BANCO_NAO_CONFIGURADO");
  }
  const resp = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!resp.ok) {
    throw new Error(`Redis HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.result;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    if (req.method === "GET") {
      const flat = (await redis(["HGETALL", HASH])) || [];
      const eventos = [];
      for (let i = 0; i < flat.length; i += 2) {
        const id = flat[i];
        let info = {};
        try {
          info = JSON.parse(flat[i + 1]);
        } catch (e) {
          info = {};
        }
        eventos.push({ id, ...info });
      }
      eventos.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
      return res.status(200).json({ eventos });
    }

    if (req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const id = (body.id || "").trim();
      if (!id) return res.status(400).json({ error: "id obrigatorio" });
      const info = {
        nome: body.nome || id,
        qtd: body.qtd ?? null,
        data: new Date().toISOString(),
      };
      await redis(["HSET", HASH, id, JSON.stringify(info)]);
      return res.status(200).json({ ok: true, evento: { id, ...info } });
    }

    if (req.method === "DELETE") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const id = (body.id || "").trim();
      if (!id) return res.status(400).json({ error: "id obrigatorio" });
      await redis(["HDEL", HASH, id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "metodo nao suportado" });
  } catch (err) {
    if (err.message === "BANCO_NAO_CONFIGURADO") {
      return res
        .status(503)
        .json({ error: "BANCO_NAO_CONFIGURADO", msg: "Banco de dados ainda nao configurado." });
    }
    return res.status(500).json({ error: err.message });
  }
}
