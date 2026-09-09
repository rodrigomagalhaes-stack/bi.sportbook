import { describe, it, expect } from 'vitest'
import { acharColunaUsuario, acharColunaValor, montarLinhas, parseNumero } from './base.js'

describe('detecção de colunas', () => {
  it('acha o jogador e o valor num cabeçalho típico de base paga', () => {
    const cab = ['user_id', 'nome', 'valor_reembolso', 'data']
    expect(acharColunaUsuario(cab)).toBe(0)
    expect(acharColunaValor(cab)).toBe(2)
  })

  it('ignora caixa, espaço e pontuação', () => {
    expect(acharColunaUsuario(['CPF', 'Valor Pago'])).toBe(0)
    expect(acharColunaValor(['CPF', 'Valor Pago'])).toBe(1)
  })

  it('devolve -1 quando não reconhece, para a tela pedir a escolha', () => {
    expect(acharColunaUsuario(['coluna a', 'coluna b'])).toBe(-1)
    expect(acharColunaUsuario(null)).toBe(-1)
  })
})

describe('números', () => {
  it('lê os dois formatos que saem do mesmo relatório', () => {
    expect(parseNumero('1.234,56')).toBeCloseTo(1234.56, 2)
    expect(parseNumero('1234.56')).toBeCloseTo(1234.56, 2)
    expect(parseNumero('R$ 50,00')).toBeCloseTo(50, 2)
  })

  it('vazio e lixo viram zero, não NaN', () => {
    expect(parseNumero('')).toBe(0)
    expect(parseNumero('—')).toBe(0)
    expect(parseNumero(null)).toBe(0)
  })
})

describe('montagem das linhas', () => {
  const CORPO = [
    ['1001', '25,00'],
    ['1002', '10,50'],
    ['', '99,00'],
    ['1001', '25,00'],
  ]

  it('descarta linha sem jogador e conta quantas foram', () => {
    const { linhas, resumo } = montarLinhas(CORPO, { colUsuario: 0, colValor: 1 })
    expect(linhas).toHaveLength(3)
    expect(resumo.semUsuario).toBe(1)
    expect(resumo.total).toBe(4)
  })

  it('soma o valor e conta usuários distintos', () => {
    const { resumo } = montarLinhas(CORPO, { colUsuario: 0, colValor: 1 })
    expect(resumo.valorTotal).toBeCloseTo(60.5, 2)
    expect(resumo.usuarios).toBe(2)
    expect(resumo.validas).toBe(3)
  })

  it('acusa o mesmo jogador repetido dentro do arquivo', () => {
    // Dois reembolsos para a mesma pessoa pelo mesmo bilhete. Dá para pegar
    // antes de o dinheiro sair, e é por isso que o número aparece na conferência.
    expect(montarLinhas(CORPO, { colUsuario: 0, colValor: 1 }).resumo.repetidos).toBe(1)
  })

  it('sem coluna de valor, o valor fica nulo em vez de zero', () => {
    const { linhas, resumo } = montarLinhas(CORPO, { colUsuario: 0 })
    expect(linhas[0].valor).toBe(null)
    expect(resumo.comValor).toBe(false)
    expect(resumo.valorTotal).toBe(0)
  })

  it('guarda a posição no arquivo, contando o cabeçalho', () => {
    // A conferência sempre termina com alguém abrindo o CSV para achar uma
    // pessoa; a linha precisa bater com a que o Excel mostra.
    const { linhas } = montarLinhas(CORPO, { colUsuario: 0, colValor: 1, deslocamento: 1 })
    expect(linhas[0].linha).toBe(2)
  })
})
