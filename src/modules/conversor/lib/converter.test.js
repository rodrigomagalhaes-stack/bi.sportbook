import { describe, it, expect } from 'vitest'
import XLSX from 'xlsx-js-style'
import {
  celulasDaMatriz,
  comoNumero,
  contarNumericas,
  decodificar,
  destinoDe,
  extensao,
  lerArquivo,
  nomeBase,
  nomeDeAba,
  nomeDeArquivo,
  normalizar,
} from './converter.js'
import { textoCSV } from '../../../lib/exportar.js'

const arquivo = (nome, conteudo, tipo = 'text/csv') => new File([conteudo], nome, { type: tipo })

describe('destinoDe', () => {
  it('planilha vira csv e texto vira xlsx', () => {
    expect(destinoDe('relatorio.xlsx')).toBe('csv')
    expect(destinoDe('antigo.XLS')).toBe('csv')
    expect(destinoDe('bilhetes.csv')).toBe('xlsx')
    expect(destinoDe('lista.txt')).toBe('xlsx')
  })

  it('não converte o que não sabe converter', () => {
    expect(destinoDe('contrato.pdf')).toBe(null)
    expect(destinoDe('sem-extensao')).toBe(null)
  })

  it('lê a extensão e o nome sem ela', () => {
    expect(extensao('a.b.xlsx')).toBe('xlsx')
    expect(nomeBase('relatorio.final.csv')).toBe('relatorio.final')
    expect(nomeBase('')).toBe('arquivo')
  })
})

describe('normalizar', () => {
  it('deixa todas as linhas com a mesma largura', () => {
    expect(normalizar([['a'], ['b', 'c', 'd']])).toEqual([
      ['a', '', ''],
      ['b', 'c', 'd'],
    ])
  })

  it('descarta as linhas vazias do fim e mantém as do meio', () => {
    expect(normalizar([['a'], [''], ['b'], [''], ['']])).toEqual([['a'], [''], ['b']])
  })

  it('não apara o conteúdo da célula', () => {
    expect(normalizar([[' com espaço ']])).toEqual([[' com espaço ']])
  })
})

describe('comoNumero', () => {
  it('reconhece número simples e decimal', () => {
    expect(comoNumero('42')).toBe(42)
    expect(comoNumero('-3.5')).toBe(-3.5)
    expect(comoNumero(' 10 ')).toBe(10)
  })

  it('entende o formato brasileiro', () => {
    expect(comoNumero('1.234,56')).toBe(1234.56)
    expect(comoNumero('2,75')).toBe(2.75)
  })

  it('mantém como texto o que perderia informação', () => {
    expect(comoNumero('00123')).toBe(null) // zero à esquerda é código
    expect(comoNumero('1234567890123456789')).toBe(null) // além da precisão do Excel
    expect(comoNumero('R$ 10,50')).toBe(null)
    expect(comoNumero('2026-09-10')).toBe(null)
    expect(comoNumero('esportivabetbr_28435851')).toBe(null)
    expect(comoNumero('')).toBe(null)
    expect(comoNumero(null)).toBe(null)
  })
})

describe('celulasDaMatriz', () => {
  const linhas = [
    ['id', 'valor'],
    ['00123', '1.234,56'],
    ['28435851', '7'],
  ]

  it('converte só o que é seguro converter', () => {
    expect(celulasDaMatriz(linhas)).toEqual([
      ['id', 'valor'],
      ['00123', 1234.56],
      [28435851, 7],
    ])
  })

  it('com a opção desligada tudo continua texto', () => {
    expect(celulasDaMatriz(linhas, { numeros: false })).toEqual(linhas)
  })

  it('conta quantas células virariam número', () => {
    expect(contarNumericas(linhas)).toBe(3)
  })
})

describe('decodificar', () => {
  it('lê UTF-8 e tira o BOM que o Excel escreve', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Ação;1')])
    expect(decodificar(bytes.buffer)).toEqual({ texto: 'Ação;1', codificacao: 'UTF-8' })
  })

  it('cai para Windows-1252 quando o arquivo não é UTF-8 válido', () => {
    // "Ação;1" como o Excel em português salva.
    const bytes = new Uint8Array([0x41, 0xe7, 0xe3, 0x6f, 0x3b, 0x31])
    expect(decodificar(bytes.buffer)).toEqual({ texto: 'Ação;1', codificacao: 'Windows-1252' })
  })
})

describe('nomes de saída', () => {
  it('corta o nome da aba no que o Excel aceita', () => {
    expect(nomeDeAba('base/2026:relatório?')).toBe('base-2026-relatório-')
    expect(nomeDeAba('x'.repeat(40))).toHaveLength(31)
    expect(nomeDeAba('   ')).toBe('Planilha')
  })

  it('troca o que o sistema de arquivos não aceita', () => {
    expect(nomeDeArquivo('bilhetes 09/2026', 'csv')).toBe('bilhetes 09-2026.csv')
  })
})

describe('lerArquivo', () => {
  it('csv vira uma aba pronta para virar xlsx', async () => {
    const lido = await lerArquivo(arquivo('bilhetes.csv', 'id;valor\r\n00123;10\r\n'))
    expect(lido).toMatchObject({ destino: 'xlsx', origem: 'csv', codificacao: 'UTF-8' })
    expect(lido.separadorOrigem).toBe(';')
    expect(lido.abas).toHaveLength(1)
    expect(lido.abas[0]).toMatchObject({
      nome: 'bilhetes',
      linhas: [
        ['id', 'valor'],
        ['00123', '10'],
      ],
    })
  })

  it('xlsx vira uma aba por planilha, com o id inteiro', async () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['id'], ['28435851']]), 'Jogadores')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['total'], [7]]), 'Resumo')
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })

    const lido = await lerArquivo(arquivo('base.xlsx', buffer, ''))
    expect(lido.destino).toBe('csv')
    expect(lido.abas.map((a) => a.nome)).toEqual(['Jogadores', 'Resumo'])
    expect(lido.abas[0].linhas).toEqual([['id'], ['28435851']])
  })

  it('recusa o que não sabe converter', async () => {
    await expect(lerArquivo(arquivo('contrato.pdf', 'x'))).rejects.toThrow(/\.pdf/)
  })

  it('recusa o csv sem nenhuma linha', async () => {
    await expect(lerArquivo(arquivo('vazio.csv', '\r\n\r\n'))).rejects.toThrow(/nenhuma linha/)
  })
})

describe('textoCSV', () => {
  it('usa o separador escolhido e só põe aspas onde precisa', () => {
    const linhas = [
      ['id', 'nome'],
      ['1', 'Silva, João'],
      ['2', 'diz "oi"'],
    ]
    expect(textoCSV(linhas, ';')).toBe('id;nome\r\n1;Silva, João\r\n2;"diz ""oi"""')
    expect(textoCSV(linhas, ',')).toBe('id,nome\r\n1,"Silva, João"\r\n2,"diz ""oi"""')
  })

  it('quebra de linha dentro da célula sai entre aspas', () => {
    expect(textoCSV([['a\nb', 'c']], ';')).toBe('"a\nb";c')
  })
})
