// Junta os dois lados e ordena.
//
// ── POR QUE NÃO RANQUEAR PELO LUCRO PASSADO ──────────────────────────────────
// A pergunta que esta tela responde é "quais boosts deste jogo têm mais chance
// de dar bom para a casa, em volume e em lucro". O caminho óbvio seria somar o
// net que cada mercado deu no histórico e ordenar por ele. Ele está errado, e
// vale dizer por quê antes que alguém o reimplemente.
//
// O net de uma boost é uma amostra de uma variável de variância enorme: um
// bilhete de odd 5.60 ou paga 4,6 vezes a stake ou não paga nada. Com as 3 ou 4
// vezes que um mercado apareceu no histórico, o net acumulado dele é quase
// inteiramente sorte. Ranquear por isso faz o sistema recomendar o mercado que
// por acaso perdeu duas seguidas para o apostador — e evitar o que por acaso
// ganhou —, que é o oposto do que se quer.
//
// O que se separa em sinal e ruído:
//
//   VOLUME  é previsível. Que o mercado de gols puxa mais que o de desarmes, e
//           que um clássico puxa mais que um jogo de meio de tabela, se repete.
//           Estimado pela mediana da família × o porte do jogo (historico.js).
//
//   MARGEM  é conhecida ANTES de a boost ir ao ar, e não precisa de histórico
//           nenhum: está na distância entre a odd original e a turbinada, uma
//           vez tirada a margem que a odd já embutia (margem.js).
//
//   NET     é o resultado sorteado dessas duas. Aparece na tela como
//           conferência, sempre ao lado do tamanho da amostra, nunca no
//           ranking.
//
// O score é `margem esperada × volume esperado` — o resultado esperado em
// reais. Ele é o produto das duas coisas que dá para estimar, e nenhuma das
// duas sozinha responde a pergunta: uma boost com margem ótima que ninguém
// aposta não rende nada, e uma que puxa muito volume com margem negativa é
// prejuízo em escala.

import { avaliarBoost, exposicao } from '../../../../server/recomendador/margem.js'
import { familiaDaBoost, familiaDe, rotuloDaFamilia } from './familias.js'

// Famílias cuja grade NÃO é um conjunto de desfechos que se excluem, por mais
// que a soma das implícitas às vezes engane.
//
//   marcador     Primeiro / Último / Qualq. Altura — as três acontecem juntas.
//                Num jogo real somaram 1,03 e teriam passado como um mercado de
//                3% de margem, inventando a probabilidade do "Qualq. Altura".
//   assistencia  mesma estrutura, por jogador.
//   placar       resultado correto vem numa matriz; coluna nenhuma fecha em 1
//                (numa medição, 0,26).
//
// Marcadas aqui, essas pernas vão direto para a estimativa explícita em vez de
// receberem um número com cara de apurado. Escadas de limiar por jogador
// ("Chutes a Gol - Fulano: Mais de 0.5 / 1.5 / 2.5") não precisam entrar na
// lista: elas vêm numa linha só e a checagem estrutural do de-vig já as recusa.
export const GRUPO_NAO_COMPLEMENTAR = new Set(['marcador', 'assistencia', 'placar'])

/** Anexa a cada perna se o grupo dela pode ser de-vigado. */
const marcarComplementaridade = (legs) =>
  (legs || []).map((l) => ({
    ...l,
    complementar: !GRUPO_NAO_COMPLEMENTAR.has(familiaDe(l.market).id),
  }))

// As duas vertentes em que uma boost é montada no site. Tudo que a tela mostra
// se encaixa numa das duas — não há terceiro caso.
export const VERTENTES = [
  {
    id: 'single',
    label: 'Single',
    descricao: 'Uma seleção só. A tela consegue sugerir mercado novo aqui: a odd de cada seleção é publicada, então dá para calcular a margem de uma boost que ainda não existe.',
  },
  {
    id: 'betbuilder',
    label: 'Bet Builder',
    descricao: 'Duas pernas ou mais. Só entram as que a casa já publicou — sem o preço dela para a combinação, não há como avaliar uma que ainda não existe.',
  },
]

// Quantas dicas cada vertente entrega. Cinco é o que se lê de uma vez antes de
// decidir; o resto fica atrás do "ver todas".
export const TOP = 5

