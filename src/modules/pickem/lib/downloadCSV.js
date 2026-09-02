export function downloadCSV(filename, rows, columns, headers) {
  const sep = ';'
  const head = (headers || columns).join(sep)
  const body = rows.map((r) =>
    columns.map((c) => {
      const v = r[c] ?? ''
      // Só coloca aspas se tiver ponto-e-vírgula ou quebra de linha
      return String(v).includes(sep) || String(v).includes('\n') ? `"${String(v).replace(/"/g, '""')}"` : String(v)
    }).join(sep)
  ).join('\n')

  // BOM UTF-8 para Excel reconhecer acentos
  const bom = '﻿'
  const blob = new Blob([bom + head + '\n' + body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
