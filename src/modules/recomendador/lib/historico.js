// O lado do volume: o que as boosts já rodadas puxaram de aposta.
//
// A fonte é `boost_days`, a mesma tabela que o Controle de Boost grava a
// cada importação da planilha do dia. Cada dia guarda uma linha por
// evento+mercado, já com apostas, apostadores, stake e net apurados — não há
// nada a recalcular aqui, só a agregar.
//
// ── MEDIANA, NÃO MÉDIA ───────────────────────────────────────────────────────
// Stake de boost é uma distribuição de cauda longa: um clássico sozinho puxa
// mais que a semana inteira de jogos de meio de tabela. A média de um mercado
// vira o retrato do maior jogo que ele pegou; a mediana continua descrevendo o
// caso típico, que é o que se quer estimar para o próximo jogo.
//
// ── ONDE MORA O APRENDIZADO ──────────────────────────────────────────────────
// A agregação por família saiu daqui e virou `aprendizado.js`, que aprende por
// (vertente, família, faixa de odd) com encolhimento hierárquico. Aqui ficou o
// que é do JOGO e não do mercado: achatar o histórico e medir o porte do
// confronto pelos times.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ ───────────────────────────────────────────────
// Não usa o net/ROI histórico para prever lucro. Ele é agregado e mostrado na
// tela ao lado do tamanho da amostra, como conferência, mas quem estima a
// margem é a odd (server/recomendador/margem.js). Ver o cabeçalho de score.js.
//
// Também não fala com o banco: quem busca é `dados.js`. Assim tudo aqui é
// função pura, testável e rodável fora do navegador.

import { familiaDe } from './familias.js'

// Mesma leitura de vertente do Controle de Boost: `cat` quando foi marcada
// à mão, o booleano `tipster` do formato antigo, e Sportsbook como padrão.
const vertenteDe = (b) => {
  if (b.cat) return b.cat
  if (b.tipster) return 'tipster'
  return 'sportsbook'
}

/** Uma linha por boost rodada, com o dia junto. */
export function achatar(dias) {
  const linhas = []
  for (const dia of dias || []) {
    for (const b of dia.boosts || []) {
      if (!b || !b.event) continue
      linhas.push({
        date: dia.date,
        event: String(b.event),
        market: String(b.market || ''),
        familia: familiaDe(b.market).id,
        vertente: vertenteDe(b),
        apostas: Number(b.total) || 0,
        apostadores: Number(b.userCount) || 0,
        stake: Number(b.stake) || 0,
        net: Number(b.net) || 0,
        // A cotação mediana do grupo. Só existe nos dias importados depois de o
        // Controle de Boost passar a gravá-la; nos anteriores vem nula e o
        // modelo simplesmente não usa a dimensão de odd para aquela linha.
        odd: Number(b.odd) > 1 ? Number(b.odd) : null,
      })
    }
  }
  return linhas
}

/** Mediana de uma lista de números. Lista vazia devolve 0. */
export function mediana(valores) {
  const v = (valores || []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return 0
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

// Separadores em ordem de confiança. `vs.` é o que o feed usa; os outros são
// para o caso de a planilha exportar diferente. O hífen fica por último porque
// ele também aparece DENTRO de nome de clube — "FC Vion Zlate Moravce - Vrable"
// é um time só, e tentá-lo primeiro partia esse jogo em três.
const SEPARADORES = [/\s+vs\.?\s+/i, /\s+x\s+/i, /\s+@\s+/i, /\s+-\s+/]

/**
 * Os times de um confronto.
 *
 * Vai descendo a lista e para no primeiro separador que devolve exatamente dois
 * nomes. Sem isso, o hífen ganhava de `vs.` nos nomes compostos: dos 1.642 jogos
 * do calendário, três não partiam em dois — e dois deles eram o mesmo clube
 * eslovaco com hífen no nome.
 */
export function timesDe(evento) {
  const texto = String(evento || '').trim()
  if (!texto) return []
  for (const sep of SEPARADORES) {
    const partes = texto
      .split(sep)
      .map((t) => t.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    if (partes.length === 2) return partes
  }
  return [texto]
}

// Quanto de amostra é preciso para o fator do jogo valer inteiro. Com 5 boosts
// no histórico dos times ele conta metade; com 20, quase tudo. Sem isso um
// único jogo grande de um time faria o fator disparar.
const PESO_AMOSTRA = 5

/**
 * O porte do jogo, em relação ao jogo mediano.
 *
 * Um mercado puxa muito mais num clássico que num jogo de meio de tabela, e a
 * mediana da família sozinha não sabe disso. O fator é quanto as boosts dos
 * times deste jogo puxaram, comparadas com a mediana geral, encolhido na
 * direção de 1 conforme a amostra é pequena — com dois jogos no histórico o
 * fator quase não sai de 1, que é o mesmo que dizer "não sei, assume o normal".
 */
export function fatorDoJogo(linhas, competidores) {
  const alvos = (competidores || []).map((c) => c.toLowerCase()).filter(Boolean)
  if (!alvos.length || !linhas.length) return { fator: 1, n: 0, medianaGeral: 0, medianaTimes: 0 }

  const doJogo = linhas.filter((l) => {
    const times = timesDe(l.event).map((t) => t.toLowerCase())
    return times.some((t) => alvos.some((a) => t.includes(a) || a.includes(t)))
  })

  const medianaGeral = mediana(linhas.map((l) => l.stake))
  const medianaTimes = mediana(doJogo.map((l) => l.stake))
  if (!medianaGeral || !doJogo.length) {
    return { fator: 1, n: doJogo.length, medianaGeral, medianaTimes }
  }

  const bruto = medianaTimes / medianaGeral
  const peso = doJogo.length / (doJogo.length + PESO_AMOSTRA)
  return { fator: 1 + (bruto - 1) * peso, n: doJogo.length, medianaGeral, medianaTimes, bruto }
}

/**
 * Diagnóstico da classificação — quanto do histórico o classificador de
 * famílias conseguiu nomear. Vai para a tela de propósito: se a provedora
 * mudar os rótulos da planilha, a estimativa de volume degrada em silêncio, e
 * este número é o que denuncia.
 */
export function diagnostico(linhas) {
  const total = linhas.length
  const outros = linhas.filter((l) => l.familia === 'outros')
  const rotulos = new Map()
  for (const l of outros) rotulos.set(l.market, (rotulos.get(l.market) || 0) + 1)
  return {
    total,
    classificadas: total - outros.length,
    pctClassificadas: total ? Math.round(((total - outros.length) / total) * 100) : 0,
    naoClassificados: [...rotulos.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([market, n]) => ({ market, n })),
  }
}
