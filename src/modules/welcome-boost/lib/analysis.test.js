import { describe, it, expect } from "vitest";
import { dedupLatestByBoost, filterReportsByEventDate, computeIdsAnalysis, round2, monthKey, monthRange, shiftMonth, firstMonthByPlayer, computeMonthSummary, availableMonths, oddsDoMes } from "./analysis";

// Helper: monta um relatório como vem do Supabase (boost_relatorios + welcome_boosts)
const report = ({ id, boost_id, confronto, mercado = "", data_evento, total_stake, ggr, player_ids, player_stats = undefined }) => ({
  id, boost_id, total_stake, ggr, player_ids, player_stats,
  welcome_boosts: { confronto, mercado, data_evento },
});

describe("dedupLatestByBoost", () => {
  it("mantém apenas o primeiro relatório de cada boost (o mais recente, lista vem ordenada desc)", () => {
    const reports = [
      { id: 10, boost_id: "A", ggr: 100 }, // mais recente da boost A
      { id: 9, boost_id: "B", ggr: 50 },
      { id: 8, boost_id: "A", ggr: 999 }, // antigo — deve ser descartado
    ];
    const out = dedupLatestByBoost(reports);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.boost_id === "A").ggr).toBe(100);
  });

  it("usa o próprio id quando boost_id é nulo", () => {
    const out = dedupLatestByBoost([{ id: 1 }, { id: 2 }, { id: 1 }]);
    expect(out).toHaveLength(2);
  });

  it("lista vazia/nula não quebra", () => {
    expect(dedupLatestByBoost([])).toEqual([]);
    expect(dedupLatestByBoost(null)).toEqual([]);
  });
});

describe("filterReportsByEventDate", () => {
  const reports = [
    report({ id: 1, boost_id: "A", confronto: "A", data_evento: "2026-06-01T15:00:00", total_stake: 0, ggr: 0, player_ids: [] }),
    report({ id: 2, boost_id: "B", confronto: "B", data_evento: "2026-06-10T23:30:00", total_stake: 0, ggr: 0, player_ids: [] }),
    report({ id: 3, boost_id: "C", confronto: "C", data_evento: "2026-07-01T00:00:00", total_stake: 0, ggr: 0, player_ids: [] }),
  ];

  it("inclui os limites do período (00:00 do from até 23:59 do to)", () => {
    const out = filterReportsByEventDate(reports, "2026-06-01", "2026-06-10");
    expect(out.map((r) => r.boost_id)).toEqual(["A", "B"]);
  });

  it("filtra só com from ou só com to", () => {
    expect(filterReportsByEventDate(reports, "2026-06-05", "").map((r) => r.boost_id)).toEqual(["B", "C"]);
    expect(filterReportsByEventDate(reports, "", "2026-06-05").map((r) => r.boost_id)).toEqual(["A"]);
  });

  it("sem filtro devolve tudo", () => {
    expect(filterReportsByEventDate(reports, "", "")).toHaveLength(3);
  });

  it("relatório sem data_evento só entra quando não há filtro", () => {
    const semData = [{ id: 9, boost_id: "X", welcome_boosts: {} }];
    expect(filterReportsByEventDate(semData, "", "")).toHaveLength(1);
    expect(filterReportsByEventDate(semData, "2026-06-01", "")).toHaveLength(0);
  });
});

