// Lógica de cálculo compartilhada por todas as telas (funções puras, sem React).
// Coberta por testes em analysis.test.js — qualquer mudança aqui deve manter os testes verdes.

export const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// Mantém apenas o relatório mais recente de cada boost (assume `reports` ordenado por created_at desc).
// Usado em todas as telas para evitar somar/duplicar quando uma boost teve relatório salvo mais de uma vez.
export const dedupLatestByBoost = (reports) => {
  const latest = {};
  for (const r of reports || []) {
    const k = r.boost_id ?? r.id;
    if (!latest[k]) latest[k] = r;
  }
  return Object.values(latest);
};

// Filtra relatórios pela data do evento (welcome_boosts.data_evento). Compartilhado entre
// "Relatórios Gerais" e "Ids Repetidos" para que os dois usem o mesmo critério de período.
export const filterReportsByEventDate = (reports, from, to) => {
  const fromD = from ? new Date(from + "T00:00:00") : null;
  const toD = to ? new Date(to + "T23:59:59") : null;
  return (reports || []).filter((r) => {
    const ds = r.welcome_boosts?.data_evento;
    if (!ds) return !from && !to;
    const d = new Date(ds);
    if (fromD && d < fromD) return false;
    if (toD && d > toD) return false;
    return true;
  });
};

// Arredonda cada valor a centavos garantindo que a soma bata EXATAMENTE com o total
// (distribui o resíduo de arredondamento pelas maiores frações). Evita divergência
// de centavos entre a soma das linhas e o total exibido.
const roundToSum = (vals, target) => {
  const cents = vals.map((v) => Math.round(v * 100));
  const targetCents = Math.round(target * 100);
  let diff = targetCents - cents.reduce((a, c) => a + c, 0);
  if (diff !== 0 && vals.length > 0) {
    const order = vals.map((v, i) => ({ i, frac: v * 100 - Math.floor(v * 100) }));
    if (diff > 0) order.sort((a, b) => b.frac - a.frac);
    else order.sort((a, b) => a.frac - b.frac);
    const step = diff > 0 ? 1 : -1;
    for (let k = 0; k < Math.abs(diff); k++) cents[order[k % order.length].i] += step;
  }
  return cents.map((c) => c / 100);
};

