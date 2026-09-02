import { alertsResponse } from '../../server/monitor/handlers.js';

export default async function handler(req, res) {
  const limit = Number(req.query.limit) || 50;

  try {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=50');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(await alertsResponse(limit));
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
}