describe("computeIdsAnalysis — cruzamento básico", () => {
  // Boost A: jogadores 1, 2, 3 · Boost B: jogadores 2, 3, 4, 5
  // → distintos: 5 · repetidos (2+): 2 (jogadores 2 e 3) · participações: 7
  const reports = [
    report({ id: 1, boost_id: "A", confronto: "Brasil vs Egito", data_evento: "2026-06-06T19:00:00", total_stake: 300, ggr: -90, player_ids: [1, 2, 3] }),
    report({ id: 2, boost_id: "B", confronto: "Argentina vs Honduras", data_evento: "2026-06-06T21:00:00", total_stake: 400, ggr: 120, player_ids: [2, 3, 4, 5] }),
  ];
  const a = computeIdsAnalysis(reports);

  it("conta jogadores distintos, repetidos e participações", () => {
    expect(a.numBoosts).toBe(2);
    expect(a.totalUnique).toBe(5);
    expect(a.totalRepeated).toBe(2);
    expect(a.totalParticipacoes).toBe(7);
    // identidade: participações = distintos + repetições extras
    expect(a.extraEntries).toBe(a.totalParticipacoes - a.totalUnique);
  });

  it("soma stake e GGR totais igual a Relatórios Gerais (Number(...) || 0)", () => {
    expect(a.totalStake).toBe(700);
    expect(a.totalGGR).toBe(30);
  });

  it("aceita valores numéricos vindos como string do banco", () => {
    const comString = [
      report({ id: 1, boost_id: "A", confronto: "X", data_evento: "2026-06-06T19:00:00", total_stake: "150.50", ggr: "-10.25", player_ids: [1] }),
    ];
    const r = computeIdsAnalysis(comString);
    expect(r.totalStake).toBe(150.5);
    expect(r.totalGGR).toBe(-10.25);
  });

  it("faixas somam exatamente os totais (reconciliação ao centavo)", () => {
    const stakeSum = round2(a.tiers.reduce((s, t) => s + t.stake_est, 0));
    const ggrSum = round2(a.tiers.reduce((s, t) => s + t.ggr_est, 0));
    expect(stakeSum).toBe(a.totalStake);
    expect(ggrSum).toBe(a.totalGGR);
  });

  it("combinações somam exatamente as faixas", () => {
    for (const t of a.tiers) {
      const combosDoTier = a.combos.filter((c) => c.freq === t.freq);
      expect(round2(combosDoTier.reduce((s, c) => s + c.stake_est, 0))).toBe(t.stake_est);
      expect(round2(combosDoTier.reduce((s, c) => s + c.ggr_est, 0))).toBe(t.ggr_est);
      expect(combosDoTier.reduce((s, c) => s + c.count, 0)).toBe(t.count);
    }
  });

  it("sem player_stats o resultado é estimado (exact = false)", () => {
    expect(a.exact).toBe(false);
  });

  it("ignora ids vazios/nulos no player_ids", () => {
    const comVazios = [
      report({ id: 1, boost_id: "A", confronto: "X", data_evento: "2026-06-06T19:00:00", total_stake: 10, ggr: 0, player_ids: [1, null, "", 2] }),
    ];
    expect(computeIdsAnalysis(comVazios).totalUnique).toBe(2);
  });
});

describe("computeIdsAnalysis — modo exato com player_stats", () => {
  // Jogador 2 pegou as duas welcomes: stake exato 100+40=140, ggr exato -50+10=-40
  const reports = [
    report({
      id: 1, boost_id: "A", confronto: "Brasil vs Egito", data_evento: "2026-06-06T19:00:00",
      total_stake: 300, ggr: -90, player_ids: [1, 2, 3],
      player_stats: { 1: [150, -30], 2: [100, -50], 3: [50, -10] },
    }),
    report({
      id: 2, boost_id: "B", confronto: "Argentina vs Honduras", data_evento: "2026-06-06T21:00:00",
      total_stake: 400, ggr: 120, player_ids: [2, 4],
      player_stats: { 2: [40, 10], 4: [360, 110] },
    }),
  ];
  const a = computeIdsAnalysis(reports);

  it("marca exact = true quando todos os relatórios têm player_stats", () => {
    expect(a.exact).toBe(true);
  });

  it("faixa de 2 welcomes usa o stake/GGR exato do jogador (não a média)", () => {
    const tier2 = a.tiers.find((t) => t.freq === 2);
    expect(tier2.count).toBe(1);
    expect(tier2.stake_est).toBe(140); // 100 (boost A) + 40 (boost B)
    expect(tier2.ggr_est).toBe(-40);   // -50 + 10
  });

  it("faixa de 1 welcome é o restante exato e tudo soma os totais", () => {
    const tier1 = a.tiers.find((t) => t.freq === 1);
    expect(tier1.count).toBe(3); // jogadores 1, 3, 4
    expect(tier1.stake_est).toBe(560); // 150 + 50 + 360
    expect(tier1.ggr_est).toBe(70);    // -30 + -10 + 110
    expect(round2(tier1.stake_est + a.tiers.find((t) => t.freq === 2).stake_est)).toBe(a.totalStake);
  });

  it("stakeRepEst/ggrRepEst refletem exatamente os repetidos", () => {
    expect(a.stakeRepEst).toBe(140);
    expect(a.ggrRepEst).toBe(-40);
  });

  it("modo misto (um relatório sem stats) volta para estimativa", () => {
    const misto = [reports[0], { ...reports[1], player_stats: undefined }];
    expect(computeIdsAnalysis(misto).exact).toBe(false);
  });
});

