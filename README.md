# BI Sportsbook — Esportiva Bet

Portal único das ferramentas de sportsbook, campanhas e operação. Projetos que
rodavam separados, cada um com sua URL, passam a viver no mesmo app: um login,
um menu, um deploy.

```bash
npm install
cp .env.example .env      # preencha (veja "Variáveis de ambiente")
npm run dev               # http://localhost:5173
```

`npm run dev` serve o portal **e** as funções de `/api` (um plugin do Vite
carrega `api/**.js` com o mesmo contrato de req/res da Vercel — ver
`vite-plugin-api-dev.js`). Antes disso, `/api/monitor/state` devolvia o
index.html do portal em desenvolvimento, e o painel do Monitor quebrava por um
motivo que não tinha nada a ver com ele.

---

## O que tem dentro

| Ferramenta | Rota | Como está integrada | Projeto de origem |
|---|---|---|---|
| Recomendador de Boosts | `/recomendador` | módulo React | nasceu aqui |
| Sportbook Vs. Tipster | `/boost-dashboard` | embutida | SportbookVsTipter |
| Calculadora de Risco | `/calculadora-risco` | embutida | calculadora-de-risco |
| Monitor Super Odds | `/monitor` | embutida (lê a API do deploy do monitor) | monitor-bilhetes-superodds |
| Welcome Boost | `/welcome-boost` (+ 3 sub-rotas) | módulo React | welcome-boost-manager |
| Quiz | `/quiz` | módulo React | pickem-dashboard |
| Analisador Bet List | `/analisador-bet-list` | embutida | analisador-bet-list |
| Ranking de UTMs | `/utms` | módulo React | nasceu aqui |
| Prefixador de IDs | `/prefixador` | módulo React | nasceu aqui |
| Freebets | `/freebets` | embutida | freebetspagamentos |

**Módulo React** = componente montado dentro do portal, navegação instantânea.
**Embutida** = a página HTML original, servida de `public/apps/` dentro de um
iframe. São monolitos de JavaScript puro (o Sportbook Vs. Tipster tem 2.500 linhas)
que já funcionam: reescrevê-los em React arriscaria a lógica sem mudar nada do
que o usuário vê. O iframe ainda isola o CSS global de cada um. Migrar uma
delas para módulo React depois é troca de uma linha em `src/shell/nav.js` mais
a rota — nenhuma das outras é afetada.

Os projetos originais estão intactos em `_originais/`, para consulta e
comparação. Nada foi apagado.

---

## Estrutura

```
src/
  main.jsx                 monta o app; BrowserRouter + AuthProvider
  App.jsx                  todas as rotas
  auth/                    login único (Supabase Auth) e guarda de rota
  shell/
    nav.js                 catálogo de tudo: menu, home e títulos saem daqui
    Shell.jsx              sidebar + topo + <Outlet/>
    EmbeddedApp.jsx        moldura das páginas em iframe
    shell.css              estilos do portal (prefixo `pb-`)
  modules/
    pickem/                cópia fiel de pickem-dashboard/src
    welcome-boost/         cópia de welcome-boost-manager/src
  pages/Home.jsx           página inicial com os atalhos

public/apps/               as páginas HTML, exatamente como eram
api/
  monitor/                 state · history · alerts · cron  (serverless)
  freebets/eventos.js      histórico de eventos pagos (Redis) — sem tela que a use
server/monitor/            backend do monitor, compartilhado entre a Vercel e
                           o modo local (`npm run monitor:start`)
supabase/                  os .sql de cada módulo
docs/                      documentação herdada dos projetos originais
_originais/                os projetos como estavam antes de entrar no portal
```

### Acrescentar uma ferramenta

1. Página pronta em HTML: jogue em `public/apps/<nome>/` e acrescente uma
   entrada `tipo: 'embutido'` em `src/shell/nav.js`. A rota se cria sozinha.
2. Módulo React: `src/modules/<nome>/`, com um `index.jsx` que embrulha o app
   em `<div className="m-<nome>">`, mais o escopo de CSS em `vite.config.js` e
   a rota em `src/App.jsx`.

