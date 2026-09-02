// Dispara um ciclo do monitor (descoberta/varredura quando é hora + leitura +
// alertas). Pensado para ser chamado a cada ~1min por um agendador externo
// (necessário no plano Hobby, onde o Cron nativo do Vercel só roda 1x/dia) e,
// opcionalmente, também pelo Cron nativo como rede de segurança diária — veja
// vercel.json e o `crons` ali.
//
// Autenticação: exige `Authorization: Bearer $CRON_SECRET`. O Vercel injeta
// esse header sozinho nas chamadas do Cron nativo quando CRON_SECRET existe;
// um agendador externo precisa mandar o mesmo header manualmente.

import { tick } from '../../server/monitor/monitor.js';
import { config as appConfig } from '../../server/monitor/config.js';

// Nome reservado pelo runtime do Vercel para configurar a função (ex.: duração
// máxima) — não pode ser reaproveitado para a config da aplicação.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!appConfig.cronSecret) {
    return res.status(500).json({ erro: 'CRON_SECRET não configurado' });
  }
  if (req.headers.authorization !== `Bearer ${appConfig.cronSecret}`) {
    return res.status(401).json({ erro: 'não autorizado' });
  }

  try {
    const r = await tick();
    // 503 quando o ciclo não conseguiu medir: o agendador precisa pintar isso
    // de vermelho. Devolver 200 para tudo foi o que deixou uma semana de
    // sistema cego passar como "success" no histórico do cron.
    // Catálogo vazio (madrugada, nenhuma boost no ar) não é falha: 200.
    if (!r.ok) {
      return res.status(r.falha ? 503 : 200).json({ ok: false, rodou: false, motivo: r.motivo });
    }
    res.status(200).json({
      ok: true,
      rodou: true,
      resumo: r.resumo,
      alertas: r.disparados?.length ?? 0,
    });
  } catch (err) {
    console.error('cron falhou:', err);
    res.status(500).json({ ok: false, erro: err.message });
  }
}