describe("computeIdsAnalysis — casos extremos", () => {
  it("lista vazia devolve zeros sem quebrar", () => {
    const a = computeIdsAnalysis([]);
    expect(a.numBoosts).toBe(0);
    expect(a.totalUnique).toBe(0);
    expect(a.totalStake).toBe(0);
    expect(a.tiers).toEqual([]);
    expect(a.exact).toBe(false);
  });

  it("boost sem player_ids conta no stake mas não no cruzamento", () => {
    const a = computeIdsAnalysis([
      report({ id: 1, boost_id: "A", confronto: "X", data_evento: "2026-06-06T19:00:00", total_stake: 99.99, ggr: 1.01, player_ids: [] }),
    ]);
    expect(a.numBoosts).toBe(1);
    expect(a.totalUnique).toBe(0);
    expect(a.totalStake).toBe(99.99);
  });
});

describe("helpers de mês", () => {
  it("monthKey usa o mês local da data do evento", () => {
    expect(monthKey("2026-08-13T20:00:00")).toBe("2026-08");
    expect(monthKey(null)).toBe(null);
    expect(monthKey("data ruim")).toBe(null);
  });

  it("monthRange devolve o primeiro e o último dia do mês", () => {
    expect(monthRange("2026-02")).toEqual(["2026-02-01", "2026-02-28"]);
    expect(monthRange("2024-02")).toEqual(["2024-02-01", "2024-02-29"]); // bissexto
    expect(monthRange("2026-12")).toEqual(["2026-12-01", "2026-12-31"]);
    expect(monthRange("")).toEqual(["", ""]);
  });

  it("shiftMonth atravessa a virada de ano", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-08", 0)).toBe("2026-08");
  });
});

describe("firstMonthByPlayer", () => {
  const hist = [
    report({ id: 1, boost_id: "A", confronto: "A", data_evento: "2026-06-10T15:00:00", total_stake: 0, ggr: 0, player_ids: ["p1", "p2"] }),
    report({ id: 2, boost_id: "B", confronto: "B", data_evento: "2026-07-05T15:00:00", total_stake: 0, ggr: 0, player_ids: ["p1", "p3"] }),
  ];

  it("guarda o mês da primeira welcome de cada jogador", () => {
    const fm = firstMonthByPlayer(hist);
    expect(fm.get("p1")).toBe("2026-06"); // apareceu nas duas — vale a mais antiga
    expect(fm.get("p2")).toBe("2026-06");
    expect(fm.get("p3")).toBe("2026-07");
  });

  it("não depende da ordem dos relatórios", () => {
    const fm = firstMonthByPlayer([...hist].reverse());
    expect(fm.get("p1")).toBe("2026-06");
  });
});

