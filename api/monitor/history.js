import { historyResponse } from '../../server/monitor/handlers.js';

export default async function handler(req, res) {
  const itemId = Number(req.query.itemId);
  if (!Number.isFinite(itemId)) return res.status(400).json({ erro: 'itemId inválido' });

  try {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(await historyResponse(itemId));
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
}