// Recebe os relatórios já filtrados por período e devolve toda a análise cruzada.
// Quando TODOS os relatórios do período têm player_stats (stake/GGR por jogador, formato
// { "<id>": [stake, ggr] }), os valores por faixa/combinação são exatos (`exact: true`);
// sem player_stats usa a média por jogador da boost como estimativa, sempre reconciliando
// a soma com os totais reais.
export function computeIdsAnalysis(reports) {
  const boosts = new Map();
  for (const r of reports) {
    const confronto = r.welcome_boosts?.confronto || "Sem nome";
    const mercado = r.welcome_boosts?.mercado || "";
    const label = mercado ? `${confronto} · ${mercado}` : confronto;
    const key = r.boost_id ?? r.id;
    if (!boosts.has(key)) boosts.set(key, {
      label, confronto, mercado, ids: new Set(), shared: new Set(),
      stake: 0, ggr: 0, stats: null,
      welcomeDate: r.welcome_boosts?.data_evento ?? null,
      data_evento: r.welcome_boosts?.data_evento ?? null,
    });
    const b = boosts.get(key);
    for (const pid of (r.player_ids ?? [])) { if (pid) b.ids.add(pid); }
    // Number(...) || 0 — mesma conversão usada nos totais de "Relatórios Gerais"
    b.stake += Number(r.total_stake) || 0;
    b.ggr += Number(r.ggr) || 0;
    if (r.player_stats && typeof r.player_stats === "object") b.stats = r.player_stats;
  }
  for (const [, b] of boosts) {
    b.avgStake = b.ids.size > 0 ? b.stake / b.ids.size : 0;
    b.avgGGR = b.ids.size > 0 ? b.ggr / b.ids.size : 0;
  }

  // Stake/GGR de um jogador em uma boost: exato quando salvo em player_stats,
  // senão a média da boost (estimativa).
  const playerStake = (k, pid) => {
    const b = boosts.get(k);
    const e = b?.stats?.[String(pid)];
    return e ? (Number(e[0]) || 0) : (b?.avgStake ?? 0);
  };
  const playerGGR = (k, pid) => {
    const b = boosts.get(k);
    const e = b?.stats?.[String(pid)];
    return e ? (Number(e[1]) || 0) : (b?.avgGGR ?? 0);
  };
  let exact = boosts.size > 0;
  for (const [, b] of boosts) if (!b.stats) exact = false;

  const crossRef = new Map();
  for (const [k, b] of boosts)
    for (const pid of b.ids) { if (!crossRef.has(pid)) crossRef.set(pid, new Set()); crossRef.get(pid).add(k); }
  for (const [pid, ks] of crossRef)
    if (ks.size > 1) for (const k of ks) boosts.get(k)?.shared.add(pid);

  let totalStake = 0, totalGGR = 0;
  for (const [, b] of boosts) { totalStake += b.stake; totalGGR += b.ggr; }

  const stats = [];
  for (const [, b] of boosts) {
    const total = b.ids.size, shared = b.shared.size;
    stats.push({
      label: b.label, confronto: b.confronto, mercado: b.mercado,
      welcomeDate: b.welcomeDate,
      total_ids: total, shared_ids: shared,
      pct_shared: total > 0 ? Math.round((shared / total) * 100) : 0,
      total_stake: b.stake, total_ggr: b.ggr, avg_stake: b.avgStake,
    });
  }
  stats.sort((a, b) => (b.welcomeDate || "").localeCompare(a.welcomeDate || ""));

  // ── combinações EXATAS de welcomes ──────────────────────────────────────────
  // Assinatura = o conjunto exato de boosts que o jogador pegou. É o nível mais
  // granular do "Comparativo de Repetição": detalha cada faixa combinação por combinação.
  const comboMap = new Map();
  for (const [pid, ks] of crossRef) {
    const arr = [...ks].sort();
    const key = arr.join("|||");
    if (!comboMap.has(key)) comboMap.set(key, { boostKeys: arr, count: 0, ids: [] });
    const c = comboMap.get(key);
    c.count++;
    if (c.ids.length < 20000) c.ids.push(pid);
  }
  const rawCombos = [...comboMap.values()].map((c) => {
    // Soma jogador a jogador quando a lista de ids do grupo está completa (exato se houver
    // player_stats); se o cap de 20k ids cortou a lista, cai para a média da boost.
    let stake = 0, ggr = 0;
    if (c.ids.length === c.count) {
      for (const pid of c.ids)
        for (const k of c.boostKeys) { stake += playerStake(k, pid); ggr += playerGGR(k, pid); }
    } else {
      stake = c.count * c.boostKeys.reduce((s, k) => s + (boosts.get(k)?.avgStake ?? 0), 0);
      ggr = c.count * c.boostKeys.reduce((s, k) => s + (boosts.get(k)?.avgGGR ?? 0), 0);
    }
    return {
      freq: c.boostKeys.length,
      labels: c.boostKeys.map((k) => boosts.get(k)?.label ?? k),
      confrontos: c.boostKeys.map((k) => boosts.get(k)?.confronto ?? k),
      count: c.count, _stake: stake, _ggr: ggr, ids: c.ids,
    };
  });

  const totalStakeR = round2(totalStake), totalGGRR = round2(totalGGR);
  // Arredonda no nível mais granular (combinação) preservando soma exata = totais reais.
  // Assim: combinações somam às faixas, e faixas somam aos totais — tudo bate ao centavo.
  const comboStakeAdj = roundToSum(rawCombos.map((c) => c._stake), totalStakeR);
  const comboGGRAdj = roundToSum(rawCombos.map((c) => c._ggr), totalGGRR);
  const combos = rawCombos.map((c, i) => ({
    freq: c.freq, labels: c.labels, confrontos: c.confrontos, count: c.count, ids: c.ids,
    stake_est: comboStakeAdj[i], ggr_est: comboGGRAdj[i],
  })).sort((a, b) => a.freq - b.freq || b.count - a.count);

  // faixas = agregação das combinações por nº de welcomes (consistente por construção)
  const tierAgg = new Map();
  for (const c of combos) {
    if (!tierAgg.has(c.freq)) tierAgg.set(c.freq, { count: 0, stake: 0, ggr: 0 });
    const t = tierAgg.get(c.freq);
    t.count += c.count; t.stake += c.stake_est; t.ggr += c.ggr_est;
  }
  const tiers = [...tierAgg.entries()].map(([freq, t]) => ({
    freq, count: t.count,
    stake_est: round2(t.stake), ggr_est: round2(t.ggr),
    avg_stake: round2(t.count > 0 ? t.stake / t.count : 0),
    ids: combos.filter((c) => c.freq === freq).flatMap((c) => c.ids),
  })).sort((a, b) => a.freq - b.freq);

  const maxFreq = tiers.length ? tiers[tiers.length - 1].freq : 0;
  const totalUnique = crossRef.size;
  const totalRepeated = [...crossRef.values()].filter(s => s.size > 1).length;
  // Participações somadas (Σ por welcome) — mesmo número de "Relatórios Gerais".
  // Identidade: participações = distintos + repetições (entradas extras).
  const totalParticipacoes = tiers.reduce((s, t) => s + t.freq * t.count, 0);
  const extraEntries = totalParticipacoes - totalUnique;

  // "dos repetidos" = soma exata das faixas 2+ (já reconciliadas com os totais).
  const repTiers = tiers.filter(t => t.freq >= 2);
  const stakeRepEst = round2(repTiers.reduce((acc, t) => acc + t.stake_est, 0));
  const ggrRepEst = round2(repTiers.reduce((acc, t) => acc + t.ggr_est, 0));

  return {
    numBoosts: boosts.size, totalUnique, totalRepeated,
    totalParticipacoes, extraEntries,
    totalStake: totalStakeR, totalGGR: totalGGRR,
    stakeRepEst, ggrRepEst, exact,
    stats, tiers, combos, maxFreq,
  };
}

