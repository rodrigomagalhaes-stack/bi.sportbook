import { describe, it, expect } from 'vitest'
import {
  dataDoCampo,
  filtrar,
  ordenar,
  periodoPara,
  porTipster,
  resumo,
} from './filtros.js'

const HOJE = '2026-09-08'

// Três bilhetes que exercitam as três datas diferentes: o jogo de domingo, o
// cadastro de segunda, o pagamento de quinta.
const BILHETES = [
  {
    id: '1',
    tipster_chave: 'joão aposta',
    tipster_nome: 'João Aposta',
    stake: 50,
    link_bilhete: 'https://casa.com/b/AAA',
    confronto_fim: '2026-09-06',
    enviado_em: '2026-09-07T13:00:00+00:00',
    status: 'a_pagar',
    bases: [],
  },
  {
    id: '2',
    tipster_chave: 'maria tips',
    tipster_nome: 'Maria Tips',
    stake: 200,
    link_bilhete: 'https://casa.com/b/BBB',
    confronto_fim: '2026-08-30',
    enviado_em: '2026-08-31T13:00:00+00:00',
    pago_em: '2026-09-03T13:00:00+00:00',
    status: 'pago',
    bases: [{ valor_total: 4000, usuarios: 120 }],
  },
  {
    id: '3',
    tipster_chave: 'joão aposta',
    tipster_nome: 'João Aposta',
    stake: 30,
    link_bilhete: 'https://casa.com/b/CCC',
    confronto_fim: '2026-09-20',
    enviado_em: '2026-09-08T13:00:00+00:00',
    status: 'a_pagar',
    bases: [],
  },
]

describe('qual data', () => {
  it('cada campo devolve a data dele', () => {
    expect(dataDoCampo(BILHETES[1], 'confronto')).toBe('2026-08-30')
    expect(dataDoCampo(BILHETES[1], 'cadastro')).toBe('2026-08-31')
    expect(dataDoCampo(BILHETES[1], 'pagamento')).toBe('2026-09-03')
  })

  it('bilhete não pago não tem data de pagamento', () => {
    expect(dataDoCampo(BILHETES[0], 'pagamento')).toBe(null)
  })
})

describe('períodos', () => {
  it('tudo não recorta nada', () => {
    expect(periodoPara('tudo', HOJE)).toBe(null)
  })

  it('7 dias inclui hoje e conta para trás', () => {
    expect(periodoPara('7', HOJE)).toEqual({ de: '2026-09-02', ate: '2026-09-08' })
  })

  it('este mês vai do dia 1 ao último dia do mês', () => {
    expect(periodoPara('mes', HOJE)).toEqual({ de: '2026-09-01', ate: '2026-09-30' })
  })

  it('mês passado atravessa a virada do ano', () => {
    expect(periodoPara('mes-1', '2026-01-15')).toEqual({ de: '2025-12-01', ate: '2025-12-31' })
  })

  it('acerta fevereiro de ano bissexto', () => {
    expect(periodoPara('mes', '2028-02-10')).toEqual({ de: '2028-02-01', ate: '2028-02-29' })
  })
})

describe('filtro', () => {
  it('sem filtro nenhum, devolve tudo', () => {
    expect(filtrar(BILHETES, {}, HOJE)).toHaveLength(3)
  })

  it('a fila junta aguardando e liberado', () => {
    const fila = filtrar(BILHETES, { situacoes: ['aguardando', 'liberado'] }, HOJE)
    expect(fila.map((b) => b.id)).toEqual(['1', '3'])
  })

  it('pendente não entra na fila de pagamento', () => {
    const pendente = { ...BILHETES[0], id: 'p', status: 'pendente' }
    const fila = filtrar([...BILHETES, pendente], { situacoes: ['aguardando', 'liberado'] }, HOJE)
    expect(fila.map((b) => b.id)).toEqual(['1', '3'])
  })

  it('o recorte de data muda de resposta conforme o campo escolhido', () => {
    // O mesmo setembro: por confronto o bilhete 2 fica de fora (jogou em
    // agosto), por pagamento ele entra (o dinheiro saiu em setembro). É
    // exatamente a confusão que o seletor de campo existe para evitar.
    const setembro = { de: '2026-09-01', ate: '2026-09-30' }
    const porConfronto = filtrar(BILHETES, { ...setembro, campoData: 'confronto' }, HOJE)
    const porPagamento = filtrar(BILHETES, { ...setembro, campoData: 'pagamento' }, HOJE)

    expect(porConfronto.map((b) => b.id)).toEqual(['1', '3'])
    expect(porPagamento.map((b) => b.id)).toEqual(['2'])
  })

  it('filtra por tipster', () => {
    expect(filtrar(BILHETES, { tipsters: ['joão aposta'] }, HOJE)).toHaveLength(2)
  })

  it('filtra por faixa de stake', () => {
    expect(filtrar(BILHETES, { stakeMin: 40 }, HOJE).map((b) => b.id)).toEqual(['1', '2'])
    expect(filtrar(BILHETES, { stakeMax: 40 }, HOJE).map((b) => b.id)).toEqual(['3'])
  })

  it('busca sem acento e sem caixa', () => {
    expect(filtrar(BILHETES, { busca: 'joao' }, HOJE)).toHaveLength(2)
    expect(filtrar(BILHETES, { busca: 'JOÃO' }, HOJE)).toHaveLength(2)
  })

  it('busca também no link', () => {
    expect(filtrar(BILHETES, { busca: 'BBB' }, HOJE).map((b) => b.id)).toEqual(['2'])
  })

  it('acha o pago sem base anexada', () => {
    const furado = [{ ...BILHETES[1], bases: [] }]
    expect(filtrar(furado, { apenasSemBase: true }, HOJE)).toHaveLength(1)
    expect(filtrar(BILHETES, { apenasSemBase: true }, HOJE)).toHaveLength(0)
  })
})

