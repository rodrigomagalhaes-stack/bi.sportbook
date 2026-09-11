import { describe, it, expect } from 'vitest';
import { codigoDoBilhete, codigoDoLink, formatarOdd, inicioLocal, oddTotal } from './bilhete.js';

describe('código no link', () => {
  it('acha o código no link de afiliado, com utm junto', () => {
    const link = 'https://go.aff.esportiva.bet/7ud79stg?shareCode=J4FVZXWWFKN&utm_source=GRUPO%20GRATIS';
    expect(codigoDoLink(link)).toBe('J4FVZXWWFKN');
  });

  it('acha no link do site e aceita o parâmetro sem caixa', () => {
    expect(codigoDoLink('https://esportiva.bet.br/sports?shareCode=ABC123')).toBe('ABC123');
    expect(codigoDoLink('https://esportiva.bet.br/sports?sharecode=ABC123')).toBe('ABC123');
  });

  it('link sem código, código estranho ou texto que não é link devolvem nulo', () => {
    expect(codigoDoLink('https://esportiva.bet.br/sports/futebol/le-16462691')).toBe(null);
    expect(codigoDoLink('https://esportiva.bet.br/sports?shareCode=a%20b')).toBe(null);
    expect(codigoDoLink('bilhete do rodrigo')).toBe(null);
    expect(codigoDoLink(null)).toBe(null);
  });

  it('prefere o código calculado pelo banco', () => {
    const b = { share_code: 'DOBANCO', link_bilhete: 'https://x.com/?shareCode=DOLINK' };
    expect(codigoDoBilhete(b)).toBe('DOBANCO');
    expect(codigoDoBilhete({ link_bilhete: 'https://x.com/?shareCode=DOLINK' })).toBe('DOLINK');
  });
});

describe('odd total', () => {
  it('na múltipla, multiplica as linhas', () => {
    expect(oddTotal({ tipo: 1, linhas: [{ odd: 1.5 }, { odd: 2 }] })).toBeCloseTo(3, 6);
  });

  it('uma linha só é a própria odd', () => {
    expect(oddTotal({ tipo: 0, linhas: [{ odd: 1.8 }] })).toBe(1.8);
  });

  it('fora da múltipla, ou com odd faltando, não inventa número', () => {
    expect(oddTotal({ tipo: 0, linhas: [{ odd: 1.5 }, { odd: 2 }] })).toBe(null);
    expect(oddTotal({ tipo: 1, linhas: [{ odd: 1.5 }, { odd: null }] })).toBe(null);
    expect(oddTotal({ tipo: 1, linhas: [] })).toBe(null);
    expect(oddTotal(null)).toBe(null);
  });

  it('formata com vírgula e duas casas', () => {
    expect(formatarOdd(34.0281)).toBe('34,03');
    expect(formatarOdd(1.5)).toBe('1,50');
  });
});

describe('horário do jogo', () => {
  it('sai no horário de Brasília, que é o que o site mostra', () => {
    // Meia-noite UTC do dia 13 ainda é dia 12 em Brasília.
    expect(inicioLocal('2026-09-13T00:00:00Z')).toBe('12/09 21:00');
    expect(inicioLocal('2026-09-12T19:00:00Z')).toBe('12/09 16:00');
  });

  it('data inválida vira travessão', () => {
    expect(inicioLocal(null)).toBe('—');
    expect(inicioLocal('ontem')).toBe('—');
  });
});