// ─── RESUMO MENSAL ───────────────────────────────────────────────────────────
// Tudo aqui usa mês LOCAL (mesmo fuso de filterReportsByEventDate), para que
// "agosto" no seletor de mês signifique exatamente o mesmo período nas outras telas.

// Chave "YYYY-MM" de uma data (null quando a data não existe/é inválida).
export const monthKey = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Primeiro e último dia do mês em YYYY-MM-DD (formato que filterReportsByEventDate espera).
export const monthRange = (ym) => {
  const [y, m] = (ym || "").split("-").map(Number);
  if (!y || !m) return ["", ""];
  const last = new Date(y, m, 0).getDate();
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, "0")}`];
};

// Avança/retrocede meses ("2026-01" + (-1) = "2025-12").
export const shiftMonth = (ym, delta) => {
  const [y, m] = (ym || "").split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// "2026-08" -> "Agosto de 2026"
export const monthLabel = (ym) => {
  const [y, m] = (ym || "").split("-").map(Number);
  if (!y || !m) return "";
  const s = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Mês (YYYY-MM) da PRIMEIRA welcome em que cada jogador aparece, olhando TODO o histórico
// salvo — base do indicador "novos registros" (jogador que estreou naquele mês).
export const firstMonthByPlayer = (reports) => {
  const first = new Map();
  for (const r of reports || []) {
    const k = monthKey(r.welcome_boosts?.data_evento);
    if (!k) continue;
    for (const pid of r.player_ids ?? []) {
      if (!pid) continue;
      const s = String(pid);
      const cur = first.get(s);
      if (!cur || k < cur) first.set(s, k); // "YYYY-MM" compara certo como string
    }
  }
  return first;
};

// Consolida um mês inteiro: totais financeiros, jogadores, novos registros e welcomes.
// `reports` deve ser a lista COMPLETA (deduplicada) — o histórico é necessário para saber
// quem é "novo". `boosts` é a lista de welcomes cadastradas (opcional).
// `firstMonth` é o mapa de firstMonthByPlayer; passe-o para não recalcular a cada mês.
export function computeMonthSummary({ reports, boosts, month, firstMonth, odd }) {
  const [from, to] = monthRange(month);
  // As odds vivem em welcome_boosts (o join dos relatórios não as traz), então vêm
  // da lista de boosts cruzada por id.
  const boostById = new Map((boosts || []).map((b) => [b.id, b]));
  const oddDe = (b) => Number(b?.odd_nova) || 0;

  // `odd` (opcional) restringe o mês às welcomes que terminaram naquela odd final.
  // Vale para TUDO: totais, jogadores, novos registros, green/red e a lista.
  const oddAlvo = Number(odd) || null;
  const daOdd = (b) => !oddAlvo || oddDe(b) === oddAlvo;

  const noMes = month ? filterReportsByEventDate(reports || [], from, to) : [];
  const monthReports = oddAlvo ? noMes.filter((r) => daOdd(boostById.get(r.boost_id))) : noMes;

  const totals = { totalStake: 0, ggr: 0, qtdApostas: 0, wins: 0, lost: 0, cashout: 0 };
  const players = new Set();
  let participacoes = 0;
  for (const r of monthReports) {
    totals.totalStake += Number(r.total_stake) || 0;
    totals.ggr += Number(r.ggr) || 0;
    totals.qtdApostas += Number(r.qtd_apostas) || 0;
    totals.wins += Number(r.wins) || 0;
    totals.lost += Number(r.lost) || 0;
    totals.cashout += Number(r.cashout) || 0;
    // `if (pid)` é o mesmo critério de id válido de computeIdsAnalysis — assim
    // "Jogadores Distintos" aqui bate com Relatórios Gerais / Ids Repetidos no mesmo período.
    for (const pid of r.player_ids ?? []) { if (pid) { players.add(String(pid)); participacoes++; } }
  }

  const fm = firstMonth || firstMonthByPlayer(reports);
  let novosRegistros = 0;
  for (const pid of players) if (fm.get(pid) === month) novosRegistros++;

  // Welcomes do mês pela data do evento. Quando a lista de boosts não é passada,
  // cai para a contagem de welcomes que têm relatório salvo.
  const comRelatorio = new Set(monthReports.map((r) => r.boost_id ?? r.id)).size;
  const welcomesMes = (boosts || []).filter((b) => monthKey(b.data_evento) === month && daOdd(b));
  const cadastradas = boosts ? welcomesMes.length : comRelatorio;

  const oddsNovas = welcomesMes.map(oddDe).filter((o) => o > 0);
  const oddMedia = oddsNovas.length ? round2(oddsNovas.reduce((a, o) => a + o, 0) / oddsNovas.length) : 0;
  const maiorOdd = welcomesMes.reduce(
    (best, b) => (oddDe(b) > (best?.odd ?? 0) ? { odd: oddDe(b), confronto: b.confronto || "-" } : best),
    null
  );

  // Resultado da WELCOME (o card inteiro), não bilhete a bilhete: a boost é de uma seleção só,
  // então se a maioria dos bilhetes resolvidos deu win a aposta entrou (green); se deu lost, red.
  // odd antiga -> odd final (a "boost") e o % de aumento, na mesma fórmula do card da boost
  const oddsDaBoost = (b) => {
    const antiga = Number(b?.odd_antiga) || 0;
    const nova = Number(b?.odd_nova) || 0;
    return {
      odd_antiga: antiga, odd_nova: nova,
      boost_pct: antiga > 1 && nova > 0 ? Math.round(((nova - antiga) / (antiga - 1)) * 100) : 0,
    };
  };

  const resultadoWelcome = (wins, lost) => {
    if (wins > lost) return "green";
    if (lost > wins) return "red";
    if (wins > 0) return "misto";  // empate real entre win e lost
    return "sem_resultado";        // nada resolvido: sem bilhete, ou só cashout/anuladas
  };

  const rows = monthReports
    .map((r) => ({
      id: r.id,
      confronto: r.welcome_boosts?.confronto || "-",
      mercado: r.welcome_boosts?.mercado || "",
      data_evento: r.welcome_boosts?.data_evento || null,
      total_stake: Number(r.total_stake) || 0,
      ggr: Number(r.ggr) || 0,
      qtd_apostas: Number(r.qtd_apostas) || 0,
      wins: Number(r.wins) || 0,
      lost: Number(r.lost) || 0,
      cashout: Number(r.cashout) || 0,
      jogadores: (r.player_ids ?? []).length || Number(r.ids_unicos) || 0,
      resultado: resultadoWelcome(Number(r.wins) || 0, Number(r.lost) || 0),
      ...oddsDaBoost(boostById.get(r.boost_id)),
    }))
    .sort((a, b) => (b.data_evento || "").localeCompare(a.data_evento || ""));

  return {
    month, from, to, odd: oddAlvo,
    totalStake: round2(totals.totalStake),
    ggr: round2(totals.ggr),
    qtdApostas: totals.qtdApostas,
    wins: totals.wins, lost: totals.lost, cashout: totals.cashout,
    ticketMedio: totals.qtdApostas > 0 ? round2(totals.totalStake / totals.qtdApostas) : 0,
    jogadores: players.size,
    participacoes,
    // contagem por CARD (welcome), a leitura de "quantas deram green / red no mês"
    welcomesGreen: rows.filter((r) => r.resultado === "green").length,
    welcomesRed: rows.filter((r) => r.resultado === "red").length,
    welcomesMistas: rows.filter((r) => r.resultado === "misto").length,
    novosRegistros,
    oddMedia, maiorOdd,
    welcomes: cadastradas,
    welcomesComRelatorio: comRelatorio,
    rows,
  };
}

// Odds finais distintas de um mês, com quantas welcomes cada uma teve — alimenta o
// filtro "só as welcomes com esta odd final". Da maior odd para a menor.
export const oddsDoMes = (boosts, month) => {
  const porOdd = new Map();
  for (const b of boosts || []) {
    if (monthKey(b.data_evento) !== month) continue;
    const o = Number(b.odd_nova) || 0;
    if (!o) continue;
    porOdd.set(o, (porOdd.get(o) || 0) + 1);
  }
  return [...porOdd.entries()]
    .map(([odd, welcomes]) => ({ odd, welcomes }))
    .sort((a, b) => b.odd - a.odd);
};

// Meses (YYYY-MM) que têm welcome cadastrada ou relatório salvo, do mais recente ao mais antigo.
export const availableMonths = (reports, boosts) => {
  const set = new Set();
  for (const r of reports || []) { const k = monthKey(r.welcome_boosts?.data_evento); if (k) set.add(k); }
  for (const b of boosts || []) { const k = monthKey(b.data_evento); if (k) set.add(k); }
  return [...set].sort((a, b) => b.localeCompare(a));
};
