import { describe, it, expect } from 'vitest'
import XLSX from 'xlsx-js-style'
import { montarAba, textoCSV } from './exportar.js'

// Escreve e lê de volta: é o único jeito de ver o que o Excel veria, porque a
// lib só funde estilo e formato numérico na hora de gerar o arquivo.
function comoOExcelVe(linhas, opcoes) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, montarAba(linhas, opcoes), 'T')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return XLSX.read(buf, { type: 'buffer', cellNF: true }).Sheets.T
}

const COM_CABECALHO = [
  ['PlayerId', 'Jogador', 'Stake'],
  ['00123', 'João Conceição', 10.5],
  [28435851, 'Silva, Maria', 1234.56],
  ['00987', 'Ana Souza', 7],
]

describe('montarAba', () => {
  it('destaca o cabeçalho e põe o filtro sobre a faixa inteira', () => {
    const aba = montarAba(COM_CABECALHO)
    expect(aba.A1.s.font.bold).toBe(true)
    expect(aba.C1.s.fill.fgColor.rgb).toBe('FFFF3D00')
    expect(aba['!autofilter']).toEqual({ ref: 'A1:C4' })
    expect(aba['!cols']).toHaveLength(3)
  })

  it('não inventa cabeçalho quando a primeira linha é dado', () => {
    const aba = montarAba([
      ['00123', 'João', 10.5],
      ['00124', 'Ana', 11],
    ])
    expect(aba.A1.s).toBeUndefined()
    expect(aba['!autofilter']).toBeUndefined()
  })

  it('aceita a decisão de quem chama, contra a heurística', () => {
    const aba = montarAba(COM_CABECALHO, { cabecalho: false })
    expect(aba.A1.s?.font?.bold).toBeUndefined()
    expect(aba['!autofilter']).toBeUndefined()
  })

  it('formata milhar e decimal só na coluna que tem decimal', () => {
    const aba = montarAba(COM_CABECALHO)
    expect(aba.C2.z).toBe('#,##0.00') // stake: tem 10,5 na coluna
    expect(aba.C4.z).toBe('#,##0.00') // o inteiro 7 acompanha a coluna dele
    expect(aba.A3.z).toBeUndefined() // id é inteiro: nada de 28.435.851
  })

  it('listra as linhas de dado, uma sim uma não', () => {
    const aba = montarAba(COM_CABECALHO)
    expect(aba.A2.s).toBeUndefined()
    expect(aba.A3.s.fill.fgColor.rgb).toBe('FFF7F5F3')
    expect(aba.A4.s).toBeUndefined()
  })

  it('com formatar desligado sai a matriz crua, só com as larguras', () => {
    const aba = montarAba(COM_CABECALHO, { formatar: false })
    expect(aba.A1.s).toBeUndefined()
    expect(aba.C2.z).toBeUndefined()
    expect(aba['!autofilter']).toBeUndefined()
    expect(aba['!cols']).toHaveLength(3)
  })

  it('não estoura com matriz vazia nem com linha mais curta', () => {
    expect(() => montarAba([])).not.toThrow()
    const aba = montarAba([['a', 'b'], ['só uma']])
    expect(aba['!cols']).toHaveLength(2)
  })
})

describe('o arquivo que o Excel abre', () => {
  it('id na linha listrada não herda o formato da coluna de valor ao lado', () => {
    // A ordem importa: com um objeto de estilo compartilhado, a coluna de
    // valor contaminava a de id e o 28435852 aparecia como 28.435.852,00.
    const aba = comoOExcelVe([
      ['Stake', 'PlayerId'],
      [10.5, 28435851],
      [1234.56, 28435852],
    ])
    expect(aba.B3.w).toBe('28435852')
    expect(aba.A3.z).toBe('#,##0.00')
  })

  it('o id em texto chega inteiro, com o zero à esquerda', () => {
    const aba = comoOExcelVe([['PlayerId'], ['00123'], ['004509871234567890']])
    expect(aba.A2.w).toBe('00123')
    expect(aba.A3.w).toBe('004509871234567890')
  })
})

describe('textoCSV', () => {
  it('respeita o separador na hora de decidir a aspa', () => {
    expect(textoCSV([['a;b', 'c']], ',')).toBe('a;b,c')
    expect(textoCSV([['a;b', 'c']], ';')).toBe('"a;b";c')
  })
})
