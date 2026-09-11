// O bilhete impresso: o código no link e as contas que a tela mostra. Função
// pura — quem lê o Altenar é server/protegidos/bilhete.js.

/**
 * O código de compartilhamento do link (`?shareCode=`).
 *
 * Serve o link do site e o de afiliado (`go.aff.esportiva.bet/…`), que chega
 * com `utm_source` junto. O nome do parâmetro é comparado sem caixa: o site
 * escreve `shareCode`, mas nada impede um encurtador de devolver `sharecode`.
 *
 * Quem decide o código de verdade é o banco, na coluna gerada `share_code` — é
 * ela que trava o duplicado. Esta função é a reserva para a tela, enquanto a
 * coluna não existir (o SQL novo ainda não rodou).
 */
export function codigoDoLink(link) {
  try {
    const url = new URL(String(link ?? '').trim());
    for (const [chave, valor] of url.searchParams) {
      if (chave.toLowerCase() === 'sharecode' && /^[A-Za-z0-9_-]{1,64}$/.test(valor)) return valor;
    }
  } catch {
    // não é nem URL: não tem código
  }
  return null;
}

export const codigoDoBilhete = (bilhete) => bilhete?.share_code || codigoDoLink(bilhete?.link_bilhete);

/**
 * A odd do bilhete inteiro.
 *
 * Só a múltipla (tipo 1) multiplica as linhas. Em simples ou sistema cada linha
 * é uma aposta à parte, e o produto seria um número sem significado — melhor
 * não mostrar nada. Uma linha só é a própria odd, qualquer que seja o tipo.
 */
export function oddTotal(bilhete) {
  const odds = (bilhete?.linhas ?? []).map((l) => Number(l.odd));
  if (!odds.length || odds.some((o) => !(o > 1))) return null;
  if (odds.length === 1) return odds[0];
  return Number(bilhete.tipo) === 1 ? odds.reduce((a, b) => a * b, 1) : null;
}

export const formatarOdd = (n) =>
  Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Horário de Brasília fixo, e não o fuso de quem olha: é o horário que o site
// mostra no bilhete (ele pede tudo com `timezoneOffset=180`), e a conferência é
// comparar os dois.
const INICIO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** '2026-09-13T00:00:00Z' → '12/09 21:00'. */
export function inicioLocal(iso) {
  const d = new Date(iso ?? '');
  return Number.isNaN(d.getTime()) ? '—' : INICIO.format(d).replace(', ', ' ');
}
