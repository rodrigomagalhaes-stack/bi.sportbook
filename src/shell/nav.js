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
    itens: [
      {
        to: '/',
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
    itens: [
      {
        to: '/boost-dashboard',
        label: 'Boost Dashboard',
        desc: 'Acompanhamento diário de boosts: apostado, risco e resultado por dia.',
        tipo: 'embutido',
        src: '/apps/boost-dashboard/boost-dashboard.html',
        origem: 'SportbookVsTipter',
      },
      {
        to: '/calculadora-risco',
        label: 'Calculadora de Risco',
        desc: 'Stake × bilhetes × odd: quanto uma boost expõe antes de entrar no ar.',
        tipo: 'embutido',
        src: '/apps/calculadora-risco/index.html',
        origem: 'calculadora-de-risco',
      },
      {
        to: '/monitor',
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
    itens: [
      {
        to: '/welcome-boost',
        exato: true,
        label: 'Welcome Boosts',
        desc: 'Cadastro e acompanhamento das boosts de boas-vindas.',
        tipo: 'nativo',
        origem: 'welcome-boost-manager',
      },
      {
        to: '/welcome-boost/mensal',
        label: 'Resumo Mensal',
        desc: 'Consolidado do mês por odd final, com os indicadores de apoio.',
        tipo: 'nativo',
        origem: 'welcome-boost-manager',
      },
      {
        to: '/welcome-boost/relatorios',
        label: 'Relatórios Gerais',
        desc: 'Números agregados de todos os relatórios salvos no período.',
        tipo: 'nativo',
        origem: 'welcome-boost-manager',
      },
      {
        to: '/welcome-boost/ids-repetidos',
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
    itens: [
      {
        to: '/quiz',
        label: 'Quiz',
        desc: 'Apuração de eventos de palpite: entradas, distribuição e premiação.',
        tipo: 'nativo',
        origem: 'pickem-dashboard',
      },
    ],
  },
  {
    id: 'operacoes',
    label: 'Operações',
    icone: 'planilha',
    itens: [
      {
        to: '/analisador-bet-list',
        label: 'Analisador Bet List',
        desc: 'Lê a planilha de apostas e resume por jogador, mercado e resultado.',
        tipo: 'embutido',
        src: '/apps/analisador-bet-list/index.html',
        origem: 'analisador-bet-list',
      },
      {
        to: '/freebets',
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
