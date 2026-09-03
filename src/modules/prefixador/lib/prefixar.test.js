import { describe, it, expect } from 'vitest'
import {
  PREFIXO_PADRAO,
  aplicarPrefixo,
  colunaProvavel,
  extrairValores,
  processarLista,
  processarMatriz,
} from './prefixar.js'
import { letraColuna, pareceCabecalho } from '../../../lib/planilha.js'

describe('aplicarPrefixo', () => {
  it('coloca o prefixo antes do número', () => {
    expect(aplicarPrefixo('28435851')).toBe('esportivabetbr_28435851')
  })

  it('não prefixa duas vezes', () => {
    const uma = aplicarPrefixo('28435851')
    expect(aplicarPrefixo(uma)).toBe(uma)
  })

  it('ignora espaços em volta e valor vazio', () => {
    expect(aplicarPrefixo('  28435851 ')).toBe('esportivabetbr_28435851')
    expect(aplicarPrefixo('   ')).toBe('')
    expect(aplicarPrefixo(null)).toBe('')
  })

  it('aceita outro prefixo', () => {
    expect(aplicarPrefixo('123', 'teste_')).toBe('teste_123')
  })
})

describe('extrairValores', () => {
  it('quebra por linha, vírgula, ponto-e-vírgula, tab e espaço', () => {
    expect(extrairValores('1\n2, 3;4\t5 6')).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('descarta linhas em branco e sobras de separador', () => {
    expect(extrairValores('\n\n 10 ,, 20 ;\n')).toEqual(['10', '20'])
  })

  it('texto vazio vira lista vazia', () => {
    expect(extrairValores('')).toEqual([])
    expect(extrairValores(null)).toEqual([])
  })
})

describe('processarLista', () => {
  it('devolve uma linha por valor, numerada', () => {
    const { linhas } = processarLista(['28435851', '28435852'])
    expect(linhas).toHaveLength(2)
    expect(linhas[1]).toMatchObject({ n: 2, original: '28435852', resultado: 'esportivabetbr_28435852' })
  })

  it('remove duplicados quando pedido e conta quantos eram', () => {
    const { linhas, resumo } = processarLista(['1', '2', '1'], { removerDuplicados: true })
    expect(linhas.map((l) => l.original)).toEqual(['1', '2'])
    expect(resumo).toMatchObject({ entradas: 3, saidas: 2, duplicados: 1 })
  })

  it('mantém duplicados quando o usuário desliga a opção', () => {
    const { linhas, resumo } = processarLista(['1', '1'], { removerDuplicados: false })
    expect(linhas).toHaveLength(2)
    expect(linhas[1].duplicado).toBe(true)
    expect(resumo.duplicados).toBe(1)
  })

  it('trata o valor já prefixado como duplicata do número solto', () => {
    const { linhas, resumo } = processarLista(['28435851', `${PREFIXO_PADRAO}28435851`])
    expect(linhas).toHaveLength(1)
    expect(resumo.duplicados).toBe(1)
  })

  it('marca já prefixados sem contá-los como não numéricos', () => {
    const { linhas, resumo } = processarLista([`${PREFIXO_PADRAO}99`])
    expect(linhas[0]).toMatchObject({ jaTinha: true, naoNumerico: false })
    expect(resumo).toMatchObject({ jaPrefixados: 1, naoNumericos: 0 })
  })

  it('sinaliza valor não numérico mas ainda assim prefixa', () => {
    const { linhas, resumo } = processarLista(['abc123'])
    expect(linhas[0]).toMatchObject({ naoNumerico: true, resultado: 'esportivabetbr_abc123' })
    expect(resumo.naoNumericos).toBe(1)
  })
})

describe('processarMatriz', () => {
  const corpo = [
    ['28435851', 'Ana'],
    ['28435852', 'Bruno'],
  ]

  it('cria uma coluna nova logo depois da escolhida', () => {
    const { linhas } = processarMatriz(corpo, { coluna: 0, cabecalho: ['id', 'nome'] })
    expect(linhas[0]).toEqual(['id', 'id_prefixado', 'nome'])
    expect(linhas[1]).toEqual(['28435851', 'esportivabetbr_28435851', 'Ana'])
  })

  it('substitui na própria coluna quando o modo é substituir', () => {
    const { linhas } = processarMatriz(corpo, { coluna: 0, modo: 'substituir' })
    expect(linhas[0]).toEqual(['esportivabetbr_28435851', 'Ana'])
  })

  it('funciona numa coluna do meio', () => {
    const { linhas } = processarMatriz([['a', '77', 'b']], { coluna: 1 })
    expect(linhas[0]).toEqual(['a', '77', 'esportivabetbr_77', 'b'])
  })

  it('pula linhas com a coluna vazia e conta o que fez', () => {
    const { linhas, resumo } = processarMatriz([['1'], [''], ['2']], { coluna: 0 })
    expect(linhas).toHaveLength(2)
    expect(resumo).toMatchObject({ processados: 2, vazios: 1, total: 3 })
  })

  it('não duplica o prefixo em planilha já processada', () => {
    const { linhas } = processarMatriz([[`${PREFIXO_PADRAO}5`]], { coluna: 0, modo: 'substituir' })
    expect(linhas[0]).toEqual([`${PREFIXO_PADRAO}5`])
  })
})

describe('pareceCabecalho', () => {
  it('reconhece a primeira linha de texto acima de dados', () => {
    expect(pareceCabecalho([['id', 'nome'], ['1', 'Ana']])).toBe(true)
  })

  it('não confunde dados com cabeçalho', () => {
    expect(pareceCabecalho([['1'], ['2']])).toBe(false)
  })

  it('uma linha só nunca é cabeçalho', () => {
    expect(pareceCabecalho([['id']])).toBe(false)
    expect(pareceCabecalho([])).toBe(false)
  })
})

describe('colunaProvavel', () => {
  it('escolhe a coluna com mais números', () => {
    expect(colunaProvavel([['Ana', '1'], ['Bruno', '2']])).toBe(1)
  })

  it('conta também os valores já prefixados', () => {
    expect(colunaProvavel([['Ana', `${PREFIXO_PADRAO}1`], ['Bruno', `${PREFIXO_PADRAO}2`]])).toBe(1)
  })

  it('sem linhas, cai na primeira coluna', () => {
    expect(colunaProvavel([])).toBe(0)
  })
})

describe('letraColuna', () => {
  it('numera como planilha', () => {
    expect([0, 1, 25, 26, 27].map(letraColuna)).toEqual(['A', 'B', 'Z', 'AA', 'AB'])
  })
})
