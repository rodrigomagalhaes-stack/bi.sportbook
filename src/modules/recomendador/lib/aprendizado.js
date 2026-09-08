// O que o histórico ensina sobre volume.
//
// ── O QUE É APRENDIDO E O QUE É REGRA ────────────────────────────────────────
// Regra fixa aqui é só uma: como agrupar (a família do mercado, a vertente, a
// faixa de odd). TODO o resto sai do `boost_days` — quanto cada combinação
// dessas puxou de stake, medido, sem número escrito à mão em lugar nenhum.
//
// Não há "mercado de gols vale 2× o de escanteios" no código. Se o de escanteios
// passar a puxar mais, a estimativa vira sozinha na próxima importação.
//
// ── POR QUE HIERARQUIA, E NÃO UMA MÉDIA POR CÉLULA ───────────────────────────
// A célula que interessa é a mais específica: "Tipster, escanteios, odd entre
// 2.5 e 4". Só que ela costuma ter duas ou três observações, e a mediana de duas
// observações é ruído com cara de número.
//
// Então cada célula é puxada na direção do pai — (vertente, família) → (família)
// → (vertente) → tudo — com peso `n / (n + K)`. Com 2 amostras a célula quase
// não fala; com 20, ela manda. É o mesmo princípio do fator de porte do jogo em
// historico.js, e é o que separa aprender de decorar.
//
// `prever` devolve o nível que de fato informou a estimativa, e a tela mostra
// isso: saber que o número veio da mediana geral, e não de Tipster+escanteios,
// é a diferença entre confiar e não confiar nele.

import { rotuloDaFamilia } from './familias.js'

// Amostras para uma célula valer sozinha. Com 8 ela conta metade; com 24, três
// quartos. Baixo o suficiente para o específico aparecer, alto o suficiente para
// duas observações não virarem verdade.
const PESO = 8

// Faixas de odd. Uma boost de 1.20 e uma de 8.00 não disputam o mesmo público,
// e a fronteira está mais ou menos onde o apostador troca de intenção: proteger
// (até 1.5), jogo normal (até 2.5), arriscar (até 4), caçar prêmio (acima).
export const FAIXAS_ODD = [
  { id: 'ate-1.5', label: 'até 1.50', min: 0, max: 1.5 },
  { id: '1.5-2.5', label: '1.50 a 2.50', min: 1.5, max: 2.5 },
  { id: '2.5-4', label: '2.50 a 4.00', min: 2.5, max: 4 },
  { id: '4-8', label: '4.00 a 8.00', min: 4, max: 8 },
  { id: 'acima-8', label: 'acima de 8.00', min: 8, max: Infinity },
]

/** A faixa de uma odd. Nulo quando a odd não é conhecida. */
export function faixaDaOdd(odd) {
  const v = Number(odd)
  if (!(v > 1)) return null
  return (FAIXAS_ODD.find((f) => v >= f.min && v < f.max) ?? FAIXAS_ODD[FAIXAS_ODD.length - 1]).id
}