---

## Recomendador de Boosts

Escolhido um jogo, a tela entrega **cinco dicas por vertente** — Single e Bet
Builder — ordenadas pelo resultado esperado em reais. A pergunta que ela responde
é "o que eu subo neste jogo".

### Duas vertentes, cinco dicas, um número

A primeira versão tinha quatro critérios de ordenação (resultado, volume, margem,
custo) e uma tabela única de 160 linhas. Era um painel de análise, não uma lista
de dicas. Os outros três critérios são as **partes** do primeiro: escolher entre
eles é responder metade da pergunta. Volume alto com margem negativa é prejuízo
em escala; margem alta sem volume não rende nada. Ficou um número só, em reais,
que é a linguagem em que a boost é decidida — com odd, custo e volume embaixo de
cada dica, menores, para conferir de onde ele veio.

**As duas listas trazem só boost que ainda não existe.** Boost publicada
ocupando uma das cinco vagas é uma dica que não dá para agir — ela vai para a
seção "Já no ar neste jogo", onde continua servindo de conferência.

**Single** sugere mercado novo: a odd de cada seleção é publicada, então dá para
calcular a margem de uma boost que ainda não existe.

**Bet Builder monta a combinação.** A odd combinada é estimada, e o erro tem
tamanho conhecido: não existe endpoint que precifique uma múltipla nova (os oito
nomes prováveis do widget do Altenar devolvem 404), então o que dá para fazer é
medir o desconto que a casa aplica nas múltiplas que ela mesma publicou. Em 33
delas, a razão entre o preço publicado e o produto das pernas ficou entre
**0,54 e 1,12**, com mediana 0,98 (2 pernas) e 0,97 (3 pernas).

A mediana serve de estimativa; a dispersão é o erro possível, e ela é grande
porque depende de QUAIS pernas se combinam — "mais gols" e "mais escanteios"
andam juntos, "menos gols" e "mais escanteios" não. Por isso toda combinação sai
com a marca `odd a conferir`: o número serve para **ordenar** as sugestões entre
si (todas erram na mesma direção) e dar ordem de grandeza; o valor final vem do
back-office.

Três cortes tiram a repetição das combinações:

- pernas de **famílias diferentes** — "mais de 2.5 gols" com "mais de 3.5 gols" é
  o mesmo palpite vendido duas vezes: a segunda perna quase não baixa a chance
  mas multiplica a odd;
- **uma dica por conjunto de famílias** — sem isso o top 5 vinha com
  "gols + escanteios" cinco vezes, variando só a linha;
- **uma perna aparece no máximo duas vezes**. Só o corte por família não bastou:
  num jogo real, "1º tempo - handicap 1X2 Lincoln (0:2)" era a perna mais valiosa
  e entrava em quatro das cinco dicas, cada vez com um par diferente. Tecnicamente
  eram cinco combinações distintas; na prática, a mesma dica quatro vezes.

### O que ele ranqueia — e o que ele recusa a ranquear

O caminho óbvio seria somar o net que cada mercado deu no histórico e ordenar
por ele. **Ele está errado**, e o código diz isso em três lugares para ninguém
o reimplementar por engano.

O net de uma boost é uma amostra de variância enorme: um bilhete de odd 5.60 ou
paga 4,6 vezes a stake ou não paga nada. Com as 3 ou 4 vezes que um mercado
aparece no histórico, o net acumulado dele é quase inteiramente sorte —
ranquear por ali recomenda o mercado que por acaso perdeu duas seguidas e evita
o que por acaso ganhou. O que se separa em sinal e ruído:

| | |
|---|---|
| **Volume** | previsível. Que gols puxa mais que desarmes, e que um clássico puxa mais que um jogo de meio de tabela, se repete. Vem da mediana de stake da família × o porte do confronto. |
| **Margem** | conhecida **antes** de a boost ir ao ar, sem histórico nenhum: está na distância entre a odd original e a turbinada, uma vez tirada a margem que a odd já embutia. |
| **Net** | o resultado sorteado dessas duas. Aparece em cada dica como conferência, sempre ao lado do tamanho da amostra, nunca no ranking. |

