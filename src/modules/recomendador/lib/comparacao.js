// O placar do recomendador: o que ele previu contra o que aconteceu.
//
// ── O QUE ESTA COMPARAÇÃO SERVE PARA DECIDIR ─────────────────────────────────
// As duas metades do modelo envelhecem de formas muito diferentes, e a tela
// precisa separá-las:
//
//   ERRO DE VOLUME  aparece rápido e dá para corrigir. Se a estimativa de gols
//                   sai 3× abaixo do realizado três vezes seguidas, isso não é
//                   sorte: é a mediana da família fora de lugar. É o número que
//                   justifica mexer no modelo.
//
//   ERRO DE RESULTADO  precisa de dezenas de observações antes de significar
//                   alguma coisa. Uma boost de odd 5.60 ou paga 4,6 vezes a
//                   stake ou não paga nada; errar o net de uma delas não diz
//                   nada sobre o modelo. Aparece com o n do lado, sempre.
//
// Por isso `resumo()` devolve os dois separados, e o de volume vem com mediana
// (não média): um jogo grande sozinho puxaria a média e faria parecer que o
// modelo subestima tudo.
//
// ── O VIÉS DE SELEÇÃO ────────────────────────────────────────────────────────
// Se só entrarem as boosts que o recomendador indicou, nunca se descobre o que
// as recusadas teriam dado, e ele parece melhor do que é. `naoMarcadas()`
// devolve as boosts que rodaram no mesmo jogo sem terem sido marcadas — elas já
// estão no `boost_days`, então a contraprova sai de graça.

import { timesDe } from './historico.js'

const semAcento = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Chave de comparação de nome de evento, imune a pontuação e acento. */
const chaveEvento = (nome) => semAcento(nome).replace(/[^a-z0-9]/g, '')

/**
 * O mesmo jogo, escrito de dois lugares diferentes.
 *
 * O nome vem do Altenar na dica e da coluna "Event name" da planilha no
 * histórico. Costuma ser idêntico — os dois nascem do mesmo feed —, mas a
 * exportação às vezes troca "vs." por "vs" ou perde um acento, e aí a chave
 * literal falha. O segundo passo compara os times: os dois lados precisam
 * aparecer, um contendo o outro, para não casar "Real Madrid" com
 * "Real Madrid Castilla" por acidente em só uma ponta.
 */
export function mesmoEvento(a, b) {
  if (!a || !b) return false
  if (chaveEvento(a) === chaveEvento(b)) return true

  const ta = timesDe(a).map(semAcento)
  const tb = timesDe(b).map(semAcento)
  if (ta.length !== 2 || tb.length !== 2) return false

  // Conter só vale para nome com algum corpo. "PSG" e "CRB" têm três letras e,
  // por inclusão, casariam com qualquer nome que as contenha — e ao contrário,
  // "Bahia" contém "a". Abaixo do piso, a comparação é de igualdade.
  const PISO = 4
  const parecido = (x, y) =>
    x === y || (x.length >= PISO && y.length >= PISO && (x.includes(y) || y.includes(x)))
  const casa = (x, lista) => lista.some((y) => parecido(x, y))
  return ta.every((t) => casa(t, tb))
}

/**
 * Cruza cada dica com o que o `boost_days` registrou.
 *
 * `linhas` é o histórico já achatado (historico.achatar). O encontro é por
 * jogo + FAMÍLIA, não por nome de mercado: o Altenar escreve "Total
 * (mais/menos) Chutes a Gol PSG" e a planilha escreve outra coisa — é a mesma
 * razão pela qual as famílias existem.
 */
