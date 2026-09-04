import { describe, expect, it } from 'vitest';
import { avaliarBoost, exposicao, overround, probJusta, OVERROUND_PADRAO } from './margem.js';

// Os números deste arquivo saíram de um payload real do Altenar: PSG x Monaco
// (evento 17455117, Ligue 1), lido em 04/09/2026.
describe('overround', () => {
  it('mede a margem de um 1x2', () => {
    // 1/1.3334 + 1/5.6667 + 1/7 = 1.0693
    expect(overround([1.3334, 5.6667, 7])).toBeCloseTo(0.0693, 4);
  });

  it('mede a margem de um par over/under', () => {
    // A coluna do 7.5 em "Total (mais/menos) Chutes a Gol PSG".
    expect(overround([2.375, 1.52])).toBeCloseTo(0.0789, 4);
  });

  it('enxerga que chance dupla cobre o espaço duas vezes', () => {
    // PSG ou empate 1.1112 · PSG ou Monaco 1.1334 · Empate ou Monaco 3.1429.
    // Somam 2.1004 porque cada seleção contém dois dos três desfechos. Lido
    // como cobertura simples daria 110% de margem, que não existe em lugar
    // nenhum; dividido pelas duas coberturas dá os 5% que realmente são.
    expect(overround([1.1112, 1.1334, 3.1429])).toBeCloseTo(0.0502, 4);
  });

  it('recusa grupo cuja soma não fecha em inteiro nenhum', () => {
    // 1/5.5 + 1/8 = 0,307: nem 1 nem 2 coberturas. É o formato das colunas de
    // resultado correto, que numa medição real deram 0,26.
    expect(overround([5.5, 8])).toBeNull();
    // Margem grande demais para ser margem — é grade mal pareada.
    expect(overround([1.01, 1.01])).toBeNull();
  });

  it('recusa de-vig quando quem chama diz que o grupo não é complementar', () => {
    // "Marcador - Fulano" traz Primeiro / Último / Qualq. Altura, que acontecem
    // juntas. Num jogo real elas somaram 1,03 e passariam como um mercado de 3%
    // de margem, inventando a probabilidade da seleção.
    const primeiroUltimoQualquer = [4.25, 4.25, 1.8];
    expect(overround(primeiroUltimoQualquer)).not.toBeNull(); // a soma engana
    expect(overround(primeiroUltimoQualquer, { complementar: false })).toBeNull();
  });

  it('precisa de pelo menos duas seleções', () => {
    expect(overround([1.9])).toBeNull();
    expect(overround([])).toBeNull();
  });
});

describe('probJusta', () => {
  it('tira a margem proporcionalmente', () => {
    const p = probJusta(1.3334, [1.3334, 5.6667, 7]);
    // 1/1.3334 = 0.75 de implícita; sem a margem de 6,93% sobra 0.7014.
    expect(p).toBeCloseTo(0.7014, 4);
  });

  it('as probabilidades de um mercado somam 1 depois do de-vig', () => {
    const mercado = [1.3334, 5.6667, 7];
    const soma = mercado.reduce((s, x) => s + probJusta(x, mercado), 0);
    expect(soma).toBeCloseTo(1, 6);
  });

  it('cai na margem padrão quando não dá para de-vigar', () => {
    expect(probJusta(2, [2])).toBeCloseTo(0.5 / (1 + OVERROUND_PADRAO), 6);
  });
});

