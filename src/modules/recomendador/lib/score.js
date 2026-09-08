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
import { assinaturaDeFamilias, montarCombinacoes } from './combinacoes.js'
import { prever } from './aprendizado.js'

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
    descricao: 'Uma seleção só. Nenhum mercado se repete: com turbinada uniforme, as seleções de um mesmo mercado dão margem e volume idênticos.',
  },
  {
    id: 'betbuilder',
    label: 'Bet Builder',
    descricao: 'Combinações de pernas de famílias diferentes. A odd combinada é estimada a partir do desconto que a casa aplica nas múltiplas dela — confira o valor final no back-office antes de subir.',
  },
]

// Quantas dicas cada vertente entrega. Cinco é o que se lê de uma vez antes de
// decidir; o resto fica atrás do "ver todas".
export const TOP = 5

// Teto de seleções listadas numa dica de Single. Acima disso a linha vira uma
// parede de texto e ninguém lê nenhuma.
const TETO_OPCOES = 6

/**
 * O volume que se espera de um candidato, perguntado ao modelo aprendido.
 *
 * O modelo (aprendizado.js) responde pela combinação de vertente, família e
 * faixa de odd, encolhendo o específico na direção do geral conforme a amostra.
 * Aqui só entra o que ele não sabe: o porte do confronto, que vem dos times
 * (historico.js) e multiplica o resultado.
 *
 * Sem histórico nenhum o stake volta nulo — a tela mostra "—" em vez de um
 * número inventado.
 */
export function volumeEsperado(modelo, { vertente, familia, familiaLabel, odd }, fator) {
  const p = prever(modelo, { vertente, familia, familiaLabel, odd })
  return {
    stake: p.stake == null ? null : p.stake * fator,
    n: p.n,
    // De onde o número veio: "Tipster · Escanteios" pesa muito mais que
    // "todas as boosts", e a tela precisa dizer qual dos dois foi.
    nivel: p.nivel,
    caminho: p.caminho,
    confianca: p.confianca,
  }
}