export function mediana(valores) {
  const v = (valores || []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/** Agrega um balde de linhas nas medidas que interessam. */
const resumir = (linhas) => ({
  n: linhas.length,
  stake: mediana(linhas.map((l) => l.stake)),
  apostas: mediana(linhas.map((l) => l.apostas)),
  apostadores: mediana(linhas.map((l) => l.apostadores)),
  stakeTotal: linhas.reduce((s, l) => s + l.stake, 0),
  netTotal: linhas.reduce((s, l) => s + l.net, 0),
})

const juntar = (mapa, chave, linha) => {
  if (!mapa.has(chave)) mapa.set(chave, [])
  mapa.get(chave).push(linha)
}

/**
 * Treina o modelo de volume sobre o histórico achatado.
 *
 * Não há ajuste iterativo nem parâmetro escondido: "treinar" aqui é medir a
 * mediana de cada agrupamento e guardar o tamanho da amostra junto, para o
 * encolhimento saber quanto confiar em cada uma.
 */
export function treinar(linhas) {
  const validas = (linhas || []).filter((l) => l && Number.isFinite(l.stake))

  const porVertenteFamiliaOdd = new Map()
  const porVertenteFamilia = new Map()
  const porFamilia = new Map()
  const porVertente = new Map()

  for (const l of validas) {
    const faixa = l.faixaOdd ?? faixaDaOdd(l.odd)
    if (faixa) juntar(porVertenteFamiliaOdd, `${l.vertente}|${l.familia}|${faixa}`, l)
    juntar(porVertenteFamilia, `${l.vertente}|${l.familia}`, l)
    juntar(porFamilia, l.familia, l)
    juntar(porVertente, l.vertente, l)
  }

  const converter = (mapa) => {
    const saida = new Map()
    for (const [chave, itens] of mapa) saida.set(chave, resumir(itens))
    return saida
  }

  return {
    vertenteFamiliaOdd: converter(porVertenteFamiliaOdd),
    vertenteFamilia: converter(porVertenteFamilia),
    familia: converter(porFamilia),
    vertente: converter(porVertente),
    geral: resumir(validas),
    // Quantas linhas trazem a odd. Enquanto o Sportbook Vs. Tipster não a
    // gravava, este número é zero e a faixa de odd nunca informa nada — a tela
    // usa isso para dizer que a dimensão ainda está enchendo.
    comOdd: validas.filter((l) => (l.faixaOdd ?? faixaDaOdd(l.odd)) != null).length,
    total: validas.length,
  }
}

// Os níveis, do mais específico ao mais geral. A ordem é a hierarquia.
const NIVEIS = [
  {
    id: 'vertente+familia+odd',
    rotulo: (c) => `${c.vertente} · ${c.familiaLabel} · odd ${c.faixaLabel}`,
    chave: (c) => (c.faixaOdd ? `${c.vertente}|${c.familia}|${c.faixaOdd}` : null),
    mapa: (m) => m.vertenteFamiliaOdd,
  },
  {
    id: 'vertente+familia',
    rotulo: (c) => `${c.vertente} · ${c.familiaLabel}`,
    chave: (c) => `${c.vertente}|${c.familia}`,
    mapa: (m) => m.vertenteFamilia,
  },
  {
    id: 'familia',
    rotulo: (c) => c.familiaLabel,
    chave: (c) => c.familia,
    mapa: (m) => m.familia,
  },
  {
    id: 'vertente',
    rotulo: (c) => c.vertente,
    chave: (c) => c.vertente,
    mapa: (m) => m.vertente,
  },
]

/**
 * O volume que se espera de uma boost com estas características.
 *
 * Desce a hierarquia do geral para o específico, e a cada degrau puxa a
 * estimativa na direção do que a célula mais fina diz, na proporção do tamanho
 * dela. Uma célula de 2 amostras move pouco; uma de 40 manda quase sozinha.
 *
 * Devolve `null` em `stake` quando não há histórico nenhum — nem geral. A tela
 * mostra "—" em vez de um número inventado.
 */
export function prever(modelo, { vertente, familia, familiaLabel, odd, faixaOdd } = {}) {
  if (!modelo || !modelo.total) {
    return { stake: null, n: 0, nivel: null, caminho: [], confianca: confiancaDe(0) }
  }

  const ctx = {
    vertente,
    familia,
    familiaLabel: familiaLabel || familia,
    faixaOdd: faixaOdd ?? faixaDaOdd(odd),
  }
  ctx.faixaLabel = FAIXAS_ODD.find((f) => f.id === ctx.faixaOdd)?.label ?? ''

  let stake = modelo.geral.stake
  let nEfetivo = modelo.geral.n
  let nivel = { id: 'geral', rotulo: 'todas as boosts', n: modelo.geral.n }
  const caminho = [{ ...nivel, stake: modelo.geral.stake, peso: 1 }]

  for (const def of NIVEIS.slice().reverse()) {
    const chave = def.chave(ctx)
    if (chave == null) continue
    const celula = def.mapa(modelo).get(chave)
    if (!celula || !celula.n || celula.stake == null) continue

    const peso = celula.n / (celula.n + PESO)
    stake = stake * (1 - peso) + celula.stake * peso
    nEfetivo = celula.n
    nivel = { id: def.id, rotulo: def.rotulo(ctx), n: celula.n }
    caminho.push({ ...nivel, stake: celula.stake, peso })
  }

  return {
    stake,
    n: nEfetivo,
    nivel,
    caminho,
    confianca: confiancaDe(nEfetivo),
  }
}

/** Quanto se pode confiar, pelo tamanho da amostra que mais pesou. */
export function confiancaDe(n) {
  if (n >= 12) return { id: 'alta', label: 'alta', tom: 'ok' }
  if (n >= 5) return { id: 'media', label: 'média', tom: '' }
  if (n >= 1) return { id: 'baixa', label: 'baixa', tom: 'alerta' }
  return { id: 'nenhuma', label: 'sem histórico', tom: 'erro' }
}

/**
 * A tabela do que foi aprendido, para a tela mostrar.
 *
 * Uma linha por (vertente, família), ordenada pelo volume mediano. É a resposta
 * direta a "o que puxou mais volume em cada situação" — e o lugar onde dá para
 * ver que Tipster e Sportsbook respondem a mercados diferentes.
 */
export function tabelaAprendida(modelo, { minAmostra = 1 } = {}) {
  if (!modelo) return []
  const linhas = []
  for (const [chave, celula] of modelo.vertenteFamilia) {
    if (celula.n < minAmostra || celula.stake == null) continue
    const [vertente, familia] = chave.split('|')
    linhas.push({
      vertente,
      familia,
      familiaLabel: rotuloDaFamilia(familia),
      n: celula.n,
      stake: celula.stake,
      apostas: celula.apostas,
      stakeTotal: celula.stakeTotal,
      netTotal: celula.netTotal,
      roi: celula.stakeTotal ? celula.netTotal / celula.stakeTotal : null,
    })
  }
  return linhas.sort((a, b) => b.stake - a.stake)
}
