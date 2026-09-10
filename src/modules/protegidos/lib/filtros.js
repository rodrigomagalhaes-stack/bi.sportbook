// Filtros e totais da tela de Bingos Protegidos. Função pura: recebe a lista
// que veio do banco e devolve a lista que a tela desenha.

import {
  diaDoTimestamp,
  diasEmAnalise,
  diasEntre,
  diasNaFila,
  hojeISO,
  semBase,
  situacao,
  usuariosPagos,
  valorPago,
} from './situacao.js'

// ── Qual data ────────────────────────────────────────────────────────────────
// Um bilhete tem TRÊS datas e elas não coincidem: o jogo foi domingo, o cadastro
// entrou segunda, o pagamento saiu quinta. "Setembro" quer dizer coisas
// diferentes em cada uma.
//
// A tela filtra sempre por `confronto` — a data preenchida no cadastro. As
// outras duas continuam alcançáveis aqui porque estão gravadas e um relatório
// futuro vai querer a de pagamento; o que a tela não faz é oferecer a escolha,
// que é onde nascia a confusão de filtrar por uma e ler como se fosse outra.

export function dataDoCampo(bilhete, campo) {
  if (campo === 'cadastro') return diaDoTimestamp(bilhete?.enviado_em)
  if (campo === 'pagamento') return diaDoTimestamp(bilhete?.pago_em)
  return bilhete?.confronto_fim ?? null
}

// ── Período ──────────────────────────────────────────────────────────────────

export const PERIODOS = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'hoje', label: 'Hoje' },
  { id: '7', label: '7 dias' },
  { id: '30', label: '30 dias' },
  { id: 'mes', label: 'Este mês' },
  { id: 'mes-1', label: 'Mês passado' },
  { id: 'custom', label: 'Escolher' },
]

/** `{ de, ate }` em 'YYYY-MM-DD', ou `null` para "sem recorte". */
export function periodoPara(id, hoje = hojeISO()) {
  const [ano, mes] = hoje.split('-').map(Number)
  const dia = (a, m, d) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const ultimoDia = (a, m) => new Date(a, m, 0).getDate()

  switch (id) {
    case 'hoje':
      return { de: hoje, ate: hoje }
    case '7':
      return { de: somarDias(hoje, -6), ate: hoje }
    case '30':
      return { de: somarDias(hoje, -29), ate: hoje }
    case 'mes':
      return { de: dia(ano, mes, 1), ate: dia(ano, mes, ultimoDia(ano, mes)) }
    case 'mes-1': {
      const a = mes === 1 ? ano - 1 : ano
      const m = mes === 1 ? 12 : mes - 1
      return { de: dia(a, m, 1), ate: dia(a, m, ultimoDia(a, m)) }
    }
    default:
      return null
  }
}

function somarDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number)
  const base = new Date(a, m - 1, d)
  base.setDate(base.getDate() + n)
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
}

// ── Busca ────────────────────────────────────────────────────────────────────
// Sem acento e sem caixa: quem procura "joao" precisa achar "João", senão
// desiste da busca e volta a rolar a lista com o olho.

const semAcento = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/**
 * Por onde os bilhetes de um mesmo tipster se juntam.
 *
 * O nome é digitado a cada cadastro, então não existe id para agrupar: "Rodrigo"
 * hoje e "rodrigo" amanhã precisam cair no mesmo tipster, e é esta chave que
 * faz isso. Junta caixa, espaço sobrando e acento.
 *
 * Quem normaliza de verdade é o banco, na coluna gerada `tipster_chave` — aqui
 * é a mesma conta como reserva, para uma linha que chegue sem ela não virar um
 * tipster fantasma nos totais. As duas fórmulas não são idênticas: o banco tira
 * acento com um `translate` do alfabeto português e este aqui usa a
 * decomposição Unicode, que alcança mais. A diferença só apareceria num nome
 * com acento fora do português, e ainda assim no caminho de reserva.
 */
export const chaveTipster = (bilhete) =>
  bilhete?.tipster_chave ?? semAcento(String(bilhete?.tipster_nome ?? '').replace(/\s+/g, ' '))

// ── O filtro ─────────────────────────────────────────────────────────────────

/**
 * @param filtros.situacoes   ids de situação aceitos; vazio ou nulo = todas
 * @param filtros.de/.ate     'YYYY-MM-DD'; nulos = sem recorte de data
 * @param filtros.campoData   qual das três datas o recorte usa
 * @param filtros.tipsters    ids de tipster; vazio = todos
 * @param filtros.busca       texto livre: tipster, link ou observação
 * @param filtros.apenasSemBase  só os pagos sem base anexada
 */
