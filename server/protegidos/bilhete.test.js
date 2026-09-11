import { describe, it, expect } from 'vitest';
import { CODIGO, normalizarBilhete } from './bilhete.js';

// Duas seleções do bilhete real J4FVZXWWFKN, como o Altenar devolve, mais um
// Bet Builder montado no formato que o site grava (`o9` no bundle da Esportiva).
const BRUTO = {
  betType: 1,
  fullCoverData: { type: 1, label: 'Combo' },
  selections: [
    {
      odd: { id: 4476998563, price: 1.6364, name: 'Mais de 10.5' },
      event: { id: 16529550, startDate: '2026-09-12T19:00:00Z', name: 'Atlético-MG vs. Fluminense' },
      market: { id: 1724833684, name: 'Total (mais/menos) Chutes Fluminense', isBB: false },
    },
    {
      odd: { price: 1.6, name: 'Menos de 28.5', preBoostedPrice: 1.45 },
      event: { startDate: '2026-09-12T21:30:00Z', name: 'Palmeiras  vs. São Paulo ' },
      market: { name: 'Totais chutes', isBB: false },
    },
    {
      odd: { price: 3.2, name: 'Resultado: Casa | Total de gols: Mais de 1.5' },
      event: { startDate: '2026-09-13T00:00:00Z', name: 'Santos vs. Cruzeiro' },
      market: { name: 'BetBuilder', isBB: true },
      bbSelections: [
        { odd: { name: 'Casa' }, market: { name: 'Resultado' } },
        { odd: { name: 'Mais de 1.5' }, market: { name: 'Total de gols' } },
      ],
    },
  ],
};

describe('bilhete compartilhado', () => {
  const b = normalizarBilhete(BRUTO, 'J4FVZXWWFKN', new Date('2026-09-11T15:00:00Z'));

  it('guarda o código, o momento da leitura e o tipo', () => {
    expect(b).toMatchObject({ codigo: 'J4FVZXWWFKN', lido_em: '2026-09-11T15:00:00.000Z', tipo: 1 });
  });

  it('cada seleção vira uma linha com jogo, mercado, palpite e odd', () => {
    expect(b.linhas[0]).toEqual({
      evento: 'Atlético-MG vs. Fluminense',
      inicio: '2026-09-12T19:00:00Z',
      mercado: 'Total (mais/menos) Chutes Fluminense',
      selecao: 'Mais de 10.5',
      odd: 1.6364,
      odd_antes: null,
      pernas: [],
    });
  });

  it('limpa o espaço sobrando e guarda a odd de antes do boost', () => {
    expect(b.linhas[1].evento).toBe('Palmeiras vs. São Paulo');
    expect(b.linhas[1].odd_antes).toBe(1.45);
  });

  it('Bet Builder sai com as pernas separadas', () => {
    expect(b.linhas[2].mercado).toBe('Bet Builder');
    expect(b.linhas[2].pernas).toEqual([
      { mercado: 'Resultado', selecao: 'Casa' },
      { mercado: 'Total de gols', selecao: 'Mais de 1.5' },
    ]);
  });

  it('resposta sem seleções vira bilhete sem linhas, sem quebrar', () => {
    expect(normalizarBilhete({}, 'X').linhas).toEqual([]);
    expect(normalizarBilhete(null, 'X').linhas).toEqual([]);
  });
});

describe('código', () => {
  it('aceita o formato do site e recusa o resto', () => {
    expect(CODIGO.test('J4FVZXWWFKN')).toBe(true);
    expect(CODIGO.test('abc_12-X')).toBe(true);
    expect(CODIGO.test('')).toBe(false);
    expect(CODIGO.test('a b')).toBe(false);
    expect(CODIGO.test('../x')).toBe(false);
  });
});
