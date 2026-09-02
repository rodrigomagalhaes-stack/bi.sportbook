# Monitor de Bilhetes — Super Odds (Esportiva Bet)

## Objetivo
Monitorar em tempo real as Golden/Super Turbinada/Welcome Boost ativas no
site, e detectar quando a trava de bilhetes de uma boost esgota **antes**
de bater o risco previsto (ex: meta de R$150k por Golden).

## O que já foi descoberto (não precisa redescobrir)

### Endpoint confirmado (funciona, testado ao vivo)
```
GET https://multiplas.esportiva.bet.br/api/superodds-counts?itemIds=ID1,ID2,ID3,...
```
- Resposta: `{"itemCounts": {"ID1": 42, "ID2": 1001, ...}}`
- CORS aberto — dá pra chamar de qualquer lugar, sem precisar de sessão logada.
- Os `itemIds` são identificadores internos da Esportiva/multiplas (formato de 8
  dígitos, ex: `15574064`) — **não são** os odd IDs do Altenar (esses têm 10
  dígitos). Não dá pra cruzar direto com `GetEventDetails` do Altenar.
- Valores observados batendo perto de números redondos (1000, 1001, 1010)
  são o indício mais forte de que este número é a contagem de bilhetes
  usados aproximando-se de uma trava.

### O problema real a resolver: descobrir a lista de itemIds ativos
- A seção "SUPER ODDS" (`multiplas.esportiva.bet.br`) é uma aplicação Nuxt
  separada do widget padrão do Altenar (`sb2frontend-altenar2.biahosted.com`).
- A lista de `itemIds` que alimenta a chamada acima é montada no carregamento
  da página `esportiva.bet.br/sports` e disparada muito cedo — rápido demais
  pra capturar com ferramentas de rede que só começam a rastrear a partir do
  momento em que são chamadas (foi exatamente onde travei usando o Chrome
  conectado por MCP).
- **Solução recomendada:** usar Playwright (Node ou Python) e registrar o
  listener de rede (`page.on('request')` / `page.route()`) **antes** de
  navegar para a URL. Isso captura a chamada desde o primeiro milissegundo,
  sem a corrida perdida que travei aqui.
  - Alternativa: abrir a página, achar a chamada real para
    `multiplas.esportiva.bet.br/api/superodds-counts` já disparada pelo
    próprio site, e reusar o `itemIds` que ela mandou.

### Lista de itemIds capturada manualmente em 13/08/2026 (pode estar desatualizada)
```
15466670,15466671,15466672,15466673,15467073,15467075,15467076,15467077,15467244,15467253,15467254,15467255,15467256,15467782,15467887,15467888,15467890,15467892,15468085,15468086,15468087,15468089,15468090,15468091,15468492,15468502,15468504,15468505,15468506,15468752,15468761,15468762,15468763,15468765,15468766,15469138,15469139,15469140,15469141,15469142,15469152,15469390,15469402,15469403,15469404,15469405,15469618,15469619,15469620,15469621,15469939,15469959,15470016,15470017,15470018,15470019,15470021,15470022,15470023,15470319,15470335,15470363,15470396,15470422,15470423,15470424,15470434,15470647,15470648,15470650,15470664,15470903,15470904,15470922,15470923,15470929,15470930,15470931,15574064,15574084,15574877,15574901,15574906,15580515,15580517,15580520,15580521,15580525,15580527,15587744,15593562,15593564,15593566,15593568,15593569,15593570,15595053,15595054,15625785,15626638
```

### Ainda não confirmado / precisa validar
1. Se o número do `superodds-counts` é **de fato** bilhetes/apostas (e não
   visualizações). Validar comparando o momento em que uma boost vira
   "esgotado" visualmente no site com o comportamento desse contador
   (deveria parar de subir exatamente nesse momento).
2. Como resolver o nome do jogo/mercado a partir do `itemId` — ainda não
   achei o endpoint que dá esse mapeamento. Pode estar embutido no payload
   inicial da página (SSR) que o Playwright consegue capturar antes de
   qualquer coisa rodar.

## O que construir no Claude Code
1. **Script de descoberta** (Playwright): navega pra
   `https://esportiva.bet.br/sports`, intercepta a rede desde o início,
   extrai a lista de `itemIds` ativa e — se possível — os nomes dos
   jogos/mercados associados.
2. **Script de monitoramento**: roda em loop/cron, chama
   `superodds-counts` pra lista atual, guarda histórico (arquivo local ou
   banco simples tipo SQLite), detecta estagnação (contagem parada por N
   leituras seguidas = provável trava esgotada) e sinaliza quando alguém
   chega perto de um teto redondo (900+, 1000+ etc).
3. **Alerta**: webhook pro Slack/WhatsApp/e-mail quando uma boost estagnar
   ou passar de um limiar.
4. **Reaproveitar**: `monitor-bilhetes-boost.html` já anexado — tem a UI
   pronta (tabela, status, cores da marca), só precisa trocar a fonte de
   dados estática pelo backend automatizado.

## Arquivos deste pacote
- `BRIEFING.md` — este arquivo
- `monitor-bilhetes-boost.html` — protótipo funcional já construído (roda
  sozinho no navegador, mas com lista de itemIds fixa)
