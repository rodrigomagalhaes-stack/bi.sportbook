// `xlsx-js-style` é o SheetJS 0.18.5 da comunidade com uma coisa a mais: a
// propriedade `s` da célula, que vira negrito, cor e borda no arquivo. O
// SheetJS de origem escreve uma fonte e uma borda fixas, então com ele o
// cabeçalho sairia igual ao resto. Congelar a primeira linha continua fora do
// alcance dos dois (nenhum escreve o `<pane>` da planilha).
import XLSX from 'xlsx-js-style'
import { pareceCabecalho } from './planilha.js'

// Cada célula recebe o **seu** objeto de estilo, e não uma referência a um
// modelo compartilhado: na hora de escrever, a lib funde o formato numérico
// (`z`) dentro do estilo da célula. Com um objeto só para todas, o `#,##0.00`
// da coluna de valor vazava para a coluna de id da mesma listra e o
// 28435851 saía como 28.435.851,00.
//
// O laranja é o da marca, o mesmo `--accent` do portal, com o texto em branco.
const estiloCabecalho = () => ({
  font: { bold: true, sz: 11, color: { rgb: 'FFFFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: 'FFFF3D00' } },
  alignment: { vertical: 'center' },
  border: { bottom: { style: 'thin', color: { rgb: 'FFE03400' } } },
})

const estiloZebra = () => ({ fill: { patternType: 'solid', fgColor: { rgb: 'FFF7F5F3' } } })

// Acima disso a listra deixa de compensar: são dezenas de milhares de células
// carregando estilo para um arquivo que ninguém vai ler rolando com o olho.
const LIMITE_ZEBRA = 20000

// Baixa uma matriz como .xlsx, formatada. `cabecalho`: 'auto' decide pela
// própria primeira linha (ver `pareceCabecalho`), true/false forçam.
export function baixarXLSX(nomeArquivo, linhas, nomeAba = 'Prefixados', opcoes = {}) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, montarAba(linhas, opcoes), nomeAba.slice(0, 31))
  XLSX.writeFile(wb, nomeArquivo)
}

export function montarAba(linhas, { cabecalho = 'auto', formatar = true } = {}) {
  const aba = XLSX.utils.aoa_to_sheet(linhas)
  aba['!cols'] = larguras(linhas)
  if (!formatar || !linhas.length) return aba

  const largura = Math.max(...linhas.map((l) => l.length), 1)
  const temCabecalho = cabecalho === 'auto' ? pareceCabecalho(linhas) : Boolean(cabecalho)
  const primeira = temCabecalho ? 1 : 0

  if (temCabecalho) {
    aba['!rows'] = [{ hpt: 21 }]
    // O filtro no cabeçalho é o que transforma a exportação em algo que dá
    // para trabalhar sem antes formatar a mão.
    aba['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: linhas.length - 1, c: largura - 1 },
      }),
    }
    for (let c = 0; c < largura; c++) {
      const celula = aba[XLSX.utils.encode_cell({ r: 0, c })]
      if (celula) celula.s = estiloCabecalho()
    }
  }

  const formatos = formatosDeColuna(linhas, primeira, largura)
  const zebra = linhas.length <= LIMITE_ZEBRA

  for (let r = primeira; r < linhas.length; r++) {
    for (let c = 0; c < largura; c++) {
      const celula = aba[XLSX.utils.encode_cell({ r, c })]
      if (!celula) continue
      if (formatos[c] && celula.t === 'n') celula.z = formatos[c]
      if (zebra && (r - primeira) % 2 === 1) celula.s = estiloZebra()
    }
  }

  return aba
}

// Milhar e duas casas só na coluna que realmente tem decimal. Coluna de id é
// de inteiros e fica em General de propósito: com `#,##0` o 28435851 apareceria
// como 28.435.851, que não é o id de ninguém.
function formatosDeColuna(linhas, primeira, largura) {
  const corpo = linhas.slice(primeira)
  return Array.from({ length: largura }, (_, c) =>
    corpo.some((l) => typeof l[c] === 'number' && !Number.isInteger(l[c])) ? '#,##0.00' : null,
  )
}

// Matriz → texto csv. Aspas só onde precisam existir: célula que tem o
// separador, aspas ou quebra de linha dentro.
export function textoCSV(linhas, separador = ';') {
  return linhas
    .map((l) =>
      l
        .map((c) => {
          const v = String(c ?? '')
          return v.includes(separador) || v.includes('"') || v.includes('\n') || v.includes('\r')
            ? `"${v.replace(/"/g, '""')}"`
            : v
        })
        .join(separador),
    )
    .join('\r\n')
}

// `bom`: o Excel só acerta os acentos de um csv UTF-8 quando o arquivo começa
// com o BOM — mas o BOM atrapalha quem for ler o csv por código, daí a opção.
export function baixarCSV(nomeArquivo, linhas, { separador = ';', bom = true } = {}) {
  const texto = textoCSV(linhas, separador)
  baixarBlob(
    nomeArquivo,
    new Blob([bom ? '﻿' + texto : texto], { type: 'text/csv;charset=utf-8;' }),
  )
}

export function baixarTXT(nomeArquivo, texto) {
  baixarBlob(nomeArquivo, new Blob([texto], { type: 'text/plain;charset=utf-8;' }))
}

function baixarBlob(nomeArquivo, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  URL.revokeObjectURL(url)
}

function larguras(linhas) {
  const largura = Math.max(...linhas.map((l) => l.length), 1)
  return Array.from({ length: largura }, (_, c) => {
    const max = linhas.reduce((m, l) => Math.max(m, String(l[c] ?? '').length), 8)
    return { wch: Math.min(max + 2, 46) }
  })
}

// Clipboard só existe em contexto seguro; o textarea escondido cobre o resto.
export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}

// esportivabetbr_lista_2026-09-03.xlsx
export function nomeComData(base, extensao) {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${base}_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.${extensao}`
}
