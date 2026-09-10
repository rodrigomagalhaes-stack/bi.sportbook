// Datas e situação de um bilhete protegido. Tudo função pura: a tela só
// pergunta e desenha.

// ── Datas ────────────────────────────────────────────────────────────────────
// O banco devolve `confronto_fim` como 'YYYY-MM-DD' e `enviado_em`/`pago_em`
// como timestamp com fuso. Comparar os dois formatos direto é onde nasce o erro
// clássico deste tipo de tela, e ele tem duas metades:
//
//   `new Date('2026-09-08')` é interpretado como UTC, e em Brasília vira
//   07/09 às 21h. Um bilhete de hoje apareceria como de ontem.
//
//   `toISOString().slice(0,10)` num pagamento feito às 21h devolve o DIA
//   SEGUINTE, porque lá já é. No fim do mês isso joga o pagamento no mês errado
//   e o relatório fechado não bate com o extrato.
//
// Por isso nada aqui usa `toISOString`, e toda comparação acontece entre
// strings 'YYYY-MM-DD' — que se ordenam corretamente como texto.

const doisDigitos = (n) => String(n).padStart(2, '0')

/** A data local de um `Date`, como 'YYYY-MM-DD'. */
export function diaLocal(data) {
  const d = data instanceof Date ? data : new Date(data)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`
}

/** Hoje, como 'YYYY-MM-DD' local. */
export const hojeISO = (agora = new Date()) => diaLocal(agora)

/** O dia de um timestamp do banco, no fuso de quem está olhando. */
export function diaDoTimestamp(ts) {
  if (!ts) return null
  return diaLocal(new Date(ts))
}

/**
 * Dias inteiros de `de` até `ate`, ambos 'YYYY-MM-DD'.
 *
 * A conta é feita em UTC ao meio-dia de propósito: somar 24h a partir da
 * meia-noite local erra por um dia nas duas viradas de horário de verão, e essa
 * conta alimenta a coluna de envelhecimento da fila.
 */
export function diasEntre(de, ate) {
  const a = comoUTC(de)
  const b = comoUTC(ate)
  if (a === null || b === null) return 0
  return Math.round((b - a) / 86400000)
}

function comoUTC(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
}

/** 'YYYY-MM-DD' → '08/09/2026'. Vazio vira travessão, não 'Invalid Date'. */
export function formatarDia(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

// ── Situação ─────────────────────────────────────────────────────────────────

export const SITUACOES = {
  pendente: { label: 'Aguardando análise', tom: '' },
  aguardando: { label: 'Aguardando confronto', tom: '' },
  liberado: { label: 'Liberado para pagar', tom: 'alerta' },
  pago: { label: 'Pago', tom: 'ok' },
  recusado: { label: 'Recusado', tom: 'erro' },
}

/**
 * Em que pé o bilhete está.
 *
 * `pendente`, `pago` e `recusado` são decisão de gente e vêm do banco.
 * `pendente` é a decisão que ainda não foi tomada, e passa na frente da data:
 * jogo encerrado não libera o pagamento de um bilhete que ninguém aprovou.
 *
 * As outras duas são
 * DERIVADAS da data, e é isso que faz a fila se manter sozinha: ninguém precisa
 * arrastar card nenhum quando o jogo acaba, e nenhum bilhete fica parado num
 * status vencido porque a pessoa que movia esqueceu.
 *
 * Um jogo marcado para HOJE conta como aguardando: durante o próprio dia dele o
 * confronto ainda não terminou. O erro tem lados de tamanhos muito diferentes —
 * pagar antes de o bilhete resolver é dinheiro que sai errado, e esperar mais um
 * dia é só esperar mais um dia.
 */
export function situacao(bilhete, hoje = hojeISO()) {
  if (bilhete?.status === 'pendente') return 'pendente'
  if (bilhete?.status === 'pago') return 'pago'
  if (bilhete?.status === 'recusado') return 'recusado'
  const fim = bilhete?.confronto_fim ?? ''
  return fim >= hoje ? 'aguardando' : 'liberado'
}

/**
 * Há quantos dias este bilhete está pagável e não foi pago.
 *
 * É a coluna que ordena a fila. Sem ela, o bilhete parado há três semanas fica
 * misturado com os de ontem e some justamente por ser o mais antigo.
 */
export function diasNaFila(bilhete, hoje = hojeISO()) {
  if (situacao(bilhete, hoje) !== 'liberado') return 0
  return diasEntre(bilhete.confronto_fim, hoje)
}

/**
 * Há quantos dias a solicitação espera alguém aprovar ou recusar.
 *
 * Conta desde o envio, e não desde o jogo: a análise não depende de o confronto
 * ter terminado, e o tipster espera a resposta desde que mandou.
 */
export function diasEmAnalise(bilhete, hoje = hojeISO()) {
  if (situacao(bilhete, hoje) !== 'pendente') return 0
  const enviado = diaDoTimestamp(bilhete.enviado_em)
  return enviado ? diasEntre(enviado, hoje) : 0
}

// ── O que já foi pago ────────────────────────────────────────────────────────
// Os totais somam TODAS as bases anexadas ao bilhete: reembolso sai em lote às
// vezes, e a conta precisa fechar com o que está anexado, não com a última.

export const valorPago = (bilhete) =>
  (bilhete?.bases ?? []).reduce((s, b) => s + Number(b.valor_total ?? 0), 0)

export const usuariosPagos = (bilhete) =>
  (bilhete?.bases ?? []).reduce((s, b) => s + Number(b.usuarios ?? 0), 0)

/**
 * Pago sem nenhuma base anexada.
 *
 * Não é um estado do fluxo, é um furo de auditoria: alguém marcou o pagamento e
 * não juntou a base que prova quem recebeu. Aparece como filtro na tela porque
 * ninguém vai procurar por ele de propósito.
 */
export const semBase = (bilhete) =>
  bilhete?.status === 'pago' && (bilhete?.bases ?? []).length === 0
