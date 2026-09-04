// A conta de margem de uma boost.
//
// POR QUE ESTA CONTA E NÃO O HISTÓRICO DE LUCRO
// O net que uma boost deu no passado é quase todo sorte: com 3 ou 4 amostras,
// um mercado "que dá bom" é um mercado que ganhou duas seguidas. Ranquear por
// isso faz o sistema recomendar exatamente o que acabou de ter uma sequência
// boa por acaso.
//
// O que É previsível está na própria odd, antes de a boost ir ao ar: a casa
// sabe quanto de margem está entregando no instante em que turbina 1.52 para
// 1.65. Esta é a parte determinística do resultado — o resto é variância.
//
// ── COMO SE CHEGA NELA ───────────────────────────────────────────────────────
// A odd publicada embute a margem: no 1x2 de PSG x Monaco, 1/1.3334 + 1/5.6667
// + 1/7 = 1.0693, ou seja 6,93% de overround. Tirado esse excesso sobra a
// probabilidade que a casa realmente atribui ao evento, e a margem em qualquer
// odd vira `1 − p × odd`.
//
// A âncora é sempre a odd combinada que a PRÓPRIA CASA publicou (`basePrice`),
// com a margem das pernas descontada dela:
//
//     p = (1 / basePrice) × Π 1/(1 + overround da perna)
//
// Ancorar em `basePrice` em vez de multiplicar as pernas de-vigadas é o que faz
// múltipla do mesmo jogo funcionar. As pernas de um mesmo jogo são
// correlacionadas — se sai gol, sai escanteio — e o produto das probabilidades
// individuais subestima muito a chance real do bilhete. A casa já resolveu essa
// correlação ao precificar a múltipla; `basePrice` traz o ajuste dela pronto.
// Multiplicando as pernas na mão, uma dupla de 4.00 aparecia com 63% de margem
// para a casa, número que não existe em lugar nenhum. Pela âncora dá 11%.

/**
 * Overround por unidade de cobertura de um grupo de odds complementares.
 *
 * Nem todo grupo cobre o espaço de resultados UMA vez. Chance dupla cobre duas
 * (cada seleção contém dois dos três desfechos), e a soma das implícitas dá
 * ~2.1 em vez de ~1.07 — lida como overround de 110% ela destruiria a conta.
 * `k` é quantas vezes o grupo cobre o espaço; a margem real é `soma/k − 1`.
 *
 * Devolve `null` quando o grupo não é complementar de verdade: os mercados de
 * marcador e de resultado correto vêm numa grade cuja coluna não fecha em
 * inteiro nenhum, e ali a soma dá 0,26 ou 0,50 — de-vigar por ela inventaria
 * probabilidade. Sem grupo válido a margem vira estimativa explícita.
 */
export function overround(precos, { complementar = true } = {}) {
  // Mercado cuja grade não é um conjunto de desfechos que se excluem não pode
  // ser de-vigado, mesmo que a soma pareça boa. "Marcador - Fulano" traz
  // Primeiro / Último / Qualq. Altura, três coisas que acontecem juntas; num
  // caso real elas somaram 1,03 e teriam passado como um mercado de 3% de
  // margem. Quem chama diz se o grupo é complementar (ver GRUPO_NAO_COMPLEMENTAR
  // em score.js) — na dúvida, a resposta é estimativa explícita, não um número
  // com aparência de apurado.
  if (!complementar) return null;
  const validos = (precos || []).filter((p) => Number(p) > 1);
  if (validos.length < 2) return null;
  const soma = validos.reduce((s, p) => s + 1 / p, 0);
  const k = Math.round(soma);
  if (k < 1) return null;
  const porUnidade = soma / k - 1;
  // Margem fora desta faixa não é margem: é grade mal pareada. Livro nenhum
  // opera abaixo de zero, e acima de 35% já não é um mercado complementar.
  if (porUnidade < 0 || porUnidade > 0.35) return null;
  return porUnidade;
}

// Margem assumida quando o mercado não dá para de-vigar. É um palpite
// explícito, e quem usa vê a marca `estimado` na tela — nunca passa por
// número apurado.
export const OVERROUND_PADRAO = 0.07;

/**
 * Probabilidade justa de uma seleção dentro do grupo dela, tirando a margem
 * proporcionalmente (de-vig multiplicativo). É o método mais simples e o mais
 * usado; ele distribui o excesso na proporção da própria odd, o que subestima
 * um pouco o azarão — a distorção conhecida do viés favorito-azarão.
 */
export function probJusta(preco, precosDoMercado, opcoes) {
  const p = Number(preco);
  if (!(p > 1)) return null;
  const o = overround(precosDoMercado, opcoes);
  return (1 / p) / (1 + (o ?? OVERROUND_PADRAO));
}

/**
 * Avalia uma boost inteira.
 *
 * `legs` = [{ price, precosDoMercado }] — a odd da perna e as odds do grupo
 * complementar dela, que é o que permite o de-vig.
 *
 * `basePrice` é a odd combinada ANTES da turbinada e `price` a turbinada, as
 * duas como o Altenar publica.
 *
 * Devolve, por R$ 1 apostado:
 *   margemBase  — o que a casa reteria sem a boost
 *   margemBoost — o que ela retém COM a boost (negativo = a boost paga mais do
 *                 que a casa espera receber)
 *   custo       — quanto a boost entrega, `p × (price − basePrice)`. É o número
 *                 mais robusto da tela: ele não depende de a margem absoluta
 *                 estar certa, só da probabilidade, e sai igual com qualquer
 *                 método de de-vig.
 */
export function avaliarBoost({ basePrice, price, legs = [] }) {
  const base = Number(basePrice);
  const turbo = Number(price);
  if (!(base > 1) || !(turbo > 1)) return null;

  // Margem acumulada das pernas. A casa empilha margem perna a perna, então
  // numa tripla de 8% cada o bilhete carrega 1 − 1/1.08³ = 20,6%.
  let fator = 1;
  let estimado = false;
  for (const leg of legs.length ? legs : [{}]) {
    // `complementar: false` na perna diz que a grade daquele mercado não é um
    // conjunto de desfechos exclusivos — ver GRUPO_NAO_COMPLEMENTAR em score.js.
    const o = overround(leg.precosDoMercado, { complementar: leg.complementar !== false });
    if (o == null) estimado = true;
    fator *= 1 / (1 + (o ?? OVERROUND_PADRAO));
  }

  const p = (1 / base) * fator;

  return {
    prob: p,
    margemBase: 1 - p * base,
    margemBoost: 1 - p * turbo,
    custo: p * (turbo - base),
    lift: turbo / base - 1,
    pernas: legs.length,
    correlacionada: legs.length > 1,
    estimado,
  };
}

/** Exposição máxima da trava: o que sai do caixa se todos os bilhetes ganharem. */
export function exposicao({ betsLimit, maxStake, price }) {
  const n = Number(betsLimit) || 0;
  const s = Number(maxStake) || 0;
  const o = Number(price) || 0;
  if (!n || !s || !o) return null;
  return { stakeMax: n * s, retornoMax: n * s * o, riscoMax: n * s * (o - 1) };
}