describe("computeMonthSummary", () => {
  const reports = [
    report({ id: 1, boost_id: "A", confronto: "A", data_evento: "2026-06-10T15:00:00", total_stake: 100, ggr: 30, player_ids: ["p1", "p2"] }),
    report({ id: 2, boost_id: "B", confronto: "B", data_evento: "2026-07-05T15:00:00", total_stake: 200, ggr: -50, player_ids: ["p1", "p3"] }),
    report({ id: 3, boost_id: "C", confronto: "C", data_evento: "2026-07-20T15:00:00", total_stake: 300, ggr: 80, player_ids: ["p3", "p4"] }),
  ];
  reports[1].qtd_apostas = 4; reports[1].wins = 1; reports[1].lost = 3; reports[1].cashout = 0;
  reports[2].qtd_apostas = 6; reports[2].wins = 4; reports[2].lost = 1; reports[2].cashout = 1;
  const boosts = [
    { id: "A", confronto: "A", data_evento: "2026-06-10T15:00:00", odd_antiga: 2, odd_nova: 4 },
    { id: "B", confronto: "B", data_evento: "2026-07-05T15:00:00", odd_antiga: 1.5, odd_nova: 3 },
    { id: "C", confronto: "C", data_evento: "2026-07-20T15:00:00", odd_antiga: 2, odd_nova: 5 },
    // welcome de julho ainda sem relatório — entra na odd média, mas não nos totais
    { id: "D", confronto: "D", data_evento: "2026-07-28T15:00:00", odd_antiga: 1.8, odd_nova: 10 },
  ];

  it("soma stake e GGR só do mês escolhido", () => {
    const s = computeMonthSummary({ reports, boosts, month: "2026-07" });
    expect(s.totalStake).toBe(500);
    expect(s.ggr).toBe(30);
    expect(s.qtdApostas).toBe(10);
    expect(s.ticketMedio).toBe(50);
    expect(s.wins).toBe(5);   // 1 + 4
    expect(s.lost).toBe(4);   // 3 + 1
    expect(s.cashout).toBe(1);
  });

  it("conta jogadores distintos e só os que estrearam no mês", () => {
    const s = computeMonthSummary({ reports, boosts, month: "2026-07" });
    expect(s.jogadores).toBe(3);        // p1, p3, p4
    expect(s.participacoes).toBe(4);    // p1+p3 e p3+p4
    expect(s.novosRegistros).toBe(2);   // p3 e p4 (p1 já tinha vindo em junho)
  });

  it("conta welcomes cadastradas no mês e quantas têm relatório", () => {
    const s = computeMonthSummary({ reports, boosts, month: "2026-07" });
    expect(s.welcomes).toBe(3);
    expect(s.welcomesComRelatorio).toBe(2);
  });

  it("sem a lista de boosts, welcomes = as que têm relatório", () => {
    const s = computeMonthSummary({ reports, month: "2026-07" });
    expect(s.welcomes).toBe(2);
  });

  it("mês sem movimento devolve tudo zerado", () => {
    const s = computeMonthSummary({ reports, boosts, month: "2026-01" });
    expect(s.totalStake).toBe(0);
    expect(s.ggr).toBe(0);
    expect(s.jogadores).toBe(0);
    expect(s.novosRegistros).toBe(0);
    expect(s.welcomes).toBe(0);
    expect(s.rows).toEqual([]);
  });

  it("no primeiro mês do histórico todo jogador é novo", () => {
    const s = computeMonthSummary({ reports, boosts, month: "2026-06" });
    expect(s.jogadores).toBe(2);
    expect(s.novosRegistros).toBe(2);
  });

  it("classifica cada welcome (card) em green/red pela maioria dos bilhetes", () => {
    const s = computeMonthSummary({ reports, boosts, month: "2026-07" });
    expect(s.rows.map((r) => r.resultado)).toEqual(["green", "red"]); // C: 4 win x 1 lost · B: 1 win x 3 lost
    expect(s.welcomesGreen).toBe(1);
    expect(s.welcomesRed).toBe(1);
    expect(s.welcomesMistas).toBe(0);
  });

  it("welcome sem bilhete resolvido não conta nem green nem red", () => {
    const semBilhete = [report({ id: 9, boost_id: "Z", confronto: "Z", data_evento: "2026-09-02T15:00:00", total_stake: 0, ggr: 0, player_ids: [] })];
    const s = computeMonthSummary({ reports: semBilhete, month: "2026-09" });
    expect(s.rows[0].resultado).toBe("sem_resultado");
    expect(s.welcomesGreen + s.welcomesRed).toBe(0);
  });

  it("lista as welcomes do mês da mais recente para a mais antiga", () => {
    const s = computeMonthSummary({ reports, boosts, month: "2026-07" });
    expect(s.rows.map((r) => r.confronto)).toEqual(["C", "B"]);
    expect(s.rows[0]).toMatchObject({ total_stake: 300, ggr: 80, jogadores: 2, wins: 4, lost: 1, cashout: 1 });
  });

  it("traz a odd de cada welcome e o agregado do mês", () => {
    const s = computeMonthSummary({ reports, boosts, month: "2026-07" });
    expect(s.rows[0]).toMatchObject({ odd_antiga: 2, odd_nova: 5, boost_pct: 300 }); // (5-2)/(2-1)
    expect(s.oddMedia).toBe(6);                        // (3 + 5 + 10) / 3, inclui a sem relatório
    expect(s.maiorOdd).toEqual({ odd: 10, confronto: "D" });
  });

  it("sem a lista de boosts as odds ficam zeradas, sem quebrar", () => {
    const s = computeMonthSummary({ reports, month: "2026-07" });
    expect(s.oddMedia).toBe(0);
    expect(s.maiorOdd).toBe(null);
    expect(s.rows[0].odd_nova).toBe(0);
  });

  it("oddsDoMes lista as odds finais do mês com a contagem, da maior para a menor", () => {
    expect(oddsDoMes(boosts, "2026-07")).toEqual([
      { odd: 10, welcomes: 1 },  // D, ainda sem relatório
      { odd: 5, welcomes: 1 },   // C
      { odd: 3, welcomes: 1 },   // B
    ]);
    expect(oddsDoMes(boosts, "2026-01")).toEqual([]);
  });

  it("filtrar por odd final restringe TODOS os números do mês", () => {
    const s = computeMonthSummary({ reports, boosts, month: "2026-07", odd: 5 });
    expect(s.odd).toBe(5);
    expect(s.rows.map((r) => r.confronto)).toEqual(["C"]);
    expect(s.totalStake).toBe(300);        // só a welcome C
    expect(s.ggr).toBe(80);
    expect(s.qtdApostas).toBe(6);
    expect(s.welcomes).toBe(1);
    expect(s.welcomesComRelatorio).toBe(1);
    expect(s.welcomesGreen).toBe(1);
    expect(s.welcomesRed).toBe(0);
    expect(s.jogadores).toBe(2);           // p3 e p4
    expect(s.oddMedia).toBe(5);
  });

  it("filtro em odd de welcome sem relatório zera os totais mas mantém a welcome contada", () => {
    const s = computeMonthSummary({ reports, boosts, month: "2026-07", odd: 10 });
    expect(s.welcomes).toBe(1);
    expect(s.welcomesComRelatorio).toBe(0);
    expect(s.totalStake).toBe(0);
    expect(s.rows).toEqual([]);
  });

  it("odd inexistente no mês não devolve nada", () => {
    const s = computeMonthSummary({ reports, boosts, month: "2026-07", odd: 99 });
    expect(s.welcomes).toBe(0);
    expect(s.rows).toEqual([]);
  });

  it("sem filtro de odd o mês continua inteiro", () => {
    const s = computeMonthSummary({ reports, boosts, month: "2026-07", odd: null });
    expect(s.odd).toBe(null);
    expect(s.totalStake).toBe(500);
    expect(s.welcomes).toBe(3);
  });

  it("a soma dos filtros por odd reconstrói o mês inteiro", () => {
    const total = computeMonthSummary({ reports, boosts, month: "2026-07" });
    const porOdd = oddsDoMes(boosts, "2026-07").map((o) => computeMonthSummary({ reports, boosts, month: "2026-07", odd: o.odd }));
    expect(round2(porOdd.reduce((a, s) => a + s.totalStake, 0))).toBe(total.totalStake);
    expect(round2(porOdd.reduce((a, s) => a + s.ggr, 0))).toBe(total.ggr);
    expect(porOdd.reduce((a, s) => a + s.welcomes, 0)).toBe(total.welcomes);
    expect(porOdd.reduce((a, s) => a + s.rows.length, 0)).toBe(total.rows.length);
  });

  it("availableMonths lista os meses com dados, do mais novo ao mais antigo", () => {
    expect(availableMonths(reports, boosts)).toEqual(["2026-07", "2026-06"]);
  });
});
