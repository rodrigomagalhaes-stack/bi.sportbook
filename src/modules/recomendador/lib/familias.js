// Famílias de mercado — a ponte entre dois vocabulários.
//
// O PROBLEMA
// O histórico de volume vem de `boost_days`, que nasce da coluna "Market types"
// da planilha de bilhetes da provedora. Os candidatos vêm do Altenar ao vivo.
// Os dois nomeiam o mesmo mercado de formas diferentes ("Total de gols" x
// "Total Goals Over/Under"), e o Altenar ainda cola o parâmetro e o nome do
// jogador no rótulo: "Total (mais/menos) Chutes a Gol PSG", "Chutes a Gol -
// Aleksandr Golovin (ASM)".
//
// Casar string com string acharia quase nada, e cada rótulo distinto viraria
// uma amostra de tamanho 1 — que é o mesmo que não ter histórico.
//
// A SAÍDA
// Os dois lados caem numa família ("gols", "escanteios", "chutes"). A família
// junta amostra suficiente para a mediana significar alguma coisa e sobrevive
// a mudança de rótulo da provedora. As regras cobrem português e inglês porque
// não está garantido em que idioma a planilha exporta.
//
// A ordem importa: a primeira regra que casar vence, então o que é específico
// vem antes do que é genérico. Múltipla vem primeiro de todas — uma boost de
// três pernas se comporta como múltipla, não como o mercado da primeira perna.

const semAcento = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

// Cada família tem rótulo para a tela e um teste sobre o nome já normalizado.
export const FAMILIAS = [
  { id: 'multipla', label: 'Múltipla / Bet Builder', re: /bet ?builder|criar aposta|multipla|parlay|combo/ },
  { id: 'placar', label: 'Resultado correto', re: /resultado correto|placar exato|correct score/ },
  // Antes de marcador de propósito: "Both Teams To Score" contém "to score" e
  // cairia em marcador se a ordem fosse a outra.
  { id: 'ambas', label: 'Ambas marcam', re: /ambas (as )?equipes marcam|ambos marcam|both teams to score|btts/ },
  { id: 'marcador', label: 'Marcador', re: /marcador|marcar a qualquer|goalscorer|to score|anytime scorer|primeiro a marcar|first scorer/ },
  { id: 'assistencia', label: 'Assistências', re: /assist/ },
  { id: 'escanteios', label: 'Escanteios', re: /escanteio|corner/ },
  { id: 'cartoes', label: 'Cartões', re: /cartao|cartoes|card|booking/ },
  { id: 'chutes', label: 'Chutes', re: /chute|finaliza|shot/ },
  { id: 'desarmes', label: 'Desarmes e faltas', re: /desarme|falta|tackle|foul/ },
  { id: 'chance-dupla', label: 'Chance dupla', re: /chance dupla|double chance/ },
  { id: 'handicap', label: 'Handicap', re: /handicap|spread|linha asiatica|asian/ },
  { id: 'gols', label: 'Total de gols', re: /total de gols|gols? (mais|menos)|total goals|goals over|over\/under/ },
  { id: 'resultado', label: 'Resultado do jogo', re: /vencedor do encontro|resultado final|1 ?x ?2|match result|full time result|match winner|moneyline|vencedor da partida/ },
  { id: 'intervalo', label: 'Tempo / intervalo', re: /1o tempo|2o tempo|primeiro tempo|segundo tempo|intervalo|half time|1st half|2nd half/ },
  { id: 'total', label: 'Outros totais', re: /total|mais de|menos de|\bover\b|\bunder\b/ },
];

export const FAMILIA_OUTROS = { id: 'outros', label: 'Outros mercados' };

// Mercado combinado: um só bilhete que junta dois mercados ("1x2 e total",
// "Total e ambas equipes marcam", "Chance dupla e total 3.5"). No site é uma
// seleção única, então é boost Single — mas NÃO puxa o volume do mercado de que
// leva o nome.
//
// Sem esta família eles herdavam o histórico do componente: "Total e ambas
// equipes marcam" caía em "ambas" e recebia o volume do Ambas Marcam simples,
// que é muito maior. Numa prévia com dados reais isso bastou para os combinados
// ocuparem as cinco primeiras dicas de Single em dois jogos de três — a parte
// da tela em que se age.
//
// A regra: o nome precisa juntar duas coisas com " e ", E duas famílias
// diferentes precisam casar nele. Só a segunda condição não bastaria ("Total de
// gols" casa em gols e em total sem ser combinado); só a primeira também não.
const FAMILIA_COMBINADO = { id: 'combinado', label: 'Mercado combinado' };

const pareceCombinado = (n) => {
  if (!/ e /.test(n)) return false;
  const casam = new Set(FAMILIAS.filter((f) => f.re.test(n)).map((f) => f.id));
  return casam.size >= 2;
};

/**
 * A família de um nome de mercado. Nunca devolve nulo: o que não casa cai em
 * "outros", que na tela aparece com esse nome mesmo — um balde visível é
 * melhor que uma classificação errada silenciosa.
 */
export function familiaDe(nome) {
  const n = semAcento(nome);
  if (!n) return FAMILIA_OUTROS;
  if (pareceCombinado(n)) return FAMILIA_COMBINADO;
  for (const f of FAMILIAS) if (f.re.test(n)) return f;
  return FAMILIA_OUTROS;
}

/**
 * A família de uma boost inteira. Duas pernas ou mais e ela é múltipla, sem
 * olhar os mercados: o que manda no comportamento (volume, chance de ganhar,
 * margem empilhada) é a estrutura, não o mercado de cada perna.
 */
export function familiaDaBoost(legs) {
  const nomes = (legs || []).map((l) => l.market).filter(Boolean);
  if ((legs || []).length > 1) return FAMILIAS[0];
  return familiaDe(nomes[0]);
}

/** Rótulo de exibição de um id de família. */
export function rotuloDaFamilia(id) {
  if (id === FAMILIA_COMBINADO.id) return FAMILIA_COMBINADO.label;
  return (FAMILIAS.find((f) => f.id === id) || FAMILIA_OUTROS).label;
}