O score é `margem esperada × volume esperado`, o resultado esperado em reais.
Nenhuma das duas metades sozinha responde: boost com margem ótima que ninguém
aposta não rende nada, e boost que puxa muito volume com margem negativa é
prejuízo em escala.

### O que é do jogo e o que é generalizado

Vale saber onde a recomendação é sob medida e onde ela é média de todo mundo:

| | |
|---|---|
| **Margem e custo** | 100% daquele jogo. Saem das odds reais do evento — `basePrice` e `price` de cada boost, e o grupo de de-vig do mercado dela. Dois jogos nunca dão o mesmo número. |
| **Volume** | mediana da **família** (generalizada: quanto "total de gols" costuma puxar, em qualquer jogo) × **fator do confronto** (específico: quanto as boosts destes times puxaram, contra o jogo mediano). |

Ou seja: a ordem entre mercados dentro de um jogo é dele; o formato dessa ordem
se repete entre jogos, escalado pelo porte do confronto. E se os times não têm
histórico, o fator vale 1 e o volume vira puramente generalizado — é por isso
que a tela mostra o fator e de quantas boosts ele saiu, em vez de escondê-lo.

Ajustar isso mais fino (mediana por família **e** campeonato, por exemplo) é
questão de ter amostra: hoje ela não daria.

### De onde vêm os números

- **Lista de jogos** — `/api/recomendador/jogos` chama o `GetEvents` do Altenar:
  o calendário inteiro, 1.665 jogos de futebol cobrindo umas seis semanas. A
  primeira versão listava a vitrine (`superodds-betcards`), que só conhece jogo
  que **já** tem Super Odds publicada — 14 num dia normal. Quem ia montar a
  boost de amanhã não achava o jogo, que é justamente quando a tela serviria. A
  vitrine continua sendo lida, mas só para marcar quais jogos já têm boost no
  ar. O campo de ID do evento na tela ignora o catálogo e abre qualquer jogo,
  inclusive fora dessas seis semanas — ele aceita o número puro, o final do
  endereço (`le-16462691`) ou a URL inteira do site colada.
- **Candidatos e odds** — `/api/recomendador/evento` chama o `GetEventDetails`
  do Altenar, o mesmo que o Monitor já usava. A resposta passa de 2 MB (354
  mercados e 8.716 odds num PSG x Monaco) e o servidor a enxuga para ~25 KB.
  Passa pelo backend, e não direto do navegador, por dois motivos: o tamanho, e
  o 403 que o Altenar devolve quando o Referer é o domínio da Esportiva.
- **Histórico de volume** — `boost_days`, a mesma tabela que o Sportbook Vs.
  Tipster grava a cada importação. Lida do navegador, assinada com o usuário
  logado (`src/lib/supabaseRest.js`).
- **Dicas marcadas** — `boost_dicas`, criada por `supabase/boost_dicas.sql`.
  Precisa ser aplicada à mão antes de o botão "subi essa" funcionar; sem ela a
  tela avisa e o resto continua.
- **Nada de novo no ambiente.** Reaproveita `ALTENAR_URL`, `ALTENAR_INTEGRATION`
  e `BASE_URL`, todas com valor padrão em `server/monitor/config.js`.

### O de-vig é por coluna, não por mercado

`desktopOddIds` é uma **grade**: cada linha é um desfecho e cada **coluna** um
conjunto complementar. No 1x2 são três linhas de uma coluna só, e a coluna é o
mercado inteiro. Em "Total (mais/menos) Chutes a Gol PSG" são duas linhas (Mais
/ Menos) e cinco colunas (4.5 … 8.5): a coluna do 7.5 é `{Mais de 7.5, Menos de
7.5}` e só ela soma ~1.

