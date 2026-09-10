import Papa from 'papaparse'
import XLSX from 'xlsx-js-style'

// Conversor de mão dupla: o que chega planilha sai csv, o que chega texto sai
// xlsx. A direção nunca é escolhida na tela — ela é a oposta do que subiu.
const PLANILHA = ['xlsx', 'xls', 'xlsm', 'xlsb', 'ods']
const TEXTO = ['csv', 'txt', 'tsv']

export const FORMATOS_ACEITOS = [...PLANILHA, ...TEXTO].map((e) => `.${e}`).join(',')

// Ponto-e-vírgula primeiro: é o que o Excel em português espera ao abrir um
// csv com dois cliques. Vírgula quebra a planilha em uma coluna só.
export const SEPARADORES = [
  { id: ';', label: 'Ponto-e-vírgula  ;', dica: 'abre direto no Excel em português' },
  { id: ',', label: 'Vírgula  ,', dica: 'padrão de quem vai ler o arquivo por código' },
  { id: '\t', label: 'Tabulação', dica: 'colar direto numa planilha' },
  { id: '|', label: 'Barra vertical  |', dica: 'quando o texto já tem vírgula e ponto-e-vírgula' },
]

export function extensao(nome) {
  const partes = String(nome ?? '').split('.')
  return partes.length > 1 ? partes.pop().toLowerCase() : ''
}

export function nomeBase(nome) {
  return String(nome ?? '').replace(/\.[^.]+$/, '').trim() || 'arquivo'
}

// A extensão de saída, ou null se for um arquivo que não sabemos converter.
export function destinoDe(nome) {
  const ext = extensao(nome)
  if (PLANILHA.includes(ext)) return 'csv'
  if (TEXTO.includes(ext)) return 'xlsx'
  return null
}

export async function lerArquivo(file) {
  const nome = file?.name ?? 'arquivo'
  const destino = destinoDe(nome)
  if (!destino) {
    const ext = extensao(nome)
    throw new Error(
      `Não sei converter ${ext ? `arquivo .${ext}` : 'esse arquivo'} — mande um .xlsx, .xls, .csv ou .txt.`,
    )
  }
  return destino === 'csv' ? dePlanilha(file, nome) : deTexto(file, nome)
}

async function dePlanilha(file, nome) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })

  // `raw: false` entrega a célula como ela aparece na tela do Excel: o id não
  // vira 2,84359e+07, a data não vira 45905 e o zero à esquerda continua lá.
  const abas = wb.SheetNames.map((nomeAba) => ({
    nome: nomeAba,
    linhas: normalizar(
      XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], {
        header: 1,
        raw: false,
        defval: '',
        blankrows: true,
      }),
    ),
  })).filter((a) => a.linhas.length)

  if (!abas.length) throw new Error('A planilha subiu, mas nenhuma aba tem conteúdo.')
  return { nome, origem: extensao(nome), destino: 'csv', abas }
}

async function deTexto(file, nome) {
  const { texto, codificacao } = decodificar(await file.arrayBuffer())

  // Duas passadas de propósito. O Papa adivinha o separador comparando quantas
  // colunas cada linha tem, e a linha em branco do fim do arquivo (todo csv
  // tem) estraga essa conta — com ela, "id;valor" é lido como uma coluna só.
  // A primeira passada descobre o separador ignorando linhas vazias; a segunda
  // lê o arquivo inteiro, aí sim com as linhas em branco do meio preservadas.
  const amostra = Papa.parse(texto, { header: false, skipEmptyLines: true, preview: 20 })
  const separador = amostra.errors?.some((e) => e.code === 'UndetectableDelimiter')
    ? ''
    : (amostra.meta?.delimiter ?? '')

  const { data } = Papa.parse(texto, {
    header: false,
    skipEmptyLines: false,
    ...(separador ? { delimiter: separador } : {}),
  })
  const linhas = normalizar(data)
  if (!linhas.length) throw new Error('O arquivo não tem nenhuma linha com conteúdo.')

  return {
    nome,
    origem: extensao(nome),
    destino: 'xlsx',
    codificacao,
    separadorOrigem: separador,
    abas: [{ nome: nomeDeAba(nomeBase(nome)), linhas }],
  }
}

// Toda leitura passa por aqui: célula sempre string (sem aparar o conteúdo,
// que numa conversão é dado), linhas em branco do fim descartadas e todas as
// linhas com a mesma largura — csv torto vira planilha torta.
export function normalizar(linhas) {
  const matriz = (linhas ?? []).map((l) => (Array.isArray(l) ? l.map((c) => String(c ?? '')) : []))
  while (matriz.length && matriz[matriz.length - 1].every((c) => c.trim() === '')) matriz.pop()
  const largura = matriz.reduce((m, l) => Math.max(m, l.length), 0)
  return matriz.map((l) => Array.from({ length: largura }, (_, i) => l[i] ?? ''))
}

// O csv não diz em que codificação foi salvo. UTF-8 com `fatal` serve de
// teste: se o arquivo não for UTF-8 válido, o decode estoura e caímos no
// Windows-1252 que o Excel em português usa — sem isso "Ação" chega "A��o".
export function decodificar(buffer) {
  const bytes = new Uint8Array(buffer)
  const semBom =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes

  try {
    return { texto: new TextDecoder('utf-8', { fatal: true }).decode(semBom), codificacao: 'UTF-8' }
  } catch {
    return { texto: new TextDecoder('windows-1252').decode(semBom), codificacao: 'Windows-1252' }
  }
}

const NUMERO = /^-?\d+(\.\d+)?$/
const NUMERO_BR = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/
const DECIMAL_BR = /^-?\d+,\d+$/

// Converte a célula em número **só** quando isso não perde informação. O que
// fica de fora é de propósito: zero à esquerda (00123 é código, não número) e
// mais de 15 dígitos (além da precisão do Excel, o id perderia o final).
export function comoNumero(valor) {
  const v = String(valor ?? '').trim()
  if (!v) return null
  if (/^-?0\d/.test(v)) return null

  const digitos = v.replace(/\D/g, '')
  if (!digitos || digitos.length > 15) return null

  if (NUMERO.test(v)) return Number(v)
  if (NUMERO_BR.test(v)) return Number(v.replace(/\./g, '').replace(',', '.'))
  if (DECIMAL_BR.test(v)) return Number(v.replace(',', '.'))
  return null
}

// Matriz de strings → matriz pronta para o aoa_to_sheet. O que continua string
// o Excel guarda como texto, e é isso que mantém o id inteiro.
export function celulasDaMatriz(linhas, { numeros = true } = {}) {
  return linhas.map((l) =>
    l.map((c) => {
      if (!numeros) return String(c ?? '')
      const n = comoNumero(c)
      return n === null ? String(c ?? '') : n
    }),
  )
}

export function contarNumericas(linhas) {
  return linhas.reduce((total, l) => total + l.filter((c) => comoNumero(c) !== null).length, 0)
}

// O Excel recusa aba com > 31 caracteres ou com : \ / ? * [ ].
export function nomeDeAba(nome) {
  const limpo = String(nome ?? '').replace(/[[\]:*?/\\]/g, '-').trim()
  return limpo.slice(0, 31) || 'Planilha'
}

export function nomeDeArquivo(base, extensao) {
  const limpo = String(base ?? '').replace(/[\\/:*?"<>|]/g, '-').trim()
  return `${limpo || 'arquivo'}.${extensao}`
}

export function rotuloSeparador(sep) {
  if (!sep) return '—'
  return SEPARADORES.find((s) => s.id === sep)?.label ?? (sep === '\t' ? 'Tabulação' : `"${sep}"`)
}
