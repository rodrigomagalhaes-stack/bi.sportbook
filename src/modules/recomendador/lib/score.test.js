import { describe, expect, it } from 'vitest'
import { TOP, VERTENTES, confianca, ranquear, volumeEsperado } from './score.js'

// Um mercado de duas vias com ~7% de margem, para as pernas dos exemplos.
const DUAS_VIAS = [1.8691, 1.8691]

const stats = (mapa) => new Map(Object.entries(mapa))

const dadosDoEvento = {
  evento: { eventId: 1, eventName: 'PSG vs. Monaco', competidores: ['PSG', 'Monaco'] },
  boosts: [
    {
      itemId: 10,
      betsLimit: 400,
      basePrice: 2,
      price: 2.05,
      legs: [{ market: 'Total de gols', selection: 'Mais de 2.5', price: 2, precosDoMercado: DUAS_VIAS }],
    },
    {
      itemId: 11,
      betsLimit: 500,
      basePrice: 2,
      price: 2.6,
      legs: [{ market: 'Total de escanteios', selection: 'Mais de 9.5', price: 2, precosDoMercado: DUAS_VIAS }],
    },
  ],
  // Três mercados de FAMÍLIAS diferentes: é o mínimo para haver combinação de
  // Bet Builder, que só junta pernas de famílias distintas.
  mercados: [
    {
      marketId: 99,
      market: 'Total cartões',
      selecoes: [
        { selectionId: 1, selection: 'Mais de 3.5', price: 2, precosDoMercado: DUAS_VIAS },
        { selectionId: 2, selection: 'Menos de 3.5', price: 1.8691, precosDoMercado: DUAS_VIAS },
      ],
    },
    {
      marketId: 98,
      market: 'Ambas equipes marcam',
      selecoes: [
        { selectionId: 4, selection: 'Sim', price: 1.8691, precosDoMercado: DUAS_VIAS },
        { selectionId: 5, selection: 'Não', price: 2, precosDoMercado: DUAS_VIAS },
      ],
    },
    {
      marketId: 97,
      market: 'Chance dupla',
      selecoes: [
        { selectionId: 6, selection: 'Casa ou empate', price: 1.2857, precosDoMercado: [1.2857, 1.5, 3.5] },
        { selectionId: 7, selection: 'Empate ou fora', price: 3.5, precosDoMercado: [1.2857, 1.5, 3.5] },
      ],
    },
  ],
}

const estatisticas = stats({
  gols: { n: 20, medianaStake: 10000, medianaApostas: 100, medianaApostadores: 80, stakeTotal: 200000, netTotal: 10000 },
  escanteios: { n: 6, medianaStake: 2000, medianaApostas: 30, medianaApostadores: 25, stakeTotal: 12000, netTotal: -500 },
  cartoes: { n: 2, medianaStake: 1000, medianaApostas: 20, medianaApostadores: 18, stakeTotal: 2000, netTotal: 100 },
  ambas: { n: 8, medianaStake: 4000, medianaApostas: 40, medianaApostadores: 35, stakeTotal: 40000, netTotal: 1500 },
  'chance-dupla': { n: 4, medianaStake: 2000, medianaApostas: 22, medianaApostadores: 20, stakeTotal: 9000, netTotal: 300 },
  multipla: { n: 12, medianaStake: 7000, medianaApostas: 70, medianaApostadores: 60, stakeTotal: 90000, netTotal: 6000 },
})

describe('confianca', () => {
  it('escala com o tamanho da amostra', () => {
    expect(confianca(20).id).toBe('alta')
    expect(confianca(6).id).toBe('media')
    expect(confianca(2).id).toBe('baixa')
    expect(confianca(0).id).toBe('nenhuma')
  })
})

