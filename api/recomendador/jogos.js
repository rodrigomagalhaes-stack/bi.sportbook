import { catalogoDeJogos } from '../../server/recomendador/altenar.js';

// O calendário de jogos para o seletor da tela — não só os que já têm Super
// Odds no ar. Ver `catalogoDeJogos` para o porquê.
export default async function handler(req, res) {
  try {
    // Calendário muda em horas, não em minutos, e a leitura custa quase 4 MB no
    // Altenar: cinco minutos de cache na CDN fazem N abas custarem uma leitura.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=900');
    res.status(200).json({ jogos: await catalogoDeJogos(), lidoEm: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ erro: `não consegui ler o calendário de jogos: ${err.message}` });
  }
}