describe('avaliarBoost', () => {
  it('mede o custo de uma boost de perna única', () => {
    // Boost 16808395: Menos de 7.5 chutes do PSG, 1.52 → 1.65.
    const a = avaliarBoost({
      basePrice: 1.52,
      price: 1.65,
      legs: [{ price: 1.52, precosDoMercado: [2.375, 1.52] }],
    });
    expect(a.margemBase).toBeCloseTo(0.0731, 3);
    expect(a.margemBoost).toBeLessThan(0); // a turbinada come a margem inteira
    expect(a.custo).toBeCloseTo(0.0792, 3);
    expect(a.estimado).toBe(false);
  });

  it('o custo é a margem que se perde: base − boost', () => {
    const a = avaliarBoost({
      basePrice: 2,
      price: 2.2,
      legs: [{ price: 2, precosDoMercado: [2, 2] }],
    });
    expect(a.custo).toBeCloseTo(a.margemBase - a.margemBoost, 10);
  });

  it('ancora múltipla na odd combinada da casa, não no produto das pernas', () => {
    // Boost 16769899: chance dupla + ambas marcam, 4.00 → 4.60. Multiplicando
    // as pernas de-vigadas a margem base dava 63%, número que não existe em
    // livro nenhum: as pernas do mesmo jogo são correlacionadas e o produto
    // subestima a chance real. Pela âncora dá ~11%, que é margem de dupla.
    const a = avaliarBoost({
      basePrice: 4,
      price: 4.6,
      legs: [
        { price: 3.1429, precosDoMercado: [1.1112, 1.1334, 3.1429] },
        { price: 1.5455, precosDoMercado: [1.5455, 2.3637] },
      ],
    });
    expect(a.margemBase).toBeCloseTo(0.11, 2);
    expect(a.correlacionada).toBe(true);
    expect(a.pernas).toBe(2);
    // O produto das pernas daria 3.1429 × 1.5455 = 4.857, bem acima dos 4.00
    // que a casa publicou: a diferença é o desconto de correlação dela, e
    // ancorar em `basePrice` é o que o traz para dentro da conta.
    expect(a.prob).toBeGreaterThan(1 / 4.857);
  });

  it('empilha a margem perna a perna', () => {
    // Três pernas a 8% de margem cada carregam 1 − 1/1.08³ = 20,6%.
    // Mercado de duas vias com 8%: as duas odds em 2/1.08 = 1.8519.
    const perna = { price: 1.8519, precosDoMercado: [1.8519, 1.8519] };
    const a = avaliarBoost({ basePrice: 8, price: 8, legs: [perna, perna, perna] });
    expect(a.margemBase).toBeCloseTo(1 - 1 / 1.08 ** 3, 3);
  });

  it('cai na estimativa quando a perna é de família não complementar', () => {
    const a = avaliarBoost({
      basePrice: 1.8,
      price: 2,
      legs: [{ price: 1.8, precosDoMercado: [4.25, 4.25, 1.8], complementar: false }],
    });
    expect(a.estimado).toBe(true);
    expect(a.margemBase).toBeCloseTo(OVERROUND_PADRAO / (1 + OVERROUND_PADRAO), 4);
  });

  it('marca como estimado quando alguma perna não tem grupo', () => {
    const a = avaliarBoost({
      basePrice: 2.1,
      price: 2.25,
      legs: [{ price: 2.1, precosDoMercado: [] }],
    });
    expect(a.estimado).toBe(true);
    expect(a.margemBase).toBeCloseTo(OVERROUND_PADRAO / (1 + OVERROUND_PADRAO), 4);
  });

  it('recusa odd inválida', () => {
    expect(avaliarBoost({ basePrice: 0, price: 2, legs: [] })).toBeNull();
    expect(avaliarBoost({ basePrice: 2, price: null, legs: [] })).toBeNull();
  });
});

describe('exposicao', () => {
  it('calcula o risco máximo da trava', () => {
    const e = exposicao({ betsLimit: 400, maxStake: 50, price: 1.65 });
    expect(e.stakeMax).toBe(20000);
    expect(e.retornoMax).toBeCloseTo(33000, 6);
    expect(e.riscoMax).toBeCloseTo(13000, 6);
  });

  it('devolve nulo sem trava ou sem stake', () => {
    expect(exposicao({ betsLimit: 0, maxStake: 50, price: 1.65 })).toBeNull();
    expect(exposicao({ betsLimit: 400, maxStake: 0, price: 1.65 })).toBeNull();
  });
});