/** Quanto se pode confiar na estimativa de volume, pelo tamanho da amostra. */
export function confianca(n) {
  if (n >= 12) return { id: 'alta', label: 'alta', tom: 'ok' }
  if (n >= 5) return { id: 'media', label: 'média', tom: '' }
  if (n >= 1) return { id: 'baixa', label: 'baixa', tom: 'alerta' }
  return { id: 'nenhuma', label: 'sem histórico', tom: 'erro' }
}

/**
 * O volume que se espera desta família neste jogo.
 *
 * Sem histórico da família não há o que estimar, e o retorno vem zerado com
 * confiança "sem histórico" — a tela mostra "—" em vez de um número inventado.
 */
export function volumeEsperado(stats, fator) {
  if (!stats || !stats.n) {
    return { stake: null, apostas: null, apostadores: null, n: 0, confianca: confianca(0) }
  }
  return {
    stake: stats.medianaStake * fator,
    apostas: stats.medianaApostas * fator,
    apostadores: stats.medianaApostadores * fator,
    n: stats.n,
    netHistorico: stats.netTotal,
    stakeHistorico: stats.stakeTotal,
    roiHistorico: stats.stakeTotal ? stats.netTotal / stats.stakeTotal : null,
    confianca: confianca(stats.n),
  }
}

/** Monta um candidato a partir de uma boost que já existe no jogo. */
function candidatoDeBoost(b, { estatisticas, fator, maxStake }) {
  const familia = familiaDaBoost(b.legs)
  const legs = marcarComplementaridade(b.legs)
  const margem = avaliarBoost({ ...b, legs })
  if (!margem) return null
  const volume = volumeEsperado(estatisticas.get(familia.id), fator)
  return {
    chave: `boost-${b.itemId}`,
    tipo: 'boost',
    itemId: b.itemId,
    rotulo: b.legs.map((l) => l.selection).filter(Boolean).join(' + ') || 'Boost sem pernas resolvidas',
    mercado: b.legs.map((l) => l.market).filter(Boolean).join(' + '),
    legs,
    familia: familia.id,
    familiaLabel: familia.label,
    basePrice: b.basePrice,
    price: b.price,
    betsLimit: b.betsLimit,
    isWelcome: b.isWelcome,
    margem,
    volume,
    exposicao: exposicao({ betsLimit: b.betsLimit, maxStake, price: b.price }),
  }
}

/**
 * Monta UM candidato por mercado que ainda não tem boost.
 *
 * ── POR QUE UM POR MERCADO, E NÃO UM POR SELEÇÃO ─────────────────────────────
 * Com uma turbinada uniforme, a margem é a MESMA para todas as seleções do
 * mercado. A conta se abre assim:
 *
 *     p          = (1 / base) / (1 + overround)
 *     price      = base × (1 + lift)
 *     margemBoost = 1 − p × price = 1 − (1 + lift) / (1 + overround)
 *
 * O `base` se cancela. Boostar o favorito a 1.58 ou o azarão a 12.00 entrega
 * exatamente a mesma margem, e o volume também é igual — ele vem da família, que
 * é a mesma. As seleções de um mercado são, para este modelo, indistinguíveis.
 *
 * Antes cada seleção virava uma linha, e o top 5 de Single aparecia com "1x2
 * Faltas" três vezes seguidas (Bragantino, Empate, Bahia): três linhas com o
 * mesmo número, ocupando o lugar de outros mercados. As diferenças de 8,7 / 8,8
 * / 8,8 pp que apareciam eram só o arredondamento da odd turbinada a duas casas.
 *
 * Então a dica é do MERCADO, e as seleções vão junto como opções — quem escolhe
 * qual delas turbinar é quem conhece o jogo. O modelo não tem o que dizer aí: o
 * histórico de volume é por família, nunca por seleção.
 */
