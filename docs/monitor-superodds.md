# Monitor de Bilhetes — Super Odds (Esportiva Bet)

Avisa **no instante em que a trava de bilhetes de uma boost esgota**, com a hora
exata do fechamento e qual jogo era. De quebra mostra quais estão a ponto de
fechar e quais pararam de vender sem fechar.

Roda com **Node 20+** e uma única dependência (`pg`). Precisa de um banco
Postgres (grátis no [Neon](https://neon.tech), inclusive via integração do
Vercel Marketplace) — veja `DATABASE_URL` em `.env.example`.

```bash
npm install
node --env-file=.env src/monitor.js --serve   # ou: npm run start, com as env vars já exportadas
```

Também roda no Vercel sem servidor dedicado — veja [Rodar no Vercel](#rodar-no-vercel).

O painel só responde enquanto esse comando está rodando. Se der "conexão
recusada", é porque o processo não está no ar.

---

## Como ele pega o esgotamento na hora

Lê `superodds-counts` a cada **15s** e compara com o `betsLimit` de cada boost.
No ciclo em que a contagem alcança a trava, dispara o alerta.

Duas coisas fazem esses 15s valerem de verdade:

- **Cache da CDN.** As respostas vêm com `cache-control: max-age=45` atrás da
  Vercel. Ler mais rápido que isso devolveria o mesmo número em cache. O monitor
  manda um parâmetro descartável (`_t=`) que força `MISS` e vai direto na origem —
  testado, a resposta deixa de vir cacheada. Desligue com `CACHE_BUSTER=0` se
  quiser pegar leve com a infra deles.
- **A hora do fechamento é registrada, não estimada.** É o instante da última
  venda observada, ou seja, o momento em que a contagem bateu o teto — não a hora
  em que o alerta saiu.

A única coisa que ele não consegue datar é uma boost que **já estava esgotada
quando o monitor subiu**: aí não houve subida para observar, e tanto o painel
quanto o alerta dizem isso em vez de inventar um horário.

---

## O que a investigação mudou em relação ao briefing

**1. Não precisa de Playwright.** A lista de `itemIds` não precisa ser capturada
na corrida de carregamento da página. O front (Nuxt) monta a seção Super Odds a
partir de `GET /api/superodds-betcards`, público e sem sessão, que devolve muito
mais que os ids:

```
betCardId ......................... o itemId (mesma chave de superodds-counts)
eventName / champName / sportName . nome do jogo e campeonato
ribbonKind ........................ golden | turbo | welcome
slipBoostPayloadFull.betsLimit .... A TRAVA DE BILHETES
combinedPrice / combinedBasePrice . odd turbinada e odd original
legs[] ............................ mercados e seleções da múltipla
```

Isso resolve as duas pendências marcadas como "ainda não confirmado" no briefing.

**2. O contador é de bilhetes — confirmado.** Na primeira coleta o item
`15667810` (Golden São Paulo × Coritiba, trava de 1000) lia **1002/1000** e parou
ali. Os valores redondos que apareciam no briefing eram travas batendo o teto.

**3. O CORS não é aberto.** As respostas de `multiplas.esportiva.bet.br` não
trazem `Access-Control-Allow-Origin` nenhum. HTML aberto direto no navegador (o
protótipo `monitor-bilhetes-boost.html`) tem as leituras bloqueadas; de
Node/servidor funciona, porque CORS é regra de navegador. Por isso o painel novo
conversa com o backend local.

**A lista devolve 100 cards e ISSO NÃO É O TOTAL.**
`/api/superodds-betcards` devolve exatamente 100 e ignora qualquer parâmetro de
paginação (`take`, `limit`, `page`, `skip`, `offset`, `eventId`… todos testados).
`npm run validate` confirma que a *vitrine* Super Odds pede só esses 100 ids —
mas a **página do jogo** mostra boosts que não estão entre eles.

O caso que fechou a questão: em Real Bétis × Real Sociedad (`ev-17173212`) o site
exibia duas boosts ESGOTADAS. A vitrine devolvia 8 cards com trava para esse
jogo, e uma das esgotadas não estava em nenhum deles.

**4. Quem tem a lista completa é o Altenar.** O sportsbook que roda o site expõe,
por evento:

```
GET https://sb2frontend-altenar2.biahosted.com/api/widget/GetEventDetails
    ?integration=esportiva&culture=pt-BR&countryCode=BR
    &deviceType=1&numFormat=en-GB&timezoneOffset=180&eventId=<id>
```

O array `boosts` do retorno traz **todas** as boosts do jogo, sem corte:

```
id ....................... o mesmo itemId de superodds-counts
price .................... a odd ORIGINAL
boostInfo.price .......... a odd TURBINADA
boostInfo.betsLimit ...... A TRAVA DE BILHETES
boostInfo.endDate ........ quando a promoção expira
odds[] ................... (marketId, selectionId) — resolvíveis no mesmo payload
```

Para o Bétis: **16 boosts, 11 com trava**, contra 8 da vitrine. A que faltava era
a `15997514` (odd 1.5 → 1.65, trava 1900), lida ao vivo em **1900/1900**.

Duas ressalvas de quem for mexer nisso:

- **Não mande `Referer` da Esportiva.** Com `Referer: https://esportiva.bet.br/`
  o Altenar responde **403**; sem `Referer` nenhum, responde 200.
- **A resposta passa de 2 MB por evento** (vêm todos os mercados do jogo junto).
  Por isso o resultado normalizado fica em cache no banco — veja "Cobertura".

Hoje o catálogo é montado assim: a vitrine da Esportiva diz **quais eventos**
estão em promoção (barato, ~200 KB, e é de onde sai o `ribbonKind`), e o Altenar
completa **cada evento**.

**As travas variam bastante.** Não existe um valor padrão: na coleta apareceram
400, 500, 600, 700, 710, 800, 1000, 1300, 1800 e 2000. Cada boost tem a sua, e é
sempre o `betsLimit` dela que o monitor usa.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run start` | Loop + painel. É o modo normal. |
| `npm run monitor` | Só o loop (alertas no console/webhook), sem painel. |
| `npm run monitor:once` | Uma leitura só e sai — para agendador/cron. |
| `npm run serve` | Só o painel, lendo o que já está no banco. |
| `npm run discover` | Lista as boosts ativas agora, com trava e quanto falta. |
| `node src/discover.js --ids` | Só os itemIds, separados por vírgula. |
| `node src/discover.js --json` | Catálogo completo em JSON. |
| `npm run validate` | **Confere a cobertura**: abre a seção num Chrome real e compara os ids que o site pede com os que o monitor acompanha. |
| `node src/monitor.js --test-alert` | Testa o webhook e sai. |

### `npm run discover`

Coleta real de 21/08, 16h40 UTC — as duas primeiras são as que o site mostrava
como ESGOTADO, e a `15997514` não aparece em `/api/superodds-betcards`:

```
Lista: SuperOdds Esportiva · 50 evento(s) vasculhado(s) · 4 com trava · 30 boosts monitoradas
  Golden: 30
  8 delas o /superodds-betcards não devolve (corte de 100 cards)

ITEM      TIPO              ODD  USADO  TRAVA       %   FALTAM  JOGO
15997514  golden       1.5→1.65   1900   1900  100.0% ESGOTADA  Real Bétis vs. Real Sociedad
15958124  golden        3.4→4.3    700    700  100.0% ESGOTADA  Real Bétis vs. Real Sociedad
15958126  golden          3.1→4    786   1200   65.5%      414  Real Bétis vs. Real Sociedad
15960265  golden          6→9.5    448    700   64.0%      252  Arsenal vs. Coventry
16000201  golden    1.4286→1.66    243    400   60.8%      157  Marseille vs. Strasbourg
15997519  golden     1.5715→1.7    837   1800   46.5%      963  Marseille vs. Strasbourg
```

A coluna `ODD` é o par que interessa: odd original → odd turbinada. E os três
números do cabeçalho contam a história do catálogo — quantos eventos foram
vasculhados, quantos deles tinham alguma trava, e quantas boosts sobraram para
monitorar.

---

## Alertas

Cada tipo dispara **uma vez por item** (o controle fica no banco, então reiniciar
não repete nada).

| Alerta | Quando |
|---|---|
| 🔴 `sold_out` | **a trava fechou** — com a hora exata e em quanto tempo fechou |
| 🟠 `near_limit` | passou de 90% da trava, com quanto falta, velocidade e ETA |
| ⏸️ `stalled` | sem vender há 20min **sem** ter fechado (saiu do ar? suspendeu?) |
| 🆕 `new_boost` | boost nova entrou no ar — desligado por padrão (`ALERT_NEW_BOOST=1`) |

**Só o `sold_out` sai do console.** Os outros ficam gravados e aparecem no
painel, mas não tocam o celular de ninguém — a decisão está em `src/alerts.js`,
em `evaluateAndAlert`.

### Entrega

Dois canais, independentes: se os dois estiverem configurados, o alerta sai nos
dois, e um fora do ar não impede o outro.

**Webhook** — defina `ALERT_WEBHOOK_URL`. Slack (`{text}`), Discord
(`{content}`) e endpoint genérico (JSON com item, contagem e `esgotadoEm`) são
detectados pela URL.

**Telegram** — defina `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`:

1. No Telegram, fale com o **@BotFather** → `/newbot` → escolha nome e usuário.
   Ele devolve o token (formato `123456789:AAF...`).
2. Abra o seu bot e mande `/start`.
3. Descubra o chat id:

   ```bash
   TELEGRAM_BOT_TOKEN="123456789:AAF..." node src/monitor.js --telegram-chat-id
   ```

   Ele lista os chats que falaram com o bot. Grupo tem id **negativo**.
4. Confira a ponta a ponta:

   ```bash
   node --env-file=.env src/monitor.js --test-alert
   ```

O passo 2 não é opcional: o Telegram proíbe um bot de iniciar conversa: sem uma
mensagem sua antes, o `sendMessage` responde `Forbidden: bot can't initiate
conversation with a user`.

Sem nenhum dos dois canais, os alertas saem no console e ficam no painel.

#### Avisar mais de uma pessoa

`TELEGRAM_CHAT_ID` aceita vários destinos separados por vírgula. Um destino que
falha (alguém que bloqueou o bot, id errado) não impede os outros — o erro sai
no log nomeando o chat.

**Para uma equipe, use um grupo**, não uma lista de pessoas. Mandar o link do
bot para alguém e pedir `/start` **não funciona**: o `/start` só autoriza o bot
a falar com aquela pessoa, quem decide o destino é a variável. Cada pessoa nova
exigiria editar a config e um novo deploy.

Com grupo, a entrada e a saída de gente se resolvem dentro do Telegram:

1. Crie o grupo e adicione o **@seu_bot** nele.
2. Rode `--telegram-chat-id`. O id do grupo é **negativo**. Não precisa de
   mensagem no grupo: o helper também lê a update `my_chat_member` ("fui
   adicionado"), que chega mesmo com o modo privacidade ligado — que é o padrão
   e impede o bot de ver as mensagens comuns do grupo.
3. Ponha esse id em `TELEGRAM_CHAT_ID`.

**Cuidado com o id do grupo mudar.** Quando um grupo comum vira supergrupo
(acontece sozinho ao passar de certo tamanho, ao virar público ou ao mudar
permissões), o Telegram troca o id, e o antigo passa a responder
`Bad Request: chat not found`. Se os alertas sumirem, rode `--telegram-chat-id`
de novo e atualize o id.

---

## Configuração

Por variável de ambiente ou `.env` (`node --env-file=.env src/monitor.js --serve`).
Veja `.env.example`.

| Variável | Padrão | |
|---|---|---|
| `POLL_SECONDS` | `15` | intervalo de leitura |
| `CACHE_BUSTER` | `1` | `0` respeita o cache de 45s da CDN |
| `DISCOVER_MINUTES` | `10` | de quanto em quanto redescobre o catálogo |
| `EVENT_TTL_MINUTES` | `60` | validade do cache de boosts de um evento (Altenar) |
| `EVENT_IDLE_TTL_MINUTES` | `360` | validade para evento que se mostrou sem trava nenhuma |
| `EVENTS_PER_TICK` | `20` | teto de eventos rebuscados no Altenar por ciclo |
| `ALTENAR_SPORT_IDS` | `66` | esportes varridos no `GetEvents` atrás de eventos em promoção |
| `ALTENAR_URL` | `https://sb2frontend-altenar2.biahosted.com` | host do sportsbook |
| `ALTENAR_INTEGRATION` | `esportiva` | identificador do operador no Altenar |
| `SCAN` | `0` | `1` religa a varredura de vizinhança (substituída pelo Altenar) |
| `SCAN_MINUTES` | `5` | frequência da varredura |
| `SCAN_RADIUS` | `60` | ids sondados em volta de cada id conhecido |
| `NEAR_LIMIT_PCT` | `0.9` | % da trava que dispara o aviso de "quase" |
| `STALL_MINUTES` | `20` | tempo parado que conta como "parou de vender" |
| `STALL_MIN_COUNT` | `5` | ignora estagnação de item quase sem bilhete |
| `ALERT_WEBHOOK_URL` | — | Slack / Discord / genérico |
| `ALERT_NEW_BOOST` | `0` | `1` avisa quando entra boost nova |
| `ALERT_STALLED` | `1` | `0` desliga o alerta de "parou de vender" |
| `TELEGRAM_BOT_TOKEN` | — | token do bot do @BotFather; com o chat id, manda o aviso de esgotamento no Telegram |
| `TELEGRAM_CHAT_ID` | — | para onde mandar; descubra com `--telegram-chat-id` |
| `PORT` | `8787` | porta do painel |
| `HOST` | `0.0.0.0` | interface onde o painel escuta (só no modo local/VPS); use `127.0.0.1` com Caddy na frente |
| `DATABASE_URL` | — | connection string do Postgres (obrigatória) |
| `CRON_SECRET` | — | segredo do `/api/cron` (só no Vercel) |
| `HIDDEN_STALE_HOURS` | `3` | boost "fora da lista" some do monitor após tanto tempo sem vender (só com `SCAN=1`) |
| `RETENTION_DAYS` | `30` | histórico guardado antes da limpeza automática |
| `LOG_FILE` | — | espelha o console num arquivo (usado pela tarefa agendada) |

---

## Estrutura

```
src/config.js     parâmetros e env
src/api.js        vitrine + contagem (Esportiva) e boosts por evento (Altenar)
src/db.js         Postgres: catálogo, estado, histórico, alertas, cache de eventos
src/analysis.js   %, quanto falta, velocidade, ETA, hora do fechamento, status
src/alerts.js     regras de disparo + entrega por webhook
src/discover.js   monta o catálogo: eventos da vitrine + boosts completas do Altenar
src/scan.js       varredura de vizinhança (desligada; ver "Cobertura")
src/validate.js   validação de cobertura via Chrome DevTools Protocol (sem deps)
scripts/instalar-servico.ps1  instala/remove a tarefa 24/7 do Windows
scripts/iniciar.cmd           arranque usado pela tarefa
scripts/instalar-vps.sh       deploy Linux: systemd + Caddy/HTTPS
scripts/Caddyfile             modelo de proxy reverso com HTTPS
src/monitor.js    loop principal (ou um ciclo só, com --once)
src/handlers.js   lógica das rotas, compartilhada entre server.js e api/*.js
src/server.js     painel + API de leitura — servidor HTTP local/VPS
api/*.js          as mesmas rotas como funções serverless do Vercel
vercel.json       rewrites + cron nativo (fallback diário no Hobby)
public/dashboard.html   o painel
```

O histórico só grava linha **quando a contagem muda** — o banco fica pequeno e é
exatamente isso que dá a hora do fechamento e a velocidade.

### API do painel

- `GET /api/state` — visão completa + resumo
- `GET /api/history?itemId=…` — série histórica de um item
- `GET /api/alerts?limit=…` — últimos alertas

---

## Cobertura: como ele acha o que a vitrine esconde

A vitrine tem teto de 100 cards. Quem completa é o Altenar, evento por evento.

**O ciclo de descoberta** (`src/discover.js`, a cada `DISCOVER_MINUTES`) monta a
lista de eventos de três fontes e depois completa cada um:

1. `/api/superodds-betcards` → quais **eventos** a vitrine está anunciando (num
   dia normal, ~17) e o `ribbonKind` de cada card.
2. O cache → evento que saiu da vitrine mas ainda tem boost com a janela aberta
   continua valendo: elas seguem à venda no site. Some do catálogo quando a
   promoção expira, não quando a vitrine desiste dele.
3. `GetEvents` do Altenar → eventos marcados com `offers.type === 5`. Existe
   porque quem enumera na fonte 1 é a própria vitrine capada em 100 cards: um
   jogo cujos cards **todos** caiam fora do corte nunca seria visto.
4. Para cada evento da união, `GetEventDetails` → **todas** as boosts do jogo.
5. Entra no catálogo só o que tem `betsLimit > 0` e janela ainda aberta.
6. `upsertBoosts` desativa o que saiu — e apaga o rastro junto.

**Sobre o `type === 5`:** comparando eventos que têm boost com trava contra os
que não têm, é o marcador que separa. Num levantamento de 1.502 jogos de futebol
(21/08), os 4 eventos com trava estavam todos entre os 42 marcados com 5 — e
todos os 4 já estavam na vitrine. É necessário, não suficiente: serve como lista
de candidatos a conferir, nunca como resposta pronta. Por isso evento que se
mostra sem trava nenhuma passa a ser reconferido só a cada
`EVENT_IDLE_TTL_MINUTES` (6h), e quando o teto por ciclo aperta a vitrine tem
prioridade — é onde as travas moram.

**O cache existe por causa do tamanho.** Cada `GetEventDetails` passa de 2 MB, e a
trava não muda depois de publicada. As boosts normalizadas ficam na tabela
`event_cache` e o catálogo é remontado dela a cada ciclo, sem chamada nova; o
Altenar só é consultado de novo depois de `EVENT_TTL_MINUTES` (padrão 60), no
máximo `EVENTS_PER_TICK` eventos por ciclo. Medido: passada completa nos 17
eventos de um dia em **4,6s**.

**Ganho medido.** Numa coleta de 21/08: vitrine = 22 boosts com trava; catálogo
novo = **30**. As 8 a mais o `/api/superodds-betcards` não devolve — entre elas a
`15997514` do Bétis, já esgotada em 1900/1900.

### E a varredura de ids (`src/scan.js`)?

Foi a primeira tentativa de furar o teto de 100: sondar ids vizinhos aos
conhecidos no `superodds-counts` e promover os que se moviam. Funcionava, mas os
achados entravam **sem nome e sem `betsLimit`** — e sem trava não dá para dizer
que esgotou, só que parou de vender. Pior, o raio padrão (60) cobria ~3.600 dos
168.000 ids da faixa ativa: as boosts fora da vitrine do dia 21/08 estavam a
2.600 ids do vizinho conhecido mais próximo, fora de alcance.

O Altenar acha as mesmas boosts **com** nome, trava e o par odd original → odd
turbinada. Por isso a varredura vem **desligada** (`SCAN=0` é o padrão) e o que
ela deixou no banco é desativado no primeiro ciclo. `SCAN=1` religa.

## Quem mantém o monitor batendo

Rodando como função serverless, **cada chamada de `/api/cron` faz uma leitura**.
Não existe loop: a cadência do sistema é a cadência de quem chama esse endpoint.
(`POLL_SECONDS` só descreve o loop contínuo do `npm run start`, usado em VPS ou
máquina local.)

| quem | intervalo | papel |
|---|---|---|
| **cron-job.org** (externo) | 1 min | **o batimento de verdade** |
| GitHub Actions (`cron.yml`) | 1 h | rede de segurança |
| Cron nativo do Vercel (`vercel.json`) | 1 dia | último recurso do plano Hobby |

Medição de 21/08, tirada do próprio banco: intervalo mediano entre leituras de
**54s**. Confirmado por um teste de silêncio — 33 minutos sem ninguém disparar
nada manualmente, durante os quais o GitHub rodou uma única vez; ainda assim
cinco boosts registraram mudança de contagem, o que exige leituras repetidas.

**Por que o GitHub Actions não pode ser o principal:** o agendador dele é
best-effort e derruba disparos sob carga — configurado em `*/5`, entregava de 30
a 45 minutos. E repositório privado consome cota, com mínimo de 1 minuto cobrado
por execução: `*/5` daria ~8.640 min/mês contra os 2.000 do plano Free, então a
cota estoura no meio do mês e o agendamento morre calado. De hora em hora dá
~720 min/mês e serve bem como backstop.

## Quão fresco está o que o painel mostra

O painel recarrega sozinho a cada 10s, mas **recarregar não é ler**: quem lê a
Esportiva é o ciclo do monitor, e rodando como função serverless cada chamada
de `/api/cron` faz **uma** leitura. A cadência real é a do agendador que chama
esse endpoint, não o `POLL_SECONDS` (que só descreve o loop contínuo do
`npm run start`).

Por isso o cabeçalho mostra a hora da **última leitura de verdade**
(`resumo.ultimaLeitura`, vinda do banco) e há quanto tempo ela foi, e o rodapé
mostra o intervalo **medido** entre leituras. O sinal ao lado do relógio segue
essa idade: verde até 2 min, âmbar até 10, vermelho acima disso.

Isso existe porque antes o painel carimbava `generatedAt` — o instante em que a
API respondeu, ou seja, sempre "agora" — como se fosse a hora da leitura. O
resultado é que ele piscava "ao vivo" com o horário atual mesmo com o monitor
congelado havia sete dias. A tela dizia que estava tudo bem enquanto nada era
lido.

## O que é medido e o que o monitor NÃO afirma

Medido de verdade, direto da API:

- contagem de bilhetes de cada boost
- `betsLimit` (a trava), quando a API expõe
- velocidade em bilhetes/min, calculada sobre leituras reais
- hora do fechamento: o instante da última venda observada

Projeção, marcada como tal no painel:

- **"Fecha em"** — extrapolação linear da velocidade atual. Nada garante que o
  ritmo continue.

O que o monitor **não** faz:

- **Não estima valor apostado em R$.** A Esportiva expõe bilhetes, não stake.
  Qualquer número em reais aqui seria multiplicação por um ticket médio chutado —
  foi removido do sistema.
- **Não diz "sem trava"** quando `betsLimit` vem `0`: diz *trava não informada*.
  Não dá para distinguir "não tem limite" de "não expõe o limite".
- **Não afirma que está vendendo** só porque tem bilhete acumulado. O selo
  "vendendo" e o contador do painel exigem contagem em movimento na janela recente.
- **Não diz o motivo de uma boost parar.** Saiu do ar, mercado suspenso ou fim
  natural da procura são indistinguíveis daqui.

## Rodar no Vercel

Sem servidor dedicado: cada rota do painel vira uma função serverless
(`api/*.js`) e o loop de monitoramento vira um `POST/GET /api/cron` chamado
periodicamente, em vez de ficar rodando 24/7 num processo. Estado (catálogo,
histórico, alertas) vai para Postgres — o sistema de arquivos de uma função
serverless não persiste entre chamadas.

**1. Banco.** No dashboard do projeto, aba *Storage* → *Marketplace* → adicione
um Postgres (Neon). Isso já injeta `DATABASE_URL`/`POSTGRES_URL` nas env vars
do projeto.

**2. Variáveis de ambiente** (Settings → Environment Variables):

| Variável | Obrigatória | |
|---|---|---|
| `DATABASE_URL` | sim (o Marketplace já cuida disso) | connection string do Postgres |
| `CRON_SECRET` | sim | qualquer string aleatória longa; autentica o `/api/cron` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | opcional | aviso no Telegram quando uma trava esgota |
| `ALERT_WEBHOOK_URL` | opcional | Slack/Discord/genérico |

**3. Deploy.** Importe o repositório no Vercel normalmente (sem build command
— são só funções Node + estático).

**4. Agendador do `/api/cron`.** O `vercel.json` já registra um Cron nativo
diário (`0 6 * * *`) como rede de segurança, mas o Cron nativo do **plano
Hobby só roda 1x por dia** — insuficiente para pegar o esgotamento na hora.
Para leitura de verdade (ex.: a cada 1 min), aponte um agendador externo
gratuito (ex.: [cron-job.org](https://cron-job.org)) para:

```
GET https://<seu-projeto>.vercel.app/api/cron
Header: Authorization: Bearer <o mesmo valor de CRON_SECRET>
```

No plano **Pro**, dá para trocar o `schedule` do `vercel.json` para
`* * * * *` e dispensar o agendador externo.

## Rodar na nuvem, com HTTPS e acesso de qualquer lugar

Tirar a dependência do PC ligado. Custo pode ser **zero**.

### O que é gratuito de verdade

| Peça | Opção sem custo | Pegadinha |
|---|---|---|
| Servidor | **Oracle Cloud Always Free** — VM ARM (até 4 vCPU/24 GB) ou 2 micro AMD, grátis para sempre | Pede cartão só para verificar identidade (não cobra). Capacidade ARM às vezes indisponível na região — se der "out of capacity", tente outra região ou a micro AMD |
| Servidor (alternativa) | **Google Cloud** — `e2-micro` em `us-central1`/`us-west1`/`us-east1`, grátis para sempre | Também pede cartão. Máquina bem menor, mas sobra para este projeto |
| Domínio | **DuckDNS** — `algumnome.duckdns.org`, grátis | Subdomínio de terceiros; funciona normalmente com Let's Encrypt |
| Certificado | **Let's Encrypt** via Caddy | Nenhuma — o Caddy pede e renova sozinho |

Fogem da lista: AWS free tier (só 12 meses), Render free (o serviço dorme e não
tem disco persistente — mata o monitoramento contínuo), Railway e Fly.io (hoje
só crédito de teste).

O projeto ocupa pouquíssimo: uma dependência (`pg`) e um banco Postgres de
alguns MB (Neon free tier sobra). A menor máquina gratuita dá conta.

### Passo a passo

**1. Crie a VM** (Ubuntu 22.04 ou 24.04) e abra as portas **80** e **443** no
firewall do provedor — no Oracle isso é feito na *Security List* da VCN, e é
onde a maioria das pessoas trava.

**2. Aponte o domínio.** No DuckDNS, crie o subdomínio e coloque o IP público da
VM. Se usar domínio próprio, crie um registro **A** apontando para esse IP.

**3. Copie o projeto e instale:**

```bash
# na sua máquina
scp -r monitor-bilhetes usuario@IP-DA-VM:~/

# na VM
cd ~/monitor-bilhetes
sudo CADDY_DOMAIN=seu-nome.duckdns.org CADDY_EMAIL=voce@email.com \
     bash scripts/instalar-vps.sh
```

O script instala o Node 22 se faltar, cria um usuário de serviço sem shell,
registra o systemd com `Restart=always`, instala o Caddy e publica em HTTPS.

**4. Acesse** `https://seu-nome.duckdns.org` — o painel abre direto, sem login.

### Como fica a segurança

- O monitor escuta **só em `127.0.0.1`** quando há Caddy na frente — quem fala
  com a internet é o Caddy.
- **O painel não tem login: quem tem a URL vê os dados.** É de propósito — quem
  quiser restringir precisa pôr uma camada na frente (Caddy `basic_auth`,
  firewall, VPN…).
- O `/api/cron` continua protegido pelo `CRON_SECRET` — a leitura é aberta, mas
  disparar uma varredura não é.
- O serviço roda com `ProtectSystem=strict` e só pode escrever em `data/`.

### Manutenção

```bash
systemctl status monitor-bilhetes
journalctl -u monitor-bilhetes -f     # log ao vivo
journalctl -u caddy -f                # problemas de certificado
```

Na nuvem o log vai para o `journal` — não precisa do `LOG_FILE` nem da rotação
própria, que são coisa do Windows.

> Os scripts de VPS foram escritos e checados sintaticamente, mas **não foram
> executados numa máquina real** — não havia servidor nesta sessão. Espere
> ajustes finos no primeiro deploy, principalmente no firewall do provedor.

---

## Rodar 24/7 (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\instalar-servico.ps1
```

Cria a tarefa `MonitorBilhetesSuperOdds` no Agendador. Não precisa de
administrador nem de senha. A tarefa:

- sobe junto com o logon;
- **repete a cada 2 min** — é isso que garante o 24/7. O "reiniciar em caso de
  falha" do Agendador só dispara quando ele considera a tarefa *falhada*; se o
  processo morre e o `cmd` fecha limpo, não dispara (testado: não voltava). Com
  repetição + `MultipleInstances=IgnoreNew`, a tarefa tenta subir toda hora e é
  ignorada enquanto já estiver rodando. Janela máxima fora do ar: 2 minutos;
- roda escondida, sem janela de console;
- não para por bateria, ociosidade ou tempo de execução.

Verificado matando o processo: voltou sozinho em menos de 2 min.

| | |
|---|---|
| Painel | http://localhost:8787 |
| Log | `data/monitor.log` (gira em 5 MB, guarda uma geração) |
| Parar | `Stop-ScheduledTask -TaskName MonitorBilhetesSuperOdds` |
| Remover | `powershell -ExecutionPolicy Bypass -File scripts\instalar-servico.ps1 -Remover` |

Para semanas de operação contínua, o monitor limpa sozinho o histórico com mais
de `RETENTION_DAYS` (30) a cada 6h.

### O que ainda derruba o 24/7

- **O PC precisa estar ligado e com o usuário logado.** O gatilho é de logon;
  tela bloqueada não atrapalha, mas desligar ou deslogar sim.
- **Suspensão.** Nesta máquina a suspensão na tomada já está como "nunca" — na
  bateria, suspende em 10 min e o monitor para junto. Para desligar também na
  bateria: `powercfg /change standby-timeout-dc 0`.
- **Independência da máquina.** Se o monitoramento não pode depender deste PC,
  o caminho é uma VPS barata: o projeto não tem dependências, então é copiar a
  pasta, instalar o Node e rodar sob `systemd`.

---

## Limites conhecidos

- **Boost já esgotada quando o monitor sobe** não tem hora de fechamento — para
  cobrir jogo por jogo, suba o monitor antes das boosts entrarem no ar.
- **Card `turbo` (Super Turbinada) não é monitorado.** Os 78 turbo da vitrine
  vinham todos com `betsLimit: 0` — não existe trava, logo não existe
  esgotamento a detectar. Só entra no catálogo boost com `betsLimit > 0`.
- **A enumeração de eventos alcança até onde as duas fontes alcançam.** A
  vitrine corta em 100 cards e o `GetEvents` em 1.500 eventos por esporte
  (ignora `hoursRange`). Elas se cobrem — o `GetEvents` pega jogo próximo que a
  vitrine cortou, a vitrine pega jogo distante que o `GetEvents` não alcança —,
  mas um jogo que escape das duas ao mesmo tempo não entra. Só o futebol é
  varrido por padrão (`ALTENAR_SPORT_IDS`).
- **A varredura (desligada) só enxerga o que se move.** Uma boost fora da vitrine
  que ainda não vendeu nenhum bilhete é indistinguível de id inexistente.
- **`stalled` não distingue** boost suspensa de boost que só parou de vender. É
  um sinal para conferir, não um diagnóstico.
- Os endpoints são internos da Esportiva e podem mudar sem aviso. Se a descoberta
  quebrar, o caminho é reabrir o bundle Nuxt de `multiplas.esportiva.bet.br` e
  procurar as rotas `/api/...` — foi assim que `superodds-betcards` apareceu.
