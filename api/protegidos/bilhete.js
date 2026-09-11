import { CODIGO, lerBilhete } from '../../server/protegidos/bilhete.js';

// As linhas de um bilhete compartilhado, pelo código do link (`?shareCode=`).
//
// Passa pelo servidor, e não pelo navegador, pelo mesmo motivo do Recomendador:
// o Altenar recusa a chamada quando o Referer é de um site, e de dentro do
// navegador não há como não mandar Referer.
export default async function handler(req, res) {
  const codigo = new URL(req.url, 'http://x').searchParams.get('codigo') ?? '';
  if (!CODIGO.test(codigo)) {
    res.status(400).json({ erro: 'informe o código do bilhete' });
    return;
  }

  try {
    const bilhete = await lerBilhete(codigo);
    if (!bilhete) {
      res.status(404).json({ erro: `A Esportiva não encontrou o bilhete ${codigo}.` });
      return;
    }
    // Um código compartilhado não muda depois de gravado: cache à vontade.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
    res.status(200).json(bilhete);
  } catch (err) {
    res.status(502).json({ erro: `não consegui ler o bilhete ${codigo}: ${err.message}` });
  }
}
