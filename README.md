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
| Controle de Boost | `/boost-dashboard` | embutida | SportbookVsTipter |
| Calculadora de Risco | `/calculadora-risco` | embutida | calculadora-de-risco |
| Monitor Super Odds | `/monitor` | embutida (lê a API do deploy do monitor) | monitor-bilhetes-superodds |
| Welcome Boost | `/welcome-boost` (+ 3 sub-rotas) | módulo React | welcome-boost-manager |
| Quiz | `/quiz` | módulo React | pickem-dashboard |
| Analisador Bet List | `/analisador-bet-list` | embutida | analisador-bet-list |
| Ranking de UTMs | `/utms` | módulo React | nasceu aqui |
| Prefixador de IDs | `/prefixador` | módulo React | nasceu aqui |
| Freebets | `/freebets` | embutida | freebetspagamentos |
| Bingos Protegidos | `/protegidos` | módulo React | nasceu aqui |

**Módulo React** = componente montado dentro do portal, navegação instantânea.
**Embutida** = a página HTML original, servida de `public/apps/` dentro de um
iframe. São monolitos de JavaScript puro (o Controle de Boost tem 2.500 linhas)
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

O formulário de cadastro dos Bingos Protegidos **não mora aqui**: ele é um
repositório e um deploy próprios
([Bingos-Protegidos](https://github.com/rodrigomagalhaes-stack/Bingos-Protegidos)),
porque quem cadastra não precisa de login no portal. Os dois falam com as mesmas
tabelas, criadas por `supabase/protegidos.sql`.

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

### Como ele aprende o volume

O volume não vem de regra escrita no código. Não existe "gols vale 2× escanteios"
em lugar nenhum: `lib/aprendizado.js` **mede** a mediana de stake de cada
combinação sobre o `boost_days` e é isso que responde. Se escanteios passar a
puxar mais, a estimativa vira sozinha na próxima importação — não há passo manual
de treino.

O que é regra é só **como agrupar**. Três dimensões:

| | |
|---|---|
| **Vertente** | Sportsbook, Tipster ou Welcome. O que puxa volume num não é o que puxa no outro, e a tela tem um seletor "Cadastrar para" que troca as dicas inteiras. |
| **Família de mercado** | gols, escanteios, cartões, múltipla… (ver `lib/familias.js`). |
| **Faixa de odd** | até 1.50, 1.50–2.50, 2.50–4, 4–8, acima de 8. Uma boost de 1.20 e uma de 8.00 não disputam o mesmo público. |
| **Time e confronto** | cada time tem o porte dele, e o confronto exato tem o seu. Multiplica o volume estimado. |

#### A hierarquia é o que separa aprender de decorar

A célula que interessa — "Tipster, escanteios, odd 2.50 a 4" — costuma ter duas
ou três observações, e a mediana de duas observações é ruído com cara de número.

Então cada célula é puxada na direção do pai: `(vertente, família, odd)` →
`(vertente, família)` → `(família)` → `(vertente)` → tudo, com peso
`n / (n + 8)`. Com 2 amostras a célula pesa 1/5; com 40, quase tudo. Uma
observação de R$ 50 mil num mar de R$ 1 mil não vira a estimativa.

Cada dica mostra **de onde o número veio** — "aprendido de Tipster · Escanteios ·
12 boosts" ou "aprendido de todas as boosts" —, porque saber qual dos dois foi é
a diferença entre confiar e não confiar nele. E o bloco **"O que ele aprendeu"**
abre a tabela inteira: volume mediano por vertente e mercado, com o tamanho da
amostra ao lado. A recomendação não é caixa preta.

#### O porte é por time, não por "algum dos dois"

A primeira versão juntava num balde só toda linha do histórico que citasse
qualquer um dos dois times e tirava uma mediana. Isso mistura o público do
Flamengo com o do Remo e devolve um número que não descreve nenhum dos dois.

Agora cada time tem o fator dele, medido sobre os jogos dele, e os dois se
combinam pela **média geométrica** — não pela aritmética, porque o fator é
multiplicativo: um time de 2× com um de 0,5× tem de dar 1×, e a aritmética daria
1,25×, inflando todo jogo de time grande contra time pequeno.

Por cima disso entra o **confronto exato**, quando ele já se repetiu: clássico
tem público próprio, acima do que os dois times sozinhos explicam. Num teste com
histórico fabricado, Flamengo × Corinthians deu 2,86× pelo nível de confronto,
enquanto Flamengo × Remo ficou em 0,56× pelo nível de time. O refinamento também
é em espaço logarítmico, pela mesma razão de ser multiplicativo.

Confronto raro quase não move nada: com uma aparição o peso é 1/5.

#### A odd começou a ser gravada agora

O `boost_days` guardava vertente e mercado, mas **não a odd**: o Controle de
Boost lia `Price`/`Net Price` da planilha só para detectar a campanha de
aumento e descartava antes de salvar. A dimensão de odd existia no modelo e não
tinha o que ler.

Agora o import grava a **mediana** das cotações pagas de cada grupo (mediana e
não média: um bilhete com cotação fora da curva jogaria o grupo inteiro para
outra faixa). Dias antigos continuam sem odd e o modelo simplesmente não usa
aquela dimensão para eles — o painel mostra quantas linhas já têm a odd, e a
dimensão liga sozinha conforme os dias vão sendo importados.

Quando ligar, ela também passa a distinguir as seleções de um mesmo mercado por
volume: a margem delas empata (ver adiante), mas o favorito a 1.35 e o azarão a
12.00 caem em faixas diferentes e deixam de ser intercambiáveis.

### O que é do jogo e o que é generalizado

Vale saber onde a recomendação é sob medida e onde ela é média de todo mundo:

| | |
|---|---|
| **Margem e custo** | 100% daquele jogo. Saem das odds reais do evento — `basePrice` e `price` de cada boost, e o grupo de de-vig do mercado dela. Dois jogos nunca dão o mesmo número. |
| **Volume** | o que o modelo aprendeu para aquela **vertente + família + faixa de odd** (generalizado: vale para qualquer jogo) × o **porte do confronto** (específico: o fator de cada time, combinado, e o do clássico quando ele já se repetiu). |

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
- **Histórico de volume** — `boost_days`, a mesma tabela que o Controle de
  Boost grava a cada importação. Lida do navegador, assinada com o usuário
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
o dia é importado no Controle de Boost, o realizado chega em `boost_days` e
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

## Bingos Protegidos

O tipster publica um bilhete; quem seguiu a dica e perdeu recebe a stake de
volta. Esta aba é a fila desse reembolso: o que há a pagar, o que já foi pago, e
para quem.

São **duas peças em URLs diferentes**. O cadastro do bilhete é um repositório e
um deploy próprios
([Bingos-Protegidos](https://github.com/rodrigomagalhaes-stack/Bingos-Protegidos)),
para quem cadastra não precisar de login no portal. A apuração mora aqui, atrás
do login de sempre. As duas falam com as mesmas tabelas
(`supabase/protegidos.sql`).

### O que é status e o que é data

Só duas coisas são status no banco: **pago** e **recusado** — as que são decisão
de alguém. "Aguardando confronto" e "liberado para pagar" saem da comparação
entre a data do último jogo e hoje.

Não é economia de coluna. Status que alguém precisa mover é status que um dia
fica errado: basta o jogo acabar num domingo para a fila mentir até segunda. Da
data, a fila se mantém sozinha — e um bilhete jamais aparece como pagável antes
de o jogo terminar.

Um bilhete com jogo marcado para **hoje** conta como aguardando. Durante o
próprio dia dele o resultado não saiu, e os dois erros têm tamanhos diferentes:
pagar antes de o bilhete resolver é dinheiro que sai errado; esperar é esperar.

### O valor a pagar não existe até a base subir

O reembolso é dos apostadores, não do tipster. O que sai do caixa é a soma do
que **cada seguidor** apostou, e isso só se sabe quando a base é gerada — a
`stake` cadastrada é a do bilhete que o tipster publicou.

Por isso a caixa **A pagar** conta bilhetes e mostra a stake como referência,
sem somar um "valor previsto". Um número previsto ali seria confundido com
compromisso de caixa na primeira vez que alguém o exportasse, e não reconcilia
com extrato nenhum. Dinheiro só aparece na caixa **Paga**, e vem somado do CSV.

### Três datas existem, e o filtro usa uma só

O jogo foi domingo, o cadastro entrou segunda, o pagamento saiu quinta —
"setembro" quer dizer três coisas diferentes. O filtro da caixa **Paga** recorta
pela **data do confronto**, a que foi preenchida no cadastro.

Não é a data em que alguém clicou em "pago": essa registra quando a pessoa mexeu
no sistema, e não diz respeito à rodada que se está conferindo. Um bilhete de
agosto pago em setembro pertence a agosto para quem confere a rodada. A ordem
dos cartões segue o mesmo critério, senão a lista embaralharia em relação ao
recorte que a produziu.

As outras duas datas continuam gravadas (`enviado_em`, `pago_em`) e o filtro em
`lib/filtros.js` aceita as três — o que a tela não faz é oferecer a escolha, que
é onde nascia a confusão de filtrar por uma e ler como se fosse outra.

### A caixa A pagar não tem filtro de data

E isso é decisão, não esquecimento. Ela é lista de trabalho: com um padrão de
"últimos 7 dias", o bilhete parado há três semanas — exatamente o que não pode
ser esquecido — sumiria da tela, e ninguém procura o que não sabe que existe.

Os cartões vêm ordenados pelo que espera há mais tempo, com uma faixa amarela na
lateral quando o jogo já terminou e o contador de dias virando vermelho a partir
de uma semana. É o único aviso que existe, porque a caixa não avisa sozinha.

A caixa **Paga** é o contrário: é relatório, e relatório sem período é uma lista
infinita sem pergunta. Ela nasce no mês corrente.

### A base paga, e o que ela abre

Ao marcar o pagamento, sobe-se o CSV da base reembolsada. O arquivo vai para um
bucket privado (auditoria) e as **linhas** viram tabela — é essa segunda metade
que permite ver o mesmo jogador reembolsado em bilhetes de tipsters diferentes,
na tela **IDs repetidos**, o mesmo cruzamento que o Welcome Boost já faz.

O cruzamento roda no banco, numa função com as datas como argumento. Uma view
não serviria: o agrupamento aconteceria antes do filtro de período aplicado por
cima, e a contagem sairia do histórico inteiro. E trazer as linhas para o
navegador seriam dezenas de MB a cada abertura de tela.

Aparecer nessa lista **não é prova de nada** — seguir dois tipsters é normal, e a
proteção vale para os dois bilhetes. O que a coluna de tipsters distintos mostra
é onde vale olhar.

### O arquivo diz quem, a stake diz quanto

O CSV da base traz **só a lista de quem recebe**. A primeira versão pedia
também uma coluna de valor, e a base real desmentiu isso: ela vem com
`PlayerId,Amount` e a `Amount` chega **vazia em todas as linhas**. A tela achava
a coluna pelo nome, lia zero em tudo e registrava um pagamento de R$ 0,00 com ar
de número conferido — o pior tipo de erro, porque nada nele parece errado.

O valor não está no arquivo porque não precisa estar: num bingo protegido cada
seguidor recebe de volta **a stake do bilhete**. Então o total é
`stake × jogadores`, e a tela mostra a conta por extenso (`34 jogadores ×
R$ 30,00 = R$ 1.020,00`) para ser conferida de cabeça antes de o dinheiro sair.

Isso muda o que um ID repetido no arquivo significa: com valor por linha, era
uma linha a mais; com valor pela stake, é **a mesma pessoa reembolsada duas
vezes pelo mesmo bilhete**, e o total sai maior que o devido. Por isso a leitura
entra uma vez por jogador e conta quantas repetidas descartou.

A coluna do jogador continua sendo escolhida na tela, como o Prefixador e o
Ranking de UTMs já fazem — nenhum layout é assumido.

### As três travas que moram no banco

Cadastrar o mesmo bilhete duas vezes é reembolsar duas vezes, então a unicidade
não fica no código de nenhuma das duas pontas:

- **link duplicado** — índice único sobre o link normalizado, ignorando os
  recusados (senão um bilhete recusado por erro de digitação ficaria bloqueado
  para sempre pelo próprio registro descartado). A normalização baixa a caixa só
  do domínio: código de bilhete costuma ser sensível à caixa, e `aBc12` e
  `abc12` são bilhetes diferentes.
- **mesmo arquivo no mesmo bilhete** — a base aceita mais de um envio (reembolso
  sai em lote), e é isso que abre o duplo envio por engano dobrando o valor pago.
- **chave do jogador** — coluna gerada no banco, não calculada no navegador.
  Quem escreve nessas tabelas são dois programas diferentes, e chave calculada
  em dois lugares é chave que um dia diverge e passa a errar em silêncio.

### O formulário não tem a chave do banco

A chave `anon` vai compilada em qualquer JavaScript que a use, e o RLS do portal
resolve isso exigindo o token de quem está logado. No formulário não há ninguém
logado: a escrita passa por uma função serverless com a *service role*, que mora
só nas variáveis daquele projeto. A alternativa — uma política de `insert` para
`anon` — seria mais curta e deixaria qualquer um injetando bilhete falso direto
na fila de pagamento.

O endereço é aberto: quem tiver o link cadastra. O que sobra de proteção é o
índice único do link, no banco, e a conferência humana — nada é pago sem alguém
abrir o cartão, ver o bilhete no site e subir a base. Se um dia isso não bastar,
o caminho que não mexe no formulário é a *Deployment Protection* da Vercel.

### O nome do tipster é digitado, e por isso é normalizado

Não há cadastro de tipsters: quem preenche escreve o nome. Sem nada por cima,
"Rodrigo" hoje e "rodrigo" amanhã seriam dois tipsters em toda soma — e depois
de gravados não haveria como saber que eram o mesmo.

Quem junta é `tipster_chave`, coluna **gerada** no banco: caixa, espaço sobrando
e acento não separam. Ser gerada é o ponto — quem escreve nessas tabelas são
dois programas diferentes (o BI e o formulário), e chave calculada em cada um é
chave que um dia diverge e passa a errar em silêncio.

O acento sai por `translate` com o alfabeto português, e não pela extensão
`unaccent`: `unaccent()` é STABLE, não IMMUTABLE — depende de um dicionário que
pode mudar —, e coluna gerada só aceita função imutável. `translate` cobre o que
o português usa e nunca deixa de ser imutável.

O que a chave **não** junta é nome de verdade diferente ("Rodrigo" e "Rodrigo
M."). Aí não há o que adivinhar sem inventar agrupamento onde não existe.

### Antes de usar

Só `supabase/protegidos.sql` no SQL Editor. Ele roda numa base limpa e também
por cima da primeira versão do arquivo, que tinha a tabela de tipsters.

---

## Um tema só para todas as telas

Cada projeto chegou com a própria paleta: três escuras (Controle de Boost,
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