function candidatoDeMercado(mercado, { estatisticas, fator, lift }) {
  const familia = familiaDe(mercado.market)
  const volume = volumeEsperado(estatisticas.get(familia.id), fator)

  const opcoes = mercado.selecoes
    .map((selecao) => {
      const [leg] = marcarComplementaridade([
        {
          market: mercado.market,
          selection: selecao.selection,
          price: selecao.price,
          precosDoMercado: selecao.precosDoMercado,
        },
      ])
      const price = Number((selecao.price * (1 + lift)).toFixed(2))
      const margem = avaliarBoost({ basePrice: selecao.price, price, legs: [leg] })
      return margem ? { selecao, leg, price, margem } : null
    })
    .filter(Boolean)

  if (!opcoes.length) return null

  // Todas empatam na margem; o desempate é só o arredondamento da odd. A de
  // melhor margem representa o mercado, e as outras seguem como opção.
  const melhor = opcoes.reduce((a, b) => (b.margem.margemBoost > a.margem.margemBoost ? b : a))

  return {
    chave: `sug-${mercado.marketId}`,
    tipo: 'sugestao',
    rotulo: mercado.market,
    mercado: mercado.market,
    // A seleção não é escolha do modelo: vai a lista inteira para a tela.
    opcoes: opcoes.map((o) => ({
      selecao: o.selecao.selection,
      basePrice: o.selecao.price,
      price: o.price,
    })),
    legs: [melhor.leg],
    familia: familia.id,
    familiaLabel: familia.label,
    basePrice: melhor.selecao.price,
    price: melhor.price,
    betsLimit: 0,
    margem: melhor.margem,
    volume,
    exposicao: null,
  }
}

const ev = (c) => (c.volume.stake == null ? null : c.margem.margemBoost * c.volume.stake)

/**
 * Ordena pelo resultado esperado em reais, jogando para o fim quem não tem
 * volume para estimar.
 *
 * Era um seletor de quatro critérios (resultado, volume, margem, custo). Virou
 * um só: os outros três são as PARTES desta conta, e escolher entre eles é
 * decidir metade da pergunta. Volume alto com margem negativa é prejuízo em
 * escala; margem alta sem volume não rende nada. Quem responde "qual boost
 * subir" é o produto dos dois, em reais. Os componentes continuam visíveis em
 * cada linha, para conferir de onde o número saiu.
 */
function ordenar(candidatos) {
  return [...candidatos].sort((a, b) => {
    const va = a.ev
    const vb = b.ev
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return vb - va
  })
}

/**
 * O ranking completo de um jogo.
 *
 * `dados` é o que /api/recomendador/evento devolveu; `estatisticas` e `fator`
 * vêm do histórico (historico.js). `incluirSugestoes` liga os mercados que
 * ainda não têm boost, turbinados no `lift` pretendido.
 */
export function ranquear(dados, { estatisticas, fator, lift = 0.1, maxStake = 0, incluirSugestoes = true }) {
  const ctx = { estatisticas, fator, lift, maxStake }

  const boosts = (dados?.boosts || []).map((b) => candidatoDeBoost(b, ctx)).filter(Boolean)

  // Mercado que já tem boost SIMPLES no jogo não vira sugestão: a linha da boost
  // real, com a odd que a casa de fato publicou, diz mais que a hipótese.
  //
  // Só as de perna única barram. A primeira versão barrava qualquer mercado
  // citado em qualquer perna, e uma múltipla que usasse "Vencedor do encontro"
  // apagava o 1x2 inteiro das sugestões — em 5 dos 8 jogos auditados sumiam
  // justamente os mercados mais turbináveis do jogo. Uma perna dentro de uma
  // múltipla não é uma boost naquele mercado.
  const jaTemBoost = new Set(
    boosts
      .filter((c) => c.legs.length === 1)
      .map((c) => c.legs[0].market)
      .filter(Boolean),
  )
  const sugestoes = incluirSugestoes
    ? (dados?.mercados || [])
        .filter((m) => !jaTemBoost.has(m.market))
        .map((m) => candidatoDeMercado(m, ctx))
        .filter(Boolean)
    : []

  const todos = [...boosts, ...sugestoes].map((c) => ({
    ...c,
    ev: ev(c),
    vertente: c.legs.length > 1 ? 'betbuilder' : 'single',
    // "Subir" = ainda não existe no site. "No ar" = a casa já publicou, e a odd
    // turbinada da linha é a real, não a pretendida.
    noAr: c.tipo === 'boost',
  }))
  const comEv = ordenar(todos)

  return {
    candidatos: comEv,
    single: comEv.filter((c) => c.vertente === 'single'),
    betbuilder: comEv.filter((c) => c.vertente === 'betbuilder'),
    qtdBoosts: boosts.length,
    qtdSugestoes: sugestoes.length,
  }
}

export { rotuloDaFamilia }
