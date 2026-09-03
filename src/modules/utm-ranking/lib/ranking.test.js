import { describe, it, expect } from 'vitest'
import {
  acharColunaUsuario,
  acharColunaUtm,
  acharColunaValor,
  contarUtms,
  parseNumero,
  rankingParaMatriz,
} from './ranking.js'

// Cabeçalho do arquivo de segmento que motivou a ferramenta.
const CABECALHO = [
  'user_id', 'utm_source', 'transaction_id', 'ext_ticket_id', 'odd',
  'valor_apostado', 'data_hora_aposta', 'settlement_type',
]

describe('detecção de colunas', () => {
  it('acha utm_source, user_id e valor_apostado no arquivo real', () => {
    expect(acharColunaUtm(CABECALHO)).toBe(1)
    expect(acharColunaUsuario(CABECALHO)).toBe(0)
    expect(acharColunaValor(CABECALHO)).toBe(5)
  })

  it('ignora maiúsculas, espaços e pontuação do cabeçalho', () => {
    expect(acharColunaUtm(['ID', 'UTM Source'])).toBe(1)
    expect(acharColunaUtm(['id', 'utm-source'])).toBe(1)
  })

  it('cai no prefixo quando não há nome exato', () => {
    expect(acharColunaUtm(['id', 'utm_source_final'])).toBe(1)
  })

  it('devolve -1 quando a coluna não existe', () => {
    expect(acharColunaUtm(['id', 'nome'])).toBe(-1)
    expect(acharColunaValor(['id', 'nome'])).toBe(-1)
  })
})

describe('parseNumero', () => {
  it('lê decimal com ponto e com vírgula', () => {
    expect(parseNumero('5.45')).toBe(5.45)
    expect(parseNumero('5,45')).toBe(5.45)
  })

  it('lê valor com milhar e moeda', () => {
    expect(parseNumero('R$ 1.234,50')).toBe(1234.5)
  })

  it('vazio e lixo viram zero', () => {
    expect(parseNumero('')).toBe(0)
    expect(parseNumero(null)).toBe(0)
    expect(parseNumero('abc')).toBe(0)
  })
})

describe('contarUtms', () => {
  const linhas = [
    ['1', '447220', '10.00'],
    ['2', '447220', '5.00'],
    ['1', '447220', '5.00'],
    ['3', '447215', '20.00'],
    ['4', '', '7.00'],
  ]

  it('ordena por número de bilhetes e numera as posições', () => {
    const { ranking } = contarUtms(linhas, { coluna: 1 })
    expect(ranking.map((r) => [r.posicao, r.utm, r.bilhetes])).toEqual([
      [1, '447220', 3],
      [2, '447215', 1],
    ])
  })

  it('separa as linhas sem utm em vez de rankear o vazio', () => {
    const { ranking, resumo } = contarUtms(linhas, { coluna: 1 })
    expect(ranking.some((r) => r.utm === '')).toBe(false)
    expect(resumo).toMatchObject({ linhas: 5, comUtm: 4, semUtm: 1, distintas: 2 })
  })

  it('calcula o percentual sobre os bilhetes com utm', () => {
    const { ranking } = contarUtms(linhas, { coluna: 1 })
    expect(ranking[0].pct).toBeCloseTo(75)
    expect(ranking[1].pct).toBeCloseTo(25)
  })

  it('soma valor apostado e conta jogadores distintos', () => {
    const { ranking, resumo } = contarUtms(linhas, { coluna: 1, colunaUsuario: 0, colunaValor: 2 })
    expect(ranking[0]).toMatchObject({ valor: 20, jogadores: 2 }) // user 1 aparece duas vezes
    expect(resumo.valorTotal).toBe(40) // a linha sem utm não entra
  })

  it('agrupa grafias diferentes e mantém a primeira vista como rótulo', () => {
    const { ranking } = contarUtms([['', 'Google'], ['', 'google'], ['', 'GOOGLE']], { coluna: 1 })
    expect(ranking).toHaveLength(1)
    expect(ranking[0]).toMatchObject({ utm: 'Google', bilhetes: 3 })
  })

  it('respeita a opção de diferenciar maiúsculas', () => {
    const { ranking } = contarUtms([['', 'Google'], ['', 'google']], { coluna: 1, ignorarCaixa: false })
    expect(ranking).toHaveLength(2)
  })

  it('ignora espaços em volta da utm', () => {
    const { ranking } = contarUtms([['', ' 447220 '], ['', '447220']], { coluna: 1 })
    expect(ranking[0].bilhetes).toBe(2)
  })

  it('desempata pelo nome da utm', () => {
    const { ranking } = contarUtms([['', 'b'], ['', 'a']], { coluna: 1 })
    expect(ranking.map((r) => r.utm)).toEqual(['a', 'b'])
  })

  it('mede a concentração do top 5', () => {
    const seis = Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 - i }, () => ['', `utm${i}`])).flat()
    const { resumo } = contarUtms(seis, { coluna: 1 })
    // 5+4+3+2+1 de 21 bilhetes = 71,4%
    expect(resumo.pctTop5).toBeCloseTo((20 / 21) * 100, 1)
  })

  it('arquivo sem nenhuma utm não quebra', () => {
    const { ranking, resumo } = contarUtms([['1', ''], ['2', '']], { coluna: 1 })
    expect(ranking).toEqual([])
    expect(resumo).toMatchObject({ comUtm: 0, semUtm: 2, pctTop5: 0 })
  })
})

describe('rankingParaMatriz', () => {
  const { ranking } = contarUtms([['1', 'a', '10']], { coluna: 1, colunaUsuario: 0, colunaValor: 2 })

  it('exporta só as colunas básicas por padrão', () => {
    const m = rankingParaMatriz(ranking)
    expect(m[0]).toEqual(['posicao', 'utm', 'bilhetes', 'pct_dos_bilhetes'])
    expect(m[1]).toEqual(['1', 'a', '1', '100,00'])
  })

  it('acrescenta jogadores e valor quando o arquivo tem essas colunas', () => {
    const m = rankingParaMatriz(ranking, { comValor: true, comJogadores: true })
    expect(m[0]).toEqual(['posicao', 'utm', 'bilhetes', 'pct_dos_bilhetes', 'jogadores_unicos', 'valor_apostado'])
    expect(m[1]).toEqual(['1', 'a', '1', '100,00', '1', '10,00'])
  })
})