/** Monta um candidato a partir de uma boost que já existe no jogo. */
function candidatoDeBoost(b, { modelo, vertente, fator, maxStake }) {
  const familia = familiaDaBoost(b.legs)
  const legs = marcarComplementaridade(b.legs)
  const margem = avaliarBoost({ ...b, legs })
  if (!margem) return null
  const volume = volumeEsperado(
    modelo,
    { vertente, familia: familia.id, familiaLabel: familia.label, odd: b.price },
    fator,
  )
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
function candidatoDeMercado(mercado, { modelo, vertente, fator, lift }) {
  const familia = familiaDe(mercado.market)

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
      if (!margem) return null
      // O volume é perguntado POR SELEÇÃO, com a odd dela. A margem empata entre
      // as seleções de um mercado (o preço base se cancela), mas o volume não
      // precisa empatar: assim que o histórico tiver odd, o favorito a 1.35 e o
      // azarão a 12.00 passam a ser distinguíveis. Enquanto não tiver, os dois
      // caem no mesmo nível do modelo e empatam — como empatam hoje.
      const volume = volumeEsperado(
        modelo,
        { vertente, familia: familia.id, familiaLabel: familia.label, odd: price },
        fator,
      )
      return { selecao, leg, price, margem, volume }
    })
    .filter(Boolean)

  if (!opcoes.length) return null

  // A seleção que representa o mercado é a de melhor resultado esperado.
  const valor = (o) => (o.volume.stake == null ? -Infinity : o.margem.margemBoost * o.volume.stake)
  const melhor = opcoes.reduce((a, b) => (valor(b) > valor(a) ? b : a))
  const volume = melhor.volume

  return {
    chave: `sug-${mercado.marketId}`,
    tipo: 'sugestao',
    rotulo: mercado.market,
    mercado: mercado.market,
    // A seleção não é escolha do modelo, então vão todas — mas com teto. Um
    // "Total e ambas equipes marcam" traz doze seleções (quatro combinações em
    // três linhas de gols), e listar as doze afoga a dica.
    opcoes: opcoes.slice(0, TETO_OPCOES).map((o) => ({
      selecao: o.selecao.selection,
      basePrice: o.selecao.price,
      price: o.price,
      volume: o.volume.stake,
    })),
    opcoesOcultas: Math.max(0, opcoes.length - TETO_OPCOES),
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

/**
 * Monta um candidato a partir de uma COMBINAÇÃO que ainda não existe.
 *
 * A odd combinada de `combo.basePrice` é estimada — ver combinacoes.js para o
 * tamanho do erro. Daqui para baixo ela entra na conta como qualquer outra odd
 * base; o que muda é a marca `oddEstimada`, que a tela usa para dizer que o
 * valor final tem de ser conferido no back-office antes de subir.
 */
function candidatoDeCombinacao(combo, { modelo, vertente, fator, lift }) {
  const legs = marcarComplementaridade(combo.legs)
  const price = Number((combo.basePrice * (1 + lift)).toFixed(2))
  const margem = avaliarBoost({ basePrice: combo.basePrice, price, legs })
  if (!margem) return null

  // Múltipla se comporta como múltipla, seja qual for o mercado das pernas.
  const volume = volumeEsperado(
    modelo,
    { vertente, familia: 'multipla', familiaLabel: 'Múltipla / Bet Builder', odd: price },
    fator,
  )

  return {
    chave: `combo-${combo.legs.map((l) => `${l.market}:${l.selection}`).join('|')}`,
    tipo: 'combinacao',
    rotulo: combo.legs.map((l) => `${l.market} ${l.selection}`).join(' + '),
    mercado: combo.legs.map((l) => l.market).join(' + '),
    // Estruturado para a tela poder desenhar perna a perna.
    pernas: combo.legs.map((l) => ({ market: l.market, selection: l.selection, price: l.price })),
    legs,
    familia: 'multipla',
    familiaLabel: 'Múltipla / Bet Builder',
    basePrice: combo.basePrice,
    price,
    oddEstimada: true,
    produtoDasPernas: combo.produtoDasPernas,
    assinatura: assinaturaDeFamilias(combo),
    betsLimit: 0,
    margem,
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

// Quantas vezes uma mesma perna pode reaparecer entre as dicas de Bet Builder.
const REPETICOES_POR_PERNA = 2

/**
 * Tira a repetição das combinações.
 *
 * Dois cortes, e os dois foram necessários:
 *
 * 1. Uma dica por CONJUNTO DE FAMÍLIAS. Sem isso o top 5 vinha com
 *    "gols + escanteios" cinco vezes, variando só a linha.
 * 2. Uma perna aparece no máximo duas vezes. Só o corte por família não bastou:
 *    num jogo real, "1º tempo - handicap 1X2 Lincoln (0:2)" era a perna mais
 *    valiosa e entrava em quatro das cinco dicas, cada vez com um par diferente.
 *    Tecnicamente eram cinco combinações distintas; na prática era a mesma dica
 *    quatro vezes.
 *
 * Recebe a lista já ordenada e percorre do melhor para o pior, então o que sai é
 * sempre a melhor combinação ainda disponível.
 */
function diversificar(candidatos) {
  const familiasVistas = new Set()
  const usoDaPerna = new Map()
  const saida = []

  for (const c of candidatos) {
    if (familiasVistas.has(c.assinatura)) continue

    const chaves = c.pernas.map((p) => `${p.market}|${p.selection}`)
    if (chaves.some((k) => (usoDaPerna.get(k) || 0) >= REPETICOES_POR_PERNA)) continue

    familiasVistas.add(c.assinatura)
    for (const k of chaves) usoDaPerna.set(k, (usoDaPerna.get(k) || 0) + 1)
    saida.push(c)
  }
  return saida
}

/**
 * As dicas de um jogo, separadas nas duas vertentes em que uma boost sobe.
 *
 * ── AS DICAS SÃO O QUE SUBIR, NÃO O QUE JÁ ESTÁ NO AR ────────────────────────
 * As duas listas trazem só boost que ainda não existe. Boost publicada ocupando
 * uma das cinco vagas é uma dica que não dá para agir — ela vai para `noAr`,
 * numa seção à parte, onde continua servindo de conferência.
 *
 * `single` tem no máximo uma dica por mercado (ver `candidatoDeMercado`) e
 * `betbuilder` no máximo uma por combinação de famílias: cinco linhas de
 * "gols + escanteios" com a linha vizinha seriam a mesma dica cinco vezes.
 */
export function ranquear(dados, { modelo, vertente = 'sportsbook', fator = 1, lift = 0.1, maxStake = 0 } = {}) {
  const ctx = { modelo, vertente, fator, lift, maxStake }

  const noAr = ordenar(
    (dados?.boosts || [])
      .map((b) => candidatoDeBoost(b, ctx))
      .filter(Boolean)
      .map((c) => ({ ...c, ev: ev(c), noAr: true, vertente: c.legs.length > 1 ? 'betbuilder' : 'single' })),
  )

  // Mercado que já tem boost SIMPLES no jogo não vira dica: ela já está lá.
  //
  // Só as de perna única barram. A primeira versão barrava qualquer mercado
  // citado em qualquer perna, e uma múltipla que usasse "Vencedor do encontro"
  // apagava o 1x2 inteiro das sugestões — em 5 dos 8 jogos auditados sumiam
  // justamente os mercados mais turbináveis. Uma perna dentro de uma múltipla
  // não é uma boost naquele mercado.
  const jaTemBoost = new Set(
    (dados?.boosts || [])
      .filter((b) => b.legs.length === 1)
      .map((b) => b.legs[0]?.market)
      .filter(Boolean),
  )

  const mercadosLivres = (dados?.mercados || []).filter((m) => !jaTemBoost.has(m.market))

  const single = ordenar(
    mercadosLivres
      .map((m) => candidatoDeMercado(m, ctx))
      .filter(Boolean)
      .map((c) => ({ ...c, ev: ev(c), noAr: false, vertente: 'single' })),
  )

  const betbuilder = diversificar(
    ordenar(
      montarCombinacoes(mercadosLivres)
        .map((combo) => candidatoDeCombinacao(combo, ctx))
        .filter(Boolean)
        .map((c) => ({ ...c, ev: ev(c), noAr: false, vertente: 'betbuilder' })),
    ),
  )

  return {
    single,
    betbuilder,
    noAr,
    // Tudo junto: a marcação e o placar procuram o candidato por aqui.
    candidatos: [...single, ...betbuilder, ...noAr],
  }
}

export { rotuloDaFamilia }
