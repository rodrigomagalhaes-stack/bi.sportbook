import { PRIZE_MODELS } from './prizeModels'

// Custo total do evento pelo modelo: soma do prêmio de cada faixa que TEVE
// ganhadores. Retorna null se não houver modelo/distribuição.
export function custoTotalModelo(dist, prizeModel) {
  if (!prizeModel || !dist) return null
  return dist.reduce((sum, row) => {
    const prize = prizeModel.prizes[row.acertos]
    return sum + (prize && row.count > 0 ? prize : 0)
  }, 0)
}

// ── Custo previsto (modelo) × payout real ────────────────────────────────────
export function costAnalysis(events) {
  return events.map((ev) => {
    const model = ev.prize_model ? PRIZE_MODELS[ev.prize_model] : null
    const previsto = custoTotalModelo(ev.dist, model)
    const real = ev.payout || 0
    const variacao = previsto != null ? real - previsto : null
    return { ev, modelo: model?.label || null, previsto, real, variacao }
  })
}

// ── Recorrência de jogadores entre eventos ───────────────────────────────────
// `events` deve vir em ordem CRONOLÓGICA (mais antigo → mais novo).
// `rows` = [{ user_external_id, evento_id, status }] de todos os eventos.
export function recurrenceAnalysis(events, rows) {
  // usuários por evento
  const byEvent = new Map() // evento_id → Set(user)
  const winsByUser = new Map() // user → nº de vitórias (status WON) em todos eventos
  const eventsByUser = new Map() // user → Set(evento_id)

  for (const r of rows) {
    if (!byEvent.has(r.evento_id)) byEvent.set(r.evento_id, new Set())
    byEvent.get(r.evento_id).add(r.user_external_id)

    if (!eventsByUser.has(r.user_external_id)) eventsByUser.set(r.user_external_id, new Set())
    eventsByUser.get(r.user_external_id).add(r.evento_id)

    if (r.status === 'WON') {
      winsByUser.set(r.user_external_id, (winsByUser.get(r.user_external_id) || 0) + 1)
    }
  }

  // timeline por evento (cronológico)
  const seen = new Set()
  let prevUsers = null
  const timeline = events.map((ev) => {
    const users = byEvent.get(ev.id) || new Set()
    let novos = 0
    for (const u of users) if (!seen.has(u)) novos++
    const recorrentes = users.size - novos

    // retenção: dos que jogaram o evento anterior, quantos % voltaram neste
    let retencao = null
    if (prevUsers && prevUsers.size > 0) {
      let voltaram = 0
      for (const u of prevUsers) if (users.has(u)) voltaram++
      retencao = (voltaram / prevUsers.size) * 100
    }

    for (const u of users) seen.add(u)
    prevUsers = users

    return { ev, jogadores: users.size, novos, recorrentes, retencao }
  })

  // globais
  const distinctUsers = eventsByUser.size
  let recorrentesGlobais = 0 // jogaram 2+ eventos
  const distEventosJogados = new Map() // nº eventos → qtd usuários
  for (const [, evset] of eventsByUser) {
    const n = evset.size
    if (n >= 2) recorrentesGlobais++
    distEventosJogados.set(n, (distEventosJogados.get(n) || 0) + 1)
  }

  // jogadores fiéis: ordenados por nº de eventos jogados, depois vitórias
  const fieis = [...eventsByUser.entries()]
    .map(([user, evset]) => ({
      user_external_id: user,
      eventos_jogados: evset.size,
      vitorias: winsByUser.get(user) || 0,
    }))
    .sort((a, b) => b.eventos_jogados - a.eventos_jogados || b.vitorias - a.vitorias)

  return {
    timeline,
    distinctUsers,
    recorrentesGlobais,
    pctRecorrencia: distinctUsers > 0 ? (recorrentesGlobais / distinctUsers) * 100 : 0,
    distEventosJogados: [...distEventosJogados.entries()].sort((a, b) => a[0] - b[0]),
    fieis,
  }
}
