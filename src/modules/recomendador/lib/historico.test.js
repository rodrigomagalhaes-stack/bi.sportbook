import { describe, expect, it } from 'vitest'
import { achatar, diagnostico, fatorDoJogo, mediana, timesDe } from './historico.js'

const dia = (date, boosts) => ({ date, boosts })
const linha = (event, market, stake, extra = {}) => ({
  event,
  market,
  stake,
  total: 10,
  userCount: 8,
  net: stake * 0.05,
  ...extra,
})

describe('achatar', () => {
  it('vira uma linha por boost, com o dia e a família junto', () => {
    const linhas = achatar([
      dia('2026-08-01', [linha('PSG vs. Monaco', 'Total de gols', 1000)]),
      dia('2026-08-02', [linha('Ipswich vs. Liverpool', 'Total de escanteios', 500)]),
    ])
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toMatchObject({ date: '2026-08-01', familia: 'gols', stake: 1000 })
    expect(linhas[1].familia).toBe('escanteios')
  })

  it('descarta linha sem evento e aguenta dia sem boosts', () => {
    const linhas = achatar([dia('2026-08-01', [{ market: 'Total de gols' }]), dia('2026-08-02', null)])
    expect(linhas).toHaveLength(0)
  })

  it('leva a odd quando o dia foi importado depois de ela passar a ser gravada', () => {
    const linhas = achatar([
      dia('2026-09-05', [linha('A vs. B', 'Total de gols', 100, { odd: 2.1 })]),
      dia('2026-09-04', [linha('C vs. D', 'Total de gols', 100)]),
    ])
    expect(linhas[0].odd).toBe(2.1)
    expect(linhas[1].odd).toBeNull() // dia antigo: a dimensão não informa nada
  })

  it('lê a vertente nos dois formatos, com Sportsbook de padrão', () => {
    const linhas = achatar([
      dia('2026-08-01', [
        linha('A vs. B', 'Total de gols', 1, { cat: 'welcome' }),
        linha('A vs. B', 'Total de gols', 1, { tipster: true }),
        linha('A vs. B', 'Total de gols', 1),
      ]),
    ])
    expect(linhas.map((l) => l.vertente)).toEqual(['welcome', 'tipster', 'sportsbook'])
  })
})

describe('mediana', () => {
  it('pega o do meio em lista ímpar e a média dos dois em lista par', () => {
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([1, 2, 3, 4])).toBe(2.5)
  })

  it('não se deixa levar por um valor gigante, como a média se deixaria', () => {
    // É o caso que motiva usar mediana: um clássico entre jogos comuns.
    expect(mediana([100, 120, 110, 90, 500000])).toBe(110)
  })

  it('lista vazia é zero', () => {
    expect(mediana([])).toBe(0)
    expect(mediana(null)).toBe(0)
  })
})

describe('timesDe', () => {
  it('aceita os separadores que as exportações usam', () => {
    expect(timesDe('PSG vs. Monaco')).toEqual(['PSG', 'Monaco'])
    expect(timesDe('PSG vs Monaco')).toEqual(['PSG', 'Monaco'])
    expect(timesDe('PSG x Monaco')).toEqual(['PSG', 'Monaco'])
    expect(timesDe('PSG - Monaco')).toEqual(['PSG', 'Monaco'])
  })

  it('não parte nome de time que contém o separador', () => {
    // "Racing de Córdoba" tem um "de", não um separador; e o x de "Ajax" não
    // pode virar divisor.
    expect(timesDe('Defensores de Belgrano vs. Racing de Córdoba')).toEqual([
      'Defensores de Belgrano',
      'Racing de Córdoba',
    ])
    expect(timesDe('Ajax vs. Feyenoord')).toEqual(['Ajax', 'Feyenoord'])
  })

  it('o hífen dentro do nome do clube perde para o vs.', () => {
    // Caso real do calendário: com o hífen no mesmo nível do `vs.`, este jogo
    // partia em três e o time errado ia para a busca de histórico.
    expect(timesDe('FC Tatran Presov vs. FC Vion Zlate Moravce - Vrable')).toEqual([
      'FC Tatran Presov',
      'FC Vion Zlate Moravce - Vrable',
    ])
  })

  it('nome que não parte em dois volta inteiro, não em pedaços', () => {
    expect(timesDe('Evento 17487710')).toEqual(['Evento 17487710'])
    expect(timesDe('')).toEqual([])
  })
})

describe('fatorDoJogo', () => {
  const muitasLinhas = (evento, stake, n) =>
    Array.from({ length: n }, () => linha(evento, 'Total de gols', stake))

  it('acha os times mesmo com o nome escrito diferente', () => {
    const linhas = achatar([dia('2026-08-01', muitasLinhas('PSG vs. Lens', 500, 3))])
    const { n } = fatorDoJogo(linhas, ['PSG', 'Monaco'])
    expect(n).toBe(3)
  })

  it('sobe quando os times deste jogo puxam mais que o normal', () => {
    const linhas = achatar([
      dia('2026-08-01', [
        ...muitasLinhas('PSG vs. Lens', 1000, 20),
        ...muitasLinhas('Lorient vs. Brest', 100, 20),
      ]),
    ])
    const { fator } = fatorDoJogo(linhas, ['PSG', 'Monaco'])
    expect(fator).toBeGreaterThan(1.5)
  })

  it('encolhe na direção de 1 quando a amostra é curta', () => {
    // Um jogo só do time, com stake dez vezes a mediana, não pode multiplicar
    // a estimativa por dez.
    const linhas = achatar([
      dia('2026-08-01', [
        linha('PSG vs. Lens', 'Total de gols', 10000),
        ...muitasLinhas('Lorient vs. Brest', 1000, 20),
      ]),
    ])
    const { fator, n } = fatorDoJogo(linhas, ['PSG'])
    expect(n).toBe(1)
    expect(fator).toBeLessThan(3)
    expect(fator).toBeGreaterThan(1)
  })

  it('vale 1 quando não há histórico nenhum dos times', () => {
    const linhas = achatar([dia('2026-08-01', muitasLinhas('Lorient vs. Brest', 100, 5))])
    expect(fatorDoJogo(linhas, ['PSG', 'Monaco']).fator).toBe(1)
    expect(fatorDoJogo([], ['PSG']).fator).toBe(1)
    expect(fatorDoJogo(linhas, []).fator).toBe(1)
  })
})

describe('diagnostico', () => {
  it('conta o que o classificador não soube nomear e lista os rótulos', () => {
    const linhas = achatar([
      dia('2026-08-01', [
        linha('A vs. B', 'Total de gols', 1),
        linha('C vs. D', 'Mercado desconhecido', 1),
        linha('E vs. F', 'Mercado desconhecido', 1),
      ]),
    ])
    const d = diagnostico(linhas)
    expect(d.total).toBe(3)
    expect(d.classificadas).toBe(1)
    expect(d.pctClassificadas).toBe(33)
    expect(d.naoClassificados[0]).toEqual({ market: 'Mercado desconhecido', n: 2 })
  })
})
