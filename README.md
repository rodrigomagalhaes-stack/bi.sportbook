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
| Sportbook Vs. Tipster | `/boost-dashboard` | embutida | SportbookVsTipter |
| Calculadora de Risco | `/calculadora-risco` | embutida | calculadora-de-risco |
| Monitor Super Odds | `/monitor` | embutida (lê a API do deploy do monitor) | monitor-bilhetes-superodds |
| Welcome Boost | `/welcome-boost` (+ 3 sub-rotas) | módulo React | welcome-boost-manager |
| Quiz | `/quiz` | módulo React | pickem-dashboard |
| Analisador Bet List | `/analisador-bet-list` | embutida | analisador-bet-list |
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