describe('ordem', () => {
  it('na fila, o que espera há mais tempo vem primeiro', () => {
    const fila = ordenar(filtrar(BILHETES, { situacoes: ['aguardando', 'liberado'] }, HOJE), 'fila', HOJE)
    expect(fila[0].id).toBe('1')
  })

  it('nos pagos, o mais recente vem primeiro', () => {
    const outro = { ...BILHETES[1], id: '4', pago_em: '2026-09-05T10:00:00+00:00' }
    expect(ordenar([BILHETES[1], outro], 'pagos').map((b) => b.id)).toEqual(['4', '2'])
  })

  it('na caixa Paga, ordena pelo confronto — a mesma data do filtro', () => {
    // Ordenar por data de pagamento aqui embaralharia a lista em relação ao
    // recorte que a produziu, que é por confronto.
    const antigo = { ...BILHETES[1], id: '5', confronto_fim: '2026-07-10' }
    expect(ordenar([antigo, BILHETES[1]], 'confronto').map((b) => b.id)).toEqual(['2', '5'])
  })

  it('nas solicitações, a enviada há mais tempo vem primeiro', () => {
    const nova = { ...BILHETES[0], id: 'n', status: 'pendente', enviado_em: '2026-09-08T10:00:00+00:00' }
    const velha = { ...BILHETES[0], id: 'v', status: 'pendente', enviado_em: '2026-09-02T10:00:00+00:00' }
    expect(ordenar([nova, velha], 'analise').map((b) => b.id)).toEqual(['v', 'n'])
  })
})

describe('totais', () => {
  it('separa aguardando, liberado e pago', () => {
    const r = resumo(BILHETES, HOJE)
    expect(r.total).toBe(3)
    expect(r.aguardando).toBe(1)
    expect(r.liberados).toBe(1)
    expect(r.pagos).toBe(1)
  })

  it('o valor pago vem das bases, e a stake é só referência', () => {
    const r = resumo(BILHETES, HOJE)
    expect(r.pago).toBe(4000)
    expect(r.usuarios).toBe(120)
    // A soma das stakes NÃO é previsão de caixa: é o que os tipsters
    // publicaram, não o que os seguidores apostaram.
    expect(r.stake).toBe(280)
  })

  it('a espera máxima é a idade do bilhete mais antigo da fila', () => {
    expect(resumo(BILHETES, HOJE).esperaMaxima).toBe(2)
  })

  it('conta as solicitações e a idade da mais antiga', () => {
    const p1 = { ...BILHETES[0], id: 'p1', status: 'pendente', enviado_em: new Date(2026, 8, 3, 12).toISOString() }
    const p2 = { ...BILHETES[0], id: 'p2', status: 'pendente', enviado_em: new Date(2026, 8, 7, 12).toISOString() }
    const r = resumo([...BILHETES, p1, p2], HOJE)
    expect(r.pendentes).toBe(2)
    expect(r.analiseMaxima).toBe(5)
    // Pendente não conta como liberado, ainda que o jogo já tenha acabado.
    expect(r.liberados).toBe(1)
  })

  it('quebra por tipster, do que mais recebeu para o que menos', () => {
    const linhas = porTipster(BILHETES, HOJE)
    expect(linhas[0]).toMatchObject({ nome: 'Maria Tips', pago: 4000, usuarios: 120 })
    expect(linhas[1]).toMatchObject({ nome: 'João Aposta', bilhetes: 2, pago: 0 })
  })

  it('junta grafias diferentes do mesmo nome', () => {
    // O nome é digitado a cada cadastro, e é o único agrupamento que existe.
    // Cadastrar "Rodrigo" hoje e "rodrigo" amanhã tem de cair no mesmo tipster;
    // sem isso seriam dois em toda soma, sem como saber depois que eram um só.
    const semChave = [
      { ...BILHETES[0], tipster_chave: undefined, tipster_nome: 'Rodrigo' },
      { ...BILHETES[2], tipster_chave: undefined, tipster_nome: 'rodrigo' },
    ]
    expect(porTipster(semChave, HOJE)).toHaveLength(1)
    expect(resumo(semChave, HOJE).tipsters).toBe(1)
  })

  it('acento e espaço sobrando também não separam', () => {
    const semChave = [
      { ...BILHETES[0], tipster_chave: undefined, tipster_nome: 'João Aposta' },
      { ...BILHETES[2], tipster_chave: undefined, tipster_nome: '  joao  aposta ' },
    ]
    expect(porTipster(semChave, HOJE)).toHaveLength(1)
  })

  it('o rótulo é a primeira grafia vista, não uma terceira inventada', () => {
    const semChave = [
      { ...BILHETES[0], tipster_chave: undefined, tipster_nome: 'João Aposta' },
      { ...BILHETES[2], tipster_chave: undefined, tipster_nome: 'joão aposta' },
    ]
    expect(porTipster(semChave, HOJE)[0].nome).toBe('João Aposta')
  })
})
