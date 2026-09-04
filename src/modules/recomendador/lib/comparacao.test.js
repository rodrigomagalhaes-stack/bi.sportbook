import { describe, expect, it } from 'vitest'
import { apurar, compartilhamento, mesmoEvento, naoMarcadas, resumo } from './comparacao.js'

const dica = (extra = {}) => ({
  id: 'x',
  event_name: 'Bahia vs. Bragantino',
  familia: 'gols',
  mercado: 'Total de gols',
  selecao: 'Mais de 2.5',
  prev_volume: 10000,
  prev_margem: 0.04,
  prev_resultado: 400,
  prev_amostra: 20,
  ...extra,
})

const linha = (extra = {}) => ({
  date: '2026-09-05',
  event: 'Bahia vs. Bragantino',
  market: 'Total Goals Over/Under',
  familia: 'gols',
  stake: 12000,
  net: 500,
  apostas: 90,
  apostadores: 70,
  vertente: 'sportsbook',
  ...extra,
})

describe('mesmoEvento', () => {
  it('casa o nome idêntico', () => {
    expect(mesmoEvento('Bahia vs. Bragantino', 'Bahia vs. Bragantino')).toBe(true)
  })

  it('ignora pontuação e acento entre as duas exportações', () => {
    expect(mesmoEvento('Bahia vs. Bragantino', 'Bahia vs Bragantino')).toBe(true)
    expect(mesmoEvento('Grêmio vs. Vasco', 'Gremio vs. Vasco')).toBe(true)
  })

  it('casa pelos times quando o nome inteiro não bate', () => {
    expect(mesmoEvento('PSG vs. Monaco', 'PSG vs. AS Monaco')).toBe(true)
  })

  it('nome curto exige igualdade, não contém', () => {
    // "Bahia" contém "a": com inclusão solta, um time de uma letra casaria com
    // meio calendário. E "PSG" casaria com qualquer nome que o contenha.
    expect(mesmoEvento('Bahia vs. Bragantino', 'A vs. B')).toBe(false)
    expect(mesmoEvento('PSG vs. Monaco', 'PSG vs. Monaco')).toBe(true)
  })

  it('não casa jogo diferente', () => {
    expect(mesmoEvento('Bahia vs. Bragantino', 'Bahia vs. Fortaleza')).toBe(false)
    expect(mesmoEvento('PSG vs. Monaco', 'Monaco vs. Lens')).toBe(false)
  })

  it('exige os DOIS times, não um só', () => {
    // Casar por um time só juntaria dois jogos diferentes do mesmo mandante.
    expect(mesmoEvento('Real Madrid vs. Betis', 'Real Madrid vs. Barcelona')).toBe(false)
  })

  it('aguenta nome vazio', () => {
    expect(mesmoEvento('', 'Bahia vs. Bragantino')).toBe(false)
    expect(mesmoEvento(null, null)).toBe(false)
  })
})

describe('apurar', () => {
  it('cruza por jogo e família, não por nome de mercado', () => {
    // O Altenar diz "Total de gols" e a planilha diz "Total Goals Over/Under".
    const [r] = apurar([dica()], [linha()])
    expect(r.status).toBe('apurada')
    expect(r.realizado.stake).toBe(12000)
    expect(r.realizado.net).toBe(500)
  })

  it('soma as várias linhas da mesma família no jogo', () => {
    const [r] = apurar([dica()], [linha(), linha({ market: 'Total de gols 1º tempo', stake: 3000, net: -200 })])
    expect(r.realizado.stake).toBe(15000)
    expect(r.realizado.net).toBe(300)
    expect(r.realizado.linhas).toBe(2)
  })

  it('mede o erro de volume como realizado ÷ previsto', () => {
    const [r] = apurar([dica({ prev_volume: 6000 })], [linha({ stake: 12000 })])
    expect(r.erroVolume).toBe(2) // puxou o dobro do previsto
  })

  it('fica aguardando enquanto o dia não foi importado', () => {
    const [r] = apurar([dica()], [linha({ event: 'Outro vs. Jogo' })])
    expect(r.status).toBe('aguardando')
    expect(r.realizado).toBeNull()
  })

  it('separa "o dia veio mas a família não apareceu" de "ainda não veio"', () => {
    // O jogo foi importado, mas nenhuma boost de gols rodou nele.
    const [r] = apurar([dica()], [linha({ familia: 'escanteios' })])
    expect(r.status).toBe('nao-apareceu')
  })

  it('não divide por zero quando a dica não tinha volume previsto', () => {
    const [r] = apurar([dica({ prev_volume: null })], [linha()])
    expect(r.status).toBe('apurada')
    expect(r.erroVolume).toBeNull()
  })
})

