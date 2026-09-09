import { describe, it, expect } from 'vitest'
import {
  diaLocal,
  diasEntre,
  diasNaFila,
  formatarDia,
  hojeISO,
  semBase,
  situacao,
  usuariosPagos,
  valorPago,
} from './situacao.js'

const HOJE = '2026-09-08'

const bilhete = (extra = {}) => ({
  status: 'a_pagar',
  confronto_fim: '2026-09-06',
  stake: 100,
  bases: [],
  ...extra,
})

describe('datas', () => {
  it('lê a data local, e não a UTC', () => {
    // 8 de setembro às 21h em Brasília já é dia 9 em UTC. Se a tela usasse
    // toISOString, este pagamento cairia no dia seguinte — e na virada do mês,
    // no mês seguinte.
    const noite = new Date(2026, 8, 8, 21, 30)
    expect(diaLocal(noite)).toBe('2026-09-08')
  })

  it('devolve nulo para data inválida em vez de "Invalid Date"', () => {
    expect(diaLocal('nada disso')).toBe(null)
  })

  it('conta dias inteiros entre duas datas', () => {
    expect(diasEntre('2026-09-06', '2026-09-08')).toBe(2)
    expect(diasEntre('2026-09-08', '2026-09-08')).toBe(0)
  })

  it('atravessa a virada do mês e do ano', () => {
    expect(diasEntre('2026-08-30', '2026-09-02')).toBe(3)
    expect(diasEntre('2025-12-30', '2026-01-02')).toBe(3)
  })

  it('não erra por um dia na virada do horário de verão', () => {
    // A conta é feita ao meio-dia UTC justamente para o dia de 23h (ou de 25h)
    // não arredondar para o lado errado.
    expect(diasEntre('2026-02-14', '2026-02-16')).toBe(2)
    expect(diasEntre('2026-10-17', '2026-10-19')).toBe(2)
  })

  it('formata para o padrão brasileiro e aguenta vazio', () => {
    expect(formatarDia('2026-09-08')).toBe('08/09/2026')
    expect(formatarDia(null)).toBe('—')
  })

  it('hojeISO sai no mesmo formato que o banco devolve', () => {
    expect(hojeISO(new Date(2026, 8, 8))).toBe('2026-09-08')
  })
})

describe('situação', () => {
  it('jogo já encerrado vira liberado para pagar', () => {
    expect(situacao(bilhete({ confronto_fim: '2026-09-06' }), HOJE)).toBe('liberado')
  })

  it('jogo de hoje ainda é aguardando', () => {
    // Durante o próprio dia do confronto o bilhete não resolveu. Pagar antes é
    // dinheiro que sai errado; esperar é só esperar.
    expect(situacao(bilhete({ confronto_fim: HOJE }), HOJE)).toBe('aguardando')
  })

  it('jogo futuro é aguardando', () => {
    expect(situacao(bilhete({ confronto_fim: '2026-09-20' }), HOJE)).toBe('aguardando')
  })

  it('pago e recusado vêm do banco e ignoram a data', () => {
    const pago = bilhete({ status: 'pago', confronto_fim: '2026-12-01' })
    expect(situacao(pago, HOJE)).toBe('pago')
    expect(situacao(bilhete({ status: 'recusado' }), HOJE)).toBe('recusado')
  })
})

describe('espera na fila', () => {
  it('conta os dias desde o fim do confronto', () => {
    expect(diasNaFila(bilhete({ confronto_fim: '2026-09-01' }), HOJE)).toBe(7)
  })

  it('quem ainda não pode ser pago não está esperando', () => {
    expect(diasNaFila(bilhete({ confronto_fim: '2026-09-20' }), HOJE)).toBe(0)
    expect(diasNaFila(bilhete({ status: 'pago' }), HOJE)).toBe(0)
  })
})

describe('o que já foi pago', () => {
  it('soma todas as bases anexadas, não só a última', () => {
    const b = bilhete({
      status: 'pago',
      bases: [
        { valor_total: 1200.5, usuarios: 30 },
        { valor_total: 300, usuarios: 8 },
      ],
    })
    expect(valorPago(b)).toBeCloseTo(1500.5, 2)
    expect(usuariosPagos(b)).toBe(38)
  })

  it('bilhete sem base soma zero, sem quebrar', () => {
    expect(valorPago(bilhete())).toBe(0)
    expect(usuariosPagos({})).toBe(0)
  })

  it('acusa o pago sem base anexada', () => {
    expect(semBase(bilhete({ status: 'pago' }))).toBe(true)
    expect(semBase(bilhete({ status: 'pago', bases: [{ valor_total: 10 }] }))).toBe(false)
    // A pagar sem base é o estado normal, não um furo.
    expect(semBase(bilhete())).toBe(false)
  })
})
