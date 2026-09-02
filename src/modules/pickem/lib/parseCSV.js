import Papa from 'papaparse'

// ── Resolução de colunas (tolerante a maiúsculas/pontuação/espaços) ──────────
const FIELD_ALIASES = {
  userId:       ['user external id', 'pid', 'username', 'user id', 'external id'],
  date:         ['timestamp', 'entry ts', 'entry timestamp', 'entryts'],
  noQuestions:  ['no. questions', 'no questions', 'questions'],
  correctPicks: ['correct picks', 'correct', 'picks'],
  prize:        ['prize value', 'prize'],
  status:       ['status'],
  userTest:     ['user test', 'test'],
  restricted:   ['restricted'],
}

const norm = (s) => String(s).toLowerCase().replace(/[\s._-]/g, '')

function buildResolver(fields) {
  const lookup = {}
  for (const f of fields) lookup[norm(f)] = f
  const resolved = {}
  for (const [canon, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const a of aliases) {
      const key = norm(a)
      if (lookup[key]) { resolved[canon] = lookup[key]; break }
    }
  }
  return resolved
}

// ── Datas (detecta o padrão pelo conteúdo) ───────────────────────────────────
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }

function parseDate(str) {
  if (!str) return null
  const s = String(str).trim()
  // DD/MM/AAAA[, HH:MM]
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0))
  // ISO 2026-06-14T17:44:57.505Z
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); return isNaN(d) ? null : d }
  // MON-DD-AAAA HH:MM:SS
  m = s.match(/^([A-Za-z]{3})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?/)
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()]
    if (mo != null) return new Date(+m[3], mo, +m[2], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
  }
  const d = new Date(s)
  return isNaN(d) ? null : d
}

// ── Prêmio (detecta decimal/milhar pelo conteúdo) ────────────────────────────
// "BRL 888.89" / "BRL 9000.00" → US (ponto decimal)
// "R$6.000" → BR (ponto milhar) ; "R$6.000,50" → BR (vírgula decimal)
function parsePrize(str) {
  if (!str) return 0
  let s = String(str).replace(/r\$|brl/gi, '').replace(/\s/g, '').trim()
  if (!s) return 0
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')        // vírgula = decimal
  } else if (/\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, '')                          // ponto + 3 dígitos = milhar
  }
  return parseFloat(s) || 0
}

const parseBool = (v) => String(v).toLowerCase() === 'true'

// ── Normalização: linha bruta → estrutura interna comum ──────────────────────
function normalizeRows(rawRows, R) {
  return rawRows.map((r) => {
    const cp = R.correctPicks ? r[R.correctPicks] : ''
    const acertos = cp !== '' && cp != null ? parseInt(cp) : null
    const premio = R.prize ? parsePrize(r[R.prize]) : 0

    // Status: usa coluna se existir; senão deriva do prêmio/acertos
    let status
    if (R.status && r[R.status]) status = r[R.status]
    else status = acertos == null ? 'PENDING' : premio > 0 ? 'WON' : 'LOST'

    return {
      data_aposta: R.date ? parseDate(r[R.date]) : null,
      user_external_id: R.userId ? r[R.userId] : null,
      is_test: R.userTest ? parseBool(r[R.userTest]) : false,
      is_restricted: R.restricted ? parseBool(r[R.restricted]) : false,
      status,
      acertos,
      premio,
      noQuestions: R.noQuestions ? parseInt(r[R.noQuestions]) || 8 : 8,
    }
  })
}

export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta }) => {
        try {
          resolve(processRows(data, meta?.fields || []))
        } catch (e) {
          reject(e)
        }
      },
      error: reject,
    })
  })
}

export function processRows(rawRows, fields = []) {
  const usableFields = fields.length ? fields : Object.keys(rawRows[0] || {})
  const R = buildResolver(usableFields)
  const allEntries = normalizeRows(rawRows, R)

  // Filtrar test e restricted
  const entries = allEntries.filter((e) => !e.is_test && !e.is_restricted)

  const uniqueUsers = [...new Set(entries.map((e) => e.user_external_id))].length
  const totalEntradas = entries.length

  const noQuestions = entries.length > 0
    ? Math.max(...entries.map((e) => e.noQuestions || 8))
    : 8

  const winners = entries.filter((e) => e.status === 'WON')
  const ganhadores = winners.length

  // Linha de corte: menor nº de acertos entre os ganhadores
  const winnerPicks = winners.map((e) => e.acertos).filter((a) => a != null)
  const winThreshold = winnerPicks.length > 0 ? Math.min(...winnerPicks) : null

  const payout = entries.reduce((sum, e) => sum + e.premio, 0)
  const premioMax = Math.max(...entries.map((e) => e.premio), 0)

  // Média de acertos (excluir PENDING)
  const comAcertos = entries.filter((e) => e.acertos != null)
  const mediaAcertos = comAcertos.length > 0
    ? comAcertos.reduce((s, e) => s + e.acertos, 0) / comAcertos.length
    : 0

  // Distribuição: 0..noQuestions
  const dist = Array.from({ length: noQuestions + 1 }, (_, i) => ({
    acertos: i,
    count: comAcertos.filter((e) => e.acertos === i).length,
  }))

  // Período
  const datas = entries.map((e) => e.data_aposta).filter(Boolean)
  const periodoInicio = datas.length ? new Date(Math.min(...datas)) : null
  const periodoFim = datas.length ? new Date(Math.max(...datas)) : null

  const fmtDate = (d) =>
    d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
  const periodoLabel = periodoInicio && periodoFim
    ? `${fmtDate(periodoInicio)} – ${fmtDate(periodoFim)}`
    : ''

  return {
    meta: {
      totalEntradas,
      usuariosUnicos: uniqueUsers,
      ganhadores,
      payout,
      mediaAcertos,
      winThreshold,
      premioMax,
      noQuestions,
      periodoInicio,
      periodoFim,
      periodoLabel,
      dist,
    },
    entries: entries.map((e) => ({
      data_aposta: e.data_aposta,
      user_external_id: e.user_external_id,
      is_test: e.is_test,
      is_restricted: e.is_restricted,
      status: e.status,
      acertos: e.acertos,
      premio: e.premio,
    })),
  }
}
