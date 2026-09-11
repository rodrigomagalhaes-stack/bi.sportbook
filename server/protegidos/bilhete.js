// As linhas de um bilhete compartilhado da Esportiva.
//
// ── DE ONDE VEM ──────────────────────────────────────────────────────────────
// Ao compartilhar um bilhete, o site da Esportiva grava as seleções no serviço
// social do Altenar (`Storage/SaveValue`, com o token do apostador) e recebe um
// código. É ele que vai no link, como `?shareCode=` — inclusive nos links de
// afiliado (`go.aff.esportiva.bet/…?shareCode=…&utm_source=…`).
//
// Para abrir um link desses, o próprio site chama `Storage/GetValue?key=CÓDIGO`:
// um GET público, sem login, que devolve em `Result` o JSON das seleções já
// com os nomes — jogo, mercado, palpite e odd. Foi conferido com o código
// J4FVZXWWFKN, uma múltipla de 8 seleções que voltou inteira.
//
// ── O QUE ELE NÃO É ──────────────────────────────────────────────────────────
// Não é a aposta feita: são as seleções do momento em que o bilhete foi
// compartilhado, com as odds daquele instante. E não é API oficial — pode mudar
// sem aviso, e por isso o BI guarda o resultado no bilhete na primeira leitura.

import { getJson } from '../monitor/api.js';

const GET_VALUE = 'https://sb2socialmedia-altenar2.biahosted.com/api/Storage/GetValue';

/** O formato que o próprio site aceita para um código compartilhado. */
export const CODIGO = /^[A-Za-z0-9_-]{1,64}$/;

const texto = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const odd = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : null);

/**
 * O bilhete no formato que o BI guarda e desenha.
 *
 * Bet Builder vem como UMA seleção com as pernas em `bbSelections`, e o nome da
 * seleção é a colagem das pernas ("Resultado: Casa | Total: Mais de 1.5"). As
 * pernas saem separadas para a tela listar uma por linha em vez de repetir a
 * colagem.
 */
export function normalizarBilhete(bruto, codigo, agora = new Date()) {
  const selecoes = Array.isArray(bruto?.selections) ? bruto.selections : [];
  return {
    codigo,
    lido_em: agora.toISOString(),
    // 1 é múltipla. É o que decide se a odd total é o produto das linhas.
    tipo: Number(bruto?.betType ?? 0),
    linhas: selecoes.map((s) => {
      const betBuilder = Boolean(s?.market?.isBB) || Array.isArray(s?.bbSelections);
      return {
        evento: texto(s?.event?.name),
        inicio: s?.event?.startDate || null,
        mercado: betBuilder ? 'Bet Builder' : texto(s?.market?.name),
        selecao: texto(s?.odd?.name),
        odd: odd(s?.odd?.price),
        odd_antes: odd(s?.odd?.preBoostedPrice),
        pernas: (s?.bbSelections ?? []).map((p) => ({
          mercado: texto(p?.market?.name),
          selecao: texto(p?.odd?.name),
        })),
      };
    }),
  };
}

/** Lê um código no Altenar. Nulo quando o código não existe (ou não tem seleção). */
export async function lerBilhete(codigo) {
  if (!CODIGO.test(String(codigo ?? ''))) throw new Error('código de bilhete inválido');

  // Referer nulo pelo mesmo motivo das outras chamadas ao Altenar: com o
  // domínio da Esportiva no Referer ele responde 403.
  const d = await getJson(`${GET_VALUE}?key=${encodeURIComponent(codigo)}`, {
    timeoutMs: 10000,
    retries: 1,
    referer: null,
  });

  // Código que não existe volta 200 com `Error` preenchido e `Result` nulo.
  if (d?.Error || !d?.Result) return null;

  let bruto;
  try {
    bruto = JSON.parse(d.Result);
  } catch {
    throw new Error('o Altenar devolveu o bilhete num formato inesperado');
  }

  const bilhete = normalizarBilhete(bruto, codigo);
  return bilhete.linhas.length ? bilhete : null;
}