describe('resumo', () => {
  it('usa mediana no erro de volume, para um jogo grande não dominar', () => {
    const apuradas = apurar(
      [
        dica({ id: 'a', prev_volume: 1000 }),
        dica({ id: 'b', event_name: 'Cuiabá vs. Goiás', prev_volume: 1000 }),
        dica({ id: 'c', event_name: 'Flamengo vs. Corinthians', prev_volume: 1000 }),
      ],
      [
        linha({ stake: 1000 }),
        linha({ event: 'Cuiabá vs. Goiás', stake: 1200 }),
        linha({ event: 'Flamengo vs. Corinthians', stake: 50000 }), // o clássico
      ],
    )
    const r = resumo(apuradas)
    expect(r.erroVolumeMediano).toBe(1.2) // e não os ~17 que a média daria
    expect(r.amostraVolume).toBe(3)
  })

  it('conta os três estados separadamente', () => {
    const apuradas = apurar(
      [dica({ id: 'a' }), dica({ id: 'b', familia: 'escanteios' }), dica({ id: 'c', event_name: 'Ceará vs. Sport' })],
      [linha()],
    )
    const r = resumo(apuradas)
    expect(r.apuradas).toBe(1)
    expect(r.naoApareceram).toBe(1)
    expect(r.aguardando).toBe(1)
    expect(r.total).toBe(3)
  })

  it('soma previsto e realizado só do que fechou', () => {
    const apuradas = apurar([dica({ prev_resultado: 400 })], [linha({ net: 500 })])
    const r = resumo(apuradas)
    expect(r.previstoTotal).toBe(400)
    expect(r.realizadoTotal).toBe(500)
  })

  it('não conta duas vezes o mesmo mercado realizado', () => {
    // Marcar "Bragantino" e "Empate" é marcar duas seleções do MESMO mercado.
    // As duas casam com a mesma linha do boost_days; somar as duas contaria o
    // stake daquele mercado em dobro.
    const duas = [
      dica({ id: 'a', familia: 'resultado', selecao: 'Bragantino', prev_volume: 35000, prev_resultado: 28 }),
      dica({ id: 'b', familia: 'resultado', selecao: 'Empate', prev_volume: 35000, prev_resultado: 27 }),
    ]
    const linhas = [linha({ familia: 'resultado', market: 'Match Result', stake: 44000, net: -2600 })]
    const apuradas = apurar(duas, linhas)

    // Cada dica continua enxergando o realizado do mercado dela...
    expect(apuradas.every((a) => a.realizado.stake === 44000)).toBe(true)
    // ...mas o placar conta uma vez só.
    const r = resumo(apuradas)
    expect(r.realizadoTotal).toBe(-2600)
    expect(r.stakeRealizadoTotal).toBe(44000)
    expect(r.previstoTotal).toBe(28)
    expect(r.amostraVolume).toBe(1)
  })

  it('conta separadamente mercados diferentes do mesmo jogo', () => {
    const duas = [
      dica({ id: 'a', familia: 'resultado' }),
      dica({ id: 'b', familia: 'escanteios' }),
    ]
    const linhas = [
      linha({ familia: 'resultado', stake: 40000, net: 100 }),
      linha({ familia: 'escanteios', stake: 9000, net: 700 }),
    ]
    const r = resumo(apurar(duas, linhas))
    expect(r.stakeRealizadoTotal).toBe(49000)
    expect(r.realizadoTotal).toBe(800)
  })

  it('lista vazia não quebra', () => {
    const r = resumo([])
    expect(r.total).toBe(0)
    expect(r.erroVolumeMediano).toBeNull()
  })
})

describe('naoMarcadas', () => {
  it('devolve as boosts que rodaram no jogo sem terem sido marcadas', () => {
    // É a contraprova: sem ela o placar só vê o que o recomendador indicou.
    const linhas = [
      linha(),
      linha({ market: 'Corners', familia: 'escanteios', stake: 30000, net: 2000 }),
      linha({ market: 'Cards', familia: 'cartoes', stake: 4000, net: -100 }),
    ]
    const fora = naoMarcadas([dica()], linhas)
    expect(fora.map((l) => l.familia)).toEqual(['escanteios', 'cartoes'])
    expect(fora[0].stake).toBe(30000) // ordenado pelo maior volume
  })

  it('ignora jogos em que nada foi marcado', () => {
    const linhas = [linha({ event: 'Outro vs. Jogo', familia: 'escanteios' })]
    expect(naoMarcadas([dica()], linhas)).toHaveLength(0)
  })

  it('sem dicas, não há contraprova a fazer', () => {
    expect(naoMarcadas([], [linha()])).toHaveLength(0)
  })
})

describe('compartilhamento', () => {
  it('conta quantas dicas dividem cada linha realizada', () => {
    const duas = [
      dica({ id: 'a', familia: 'resultado', selecao: 'Bragantino' }),
      dica({ id: 'b', familia: 'resultado', selecao: 'Empate' }),
      dica({ id: 'c', familia: 'escanteios', selecao: 'Mais de 9.5' }),
    ]
    const linhas = [linha({ familia: 'resultado' }), linha({ familia: 'escanteios' })]
    const c = compartilhamento(apurar(duas, linhas))
    expect([...c.values()].sort()).toEqual([1, 2])
  })
})
