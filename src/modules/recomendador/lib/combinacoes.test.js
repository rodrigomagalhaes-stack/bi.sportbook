import { describe, expect, it } from 'vitest'
import { RAZAO_CORRELACAO, assinaturaDeFamilias, montarCombinacoes, pernasCandidatas } from './combinacoes.js'

const DUAS_VIAS = [1.8691, 1.8691]

const mercado = (market, selecoes) => ({
  marketId: market.length,
  market,
  selecoes: selecoes.map((s, i) => ({
    selectionId: i,
    selection: s.selection,
    price: s.price,
    precosDoMercado: s.precosDoMercado || DUAS_VIAS,
  })),
})

const mercados = [
  mercado('Total de gols', [
    { selection: 'Mais de 0.5', price: 1.1 },
    { selection: 'Mais de 2.5', price: 2 },
  ]),
  mercado('Total de escanteios', [
    { selection: 'Mais de 5.5', price: 1.3 },
    { selection: 'Mais de 9.5', price: 2.2 },
  ]),
  mercado('Total cartões', [{ selection: 'Mais de 3.5', price: 1.9 }]),
]

describe('pernasCandidatas', () => {
  it('recusa perna quase certa e perna improvável demais', () => {
    // Abaixo de 1.10 a perna quase não move a odd; acima de 4 a múltipla vira
    // loteria e não vende.
    const pernas = pernasCandidatas([
      mercado('Total de gols', [
        { selection: 'Mais de 0.5', price: 1.02 },
        { selection: 'Mais de 2.5', price: 2 },
        { selection: 'Mais de 6.5', price: 12 },
      ]),
    ])
    expect(pernas.map((p) => p.selection)).toEqual(['Mais de 2.5'])
  })

  it('limita quantas seleções cada família contribui', () => {
    const muitas = mercado(
      'Total de gols',
      Array.from({ length: 8 }, (_, i) => ({ selection: `Mais de ${i}.5`, price: 1.2 + i * 0.2 })),
    )
    const pernas = pernasCandidatas([muitas])
    expect(pernas.length).toBeLessThanOrEqual(3)
  })

  it('carrega a família de cada perna, que é o que separa as combinações', () => {
    const pernas = pernasCandidatas(mercados)
    expect(new Set(pernas.map((p) => p.familia))).toEqual(new Set(['gols', 'escanteios', 'cartoes']))
  })
})

describe('montarCombinacoes', () => {
  it('junta pernas de famílias diferentes', () => {
    const combos = montarCombinacoes(mercados)
    expect(combos.length).toBeGreaterThan(0)
    for (const c of combos) {
      expect(new Set(c.familias).size).toBe(c.legs.length)
    }
  })

  it('nunca junta duas pernas da MESMA família', () => {
    // "Mais de 2.5 gols" com "mais de 3.5 gols" é o mesmo palpite vendido duas
    // vezes: a segunda perna quase não baixa a chance mas multiplica a odd.
    const combos = montarCombinacoes([
      mercado('Total de gols', [
        { selection: 'Mais de 0.5', price: 1.1 },
        { selection: 'Mais de 2.5', price: 2 },
      ]),
    ])
    expect(combos).toHaveLength(0)
  })

  it('aplica o desconto de correlação medido, e não o produto cru', () => {
    const combos = montarCombinacoes(mercados, { pernasMin: 2, pernasMax: 2 })
    const c = combos[0]
    const produto = c.legs.reduce((a, l) => a * l.price, 1)
    expect(c.produtoDasPernas).toBeCloseTo(produto, 2)
    expect(c.razaoAplicada).toBe(RAZAO_CORRELACAO[2])
    expect(c.basePrice).toBeLessThan(produto)
  })

  it('respeita a faixa de odd que se quer publicar', () => {
    const combos = montarCombinacoes(mercados, { alvoMin: 2, alvoMax: 3 })
    expect(combos.length).toBeGreaterThan(0)
    for (const c of combos) {
      expect(c.basePrice).toBeGreaterThanOrEqual(2)
      expect(c.basePrice).toBeLessThanOrEqual(3)
    }
  })

  it('ordena da mais simples e mais barata para a mais longa', () => {
    const combos = montarCombinacoes(mercados)
    for (let i = 1; i < combos.length; i++) {
      const antes = combos[i - 1]
      const agora = combos[i]
      expect(antes.pernas < agora.pernas || antes.basePrice <= agora.basePrice).toBe(true)
    }
  })

  it('sem mercados não inventa combinação', () => {
    expect(montarCombinacoes([])).toHaveLength(0)
    expect(montarCombinacoes(null)).toHaveLength(0)
  })
})

describe('assinaturaDeFamilias', () => {
  it('é a mesma para o mesmo par de famílias, em qualquer ordem', () => {
    expect(assinaturaDeFamilias({ familias: ['gols', 'escanteios'] })).toBe(
      assinaturaDeFamilias({ familias: ['escanteios', 'gols'] }),
    )
  })

  it('separa pares diferentes', () => {
    expect(assinaturaDeFamilias({ familias: ['gols', 'escanteios'] })).not.toBe(
      assinaturaDeFamilias({ familias: ['gols', 'cartoes'] }),
    )
  })
})
