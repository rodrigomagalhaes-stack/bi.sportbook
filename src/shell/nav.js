// Catálogo único de tudo que o portal oferece. É a fonte da barra lateral, da
// página inicial e dos títulos do topo — incluir um módulo novo é acrescentar
// uma entrada aqui e a rota correspondente em App.jsx.
//
// `tipo`: 'nativo'  → componente React montado dentro do portal
//         'embutido' → página HTML servida de /public/apps e exibida em iframe

export const secoes = [
  {
    id: 'inicio',
    label: 'Início',
    icone: 'casa',
    cor: 'text-faint',
    itens: [
      {
        to: '/',
        icone: 'grade',
        exato: true,
        label: 'Visão Geral',
        desc: 'Atalhos para todas as ferramentas do portal.',
        tipo: 'nativo',
      },
    ],
  },
  {
    id: 'sportsbook',
    label: 'Sportsbook',
    icone: 'bola',
    cor: 'accent',
    itens: [
      {
        to: '/recomendador',
        icone: 'alvo',
        label: 'Recomendador de Boosts',
        desc: 'Ranqueia as boosts de um jogo por margem esperada × volume que o mercado costuma puxar.',
        tipo: 'nativo',
      },
      {
        to: '/boost-dashboard',
        icone: 'colunas',
        label: 'Controle de Boost',
        desc: 'Acompanhamento diário de boosts: apostado, risco e resultado por dia.',
        tipo: 'embutido',
        src: '/apps/boost-dashboard/boost-dashboard.html',
        origem: 'SportbookVsTipter',
      },
      {
        to: '/calculadora-risco',
        icone: 'calculadora',
        label: 'Calculadora de Risco',
        desc: 'Stake × bilhetes × odd: quanto uma boost expõe antes de entrar no ar.',
        tipo: 'embutido',
        src: '/apps/calculadora-risco/index.html',
        origem: 'calculadora-de-risco',
      },
      {
        to: '/monitor',
        icone: 'pulso',
        label: 'Monitor Super Odds',
        desc: 'Avisa no instante em que a trava de bilhetes de uma boost esgota.',
        tipo: 'embutido',
        src: '/apps/monitor/dashboard.html',
        origem: 'monitor-bilhetes-superodds',
      },
    ],
  },
  {
    id: 'welcome-boost',
    label: 'Welcome Boost',
    icone: 'raio',
    cor: 'amber',
    itens: [
      {
        to: '/welcome-boost',
        icone: 'raio',
        exato: true,
        label: 'Welcome Boosts',
        desc: 'Cadastro e acompanhamento das boosts de boas-vindas.',
        tipo: 'nativo',
        origem: 'welcome-boost-manager',
      },
      {
        to: '/welcome-boost/mensal',
        icone: 'calendario',
        label: 'Resumo Mensal',
        desc: 'Consolidado do mês por odd final, com os indicadores de apoio.',
        tipo: 'nativo',
        origem: 'welcome-boost-manager',
      },
      {
        to: '/welcome-boost/relatorios',
        icone: 'documento',
        label: 'Relatórios Gerais',
        desc: 'Números agregados de todos os relatórios salvos no período.',
        tipo: 'nativo',
        origem: 'welcome-boost-manager',
      },
      {
        to: '/welcome-boost/ids-repetidos',
        icone: 'copias',
        label: 'Ids Repetidos',
        desc: 'Jogadores que aparecem em mais de uma boost dentro do período.',
        tipo: 'nativo',
        origem: 'welcome-boost-manager',
      },
    ],
  },
  {
    id: 'campanhas',
    label: 'Campanhas',
    icone: 'trofeu',
    cor: 'blue',
    itens: [
      {
        to: '/quiz',
        icone: 'trofeu',
        label: 'Quiz',
        desc: 'Apuração de eventos de palpite: entradas, distribuição e premiação.',
        tipo: 'nativo',
        origem: 'pickem-dashboard',
      },
      {
        to: '/protegidos',
        icone: 'presente',
        label: 'Bingos Protegidos',
        desc: 'Fila de reembolso dos bilhetes dos tipsters: o que há a pagar, o que já foi pago e para quem.',
        tipo: 'nativo',
      },
    ],
  },
  {
    id: 'operacoes',
    label: 'Operações',
    icone: 'planilha',
    cor: 'green',
    itens: [
      {
        to: '/analisador-bet-list',
        icone: 'lista',
        label: 'Analisador Bet List',
        desc: 'Lê a planilha de apostas e resume por jogador, mercado e resultado.',
        tipo: 'embutido',
        src: '/apps/analisador-bet-list/index.html',
        origem: 'analisador-bet-list',
      },
      {
        to: '/utms',
        icone: 'ranking',
        label: 'Ranking de UTMs',
        desc: 'Conta as UTMs do arquivo de bilhetes e mostra as que mais se repetem.',
        tipo: 'nativo',
      },
      {
        to: '/prefixador',
        icone: 'etiqueta',
        label: 'Prefixador de IDs',
        desc: 'Cola a lista ou sobe a planilha e sai tudo com esportivabetbr_ na frente.',
        tipo: 'nativo',
      },
      {
        to: '/freebets',
        icone: 'presente',
        exato: true,
        label: 'Freebets',
        desc: 'Gera a lista de PlayerIds aptos ao pagamento de freebet. Roda 100% no navegador.',
        tipo: 'embutido',
        src: '/apps/freebets/index.html',
        origem: 'freebetspagamentos',
      },
    ],
  },
]

export const todosItens = secoes.flatMap((s) =>
  s.itens.map((i) => ({ ...i, secao: s.label, secaoId: s.id })),
)

// Casa a URL atual com o item de menu mais específico que a cobre — usado para
// o título do topo e para marcar o item ativo.
export function itemDaRota(pathname) {
  const candidatos = todosItens.filter((i) =>
    i.exato || i.to === '/' ? i.to === pathname : pathname.startsWith(i.to),
  )
  return candidatos.sort((a, b) => b.to.length - a.to.length)[0] ?? null
}
