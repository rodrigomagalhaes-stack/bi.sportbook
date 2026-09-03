// Contagem de UTMs de um arquivo de bilhetes. Tudo aqui é função pura: a tela
// só escolhe as colunas e desenha o resultado.

const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s._-]/g, '')

// Nomes de coluna que já apareceram nos arquivos de segmento. A ordem importa:
// a primeira que casar é a sugerida.
const NOMES_UTM = ['utmsource', 'utm', 'utmmedium', 'utmcampaign', 'source', 'afiliado', 'affiliate', 'btag']
const NOMES_USUARIO = ['userid', 'playerid', 'userexternalid', 'idjogador', 'jogador', 'cpf']
const NOMES_VALOR = ['valorapostado', 'stake', 'totalstake', 'valor', 'amount', 'betamount']

function acharColuna(cabecalho, nomes) {
  if (!cabecalho) return -1
  const mapa = cabecalho.map(norm)
  for (const alvo of nomes) {
    const i = mapa.indexOf(alvo)
    if (i !== -1) return i
  }
  // Sem nome exato, aceita quem começa com o alvo (utm_source_1, valor_apostado_brl…)
  for (const alvo of nomes) {
    const i = mapa.findIndex((c) => c.startsWith(alvo))
    if (i !== -1) return i
  }
  return -1
}

export const acharColunaUtm = (cabecalho) => acharColuna(cabecalho, NOMES_UTM)
export const acharColunaUsuario = (cabecalho) => acharColuna(cabecalho, NOMES_USUARIO)
export const acharColunaValor = (cabecalho) => acharColuna(cabecalho, NOMES_VALOR)

// "5.45" e "5,45" chegam do mesmo relatório dependendo de quem exportou.
export function parseNumero(valor) {
  const s = String(valor ?? '').replace(/[^\d,.-]/g, '').trim()
  if (!s) return 0
  const limpo = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = parseFloat(limpo)
  return Number.isFinite(n) ? n : 0
}

// Ranking das UTMs. Linhas sem UTM não entram na disputa — viram o contador
// "sem utm", que é informação de qualidade do arquivo, não um afiliado.
export function contarUtms(linhas, opcoes = {}) {
  const {
    coluna = 0,
    colunaUsuario = -1,
    colunaValor = -1,
    ignorarCaixa = true,
  } = opcoes

  const grupos = new Map()
  let comUtm = 0
  let semUtm = 0
  let valorTotal = 0

  for (const linha of linhas) {
    const bruto = String(linha?.[coluna] ?? '').trim()
    if (!bruto) { semUtm++; continue }

    comUtm++
    const chave = ignorarCaixa ? bruto.toLowerCase() : bruto
    let g = grupos.get(chave)
    if (!g) {
      // O rótulo é a primeira grafia vista: agrupar "Google" com "google" não
      // deve inventar uma terceira forma na tela.
      g = { utm: bruto, bilhetes: 0, valor: 0, jogadores: new Set() }
      grupos.set(chave, g)
    }

    g.bilhetes++

    if (colunaValor >= 0) {
      const v = parseNumero(linha[colunaValor])
      g.valor += v
      valorTotal += v
    }

    if (colunaUsuario >= 0) {
      const u = String(linha[colunaUsuario] ?? '').trim()
      if (u) g.jogadores.add(u)
    }
  }

  const ranking = [...grupos.values()]
    .map((g) => ({
      utm: g.utm,
      bilhetes: g.bilhetes,
      // Percentual sobre os bilhetes que têm UTM: é a fatia de cada afiliado
      // dentro do que dá para atribuir.
      pct: comUtm ? (g.bilhetes / comUtm) * 100 : 0,
      valor: g.valor,
      jogadores: g.jogadores.size,
    }))
    // Empate desempatado pela UTM, para o ranking não dançar a cada leitura.
    .sort((a, b) => b.bilhetes - a.bilhetes || a.utm.localeCompare(b.utm))
    .map((item, i) => ({ ...item, posicao: i + 1 }))

  return {
    ranking,
    resumo: {
      linhas: linhas.length,
      comUtm,
      semUtm,
      distintas: ranking.length,
      valorTotal,
      // Concentração: quanto o topo do ranking responde do total atribuído.
      pctTop5: ranking.slice(0, 5).reduce((s, r) => s + r.pct, 0),
    },
  }
}

// Matriz pronta para exportar (a mesma que a tela mostra, sem corte de topo).
export function rankingParaMatriz(ranking, { comValor = false, comJogadores = false } = {}) {
  const cabecalho = ['posicao', 'utm', 'bilhetes', 'pct_dos_bilhetes']
  if (comJogadores) cabecalho.push('jogadores_unicos')
  if (comValor) cabecalho.push('valor_apostado')

  const linhas = ranking.map((r) => {
    const l = [String(r.posicao), r.utm, String(r.bilhetes), r.pct.toFixed(2).replace('.', ',')]
    if (comJogadores) l.push(String(r.jogadores))
    if (comValor) l.push(r.valor.toFixed(2).replace('.', ','))
    return l
  })

  return [cabecalho, ...linhas]
}