describe('volumeEsperado', () => {
  it('aplica o porte do jogo sobre a mediana da família', () => {
    const v = volumeEsperado(estatisticas.get('gols'), 1.5)
    expect(v.stake).toBe(15000)
    expect(v.apostas).toBe(150)
    expect(v.confianca.id).toBe('alta')
  })

  it('devolve nulo, e não zero, quando a família nunca apareceu', () => {
    // Zero seria um número: a tela mostraria "R$ 0" como se fosse estimativa.
    const v = volumeEsperado(undefined, 1)
    expect(v.stake).toBeNull()
    expect(v.confianca.id).toBe('nenhuma')
  })

  it('leva o ROI histórico junto, para a tela poder mostrar a conferência', () => {
    const v = volumeEsperado(estatisticas.get('gols'), 1)
    expect(v.roiHistorico).toBeCloseTo(0.05, 6)
    expect(v.n).toBe(20)
  })
})

describe('ranquear', () => {
  const opcoes = { estatisticas, fator: 1, maxStake: 50 }

  it('o que já está no ar sai das dicas e vai para a lista própria', () => {
    // Uma boost publicada ocupando uma das cinco vagas é uma dica que não dá
    // para agir. Ela continua visível, mas fora do top.
    const r = ranquear(dadosDoEvento, opcoes)
    expect(r.noAr.map((c) => c.itemId).sort()).toEqual([10, 11])
    expect(r.single.every((c) => !c.noAr)).toBe(true)
    expect(r.betbuilder.every((c) => !c.noAr)).toBe(true)
  })

  it('Single traz uma dica por mercado, com as seleções como opções', () => {
    const r = ranquear(dadosDoEvento, opcoes)
    const cartoes = r.single.find((c) => c.mercado === 'Total cartões')
    expect(cartoes.rotulo).toBe('Total cartões')
    expect(cartoes.opcoes.map((o) => o.selecao)).toEqual(['Mais de 3.5', 'Menos de 3.5'])
    // Um mercado nunca aparece duas vezes.
    const mercados = r.single.map((c) => c.mercado)
    expect(new Set(mercados).size).toBe(mercados.length)
  })

  it('Single não sugere mercado que já tem boost simples no ar', () => {
    const dados = {
      ...dadosDoEvento,
      mercados: [
        ...dadosDoEvento.mercados,
        {
          marketId: 100,
          market: 'Total de gols',
          selecoes: [{ selectionId: 3, selection: 'Mais de 3.5', price: 2, precosDoMercado: DUAS_VIAS }],
        },
      ],
    }
    const r = ranquear(dados, opcoes)
    expect(r.single.filter((c) => c.mercado === 'Total de gols')).toHaveLength(0)
  })

  it('perna de múltipla NÃO barra o mercado das dicas', () => {
    // A primeira versão barrava qualquer mercado citado em qualquer perna: uma
    // múltipla que usasse "Vencedor do encontro" apagava o 1x2 inteiro das
    // sugestões. Em 5 de 8 jogos auditados sumiam os mercados mais turbináveis.
    const dados = {
      ...dadosDoEvento,
      boosts: [
        {
          itemId: 20,
          betsLimit: 0,
          basePrice: 4,
          price: 4.4,
          legs: [
            { market: 'Total cartões', selection: 'Mais de 3.5', price: 2, precosDoMercado: DUAS_VIAS },
            { market: 'Total de gols', selection: 'Mais de 2.5', price: 2, precosDoMercado: DUAS_VIAS },
          ],
        },
      ],
    }
    const r = ranquear(dados, opcoes)
    expect(r.single.filter((c) => c.mercado === 'Total cartões')).toHaveLength(1)
  })

  it('Bet Builder monta combinação nova, com as pernas escritas por extenso', () => {
    const r = ranquear(dadosDoEvento, opcoes)
    expect(r.betbuilder.length).toBeGreaterThan(0)
    const combo = r.betbuilder[0]
    expect(combo.pernas.length).toBeGreaterThanOrEqual(2)
    expect(combo.pernas[0]).toHaveProperty('market')
    expect(combo.pernas[0]).toHaveProperty('selection')
    expect(combo.familia).toBe('multipla')
  })

  it('a odd da combinação sai marcada como estimada', () => {
    // Não existe endpoint que precifique uma combinação nova; a odd vem do
    // produto das pernas corrigido pelo desconto medido nas múltiplas da casa.
    const r = ranquear(dadosDoEvento, opcoes)
    expect(r.betbuilder[0].oddEstimada).toBe(true)
    expect(r.betbuilder[0].basePrice).toBeLessThan(r.betbuilder[0].produtoDasPernas + 0.01)
  })

  it('Bet Builder não repete a mesma dupla de famílias', () => {
    const r = ranquear(dadosDoEvento, opcoes)
    const assinaturas = r.betbuilder.map((c) => c.assinatura)
    expect(new Set(assinaturas).size).toBe(assinaturas.length)
  })

  it('Bet Builder não repete a mesma perna mais de duas vezes', () => {
    // Só o corte por família não bastava: num jogo real a perna mais valiosa
    // entrava em quatro das cinco dicas, cada vez com um par diferente.
    const r = ranquear(dadosDoEvento, opcoes)
    const uso = new Map()
    for (const c of r.betbuilder) {
      for (const p of c.pernas) {
        const k = `${p.market}|${p.selection}`
        uso.set(k, (uso.get(k) || 0) + 1)
      }
    }
    expect(Math.max(...uso.values(), 0)).toBeLessThanOrEqual(2)
  })

  it('cada lista sai ordenada pelo resultado esperado', () => {
    const r = ranquear(dadosDoEvento, opcoes)
    for (const lista of [r.single, r.betbuilder, r.noAr]) {
      const evs = lista.map((c) => c.ev).filter((e) => e != null)
      expect(evs).toEqual([...evs].sort((a, b) => b - a))
    }
  })

  it('joga para o fim quem não tem histórico, em vez de tratá-lo como zero', () => {
    const dados = {
      ...dadosDoEvento,
      mercados: [
        ...dadosDoEvento.mercados,
        {
          marketId: 101,
          market: 'Mercado nunca visto',
          selecoes: [{ selectionId: 9, selection: 'Sim', price: 2, precosDoMercado: DUAS_VIAS }],
        },
      ],
    }
    const r = ranquear(dados, opcoes)
    const ultimo = r.single[r.single.length - 1]
    expect(ultimo.mercado).toBe('Mercado nunca visto')
    expect(ultimo.volume.stake).toBeNull()
    expect(ultimo.ev).toBeNull()
  })

  it('todas as seleções de um mercado dão a MESMA margem', () => {
    // É o que justifica a dica ser do mercado e não de uma seleção:
    //   p           = (1/base) / (1 + overround)
    //   price       = base × (1 + lift)
    //   margemBoost = 1 − p × price = 1 − (1 + lift) / (1 + overround)
    // O `base` se cancela. Na conta exata as margens são idênticas.
    const lift = 0.1
    const overround = 0.07
    const exata = (base) => 1 - (1 / base / (1 + overround)) * (base * (1 + lift))
    expect(exata(2)).toBeCloseTo(exata(12), 12)

    // Na implementação sobra um resíduo: a odd turbinada é arredondada a duas
    // casas, e é só isso que faz a tela mostrar 8,7 / 8,8 / 8,8 pp em vez de
    // três números iguais. O arredondamento erra no máximo meio centavo na odd,
    // o que sobre a menor odd sugerida (1.15) dá ~0,4 pp.
    const r = ranquear(dadosDoEvento, { ...opcoes, lift })
    const sug = r.single.find((c) => c.opcoes)
    const margens = sug.opcoes.map((o) => 1 - (1 / o.basePrice / (1 + overround)) * o.price)
    expect(Math.max(...margens) - Math.min(...margens)).toBeLessThan(0.005)
  })

  it('calcula a exposição da trava das boosts no ar quando há max stake', () => {
    const r = ranquear(dadosDoEvento, opcoes)
    const gols = r.noAr.find((c) => c.itemId === 10)
    expect(gols.exposicao.stakeMax).toBe(20000)
    expect(gols.exposicao.riscoMax).toBeCloseTo(21000, 6)
  })
})

describe('VERTENTES e TOP', () => {
  it('são exatamente duas vertentes, single e bet builder', () => {
    expect(VERTENTES.map((v) => v.id)).toEqual(['single', 'betbuilder'])
  })

  it('o top é de cinco dicas', () => {
    expect(TOP).toBe(5)
  })
})