Somando o mercado inteiro daria 5,4 de probabilidade implícita — cinco pares
empilhados — e a probabilidade sairia cinco vezes menor que a real. Duas outras
armadilhas na mesma conta:

- **Chance dupla soma ~2**, não ~1: cada seleção contém dois dos três desfechos.
  Lida como cobertura simples, viraria 110% de margem. O código arredonda a soma
  para achar quantas vezes o grupo cobre o espaço e divide por isso.
- **Marcador e resultado correto** não fecham em inteiro nenhum (0,26 numa
  medição). Ali não há de-vig possível: a linha sai marcada `estimado`.
- **E a soma às vezes engana.** "Marcador - Fulano" traz Primeiro / Último /
  Qualq. Altura, três coisas que acontecem juntas; num jogo real elas somaram
  1,03 e teriam passado como um mercado de 3% de margem, inventando a
  probabilidade da seleção. Por isso existe `GRUPO_NAO_COMPLEMENTAR` em
  `lib/score.js`: marcador, assistências e resultado correto vão direto para a
  estimativa, sem passar pela checagem numérica que os aceitaria por acidente.

### Múltipla é ancorada na odd da casa

A margem de uma múltipla **não** sai do produto das pernas de-vigadas. Pernas do
mesmo jogo são correlacionadas — se sai gol, sai escanteio — e o produto
subestima muito a chance real de o bilhete ganhar: uma dupla de 4.00 aparecia
com 63% de margem para a casa, número que não existe em livro nenhum.

A âncora é a odd combinada que a **própria casa** publicou, com a margem das
pernas descontada dela: `p = (1/basePrice) × Π 1/(1 + overround da perna)`. A
casa já resolveu a correlação ao precificar a múltipla, e `basePrice` traz o
ajuste pronto. A mesma dupla dá 11%.

### O limite mais importante: 3 de 4 boosts têm a margem ASSUMIDA

Numa auditoria de **94 boosts reais** em 10 jogos, só **24% fecharam com a
margem medida**. O resto caiu nos 7% assumidos por perna. O motivo é estrutural,
não um bug:

| | |
|---|---|
| pernas individuais | 43% medidas |
| boosts de perna única | 22% medidas |
| múltiplas (2+ pernas) | 33% medidas |

Perna única de-viga MENOS que múltipla porque as boosts simples caem quase todas
em mercado de jogador — marcador, assistências, "Chutes a Gol - Fulano: Mais de
0.5 / 1.5 / 2.5". Essa escada de limiar não tem o "menos de" do outro lado, então
não existe conjunto complementar para tirar a margem. Múltipla precisa de todas
as pernas boas, mas as pernas dela costumam ser de mercado principal.

**O viés tem direção conhecida.** Mercado de jogador carrega mais margem que os
7% assumidos; assumindo menos, o sistema calcula uma probabilidade maior que a
real e reporta *menos* margem e *mais* custo do que existe. Erra para o lado
conservador — mas empurra sistematicamente as boosts de mercado de jogador para
baixo no ranking.

A tela mostra **% das boosts com margem medida** entre os indicadores, e cada
linha estimada leva a marca. Fechar essa lacuna depende de saber a margem que a
casa realmente pratica nesses mercados — informação de operação, não do feed.

### Uma dica por mercado, não por seleção

O top 5 de Single chegou a aparecer com "1x2 Faltas" três vezes seguidas —
Bragantino, Empate e Bahia —, três linhas com o mesmo número ocupando o lugar de
outros mercados. Não era só feio: é que **as seleções de um mercado são
indistinguíveis para este modelo**.

```
p           = (1 / base) / (1 + overround)
price       = base × (1 + lift)
margemBoost = 1 − p × price = 1 − (1 + lift) / (1 + overround)
```

O `base` se cancela. Turbinar o favorito a 1.58 ou o azarão a 12.00 entrega
exatamente a mesma margem, e o volume também é igual — ele vem da família, que é
a mesma. As diferenças de 8,7 / 8,8 / 8,8 pp que apareciam na tela eram só o
arredondamento da odd turbinada a duas casas (no máximo ~0,4 pp, para a menor
odd que vira sugestão).

