// Regras do prefixador. Tudo aqui é função pura: a tela só chama e desenha,
// e os testes cobrem os casos de borda sem montar componente nenhum.

export const PREFIXO_PADRAO = 'esportivabetbr_'

// A lista colada vem de qualquer lugar (Excel, Sheets, bloco de notas, chat),
// então qualquer separador comum serve: quebra de linha, tab, vírgula,
// ponto-e-vírgula, barra vertical ou espaço.
export function extrairValores(texto) {
  return String(texto ?? '')
    .split(/[\s,;|]+/)
    .map((v) => v.trim())
    .filter(Boolean)
}

// Idempotente de propósito: rodar duas vezes na mesma lista não gera
// `esportivabetbr_esportivabetbr_28435851`.
export function aplicarPrefixo(valor, prefixo = PREFIXO_PADRAO) {
  const v = String(valor ?? '').trim()
  if (!v) return ''
  return v.startsWith(prefixo) ? v : prefixo + v
}

const soDigitos = (v) => /^\d+$/.test(v)

// Processa a lista já separada e devolve as linhas da tabela + o resumo que
// aparece nos indicadores do topo.
export function processarLista(valores, opcoes = {}) {
  const { prefixo = PREFIXO_PADRAO, removerDuplicados = true } = opcoes

  const vistos = new Set()
  const linhas = []
  let duplicados = 0
  let jaPrefixados = 0
  let naoNumericos = 0

  for (const bruto of valores) {
    const original = String(bruto ?? '').trim()
    if (!original) continue

    const resultado = aplicarPrefixo(original, prefixo)
    const duplicado = vistos.has(resultado)
    if (duplicado) duplicados++
    else vistos.add(resultado)

    if (duplicado && removerDuplicados) continue

    const jaTinha = prefixo !== '' && original.startsWith(prefixo)
    if (jaTinha) jaPrefixados++

    // O miolo é o que sobra depois do prefixo: é ele que precisa ser número,
    // não o valor inteiro (senão todo valor já prefixado cairia como suspeito).
    const miolo = jaTinha ? original.slice(prefixo.length) : original
    const naoNumerico = !soDigitos(miolo)
    if (naoNumerico) naoNumericos++

    linhas.push({
      n: linhas.length + 1,
      original,
      resultado,
      jaTinha,
      duplicado,
      naoNumerico,
    })
  }

  return {
    linhas,
    resumo: {
      entradas: valores.filter((v) => String(v ?? '').trim()).length,
      saidas: linhas.length,
      unicos: vistos.size,
      duplicados,
      jaPrefixados,
      naoNumericos,
    },
  }
}

// ── Planilhas ───────────────────────────────────────────────────────────────

// Aplica o prefixo numa coluna de uma matriz (linhas × colunas), devolvendo
// uma nova matriz. `modo` decide se o resultado substitui a coluna original
// ou entra numa coluna nova ao lado dela.
export function processarMatriz(linhas, opcoes = {}) {
  const {
    coluna = 0,
    prefixo = PREFIXO_PADRAO,
    modo = 'nova',
    nomeNovaColuna = 'id_prefixado',
    cabecalho = null,
    ignorarVazios = true,
  } = opcoes

  const saida = []
  let processados = 0
  let vazios = 0

  if (cabecalho) {
    const linha = [...cabecalho]
    if (modo === 'nova') linha.splice(coluna + 1, 0, nomeNovaColuna)
    saida.push(linha)
  }

  for (const original of linhas) {
    const celula = String(original[coluna] ?? '').trim()
    if (!celula && ignorarVazios) { vazios++; continue }

    const valor = aplicarPrefixo(celula, prefixo)
    if (celula) processados++

    const linha = [...original]
    if (modo === 'nova') linha.splice(coluna + 1, 0, valor)
    else linha[coluna] = valor
    saida.push(linha)
  }

  return { linhas: saida, resumo: { processados, vazios, total: linhas.length } }
}

// Coluna sugerida: a que tem mais células só de dígitos (ou já prefixadas).
export function colunaProvavel(linhas, prefixo = PREFIXO_PADRAO) {
  if (!linhas?.length) return 0
  const largura = Math.max(...linhas.map((l) => l.length))
  let melhor = 0
  let melhorPlacar = -1
  for (let c = 0; c < largura; c++) {
    let placar = 0
    for (const l of linhas) {
      const v = String(l[c] ?? '').trim()
      if (!v) continue
      if (soDigitos(v)) placar++
      else if (prefixo && v.startsWith(prefixo)) placar++
    }
    if (placar > melhorPlacar) { melhorPlacar = placar; melhor = c }
  }
  return melhor
}
