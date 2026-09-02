// Configuração central. Tudo pode ser sobrescrito por variável de ambiente
// (ou por um arquivo .env carregado com `node --env-file=.env`).

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export const config = {
  // --- coleta ---
  baseUrl: process.env.BASE_URL || 'https://multiplas.esportiva.bet.br',

  // O objetivo do sistema é saber que a trava esgotou NA HORA, então a leitura
  // é curta. As respostas vêm com `cache-control: max-age=45` atrás da CDN da
  // Vercel; o `cacheBuster` abaixo contorna isso indo direto na origem, senão
  // ler mais rápido que 45s só devolveria o mesmo número em cache.
  pollSeconds: num(process.env.POLL_SECONDS, 15),
  cacheBuster: process.env.CACHE_BUSTER !== '0',

  discoverMinutes: num(process.env.DISCOVER_MINUTES, 10), // frequência de redescoberta da lista
  chunkSize: num(process.env.CHUNK_SIZE, 400),            // itemIds por chamada (limite de URL)

  // --- Altenar: a lista completa de boosts por evento ---
  // `/api/superodds-betcards` corta em 100 cards e deixa boosts VIVAS de fora:
  // no Real Bétis x Real Sociedad ela devolvia 8 das 11 boosts com trava do
  // jogo, e uma das omitidas (item 15997514, trava 1900) já estava esgotada no
  // site. O sportsbook por trás da Esportiva é o Altenar, e o endpoint dele
  // devolve, por evento, TODAS as boosts com a trava e o par odd base → odd
  // turbinada. Passou a ser a fonte do catálogo; a lista da Esportiva ficou
  // só como índice de quais eventos estão em promoção. Ver src/api.js.
  altenarUrl: process.env.ALTENAR_URL || 'https://sb2frontend-altenar2.biahosted.com',
  altenarIntegration: process.env.ALTENAR_INTEGRATION || 'esportiva',

  // Esportes varridos no `GetEvents` do Altenar para achar eventos em promoção
  // que a vitrine não citou. 66 = futebol, que é onde as travas aparecem.
  altenarSportIds: (process.env.ALTENAR_SPORT_IDS || '66')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Boolean),

  // A resposta por evento passa de 2 MB, então o resultado normalizado fica em
  // cache no banco (tabela event_cache) e só é rebuscado depois desse prazo.
  eventTtlMinutes: num(process.env.EVENT_TTL_MINUTES, 60),
  // Evento que já se mostrou sem nenhuma trava é reconferido bem mais devagar —
  // é o caso da maioria dos candidatos que vêm do `GetEvents`, e sem isso eles
  // custariam 2 MB cada por hora para não trazer nada.
  eventIdleTtlMinutes: num(process.env.EVENT_IDLE_TTL_MINUTES, 360),
  // Teto de eventos rebuscados num mesmo ciclo — segura o tempo e o tráfego de
  // uma função serverless quando o catálogo está frio. Uma passada completa nos
  // 17 eventos de um dia normal levou 4,6s, bem dentro do maxDuration de 60s.
  eventsPerTick: num(process.env.EVENTS_PER_TICK, 20),

  // Varredura de vizinhança de ids (src/scan.js). Nasceu para contornar o corte
  // de 100 cards, mas achava ids sem nome e sem trava — e sem trava não dá para
  // dizer que esgotou. O Altenar resolve o mesmo problema com dados completos,
  // então ela vem desligada. SCAN=1 religa.
  scanEnabled: process.env.SCAN === '1',
  scanMinutes: num(process.env.SCAN_MINUTES, 5),
  scanRadius: num(process.env.SCAN_RADIUS, 60),           // ids sondados em volta de cada conhecido

  // --- detecção ---
  nearLimitPct: num(process.env.NEAR_LIMIT_PCT, 0.9), // % da trava que dispara o aviso de "quase lá"
  stallMinutes: num(process.env.STALL_MINUTES, 20),   // minutos sem mudança = parou de vender
  stallMinCount: num(process.env.STALL_MIN_COUNT, 5), // ignora estagnação de itens quase parados
  rateWindowMinutes: num(process.env.RATE_WINDOW_MINUTES, 30), // janela para velocidade/ETA

  // Boosts "fora da lista" (achadas pela varredura, sem sinal oficial de
  // saída) somem do monitor depois de tantas horas sem vender — é o proxy de
  // "o jogo acabou" para elas. Ver src/db.js `deactivateStaleHidden`.
  hiddenStaleHours: num(process.env.HIDDEN_STALE_HOURS, 3),
  retentionDays: num(process.env.RETENTION_DAYS, 30), // histórico guardado no banco

  // --- alertas ---
  webhookUrl: process.env.ALERT_WEBHOOK_URL || '',    // Slack / Discord / genérico
  alertOnNewBoost: process.env.ALERT_NEW_BOOST === '1',
  alertOnStalled: process.env.ALERT_STALLED !== '0',

  // Telegram. O token vem do @BotFather; o chat é para onde a mensagem vai
  // (você, ou um grupo — nesse caso o id é negativo). Descubra o id com
  // `node src/monitor.js --telegram-chat-id` depois de mandar um /start ao bot.
  // Funciona junto com o webhook: se os dois estiverem configurados, o alerta
  // sai nos dois.
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  // Aceita mais de um destino, separados por vírgula: um grupo, várias
  // pessoas, ou os dois. Grupo é o jeito prático de incluir gente — dar
  // /start no bot NÃO inscreve ninguém, só autoriza o bot a falar.
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  get telegramChatIdList() {
    return this.telegramChatId.split(',').map((c) => c.trim()).filter(Boolean);
  },
  get telegramEnabled() {
    return !!(this.telegramBotToken && this.telegramChatIdList.length);
  },

  // --- servidor ---
  port: num(process.env.PORT, 8787),

  // O painel é público: quem tem a URL entra, sem login nem senha.
  // Por isso o servidor local/VPS escuta em todas as interfaces por padrão
  // (HOST=127.0.0.1 restringe a localhost, se você quiser). Só é usado por
  // src/server.js — no Vercel cada rota já é uma função isolada.
  get host() {
    return process.env.HOST || '0.0.0.0';
  },

  // --- persistência ---
  // Postgres (Neon via Vercel Marketplace ou qualquer Postgres). A integração
  // Neon do Vercel expõe DATABASE_URL/POSTGRES_URL automaticamente.
  databaseUrl:
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    '',

  // Segredo do endpoint /api/cron. O Vercel injeta automaticamente o header
  // `Authorization: Bearer $CRON_SECRET` nas chamadas do próprio Cron nativo
  // quando essa variável existe; o mesmo valor serve para um pinger externo
  // (necessário no plano Hobby, que só roda cron nativo 1x/dia).
  cronSecret: process.env.CRON_SECRET || '',
};

// Rótulos só para exibição. O que define se uma boost entra no monitor não é o
// tipo, é ter trava: card `turbo` vem sempre com `betsLimit: 0` (conferido nos
// 78 turbo da lista), e sem trava não existe esgotamento para detectar — por
// isso eles ficam de fora do catálogo. Ver src/discover.js.
export const KINDS = {
  golden: 'Golden',
  turbo: 'Super Turbinada',  // sem trava; não entra no monitor
  welcome: 'Welcome Boost',
  oculta: 'Fora da lista',   // achada pela varredura; sem nome e sem trava conhecida
};
