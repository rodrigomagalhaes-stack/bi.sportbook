import { describe, expect, it } from 'vitest'
import { familiaDaBoost, familiaDe, rotuloDaFamilia } from './familias.js'

const id = (nome) => familiaDe(nome).id

describe('familiaDe', () => {
  it('reconhece os rótulos do Altenar, com parâmetro e nome de jogador colados', () => {
    // Todos estes saíram do payload de PSG x Monaco.
    expect(id('Vencedor do encontro')).toBe('resultado')
    expect(id('Chance dupla')).toBe('chance-dupla')
    expect(id('Total de gols')).toBe('gols')
    expect(id('Ambas equipes marcam')).toBe('ambas')
    expect(id('Total (mais/menos) Chutes a Gol PSG')).toBe('chutes')
    expect(id('Chutes a Gol - Aleksandr Golovin (ASM)')).toBe('chutes')
    expect(id('Total de escanteios')).toBe('escanteios')
    expect(id('Total cartões')).toBe('cartoes')
    expect(id('Marcador - Khvicha Kvaratskhelia (PSG)')).toBe('marcador')
    expect(id('Resultado Correto')).toBe('placar')
    expect(id('Handicap')).toBe('handicap')
  })

  it('reconhece os mesmos mercados em inglês', () => {
    // Não está garantido em que idioma a planilha de bilhetes exporta.
    expect(id('Match Result')).toBe('resultado')
    expect(id('Both Teams To Score')).toBe('ambas')
    expect(id('Total Goals Over/Under')).toBe('gols')
    expect(id('Corners Over/Under')).toBe('escanteios')
    expect(id('Player Shots On Target')).toBe('chutes')
    expect(id('Anytime Goalscorer')).toBe('marcador')
    expect(id('Correct Score')).toBe('placar')
    expect(id('Asian Handicap')).toBe('handicap')
    expect(id('Double Chance')).toBe('chance-dupla')
  })

  it('ignora acento e caixa', () => {
    expect(id('TOTAL CARTÕES')).toBe('cartoes')
    expect(id('total cartoes')).toBe('cartoes')
  })

  it('deixa o específico ganhar do genérico', () => {
    // "1º tempo - handicap" é handicap, não um balde de primeiro tempo; e
    // "Total de escanteios" é escanteios, não "outros totais".
    expect(id('1º tempo - handicap')).toBe('handicap')
    expect(id('Total de escanteios')).toBe('escanteios')
    expect(id('Total de gols')).toBe('gols')
  })

  it('separa mercado combinado de mercado simples', () => {
    // No site é uma seleção só (boost Single), mas puxa muito menos que o
    // mercado de que leva o nome. Sem família própria, "Total e ambas equipes
    // marcam" herdava o volume do Ambas Marcam simples e dominava o top 5.
    expect(id('Total e ambas equipes marcam')).toBe('combinado')
    expect(id('1x2 e total')).toBe('combinado')
    expect(id('Chance dupla e total 3.5')).toBe('combinado')
    expect(id('1x2 e ambas equipes marcam')).toBe('combinado')
    expect(rotuloDaFamilia('combinado')).toBe('Mercado combinado')
  })

  it('não confunde mercado simples com combinado', () => {
    // "Total de gols" casa em duas famílias (gols e "outros totais") mas não
    // junta dois mercados — o " e " é o que separa um caso do outro.
    expect(id('Total de gols')).toBe('gols')
    expect(id('Ambas equipes marcam')).toBe('ambas')
    expect(id('1º tempo - handicap')).toBe('handicap')
    expect(id('Total de escanteios')).toBe('escanteios')
  })

  it('joga o que não conhece num balde visível, nunca em nulo', () => {
    expect(id('Mercado que ninguém viu ainda')).toBe('outros')
    expect(id('')).toBe('outros')
    expect(id(null)).toBe('outros')
    expect(rotuloDaFamilia('outros')).toBe('Outros mercados')
  })
})

describe('familiaDaBoost', () => {
  it('duas pernas ou mais é múltipla, sem olhar os mercados', () => {
    const legs = [{ market: 'Total cartões' }, { market: 'Total de escanteios' }]
    expect(familiaDaBoost(legs).id).toBe('multipla')
  })

  it('perna única herda a família do mercado dela', () => {
    expect(familiaDaBoost([{ market: 'Total de gols' }]).id).toBe('gols')
  })

  it('bet builder da planilha cai na mesma família das múltiplas', () => {
    // O histórico rotula múltipla como Bet Builder; o Altenar entrega pernas.
    // Os dois precisam cair no mesmo lugar ou a amostra se parte em duas.
    expect(id('Winner with Bet Builder')).toBe('multipla')
    expect(id('Criar Aposta')).toBe('multipla')
  })
})
