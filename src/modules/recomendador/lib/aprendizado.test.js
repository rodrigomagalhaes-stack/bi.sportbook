import { describe, expect, it } from 'vitest'
import { FAIXAS_ODD, faixaDaOdd, prever, tabelaAprendida, treinar } from './aprendizado.js'

const linha = (extra = {}) => ({
  vertente: 'sportsbook',
  familia: 'gols',
  stake: 1000,
  net: 50,
  apostas: 20,
  apostadores: 18,
  ...extra,
})

const muitas = (n, extra) => Array.from({ length: n }, () => linha(extra))

describe('faixaDaOdd', () => {
  it('separa as faixas pelas fronteiras', () => {
    expect(faixaDaOdd(1.2)).toBe('ate-1.5')
    expect(faixaDaOdd(1.5)).toBe('1.5-2.5')
    expect(faixaDaOdd(2.5)).toBe('2.5-4')
    expect(faixaDaOdd(4)).toBe('4-8')
    expect(faixaDaOdd(20)).toBe('acima-8')
  })

  it('odd desconhecida ou inválida não tem faixa', () => {
    // É o estado de todo o histórico anterior à gravação da odd: a dimensão
    // simplesmente não informa, em vez de inventar uma faixa.
    expect(faixaDaOdd(null)).toBeNull()
    expect(faixaDaOdd(0)).toBeNull()
    expect(faixaDaOdd(1)).toBeNull()
    expect(faixaDaOdd('abc')).toBeNull()
  })

  it('toda faixa tem rótulo para a tela', () => {
    expect(FAIXAS_ODD.every((f) => f.label && f.id)).toBe(true)
  })
})

describe('treinar', () => {
  it('mede cada agrupamento e guarda o tamanho da amostra', () => {
    const m = treinar([
      ...muitas(3, { vertente: 'sportsbook', familia: 'gols', stake: 1000 }),
      ...muitas(2, { vertente: 'tipster', familia: 'gols', stake: 5000 }),
    ])
    expect(m.total).toBe(5)
    expect(m.vertenteFamilia.get('sportsbook|gols')).toMatchObject({ n: 3, stake: 1000 })
    expect(m.vertenteFamilia.get('tipster|gols')).toMatchObject({ n: 2, stake: 5000 })
    expect(m.familia.get('gols').n).toBe(5)
  })

  it('conta quantas linhas trazem a odd', () => {
    // Enquanto o Sportbook Vs. Tipster não gravava a odd, isto é zero e a
    // dimensão de faixa fica dormente.
    const m = treinar([linha(), linha({ odd: 2.1 })])
    expect(m.comOdd).toBe(1)
    expect(m.vertenteFamiliaOdd.get('sportsbook|gols|1.5-2.5').n).toBe(1)
  })

  it('descarta linha sem stake numérico', () => {
    expect(treinar([linha(), linha({ stake: null }), null]).total).toBe(1)
  })

  it('histórico vazio não quebra', () => {
    const m = treinar([])
    expect(m.total).toBe(0)
    expect(m.geral.stake).toBeNull()
  })
})