export function apurar(dicas, linhas) {
  return (dicas || []).map((d) => {
    const doEvento = (linhas || []).filter((l) => mesmoEvento(l.event, d.event_name))
    const casadas = doEvento.filter((l) => l.familia === d.familia)

    if (!doEvento.length) {
      return { dica: d, status: 'aguardando', realizado: null, erroVolume: null }
    }
    if (!casadas.length) {
      return { dica: d, status: 'nao-apareceu', realizado: null, erroVolume: null }
    }

    const stake = casadas.reduce((s, l) => s + l.stake, 0)
    const net = casadas.reduce((s, l) => s + l.net, 0)
    const apostas = casadas.reduce((s, l) => s + l.apostas, 0)
    const previsto = Number(d.prev_volume)

    return {
      dica: d,
      status: 'apurada',
      // Atenção ao que este número É: o realizado do EVENTO+FAMÍLIA inteiro, não
      // o desta seleção. O `boost_days` agrega por evento+mercado e não guarda a
      // seleção, então não há como repartir. Duas dicas do mesmo mercado
      // enxergam a mesma linha — ver `chaveRealizado` e o de-duplicador em
      // `resumo`, sem o qual os totais contariam o mesmo stake duas vezes.
      realizado: { stake, net, apostas, roi: stake ? net / stake : null, linhas: casadas.length },
      chaveRealizado: `${chaveEvento(d.event_name)}|${d.familia}`,
      // > 1 = puxou mais que o previsto; < 1 = puxou menos.
      erroVolume: previsto > 0 ? stake / previsto : null,
    }
  })
}

/**
 * Quantas dicas dividem cada linha realizada. Serve para a tela avisar que o
 * volume mostrado é do mercado, não daquela seleção sozinha.
 */
export function compartilhamento(apuradas) {
  const contagem = new Map()
  for (const a of apuradas || []) {
    if (a.status !== 'apurada') continue
    contagem.set(a.chaveRealizado, (contagem.get(a.chaveRealizado) || 0) + 1)
  }
  return contagem
}

const mediana = (v) => {
  const s = (v || []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!s.length) return null
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * O placar agregado. Volume e resultado vêm separados de propósito — ver o
 * cabeçalho deste arquivo.
 */
export function resumo(apuradas) {
  const fechadas = (apuradas || []).filter((a) => a.status === 'apurada')

  // Marcar duas seleções do mesmo mercado (o "Bragantino" e o "Empate" do 1x2)
  // faz as duas casarem com a MESMA linha do boost_days. Somar as duas contaria
  // os R$ 44 mil daquele mercado duas vezes e inflaria o placar inteiro. Nos
  // agregados, cada linha realizada entra uma vez só — a primeira, que é a de
  // melhor posição no ranking.
  const vistas = new Set()
  const unicas = fechadas.filter((a) => {
    if (vistas.has(a.chaveRealizado)) return false
    vistas.add(a.chaveRealizado)
    return true
  })
  const comVolume = unicas.filter((a) => a.erroVolume != null)

  return {
    total: (apuradas || []).length,
    apuradas: fechadas.length,
    aguardando: (apuradas || []).filter((a) => a.status === 'aguardando').length,
    naoApareceram: (apuradas || []).filter((a) => a.status === 'nao-apareceu').length,

    // Mediana, não média: um clássico sozinho puxaria a média e faria parecer
    // que o modelo subestima tudo.
    erroVolumeMediano: mediana(comVolume.map((a) => a.erroVolume)),
    amostraVolume: comVolume.length,

    previstoTotal: unicas.reduce((s, a) => s + (Number(a.dica.prev_resultado) || 0), 0),
    realizadoTotal: unicas.reduce((s, a) => s + a.realizado.net, 0),
    stakePrevistoTotal: comVolume.reduce((s, a) => s + (Number(a.dica.prev_volume) || 0), 0),
    stakeRealizadoTotal: comVolume.reduce((s, a) => s + a.realizado.stake, 0),
  }
}

/**
 * A contraprova: boosts que rodaram nos mesmos jogos e NÃO foram marcadas.
 *
 * Sem isso o placar só enxerga o que o recomendador indicou e ele sempre parece
 * bom — nunca se saberia se a boost que ele deixou de fora teria rendido mais.
 */
export function naoMarcadas(dicas, linhas) {
  const eventos = [...new Set((dicas || []).map((d) => d.event_name))]
  if (!eventos.length) return []

  const marcadas = new Set((dicas || []).map((d) => `${chaveEvento(d.event_name)}|${d.familia}`))

  return (linhas || [])
    .filter((l) => eventos.some((e) => mesmoEvento(l.event, e)))
    .filter((l) => {
      const evento = eventos.find((e) => mesmoEvento(l.event, e))
      return !marcadas.has(`${chaveEvento(evento)}|${l.familia}`)
    })
    .sort((a, b) => b.stake - a.stake)
}