Então a sugestão é do **mercado**, com as seleções listadas junto como opções.
Escolher qual turbinar é de quem conhece o jogo: o modelo não tem o que dizer
aí, porque o histórico de volume é por família e nunca por seleção. Boosts que
já estão no ar continuam uma linha cada — ali as odds turbinadas são reais e a
casa não aplicou um lift uniforme.

### Mercado combinado tem família própria

"Total e ambas equipes marcam" e "1x2 e total" são uma seleção só no site — boost
Single, portanto —, mas não puxam o volume do mercado de que levam o nome. Sem
família própria eles herdavam o histórico do componente: o primeiro caía em
"ambas" e recebia o volume do Ambas Marcam simples. Numa prévia com dados reais
isso bastou para os combinados ocuparem as cinco primeiras dicas de Single em
dois jogos de três — justamente a parte da tela em que se age.

A regra que os separa está em `lib/familias.js`: o nome precisa juntar duas
coisas com " e " **e** casar em duas famílias diferentes. Só a segunda condição
não bastaria ("Total de gols" casa em gols e em "outros totais" sem ser
combinado); só a primeira também não.

### O placar: o que ele previu contra o que aconteceu

Marcar **subi essa** numa dica grava a previsão em `boost_dicas` (SQL em
`supabase/boost_dicas.sql`, aplicado à mão no SQL Editor como os outros). Quando
o dia é importado no Sportbook Vs. Tipster, o realizado chega em `boost_days` e
os dois se encontram por **jogo + família** — não por nome de mercado, porque o
Altenar escreve "Total de gols" e a planilha escreve "Total Goals Over/Under".

**A previsão é gravada, não recalculada.** Recalcular na hora da comparação
avaliaria o modelo de hoje contra o resultado de ontem, e a mediana de volume já
teria absorvido aquele mesmo jogo — ele sempre pareceria certo. Os campos
`prev_*` guardam o que a tela dizia no momento da escolha e não mudam mais.

O placar separa dois erros que amadurecem em ritmos muito diferentes, e por isso
nunca são somados num "acerto de X%":

| | |
|---|---|
| **Erro de volume** | vira sinal com poucas observações. Se gols sai 3× abaixo do realizado três vezes seguidas, isso não é sorte: é a mediana da família fora de lugar. É o número que justifica mexer no modelo. |
| **Erro de resultado** | precisa de dezenas de observações. Uma boost de odd alta ou paga muito ou não paga nada; errar o net de uma delas não diz nada. Aparece sempre com o n do lado. |

Duas armadilhas que o código evita de propósito:

- **Viés de seleção.** Se só as marcadas entrassem, nunca se saberia o que as
  boosts recusadas teriam rendido e o recomendador pareceria melhor do que é. O
  bloco "rodaram nos mesmos jogos e não foram marcadas" é a contraprova, e sai
  de graça: o `boost_days` já tem todas.
- **Contagem dupla.** Marcar "Bragantino" e "Empate" é marcar duas seleções do
  mesmo mercado, e as duas casam com a MESMA linha do `boost_days` — que agrega
  por evento+mercado, sem separar seleção. Cada dica continua mostrando o
  realizado do mercado dela (marcado `do mercado` na tela), mas nos totais cada
  linha entra uma vez só. Sem isso, numa simulação, R$ 44 mil de um 1x2 contavam
  duas vezes e o placar inteiro inflava.

### Aprender vem depois de medir

O sistema **não** se auto-ajusta, e isso é decisão, não pendência. Com cinco ou
dez observações, "aprender" é decorar sorte — o mesmo motivo pelo qual o ranking
se recusa a usar o lucro passado. Metade do aprendizado já acontece sozinha: o
volume é a mediana de `boost_days`, então todo relatório importado melhora a
estimativa sem código novo. O placar é o que diz **se ela acertou** — e só
depois de o erro de volume se mostrar sistemático é que vale calibrar, e aí um
parâmetro de cada vez.

