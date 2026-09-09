import { describe, it, expect } from 'vitest'
import { acharColunaUsuario, montarLinhas, valorDaBase } from './base.js'

describe('detecção da coluna do jogador', () => {
  it('acha o cabeçalho da base real', () => {
    // O arquivo que a operação exporta hoje: PlayerId e uma coluna Amount que
    // chega vazia em todas as linhas.
    expect(acharColunaUsuario(['PlayerId', 'Amount'])).toBe(0)
  })

  it('ignora caixa, espaço e pontuação', () => {
    expect(acharColunaUsuario(['CPF', 'nome'])).toBe(0)
    expect(acharColunaUsuario(['nome', 'user_id'])).toBe(1)
  })

  it('devolve -1 quando não reconhece, para a tela pedir a escolha', () => {
    expect(acharColunaUsuario(['coluna a', 'coluna b'])).toBe(-1)
    expect(acharColunaUsuario(null)).toBe(-1)
  })
})

describe('valor da base', () => {
  it('é a stake do bilhete vezes quantos receberam', () => {
    // O caso real: 34 jogadores num bilhete de R$ 30,00.
    expect(valorDaBase(30, 34)).toBe(1020)
  })

  it('arredonda em centavos', () => {
    // 10.10 * 3 dá 30.299999999999997 em ponto flutuante, e este número vira o
    // total que o financeiro confere.
    expect(valorDaBase(10.1, 3)).toBe(30.3)
  })

  it('base vazia não vira pagamento', () => {
    expect(valorDaBase(30, 0)).toBe(0)
    expect(valorDaBase(null, 5)).toBe(0)
  })
})

describe('montagem das linhas', () => {
  const CORPO = [
    ['esportivabetbr_001', ''],
    ['esportivabetbr_002', ''],
    ['', ''],
    ['ESPORTIVABETBR_001', ''],
  ]

  it('descarta linha sem jogador e conta quantas foram', () => {
    const { linhas, resumo } = montarLinhas(CORPO, { colUsuario: 0 })
    expect(resumo.total).toBe(4)
    expect(resumo.semUsuario).toBe(1)
    expect(linhas).toHaveLength(2)
  })

  it('o mesmo jogador entra uma vez só', () => {
    // Com o valor vindo da stake, um ID repetido no arquivo seria a mesma
    // pessoa reembolsada duas vezes pelo mesmo bilhete, e o total sairia maior
    // que o devido.
    const { linhas, resumo } = montarLinhas(CORPO, { colUsuario: 0 })
    expect(resumo.jogadores).toBe(2)
    expect(resumo.repetidos).toBe(1)
    expect(linhas.map((l) => l.usuario)).toEqual(['esportivabetbr_001', 'esportivabetbr_002'])
  })

  it('guarda a posição no arquivo, contando o cabeçalho', () => {
    // A conferência sempre termina com alguém abrindo o CSV para achar uma
    // pessoa; a linha precisa bater com a que o Excel mostra.
    const { linhas } = montarLinhas(CORPO, { colUsuario: 0, deslocamento: 1 })
    expect(linhas[0].linha).toBe(2)
    expect(linhas[1].linha).toBe(3)
  })

  it('arquivo vazio não quebra', () => {
    expect(montarLinhas([], { colUsuario: 0 }).linhas).toEqual([])
    expect(montarLinhas(null, { colUsuario: 0 }).resumo.jogadores).toBe(0)
  })
})
