// Leitura do CSV da base reembolsada. O arquivo chega em matriz de strings pelo
// `lib/planilha.js` do portal; aqui ele vira as linhas que vão para o banco,
// mais o resumo que a tela mostra antes de confirmar o envio.
//
// Nenhum layout é assumido. Cada parceiro exporta com um nome de coluna
// diferente, e a tela pede que se escolha qual é qual — o mesmo caminho que o
// Prefixador e o Ranking de UTMs já usam. O que está abaixo só chuta o palpite
// inicial dessa escolha.

const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s._-]/g, '')

const NOMES_USUARIO = [
  'userid', 'playerid', 'userexternalid', 'customerid', 'idjogador',
  'jogador', 'usuario', 'conta', 'login', 'cpf', 'documento',
]
const NOMES_VALOR = [
  'valorreembolso', 'valorpago', 'reembolso', 'valor', 'amount',
  'credito', 'freebet', 'premio', 'stake',
]

function acharColuna(cabecalho, nomes) {
  if (!cabecalho) return -1
  const mapa = cabecalho.map(norm)
  for (const alvo of nomes) {
    const i = mapa.indexOf(alvo)
    if (i !== -1) return i
  }
  for (const alvo of nomes) {
    const i = mapa.findIndex((c) => c.startsWith(alvo))
    if (i !== -1) return i
  }
  return -1
}

export const acharColunaUsuario = (cabecalho) => acharColuna(cabecalho, NOMES_USUARIO)
export const acharColunaValor = (cabecalho) => acharColuna(cabecalho, NOMES_VALOR)

/**
 * "1.234,56" e "1234.56" saem do mesmo relatório dependendo de quem exportou.
 *
 * Vale a mesma conta que o Ranking de UTMs faz no arquivo dele. Está repetida
 * aqui, e não importada de lá, para os dois módulos não ficarem amarrados um no
 * outro por causa de seis linhas — mexer no arquivo de um não pode mudar o
 * número que o outro mostra.
 */
export function parseNumero(valor) {
  const s = String(valor ?? '').replace(/[^\d,.-]/g, '').trim()
  if (!s) return 0
  const limpo = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = parseFloat(limpo)
  return Number.isFinite(n) ? n : 0
}

/**
 * As linhas da base, prontas para gravar, e o que elas dizem sobre o arquivo.
 *
 * `linha` guarda a posição no arquivo original (contando o cabeçalho, se
 * houver), porque toda conferência de pagamento termina com alguém abrindo o
 * CSV para procurar uma pessoa específica.
 *
 * Sem coluna de valor escolhida, `valor` fica nulo em vez de zero: zero é uma
 * afirmação — "esta pessoa recebeu R$ 0,00" — e nulo é o que de fato se sabe,
 * que é nada. A diferença aparece na soma do quadro Pago, que senão exibiria
 * R$ 0,00 com ar de número conferido.
 */
export function montarLinhas(corpo, { colUsuario, colValor = -1, deslocamento = 0 } = {}) {
  const linhas = []
  const contagem = new Map()
  let semUsuario = 0
  let valorTotal = 0
  let comValor = 0

  ;(corpo ?? []).forEach((l, i) => {
    const usuario = String(l?.[colUsuario] ?? '').trim()
    if (!usuario) {
      semUsuario++
      return
    }

    const chave = usuario.toLowerCase()
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1)

    let valor = null
    if (colValor >= 0) {
      valor = parseNumero(l[colValor])
      valorTotal += valor
      comValor++
    }

    linhas.push({ usuario, valor, linha: i + 1 + deslocamento })
  })

  // Mesmo ID duas vezes no MESMO arquivo é a pessoa sendo reembolsada duas
  // vezes pelo mesmo bilhete. Não é o cruzamento entre bilhetes (esse roda no
  // banco, depois) — é o erro que dá para pegar antes de o dinheiro sair.
  let repetidos = 0
  for (const n of contagem.values()) if (n > 1) repetidos++

  return {
    linhas,
    resumo: {
      total: (corpo ?? []).length,
      validas: linhas.length,
      semUsuario,
      usuarios: contagem.size,
      repetidos,
      valorTotal: comValor ? valorTotal : 0,
      comValor: colValor >= 0,
    },
  }
}