### Quando ele degrada, ele avisa

O histórico nomeia mercados como a planilha da provedora exporta ("Total Goals
Over/Under"); o Altenar, do jeito dele ("Total (mais/menos) Chutes a Gol PSG").
Os dois caem numa **família** (`lib/familias.js`, regras em português e inglês)
porque casar string com string acharia quase nada e cada rótulo viraria uma
amostra de tamanho 1.

Se a provedora mudar os rótulos, a estimativa de volume degradaria em silêncio.
Por isso a tela mostra sempre **% do histórico classificado** e, no diagnóstico,
os rótulos que ficaram de fora — cada um é um candidato a virar regra nova.

---

## Um tema só para todas as telas

Cada projeto chegou com a própria paleta: três escuras (Sportbook Vs. Tipster,
Analisador, Freebets), uma bege-quente (Welcome Boost), uma cinza-clara
(Monitor) e o Pick'em em preto. Todas foram para o mesmo branco.

O caminho não foi reescrever CSS: **cada página já usava variáveis num
`:root`**, então o `:root` de cada uma passou a apontar para a paleta comum.
As regras de layout continuam idênticas às do projeto original — só a origem
das cores mudou. Os dois arquivos que mandam nas cores:

- `src/shell/shell.css` — o portal e os módulos React
- `public/apps/_shared/tema.css` — as telas embutidas, que rodam em iframe e
  não enxergam o CSS do portal

São espelhos um do outro. Mudou uma cor num, mude no outro.

O Pick'em e o Welcome Boost também precisavam ficar isolados entre si: os dois
declaravam `:root` e `.app-header`, e num bundle só o último a carregar
venceria. O `vite.config.js` prefixa todo seletor de cada módulo com a classe
do seu wrapper (`.m-pickem`, `.m-welcome-boost`), e `:root`/`body` viram o
próprio wrapper — é lá que as variáveis pousam para cascatear até os estilos
inline.

### O que saiu de cada tela

Logo, nome do programa e barra de marca foram removidos de todas: quem nomeia
a tela agora é o topo do portal. Ficou o que era funcional — as abas do Boost
Dashboard, o indicador de conexão do Pick'em, o estado da coleta no Monitor.
O alternador claro/escuro do Analisador saiu junto com o tema escuro. Nenhuma
tela leva o usuário para fora da moldura.

## Variáveis de ambiente

Tudo documentado em `.env.example`. Os quatro grupos:

- **`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`** — login do portal e banco
  do Welcome Boost. Sem elas o portal abre **sem autenticação** e avisa isso no
  topo (trancar todo mundo do lado de fora seria pior).
- **`VITE_PICKEM_SUPABASE_*`** — separadas de propósito: as tabelas do Pick'em
  podem estar em outro projeto. Vazias = modo "Local", como o Pick'em já era.
  Antes de preencher, aplique `supabase/pickem_schema.sql`.
- **`KV_REST_API_*`** — Redis que servia o histórico de eventos pagos do
  Freebets · Processador. Essa tela foi removida do portal; a função
  `api/freebets/eventos.js` continua no repositório, mas hoje ninguém a chama.
- **`DATABASE_URL`, `CRON_SECRET` e a família do monitor** — só fazem falta se
  o portal for servir os números do Monitor por conta própria. Hoje ele lê do
  deploy `monitor-bilhetes-superodds`, que já coleta — ver a seção abaixo.
  Detalhes das variáveis em `docs/monitor-superodds.md`.

### Login e cadastro

A tela de entrada tem dois modos, e-mail e senha nos dois: **Entrar** e **Criar
conta** (`/#criar-conta` abre direto no cadastro, para mandar o link a quem
ainda não tem acesso). Não há login social.

O cadastro chama `supabase.auth.signUp`, então depende de duas chaves do
projeto no Supabase, em `Authentication → Sign In / Providers → Email`:

- **Allow new users to sign up** precisa estar **ligado**. Desligado, a tela
  mostra "o cadastro está desativado no projeto do Supabase".
- **Confirm email** decide o fluxo: ligado, a pessoa recebe um e-mail e só
  entra depois de confirmar; desligado, ela entra na hora.

#### Só e-mails de domínio autorizado

O cadastro é restrito a `@esportiva.bet`, em duas camadas:

- **`VITE_DOMINIOS_PERMITIDOS`** (lista separada por vírgula) faz a tela avisar
  na hora que o e-mail não serve. É conveniência, não segurança — quem chamar
  a API do Supabase direto passa por cima disso.
- **`supabase/restringir_cadastro_por_dominio.sql`** é o que bloqueia de fato:
  cria a função do hook *Before User Created*, que o Supabase executa antes de
  criar o usuário e que recusa domínio fora da lista. Aplique o SQL e ligue o
  hook em `Authentication → Hooks → Before User Created`. As instruções estão
  no cabeçalho do arquivo.

Mantenha as duas listas em sincronia: o SQL é quem manda, a variável é quem
avisa. Sem o hook, o cadastro continua aberto a qualquer domínio.

### Sobre a chave anon

A chave que ficava fixa no código continua funcionando como reserva, mas agora
é lida do ambiente. Ela é pública por natureza (o navegador sempre a enviou) —
o que **não** existe hoje é RLS nas tabelas do Supabase: o login protege a
tela, não os dados. Quem souber a URL do projeto lê e escreve. Ativar RLS é o
próximo passo recomendado e independe deste portal.

---

## Comandos

| | |
|---|---|
| `npm run dev` | portal em desenvolvimento |
| `npm run build` | build de produção em `dist/` |
| `npm run lint` | ESLint (as ressalvas herdadas dos módulos ficam como aviso) |
| `npm test` | testes do Welcome Boost (44) |
| `npm run monitor:start` | monitor + painel local em `http://localhost:8787` |
| `npm run monitor:once` | um ciclo de coleta e sai |
| `npm run monitor:discover` | redescobre a lista de itemIds |

---

## Deploy

Um projeto na Vercel para tudo (`vercel.json`): build do Vite, as funções de
`api/`, o fallback de SPA para as rotas do portal e o cron diário do monitor em
`/api/monitor/cron`. O ciclo real do monitor continua dependendo de um
agendador externo chamando essa rota a cada ~1min — o cron nativo do plano
Hobby roda 1x/dia e serve só de rede de segurança.

As rotas de API ganharam prefixo por módulo (`/api/monitor/state`,
`/api/freebets/eventos`) para os dois backends conviverem. O painel local do
monitor atende aos dois formatos, então `public/apps/monitor/dashboard.html` é
o mesmo arquivo nos dois ambientes.

### De onde o Monitor lê

A coleta do Monitor é um processo contínuo: um agendador externo chama
`/api/cron` a cada ~1min e grava as contagens no Postgres. Quem faz isso é o
deploy `monitor-bilhetes-superodds`, que já está no ar com banco e agendador
funcionando — e cuja API é pública e CORS-aberta.

Por isso o painel do portal **lê daquela API** (a constante `API` no topo do
script de `public/apps/monitor/dashboard.html`), em vez de o portal montar um
segundo coletor gravando no mesmo banco: dois cron jobs em paralelo dobrariam
leituras e alertas.

O backend continua inteiro aqui (`server/monitor/`, `api/monitor/`), mas o
`vercel.json` do portal **não declara cron**, de propósito: um cron aqui
chamaria `/api/monitor/cron` sem `DATABASE_URL` e falharia todo dia — e, se
alguém preenchesse a variável para resolver o erro, passariam a existir dois
coletores gravando no mesmo banco, duplicando leituras e alertas do Telegram.

Para o portal passar a servir os números sozinho: troque aquela constante por
`'/api/monitor'`, preencha `DATABASE_URL` e `CRON_SECRET`, declare o cron aqui
e **desligue o do outro projeto** — nessa ordem.