describe('prever', () => {
  it('aprende que a mesma família puxa diferente em cada vertente', () => {
    // É o pedido central: comparar Sportsbook e Tipster. Nada disso está escrito
    // no código — sai do histórico.
    const m = treinar([
      ...muitas(40, { vertente: 'sportsbook', familia: 'gols', stake: 1000 }),
      ...muitas(40, { vertente: 'tipster', familia: 'gols', stake: 9000 }),
    ])
    const sb = prever(m, { vertente: 'sportsbook', familia: 'gols' })
    const tip = prever(m, { vertente: 'tipster', familia: 'gols' })
    expect(tip.stake).toBeGreaterThan(sb.stake * 3)
    expect(sb.nivel.id).toBe('vertente+familia')
  })

  it('a faixa de odd afina a estimativa quando existe', () => {
    const m = treinar([
      ...muitas(30, { familia: 'gols', odd: 1.2, stake: 8000 }),
      ...muitas(30, { familia: 'gols', odd: 6, stake: 500 }),
    ])
    const curta = prever(m, { vertente: 'sportsbook', familia: 'gols', odd: 1.2 })
    const longa = prever(m, { vertente: 'sportsbook', familia: 'gols', odd: 6 })
    expect(curta.stake).toBeGreaterThan(longa.stake)
    expect(curta.nivel.id).toBe('vertente+familia+odd')
  })

  it('sem a odd, para no nível de vertente+família', () => {
    const m = treinar(muitas(20, { familia: 'gols', odd: 2 }))
    expect(prever(m, { vertente: 'sportsbook', familia: 'gols' }).nivel.id).toBe('vertente+familia')
  })

  it('encolhe a célula magra na direção do geral', () => {
    // Uma observação de R$ 50.000 num mar de R$ 1.000 não pode virar a
    // estimativa: com n=1 a célula pesa 1/9.
    const m = treinar([
      ...muitas(60, { familia: 'gols', stake: 1000 }),
      linha({ familia: 'escanteios', stake: 50000 }),
    ])
    const p = prever(m, { vertente: 'sportsbook', familia: 'escanteios' })
    expect(p.stake).toBeLessThan(20000)
    expect(p.stake).toBeGreaterThan(1000)
    expect(p.n).toBe(1)
    expect(p.confianca.id).toBe('baixa')
  })

  it('célula gorda manda quase sozinha', () => {
    const m = treinar([
      ...muitas(60, { familia: 'gols', stake: 1000 }),
      ...muitas(60, { familia: 'escanteios', stake: 9000 }),
    ])
    const p = prever(m, { vertente: 'sportsbook', familia: 'escanteios' })
    expect(p.stake).toBeGreaterThan(8000)
    expect(p.confianca.id).toBe('alta')
  })

  it('família nunca vista cai no que a vertente diz, e avisa o nível', () => {
    const m = treinar(muitas(20, { vertente: 'tipster', familia: 'gols', stake: 3000 }))
    const p = prever(m, { vertente: 'tipster', familia: 'mercado-inedito' })
    expect(p.stake).toBeGreaterThan(0)
    expect(p.nivel.id).toBe('vertente')
  })

  it('devolve o caminho inteiro, do geral ao específico', () => {
    // A tela mostra de onde o número veio: saber que ele saiu da mediana geral,
    // e não de Tipster+escanteios, é a diferença entre confiar e não confiar.
    const m = treinar(muitas(20, { vertente: 'tipster', familia: 'gols', odd: 2, stake: 3000 }))
    const p = prever(m, { vertente: 'tipster', familia: 'gols', odd: 2 })
    expect(p.caminho.map((c) => c.id)).toEqual([
      'geral',
      'vertente',
      'familia',
      'vertente+familia',
      'vertente+familia+odd',
    ])
  })

  it('sem histórico nenhum devolve nulo, não zero', () => {
    const p = prever(treinar([]), { vertente: 'sportsbook', familia: 'gols' })
    expect(p.stake).toBeNull()
    expect(p.confianca.id).toBe('nenhuma')
  })
})

describe('tabelaAprendida', () => {
  it('mostra o que cada vertente respondeu, do maior volume para o menor', () => {
    const m = treinar([
      ...muitas(10, { vertente: 'tipster', familia: 'escanteios', stake: 9000, net: 100 }),
      ...muitas(10, { vertente: 'sportsbook', familia: 'gols', stake: 1000, net: 50 }),
    ])
    const t = tabelaAprendida(m)
    expect(t[0]).toMatchObject({ vertente: 'tipster', familia: 'escanteios', n: 10, stake: 9000 })
    expect(t[1].vertente).toBe('sportsbook')
    expect(t[0].roi).toBeCloseTo(1000 / 90000, 6)
  })

  it('deixa de fora célula abaixo da amostra mínima', () => {
    const m = treinar([
      ...muitas(10, { familia: 'gols' }),
      linha({ familia: 'escanteios', stake: 400 }),
    ])
    expect(tabelaAprendida(m, { minAmostra: 5 }).map((l) => l.familia)).toEqual(['gols'])
  })
})
