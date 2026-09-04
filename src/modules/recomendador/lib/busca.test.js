import { describe, expect, it } from 'vitest'
import { filtrarJogos, idDoTexto } from './busca.js'

describe('idDoTexto', () => {
  it('aceita o ID puro', () => {
    expect(idDoTexto('16462691')).toBe('16462691')
    expect(idDoTexto('  16462691  ')).toBe('16462691')
  })

  it('aceita o final da URL do site', () => {
    // É o formato que quebrou a primeira versão: `/^\d+$/` recusava e a tela
    // ficava no jogo anterior, sem dizer nada.
    expect(idDoTexto('le-16462691')).toBe('16462691')
  })

  it('aceita a URL inteira colada da barra do navegador', () => {
    const url =
      'https://esportiva.bet.br/sports/futebol/brasil/brasileirao-a/bragantino-vs-bahia/le-16462691'
    expect(idDoTexto(url)).toBe('16462691')
  })

  it('pega o último id quando o endereço tem mais de um número', () => {
    expect(idDoTexto('https://x/y/17455117/le-16462691')).toBe('16462691')
  })

  it('ignora número curto, que não é id de evento', () => {
    // "brasileirao-a" e afins não têm número; um "2026" solto também não pode
    // virar id.
    expect(idDoTexto('brasileirao-a 2026')).toBeNull()
    expect(idDoTexto('')).toBeNull()
    expect(idDoTexto(null)).toBeNull()
    expect(idDoTexto('sem numero nenhum')).toBeNull()
  })
})

describe('filtrarJogos', () => {
  const jogos = [
    { eventId: 1, eventName: 'Remo vs. Flamengo', champName: 'Brasileirão A', categoryName: 'Brasil', qtdBoosts: 0 },
    { eventId: 2, eventName: 'Independiente del Valle vs. Flamengo', champName: 'Libertadores', categoryName: 'América do Sul', qtdBoosts: 3 },
    { eventId: 3, eventName: 'Ferroviária (F) vs. Flamengo RJ (F)', champName: 'Brasileirão A1 Feminino', categoryName: 'Brasil', qtdBoosts: 0 },
    { eventId: 4, eventName: 'PSG vs. Monaco', champName: 'Ligue 1', categoryName: 'França', qtdBoosts: 5 },
  ]

  it('sem termo, devolve tudo', () => {
    expect(filtrarJogos(jogos)).toHaveLength(4)
  })

  it('acha por time', () => {
    expect(filtrarJogos(jogos, { busca: 'flamengo' })).toHaveLength(3)
  })

  it('exige TODOS os termos, que é o que separa um Flamengo do outro', () => {
    const r = filtrarJogos(jogos, { busca: 'flamengo libertadores' })
    expect(r).toHaveLength(1)
    expect(r[0].eventId).toBe(2)
  })

  it('acha por campeonato e por país', () => {
    expect(filtrarJogos(jogos, { busca: 'ligue' })[0].eventId).toBe(4)
    expect(filtrarJogos(jogos, { busca: 'frança' })[0].eventId).toBe(4)
  })

  it('ignora acento nos dois lados', () => {
    expect(filtrarJogos(jogos, { busca: 'franca' })[0].eventId).toBe(4)
    expect(filtrarJogos(jogos, { busca: 'BRASILEIRAO' })).toHaveLength(2)
  })

  it('filtra por quem já tem boost no ar', () => {
    const r = filtrarJogos(jogos, { soComBoost: true })
    expect(r.map((j) => j.eventId)).toEqual([2, 4])
  })

  it('combina busca e filtro de boost', () => {
    const r = filtrarJogos(jogos, { busca: 'flamengo', soComBoost: true })
    expect(r).toHaveLength(1)
    expect(r[0].eventId).toBe(2)
  })
})
