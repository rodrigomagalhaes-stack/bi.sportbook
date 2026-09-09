// Leitura do CSV da base reembolsada. O arquivo chega em matriz de strings pelo
// `lib/planilha.js` do portal; aqui ele vira as linhas que vão para o banco,
// mais o resumo que a tela mostra antes de confirmar o envio.
//
// O ARQUIVO SÓ TRAZ QUEM RECEBE, NÃO QUANTO
// A primeira versão pedia uma coluna de valor. A base real não tem: ela vem com
// `PlayerId,Amount` e a coluna `Amount` chega vazia em todas as linhas — o que
// fazia a tela achar a coluna pelo nome, ler zero em tudo e registrar um
// pagamento de R$ 0,00 com ar de número conferido.
//
// O valor não está no arquivo porque não precisa estar: num bingo protegido
// cada seguidor recebe de volta a stake do bilhete. O arquivo responde QUEM, e
// a stake cadastrada responde QUANTO — ver `valorDaBase`.

const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s._-]/g, '')

const NOMES_USUARIO = [
  'playerid', 'userid', 'userexternalid', 'customerid', 'idjogador',
  'jogador', 'usuario', 'conta', 'login', 'cpf', 'documento',
]

export function acharColunaUsuario(cabecalho) {
  if (!cabecalho) return -1
  const mapa = cabecalho.map(norm)
  for (const alvo of NOMES_USUARIO) {
    const i = mapa.indexOf(alvo)
    if (i !== -1) return i
  }
  for (const alvo of NOMES_USUARIO) {
    const i = mapa.findIndex((c) => c.startsWith(alvo))
    if (i !== -1) return i
  }
  return -1
}

/**
 * O que sai do caixa: cada jogador da base recebe a stake do bilhete de volta.
 *
 * Arredonda em centavos porque `30 * 34` em ponto flutuante é exato, mas
 * `10.10 * 3` não é — e esse número vira o total que o financeiro confere.
 */
export const valorDaBase = (stake, jogadores) =>
  Math.round(Number(stake ?? 0) * Number(jogadores ?? 0) * 100) / 100

/**
 * As linhas da base, prontas para gravar, e o que elas dizem sobre o arquivo.
 *
 * UMA LINHA POR JOGADOR, não por linha do arquivo. Com o valor vindo da stake,
 * um ID repetido no arquivo viraria a mesma pessoa reembolsada duas vezes pelo
 * mesmo bilhete — e o total pago sairia maior que o devido. As repetidas são
 * descartadas e contadas, para a tela poder avisar.
 *
 * `linha` guarda a posição no arquivo original (contando o cabeçalho, se
 * houver), porque toda conferência de pagamento termina com alguém abrindo o
 * CSV para procurar uma pessoa específica.
 */
export function montarLinhas(corpo, { colUsuario, deslocamento = 0 } = {}) {
  const vistos = new Map()
  let semUsuario = 0
  let repetidos = 0

  ;(corpo ?? []).forEach((l, i) => {
    const usuario = String(l?.[colUsuario] ?? '').trim()
    if (!usuario) {
      semUsuario++
      return
    }

    const chave = usuario.toLowerCase()
    if (vistos.has(chave)) {
      repetidos++
      return
    }

    vistos.set(chave, { usuario, linha: i + 1 + deslocamento })
  })

  const linhas = [...vistos.values()]

  return {
    linhas,
    resumo: {
      total: (corpo ?? []).length,
      jogadores: linhas.length,
      semUsuario,
      repetidos,
    },
  }
}
