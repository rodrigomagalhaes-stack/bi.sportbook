import Papa from 'papaparse'
import XLSX from 'xlsx-js-style'

// Lê csv/txt/xlsx sempre para o mesmo formato — matriz de strings, sem
// cabeçalho assumido. Quem decide se a primeira linha é cabeçalho é a tela
// (ver `pareceCabecalho`), porque a planilha do parceiro nem sempre traz um.
export async function lerArquivo(file) {
  const nome = file?.name ?? 'arquivo'
  const ext = nome.split('.').pop().toLowerCase()

  const linhas = ext === 'xlsx' || ext === 'xls' ? await lerPlanilha(file) : await lerTexto(file)

  // Descarta linhas totalmente vazias (o Excel adora exportar algumas no fim).
  const limpas = linhas.filter((l) => l.some((c) => String(c ?? '').trim() !== ''))
  if (!limpas.length) throw new Error('O arquivo não tem nenhuma linha com conteúdo.')

  const largura = Math.max(...limpas.map((l) => l.length))
  return {
    nome,
    linhas: limpas.map((l) => Array.from({ length: largura }, (_, i) => String(l[i] ?? '').trim())),
  }
}

function lerTexto(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      // Deixa o Papa descobrir se é vírgula, ponto-e-vírgula ou tab.
      complete: ({ data }) => resolve(data),
      error: reject,
    })
  })
}

async function lerPlanilha(file) {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const aba = wb.Sheets[wb.SheetNames[0]]
  if (!aba) throw new Error('A planilha não tem nenhuma aba.')
  // `raw: false` mantém os ids como texto: nada de 2,84359e+07 nem de perder
  // zero à esquerda no caminho.
  return XLSX.utils.sheet_to_json(aba, { header: 1, raw: false, defval: '' })
}

const soDigitos = (v) => /^\d+$/.test(v)

// Heurística de cabeçalho: só faz sentido se houver mais de uma linha e a
// primeira não parecer dado (nenhuma célula puramente numérica).
export function pareceCabecalho(linhas) {
  if (!Array.isArray(linhas) || linhas.length < 2) return false
  const primeira = linhas[0].map((c) => String(c ?? '').trim()).filter(Boolean)
  if (primeira.length === 0) return false
  return primeira.every((c) => !soDigitos(c))
}

// Nome de coluna no estilo planilha: 0 → A, 25 → Z, 26 → AA.
export function letraColuna(indice) {
  let n = indice
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}