export function filtrar(bilhetes, filtros = {}, hoje = hojeISO()) {
  const {
    situacoes = null,
    de = null,
    ate = null,
    campoData = 'confronto',
    tipsters = null,
    stakeMin = null,
    stakeMax = null,
    busca = '',
    apenasSemBase = false,
  } = filtros

  const alvo = semAcento(busca)
  // `aceitos*` e não `porTipster`: existe uma função exportada com esse nome
  // neste mesmo arquivo, e a variável local a escondia dentro do filtro — duas
  // coisas diferentes com um nome só, uma delas invisível de dentro da outra.
  const aceitosSituacao = situacoes?.length ? new Set(situacoes) : null
  const aceitosTipster = tipsters?.length ? new Set(tipsters) : null

  return (bilhetes ?? []).filter((b) => {
    if (aceitosSituacao && !aceitosSituacao.has(situacao(b, hoje))) return false
    if (aceitosTipster && !aceitosTipster.has(chaveTipster(b))) return false
    if (apenasSemBase && !semBase(b)) return false

    if (stakeMin != null && Number(b.stake) < stakeMin) return false
    if (stakeMax != null && Number(b.stake) > stakeMax) return false

    if (de || ate) {
      const data = dataDoCampo(b, campoData)
      // Sem a data do campo escolhido, o bilhete fica fora do recorte — é o que
      // faz "por data de pagamento" mostrar só o que foi pago, sem precisar de
      // um filtro de status junto.
      if (!data) return false
      if (de && data < de) return false
      if (ate && data > ate) return false
    }

    if (alvo) {
      const campos = `${b.tipster_nome ?? ''} ${b.link_bilhete ?? ''} ${b.observacao ?? ''}`
      if (!semAcento(campos).includes(alvo)) return false
    }

    return true
  })
}

/**
 * A ordem de cada caixa.
 *
 * `fila` — o que espera há mais tempo no topo. A caixa A pagar é lista de
 * trabalho, e o bilhete mais antigo é o que corre risco de ser esquecido.
 *
 * `confronto` — jogo mais recente no topo. É a ordem da caixa Paga, e casa com
 * o filtro dela, que também é por data de confronto: ordenar por data de
 * pagamento ali faria a lista embaralhar em relação ao recorte que a produziu.
 *
 * `analise` — a solicitação enviada há mais tempo no topo. O mesmo motivo da
 * fila: quem espera resposta há mais tempo é quem corre risco de ser esquecido.
 *
 * `pagos` — pelo momento em que o pagamento foi marcado.
 */
export function ordenar(bilhetes, modo = 'fila', hoje = hojeISO()) {
  const lista = [...(bilhetes ?? [])]

  if (modo === 'analise') {
    return lista.sort((a, b) => String(a.enviado_em ?? '').localeCompare(String(b.enviado_em ?? '')))
  }

  if (modo === 'fila') {
    return lista.sort(
      (a, b) =>
        diasNaFila(b, hoje) - diasNaFila(a, hoje) ||
        String(a.confronto_fim ?? '').localeCompare(String(b.confronto_fim ?? '')),
    )
  }

  if (modo === 'confronto') {
    return lista.sort((a, b) =>
      String(b.confronto_fim ?? '').localeCompare(String(a.confronto_fim ?? '')),
    )
  }

  return lista.sort((a, b) => String(b.pago_em ?? '').localeCompare(String(a.pago_em ?? '')))
}

// ── Totais ───────────────────────────────────────────────────────────────────

/**
 * Os indicadores dos quadros.
 *
 * `stake` NÃO é previsão de caixa: é a stake dos bilhetes que o tipster
 * publicou, não a soma do que os seguidores apostaram. O valor que sai do caixa
 * só existe quando a base sobe, e é o `pago`.
 */
export function resumo(bilhetes, hoje = hojeISO()) {
  const r = {
    total: 0,
    pendentes: 0,
    aguardando: 0,
    liberados: 0,
    pagos: 0,
    recusados: 0,
    stake: 0,
    pago: 0,
    usuarios: 0,
    semBase: 0,
    esperaMaxima: 0,
    analiseMaxima: 0,
    tipsters: 0,
  }

  const tipsters = new Set()

  for (const b of bilhetes ?? []) {
    r.total++
    tipsters.add(chaveTipster(b))
    r.stake += Number(b.stake ?? 0)

    const s = situacao(b, hoje)
    if (s === 'pendente') {
      r.pendentes++
      r.analiseMaxima = Math.max(r.analiseMaxima, diasEmAnalise(b, hoje))
    }
    if (s === 'aguardando') r.aguardando++
    if (s === 'liberado') {
      r.liberados++
      r.esperaMaxima = Math.max(r.esperaMaxima, diasEntre(b.confronto_fim, hoje))
    }
    if (s === 'pago') {
      r.pagos++
      r.pago += valorPago(b)
      r.usuarios += usuariosPagos(b)
      if (semBase(b)) r.semBase++
    }
    if (s === 'recusado') r.recusados++
  }

  r.tipsters = tipsters.size
  return r
}

/** Quanto cada tipster já recebeu de reembolso no recorte atual. */
export function porTipster(bilhetes, hoje = hojeISO()) {
  const mapa = new Map()

  for (const b of bilhetes ?? []) {
    const chave = chaveTipster(b)
    let t = mapa.get(chave)
    if (!t) {
      // O rótulo é a primeira grafia vista. Agrupar "João" com "joão" não pode
      // inventar na tela uma terceira forma que ninguém digitou.
      t = { id: chave, nome: b.tipster_nome, bilhetes: 0, stake: 0, pago: 0, usuarios: 0 }
      mapa.set(chave, t)
    }
    t.bilhetes++
    t.stake += Number(b.stake ?? 0)
    if (situacao(b, hoje) === 'pago') {
      t.pago += valorPago(b)
      t.usuarios += usuariosPagos(b)
    }
  }

  return [...mapa.values()].sort((a, b) => b.pago - a.pago || b.bilhetes - a.bilhetes)
}
