import { candidatosDoEvento } from '../../server/recomendador/altenar.js';

// As boosts e os mercados de um jogo, já enxugados. O Altenar devolve mais de
// 2 MB por evento; o que sai daqui fica na casa dos 25 KB.
//
// Por que passa pelo servidor em vez de o navegador chamar o Altenar direto:
// a resposta é grande demais para trafegar até o cliente inteira, e o endpoint
// devolve 403 quando o Referer é o domínio da Esportiva (ver o comentário de
// `getJson` em server/monitor/api.js) — de dentro do navegador não há como não
// mandar Referer.
export default async function handler(req, res) {
  const eventId = Number(new URL(req.url, 'http://x').searchParams.get('eventId'));
  if (!Number.isFinite(eventId) || eventId <= 0) {
    res.status(400).json({ erro: 'informe eventId' });
    return;
  }
  try {
    // As odds mudam durante o dia, mas não de segundo em segundo, e a chamada
    // custa 2 MB no Altenar: meio minuto de cache evita repetir isso a cada
    // clique de quem está comparando boosts.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=120');
    res.status(200).json(await candidatosDoEvento(eventId));
  } catch (err) {
    res.status(502).json({ erro: `não consegui ler o evento ${eventId}: ${err.message}` });
  }
}
