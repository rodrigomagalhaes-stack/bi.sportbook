// Achar o jogo: pelo texto, ou pelo ID vindo de onde quer que ele tenha sido
// copiado.

const semAcento = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/**
 * O ID do evento dentro de um texto qualquer.
 *
 * A primeira versão exigia só dígitos (`/^\d+$/`) e, com qualquer outra coisa,
 * não fazia nada — nem abria o jogo, nem reclamava. Quem colava o endereço do
 * site via a tela continuar no jogo anterior e concluía que a busca por ID
 * estava trazendo a partida errada. Ela não estava trazendo nada.
 *
 * Os três formatos que aparecem na prática:
 *   16462691
 *   le-16462691                              (o final da URL)
 *   https://esportiva.bet.br/sports/futebol/brasil/brasileirao-a/…/le-16462691
 *
 * A regra é a última sequência de 6 dígitos ou mais: os ids do Altenar têm 8, e
 * o resto do endereço (nome do time, do campeonato) não tem número nenhum
 * comprido. Pega a ÚLTIMA porque na URL o id é o último trecho.
 */
export function idDoTexto(texto) {
  const achados = String(texto ?? '').match(/\d{6,}/g)
  return achados ? achados[achados.length - 1] : null
}

/**
 * Filtra o calendário. Cada termo da busca precisa aparecer em algum lugar do
 * jogo (nome, campeonato ou país), então "flamengo brasileirão" acha o que
 * "flamengo" sozinho traria misturado com a Libertadores e o feminino.
 */
export function filtrarJogos(jogos, { busca = '', soComBoost = false } = {}) {
  const termos = semAcento(busca).split(/\s+/).filter(Boolean)
  return (jogos || []).filter((j) => {
    if (soComBoost && !j.qtdBoosts) return false
    if (!termos.length) return true
    const alvo = semAcento(`${j.eventName} ${j.champName} ${j.categoryName}`)
    return termos.every((t) => alvo.includes(t))
  })
}
