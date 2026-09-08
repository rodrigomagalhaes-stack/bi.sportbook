// Monta combinações de Bet Builder para subir.
//
// ── A ODD COMBINADA É ESTIMADA, E ISSO TEM TAMANHO CONHECIDO ─────────────────
// Não existe endpoint público que precifique uma combinação nova: os oito nomes
// prováveis do widget do Altenar devolvem 404. O que dá para fazer é medir o
// desconto que a casa aplica nas múltiplas que ela mesma publicou — a razão
// entre o preço publicado e o produto das pernas.
//
// Em 33 múltiplas reais, essa razão ficou em 0,54 a 1,12, com mediana 0,98 (2
// pernas) e 0,97 (3 pernas). A mediana serve de estimativa; a dispersão é o
// tamanho do erro possível, e ela é grande porque depende de QUAIS pernas se
// combinam — "mais gols" com "mais escanteios" andam juntos, "menos gols" com
// "mais escanteios" não.
//
// Por isso toda combinação sai marcada como odd a conferir. O número serve para
// ORDENAR as sugestões entre si (todas erram na mesma direção) e para dar uma
// ordem de grandeza; o valor final vem do back-office.
//
// ── O QUE ENTRA NUMA COMBINAÇÃO ──────────────────────────────────────────────
// Pernas de FAMÍLIAS DIFERENTES. Juntar "mais de 2.5 gols" com "mais de 3.5
// gols" é vender duas vezes o mesmo palpite: a segunda perna quase não muda a
// chance do bilhete, mas multiplica a odd, e o resultado é uma múltipla que
// parece generosa e não é.

import { familiaDe } from './familias.js'

// Razão medida entre o preço que a casa publicou e o produto das pernas.
// Números de uma medição em 33 múltiplas publicadas — ver o cabeçalho.
export const RAZAO_CORRELACAO = { 2: 0.98, 3: 0.97 }
export const RAZAO_PADRAO = 0.97

// Perna que vale combinar: nem quase-certa (não move a odd), nem improvável
// demais (a múltipla vira loteria e não vende).
const ODD_PERNA_MIN = 1.1
const ODD_PERNA_MAX = 4

// Quantas seleções cada família contribui para o sorteio de combinações. Mais
// que isso faz o número de pares explodir sem trazer variedade real: são as
// mesmas famílias com a linha vizinha.
const SELECOES_POR_FAMILIA = 3

/** Todas as combinações de tamanho `n` de uma lista. */
function combinar(lista, n) {
  if (n === 1) return lista.map((x) => [x])
  const saida = []
  for (let i = 0; i <= lista.length - n; i++) {
    for (const resto of combinar(lista.slice(i + 1), n - 1)) saida.push([lista[i], ...resto])
  }
  return saida
}

/**
 * O conjunto de pernas candidatas, uma família de cada vez.
 *
 * As seleções vêm ordenadas pela odd: a mais provável primeiro, porque é a que
 * costuma puxar volume e a que mantém a odd combinada numa faixa vendável.
 */
export function pernasCandidatas(mercados) {
  const porFamilia = new Map()

  for (const mercado of mercados || []) {
    const familia = familiaDe(mercado.market)
    for (const selecao of mercado.selecoes || []) {
      if (!(selecao.price >= ODD_PERNA_MIN && selecao.price <= ODD_PERNA_MAX)) continue
      const lista = porFamilia.get(familia.id) || []
      lista.push({
        market: mercado.market,
        marketId: mercado.marketId,
        selection: selecao.selection,
        selectionId: selecao.selectionId,
        price: selecao.price,
        precosDoMercado: selecao.precosDoMercado,
        familia: familia.id,
        familiaLabel: familia.label,
      })
      porFamilia.set(familia.id, lista)
    }
  }

  const pernas = []
  for (const [, lista] of porFamilia) {
    lista.sort((a, b) => a.price - b.price)
    pernas.push(...lista.slice(0, SELECOES_POR_FAMILIA))
  }
  return pernas
}

/**
 * As combinações que valem virar dica.
 *
 * `alvoMin`/`alvoMax` é a faixa de odd combinada que se quer publicar. Fora
 * dela a múltipla ou não interessa a ninguém (perto de 1) ou não vende
 * (improvável demais).
 */
export function montarCombinacoes(
  mercados,
  { pernasMin = 2, pernasMax = 3, alvoMin = 1.5, alvoMax = 8, limite = 60 } = {},
) {
  const pernas = pernasCandidatas(mercados)
  const saida = []

  for (let n = pernasMin; n <= pernasMax; n++) {
    for (const grupo of combinar(pernas, n)) {
      // Uma família só entra uma vez: duas pernas de gols é o mesmo palpite
      // vendido duas vezes, e infla a odd sem baixar a chance na mesma medida.
      const familias = new Set(grupo.map((p) => p.familia))
      if (familias.size !== grupo.length) continue

      const produto = grupo.reduce((acc, p) => acc * p.price, 1)
      const razao = RAZAO_CORRELACAO[n] ?? RAZAO_PADRAO
      const basePrice = Number((produto * razao).toFixed(2))
      if (basePrice < alvoMin || basePrice > alvoMax) continue

      saida.push({
        legs: grupo.map((p) => ({
          market: p.market,
          selection: p.selection,
          price: p.price,
          precosDoMercado: p.precosDoMercado,
        })),
        familias: [...familias],
        basePrice,
        produtoDasPernas: Number(produto.toFixed(2)),
        razaoAplicada: razao,
        pernas: n,
      })
    }
  }

  // Odd mais baixa primeiro: é a faixa que vende, e a estimativa erra menos
  // quanto menos pernas e menor a odd.
  saida.sort((a, b) => a.pernas - b.pernas || a.basePrice - b.basePrice)
  return saida.slice(0, limite)
}

/** A assinatura de famílias de uma combinação, para não repetir a mesma dica. */
export const assinaturaDeFamilias = (combo) => [...combo.familias].sort().join('+')
