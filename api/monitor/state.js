import { stateResponse } from '../../server/monitor/handlers.js';

export default async function handler(req, res) {
  try {
    // O painel se recarrega de 10 em 10s e cada carga fazia uma leitura no
    // banco — com duas abas abertas, o dobro; com cinco, cinco vezes. Como o
    // número só muda quando um ciclo do monitor roda (~1min), 10s de cache na
    // CDN não atrasam nada de perceptível e fazem N abas custarem uma leitura
    // só. `max-age=0` mantém o navegador sempre perguntando à CDN.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=50');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(await stateResponse());
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
}
