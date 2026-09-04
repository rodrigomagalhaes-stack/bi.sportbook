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
  mercados: [
    {
      marketId: 99,
      market: 'Total cartões',
      selecoes: [
        { selectionId: 1, selection: 'Mais de 3.5', price: 2, precosDoMercado: DUAS_VIAS },
        { selectionId: 2, selection: 'Menos de 3.5', price: 1.8691, precosDoMercado: DUAS_VIAS },
      ],
    },
  ],
}

const estatisticas = stats({
  gols: { n: 20, medianaStake: 10000, medianaApostas: 100, medianaApostadores: 80, stakeTotal: 200000, netTotal: 10000 },
  escanteios: { n: 6, medianaStake: 2000, medianaApostas: 30, medianaApostadores: 25, stakeTotal: 12000, netTotal: -500 },
  cartoes: { n: 2, medianaStake: 1000, medianaApostas: 20, medianaApostadores: 18, stakeTotal: 2000, netTotal: 100 },
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

  it('monta um candidato por boost existente e por seleção sugerida', () => {
    const r = ranquear(dadosDoEvento, opcoes)
    expect(r.qtdBoosts).toBe(2)
    expect(r.qtdSugestoes).toBe(2)
    expect(r.candidatos).toHaveLength(4)
  })

  it('ordena por resultado esperado, que é margem × volume', () => {
    const r = ranquear(dadosDoEvento, opcoes)
    // A boost de gols é a única que sobra margem depois da turbinada (2→2.05)
    // e ainda puxa 5× o volume de escanteios: tem de vir na frente.
    expect(r.candidatos[0].itemId).toBe(10)
    expect(r.candidatos[0].ev).toBeGreaterThan(r.candidatos[1].ev)
  })

  it('a boost cara de escanteios tem margem final negativa', () => {
    const r = ranquear(dadosDoEvento, opcoes)
    const escanteios = r.candidatos.find((c) => c.itemId === 11)
    expect(escanteios.margem.margemBoost).toBeLessThan(0)
    expect(escanteios.ev).toBeLessThan(0)
  })

  it('separa nas duas vertentes, por número de pernas', () => {
    const dados = {
      ...dadosDoEvento,
      boosts: [
        ...dadosDoEvento.boosts,
        {
          itemId: 40,
          betsLimit: 0,
          basePrice: 4,
          price: 4.3,
          legs: [
            { market: 'Total de gols', selection: 'Mais de 2.5', price: 2, precosDoMercado: DUAS_VIAS },
            { market: 'Total de escanteios', selection: 'Mais de 9.5', price: 2, precosDoMercado: DUAS_VIAS },
          ],
        },
      ],
    }
    const r = ranquear(dados, opcoes)
    expect(r.betbuilder.map((c) => c.itemId)).toEqual([40])
    expect(r.single.every((c) => c.legs.length === 1)).toBe(true)
    expect(r.single.length + r.betbuilder.length).toBe(r.candidatos.length)
  })

  it('marca o que já está no ar e o que é para subir', () => {
    const r = ranquear(dadosDoEvento, opcoes)
    expect(r.candidatos.find((c) => c.itemId === 10).noAr).toBe(true)
    expect(r.candidatos.find((c) => c.tipo === 'sugestao').noAr).toBe(false)
  })

  it('cada vertente sai ordenada pelo resultado esperado', () => {
    const r = ranquear(dadosDoEvento, opcoes)
    for (const lista of [r.single, r.betbuilder]) {
      const evs = lista.map((c) => c.ev).filter((e) => e != null)
      expect(evs).toEqual([...evs].sort((a, b) => b - a))
    }
  })

  it('sugestão nasce da turbinada pretendida sobre a odd atual', () => {
    const r = ranquear(dadosDoEvento, { ...opcoes, lift: 0.2 })
    const sug = r.candidatos.find((c) => c.tipo === 'sugestao' && c.basePrice === 2)
    expect(sug.price).toBe(2.4)
    expect(sug.margem.custo).toBeGreaterThan(0)
  })

  it('perna de múltipla NÃO barra o mercado das sugestões', () => {
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
    expect(r.candidatos.filter((c) => c.tipo === 'sugestao' && c.mercado === 'Total cartões').length).toBeGreaterThan(0)
  })

  it('não sugere mercado que já tem boost SIMPLES no jogo', () => {
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
    expect(r.candidatos.filter((c) => c.tipo === 'sugestao' && c.mercado === 'Total de gols')).toHaveLength(0)
  })

  it('família não complementar cai na estimativa em vez de fingir de-vig', () => {
    // Marcador vem como Primeiro / Último / Qualq. Altura, que acontecem juntas.
    const dados = {
      ...dadosDoEvento,
      boosts: [
        {
          itemId: 30,
          betsLimit: 0,
          basePrice: 1.8,
          price: 2,
          legs: [
            { market: 'Marcador - Fulano (X)', selection: 'Qualq. Altura', price: 1.8, precosDoMercado: [4.25, 4.25, 1.8] },
          ],
        },
      ],
    }
    const r = ranquear(dados, opcoes)
    expect(r.candidatos.find((c) => c.itemId === 30).margem.estimado).toBe(true)
  })

  it('deixa as sugestões de fora quando desligadas', () => {
    const r = ranquear(dadosDoEvento, { ...opcoes, incluirSugestoes: false })
    expect(r.qtdSugestoes).toBe(0)
    expect(r.candidatos.every((c) => c.tipo === 'boost')).toBe(true)
  })

  it('joga para o fim o candidato sem histórico, em vez de tratá-lo como zero', () => {
    const dados = {
      ...dadosDoEvento,
      boosts: [
        ...dadosDoEvento.boosts,
        {
          itemId: 12,
          betsLimit: 0,
          basePrice: 2,
          price: 2.05,
          legs: [{ market: 'Mercado nunca visto', selection: 'Sim', price: 2, precosDoMercado: DUAS_VIAS }],
        },
      ],
    }
    const r = ranquear(dados, opcoes)
    const ultimo = r.candidatos[r.candidatos.length - 1]
    expect(ultimo.itemId).toBe(12)
    expect(ultimo.volume.stake).toBeNull()
    expect(ultimo.ev).toBeNull()
  })

  it('calcula a exposição da trava quando há max stake', () => {
    const r = ranquear(dadosDoEvento, opcoes)
    const gols = r.candidatos.find((c) => c.itemId === 10)
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
