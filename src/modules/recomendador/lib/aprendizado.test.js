import { describe, expect, it } from 'vitest'
import {
  FAIXAS_ODD,
  chaveConfronto,
  faixaDaOdd,
  prever,
  preverFator,
  tabelaAprendida,
  treinar,
} from './aprendizado.js'

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
    // Enquanto o Controle de Boost não gravava a odd, isto é zero e a
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

describe('chaveConfronto', () => {
  it('é a mesma com o mando invertido', () => {
    // Senão cada clássico vira dois baldes de uma amostra cada.
    expect(chaveConfronto(['Flamengo', 'Corinthians'])).toBe(
      chaveConfronto(['Corinthians', 'Flamengo']),
    )
  })

  it('ignora acento e caixa', () => {
    expect(chaveConfronto(['Grêmio', 'Vasco'])).toBe(chaveConfronto(['GREMIO', 'vasco']))
  })
})

describe('preverFator', () => {
  const jogo = (event, stake, n) =>
    Array.from({ length: n }, () => linha({ event, stake }))

  // Cada jogo contra um adversário diferente: assim o time junta amostra e o
  // CONFRONTO não, que é o caso de um time grande na temporada normal.
  const temporada = (time, stake, n) =>
    Array.from({ length: n }, (_, i) => linha({ event: `${time} vs. Adversario ${i}`, stake }))

  it('aprende o porte de cada time separado', () => {
    const m = treinar([
      ...temporada('Flamengo', 40000, 30),
      ...temporada('Remo', 2000, 30),
    ])
    // Confronto que nunca aconteceu — o caso normal de uma rodada nova. Só o
    // nível de time tem o que dizer.
    const grande = preverFator(m, ['Flamengo', 'Estreante FC'])
    const pequeno = preverFator(m, ['Remo', 'Estreante FC'])
    expect(grande.fator).toBeGreaterThan(pequeno.fator * 2)
    expect(grande.nivel.id).toBe('times')
  })

  it('combina os dois times pela média geométrica, não pela aritmética', () => {
    // Um time de 2× com um de 0,5× tem de dar 1×. A média aritmética daria
    // 1,25× e inflaria todo jogo de time grande contra time pequeno.
    const m = treinar([
      ...jogo('Gigante vs. Neutro', 4000, 60),
      ...jogo('Anao vs. Neutro', 1000, 60),
      ...jogo('Neutro vs. Outro', 2000, 60),
    ])
    const f = preverFator(m, ['Gigante', 'Anao'])
    const aritmetica = (2 + 0.5) / 2
    expect(f.fator).toBeLessThan(aritmetica)
  })

  it('o confronto exato refina o que os times sozinhos diziam', () => {
    // Clássico que se repete tem público próprio, acima do que os dois times
    // explicariam separados.
    const m = treinar([
      ...jogo('Flamengo vs. Neutro', 10000, 40),
      ...jogo('Corinthians vs. Neutro', 10000, 40),
      ...jogo('Neutro vs. Outro', 10000, 40),
      ...jogo('Flamengo vs. Corinthians', 90000, 20),
    ])
    const semClassico = preverFator(m, ['Flamengo', 'Neutro'])
    const classico = preverFator(m, ['Flamengo', 'Corinthians'])
    expect(classico.fator).toBeGreaterThan(semClassico.fator * 2)
    expect(classico.nivel.id).toBe('confronto')
  })

  it('confronto raro quase não move o fator', () => {
    const m = treinar([
      ...jogo('Flamengo vs. Neutro', 10000, 40),
      ...jogo('Corinthians vs. Neutro', 10000, 40),
      linha({ event: 'Flamengo vs. Corinthians', stake: 900000 }),
    ])
    const f = preverFator(m, ['Flamengo', 'Corinthians'])
    expect(f.fator).toBeLessThan(4)
  })

  it('time sem histórico não empurra o fator para lado nenhum', () => {
    const m = treinar([
      ...jogo('Flamengo vs. Neutro', 40000, 30),
      ...jogo('Neutro vs. Outro', 10000, 30),
    ])
    const f = preverFator(m, ['Flamengo', 'Time Inedito FC'])
    expect(f.fator).toBeGreaterThan(1)
    expect(f.times.find((t) => t.nome === 'Time Inedito FC').fator).toBe(1)
  })

  it('acha o time mesmo com o nome escrito um pouco diferente', () => {
    const m = treinar(jogo('Real Madrid vs. Neutro', 40000, 30))
    expect(preverFator(m, ['Real Madrid CF', 'Neutro']).n).toBeGreaterThan(0)
  })

  it('nome curto não casa por continência', () => {
    // "PSG" dentro de qualquer nome que o contenha juntaria times diferentes.
    const m = treinar(jogo('Bahia vs. Neutro', 40000, 30))
    const f = preverFator(m, ['AB', 'Neutro'])
    expect(f.times.find((t) => t.nome === 'AB').n).toBe(0)
  })

  it('sem histórico, ou sem dois times, o fator é 1', () => {
    expect(preverFator(treinar([]), ['A', 'B']).fator).toBe(1)
    expect(preverFator(treinar(muitas(10)), ['So um time']).fator).toBe(1)
  })
})
