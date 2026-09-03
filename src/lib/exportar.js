import * as XLSX from 'xlsx'

// Baixa uma matriz (primeira linha = cabeçalho) como .xlsx.
export function baixarXLSX(nomeArquivo, linhas, nomeAba = 'Prefixados') {
  const aba = XLSX.utils.aoa_to_sheet(linhas)
  aba['!cols'] = larguras(linhas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, aba, nomeAba.slice(0, 31))
  XLSX.writeFile(wb, nomeArquivo)
}

export function baixarCSV(nomeArquivo, linhas) {
  const sep = ';'
  const texto = linhas
    .map((l) =>
      l
        .map((c) => {
          const v = String(c ?? '')
          return v.includes(sep) || v.includes('"') || v.includes('\n')
            ? `"${v.replace(/"/g, '""')}"`
            : v
        })
        .join(sep),
    )
    .join('\r\n')

  // BOM para o Excel abrir os acentos certos.
  baixarBlob(nomeArquivo, new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8;' }))
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
