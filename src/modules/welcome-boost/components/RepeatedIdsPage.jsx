import { useState, useEffect, useCallback, useMemo } from "react";
import { S } from "../styles";
import { IconChart, IconUser, IconCoin, IconTrophy, IconHistory, IconDownload } from "../icons";
import { fmtR, fmtDate, downloadIdsCsv } from "../lib/format";
import { fetchLatestReports } from "../lib/api";
import { filterReportsByEventDate, computeIdsAnalysis } from "../lib/analysis";
import PeriodFilter from "./PeriodFilter";

// ─── IDS REPETIDOS — DASHBOARD ───────────────────────────────────────────────
// Cruza os jogadores entre os Welcome Boosts cadastrados e mostra, por faixa de
// repetição, quantos IDs pegaram N welcomes e o prejuízo (GGR) que geraram.
// Filtrável pela data do evento (welcome_boosts.data_evento) — o período vem do App
// e é compartilhado com "Relatórios Gerais".
export default function RepeatedIdsPage({ period, onPeriodChange }) {
  const [phase, setPhase] = useState("loading"); // loading | ready | no_data | error
  const [rawReports, setRawReports] = useState(null);

  const fetchRaw = useCallback(async () => {
    setPhase("loading");
    try {
      // Mesma busca (já deduplicada pelo relatório mais recente de cada boost) usada em
      // "Relatórios Gerais", para que os dois dashboards somem exatamente os mesmos dados.
      const reports = await fetchLatestReports();
      if (!reports.length) { setRawReports([]); setPhase("no_data"); return; }
      setRawReports(reports);
      setPhase("ready");
    } catch (e) { console.error(e); setPhase("error"); }
  }, []);

  useEffect(() => { fetchRaw(); }, [fetchRaw]);

  // Só calcula/exibe os dados depois que um período é informado — nada aparece
  // automaticamente ao abrir a tela.
  const hasDateFilter = !!(period.from || period.to);

  // filtro por data do evento
  const filtered = useMemo(() => {
    if (!rawReports || !hasDateFilter) return null;
    return filterReportsByEventDate(rawReports, period.from, period.to);
  }, [rawReports, period.from, period.to, hasDateFilter]);

  const a = useMemo(() => filtered ? computeIdsAnalysis(filtered) : null, [filtered]);

  // labels: quando todos os relatórios têm player_stats, os valores por faixa são exatos
  const estLbl = a?.exact ? "" : " estimado";
  const approx = a?.exact ? "" : "~";

  // welcomes dentro do período
  const welcomesInRange = useMemo(() => {
    if (!filtered) return [];
    const seen = new Map();
    for (const r of filtered) {
      const key = r.boost_id ?? r.id;
      if (!seen.has(key)) {
        const c = r.welcome_boosts?.confronto || "Sem nome";
        const m = r.welcome_boosts?.mercado || "";
        seen.set(key, { label: m ? `${c} · ${m}` : c, date: r.welcome_boosts?.data_evento });
      }
    }
    return [...seen.values()].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  }, [filtered]);

  const downloadTierIds = (tier) => {
    if (!tier?.ids?.length) return;
    downloadIdsCsv(tier.ids, `ids_${tier.freq}_welcomes.csv`);
  };

  const pct = (n, d) => d > 0 ? ((n / d) * 100).toFixed(1) + "%" : "0%";

  // gráfico interativo do "Comparativo de Repetição" detalhado (combinação por combinação)
  const [comboMetric, setComboMetric] = useState("count"); // count | stake_est | ggr_est
  const [comboMinFreq, setComboMinFreq] = useState(2);      // 1 = inclui exclusivos, 2 = só repetidos
  const [hoverCombo, setHoverCombo] = useState(null);
  const comboGet = (key) => key === "stake_est" ? (c => c.stake_est) : key === "ggr_est" ? (c => Math.abs(c.ggr_est)) : (c => c.count);
  const comboFmt = (key, c) => {
    if (key === "stake_est") return fmtR(c.stake_est);
    if (key === "ggr_est") return (c.ggr_est < 0 ? "-" : "") + fmtR(Math.abs(c.ggr_est));
    return c.count.toLocaleString("pt-BR");
  };
  const shownCombos = useMemo(() => {
    if (!a?.combos) return [];
    const g = comboGet(comboMetric);
    return a.combos.filter(c => c.freq >= comboMinFreq).sort((x, y) => g(y) - g(x));
  }, [a, comboMetric, comboMinFreq]);
  const maxComboVal = useMemo(() => {
    const g = comboGet(comboMetric);
    return Math.max(1, ...shownCombos.map(g));
  }, [shownCombos, comboMetric]);
  const downloadComboIds = (c) => {
    if (!c?.ids?.length) return;
    downloadIdsCsv(c.ids, `ids_combo_${c.confrontos.join("_").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60)}.csv`);
  };

  const sec = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", marginBottom: 24, overflow: "hidden", boxShadow: "var(--shadow)" };
  const secHead = { fontSize: 12, fontWeight: 700, color: "var(--t2)", textTransform: "uppercase", letterSpacing: "0.1em", padding: "13px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, background: "var(--surface-2)" };

  const repeatedTiers = a ? a.tiers.filter(t => t.freq >= 2).sort((x, y) => y.freq - x.freq) : [];
  const topTier = repeatedTiers.find(t => t.freq === a?.maxFreq && a?.maxFreq > 1);

  const tierLabel = (freq) => {
    if (!a) return `${freq} welcomes`;
    if (freq === 1) return "1 welcome (exclusivos)";
    if (freq === a.numBoosts) return `Todas as ${freq} welcomes`;
    return `${freq} welcomes`;
  };

  return (
    <div style={S.reportPage}>
      <div style={S.reportContent} className="report-content">

        {/* Filtro por data do evento (compartilhado com Relatórios Gerais) */}
        <PeriodFilter label="Período (data do evento):" from={period.from} to={period.to} onChange={onPeriodChange}>
          <button style={{ ...S.btnSecondary, padding: "8px 14px", fontSize: 12, marginLeft: "auto", display: "flex", alignItems: "center", gap: 7 }} onClick={fetchRaw} disabled={phase === "loading"}>
            <IconChart /> Atualizar dados
          </button>
        </PeriodFilter>

        {phase === "loading" && <div style={{ textAlign: "center", padding: 80, color: "var(--t3)", fontSize: 14 }}>Carregando relatórios...</div>}
        {phase === "error" && <div style={S.empty}><div style={S.emptyTitle}>Erro ao carregar</div><div style={{ fontSize: 13, color: "var(--t3)" }}>Tente "Atualizar dados".</div></div>}
        {phase === "no_data" && <div style={S.empty}><div style={S.emptyTitle}>Nenhum dado disponível</div><div style={{ fontSize: 13, color: "var(--t3)" }}>Gere e salve relatórios para que os IDs sejam cruzados aqui.</div></div>}

        {phase === "ready" && !hasDateFilter && (
          <div style={S.empty}><div style={S.emptyTitle}>Informe um período para começar</div><div style={{ fontSize: 13, color: "var(--t3)" }}>Selecione a data do evento no filtro acima para cruzar os IDs das welcomes.</div></div>
        )}

        {phase === "ready" && hasDateFilter && a && a.numBoosts === 0 && (
          <div style={S.empty}><div style={S.emptyTitle}>Nenhuma welcome no período</div><div style={{ fontSize: 13, color: "var(--t3)" }}>Ajuste o filtro de datas acima.</div></div>
        )}

        {phase === "ready" && hasDateFilter && a && a.numBoosts > 0 && (<>

          {/* welcomes comparadas */}
          <div style={{ marginBottom: 24, padding: "14px 18px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              {a.numBoosts} welcome{a.numBoosts !== 1 ? "s" : ""} comparada{a.numBoosts !== 1 ? "s" : ""} no período
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {welcomesInRange.map((w, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 99, background: "var(--surface-2)", border: "1px solid var(--line)", fontSize: 11.5, color: "var(--t2)" }}>
                  {w.label}
                  {w.date && <span style={{ color: "var(--t3)", fontSize: 10 }}>· {fmtDate(w.date)}</span>}
                </span>
              ))}
            </div>
          </div>

          {/* Reconciliação com "Relatórios Gerais" */}
          <div style={{ marginBottom: 24, padding: "14px 18px", background: "var(--info-soft)", border: "1px solid var(--info)", borderRadius: "var(--r-md)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>🧮</div>
            <div style={{ fontSize: 12.5, color: "var(--t2)", lineHeight: 1.5 }}>
              <strong style={{ color: "var(--t1)" }}>{a.totalParticipacoes.toLocaleString("pt-BR")} participações</strong> somando todas as welcomes
              <span style={{ color: "var(--t3)" }}> (é o número de "Relatórios Gerais")</span>
              {" − "}
              <strong style={{ color: "var(--warn)" }}>{a.extraEntries.toLocaleString("pt-BR")} repetições</strong>
              {" = "}
              <strong style={{ color: "var(--info)" }}>{a.totalUnique.toLocaleString("pt-BR")} jogadores distintos</strong>.
              <span style={{ color: "var(--t3)" }}> Um jogador em várias welcomes conta 1× aqui, mas é somado em Relatórios Gerais.</span>
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(186px, 1fr))", gap: 14, marginBottom: 28 }}>
            <div style={S.statCard}>
              <div style={S.statCardTop}><div style={S.statLabel}>Jogadores Distintos</div><div style={S.statIconWrap("var(--info)")}><IconUser /></div></div>
              <div style={{ ...S.statValue, color: "var(--info)" }}>{a.totalUnique.toLocaleString("pt-BR")}</div>
              <div style={S.statSub}>cada um conta 1× · {a.totalParticipacoes.toLocaleString("pt-BR")} participações</div>
            </div>
            <div style={S.statCard}>
              <div style={S.statCardTop}><div style={S.statLabel}>Pegaram 2+ Welcomes</div><div style={S.statIconWrap("var(--warn)")}><IconChart /></div></div>
              <div style={{ ...S.statValue, color: "var(--warn)" }}>{a.totalRepeated.toLocaleString("pt-BR")}</div>
              <div style={S.statSub}>{pct(a.totalRepeated, a.totalUnique)} dos apostadores</div>
            </div>
            <div style={S.statCard}>
              <div style={S.statCardTop}><div style={S.statLabel}>Stake Total</div><div style={S.statIconWrap("var(--t2)")}><IconCoin /></div></div>
              <div style={{ ...S.statValue, color: "var(--t1)", fontSize: 18 }}>{fmtR(a.totalStake)}</div>
              <div style={S.statSub}>{approx}{fmtR(a.stakeRepEst)} dos repetidos</div>
            </div>
            <div style={S.statCard}>
              <div style={S.statCardTop}><div style={S.statLabel}>GGR Total</div><div style={S.statIconWrap(a.totalGGR >= 0 ? "var(--up)" : "var(--down)")}><IconTrophy /></div></div>
              <div style={{ ...S.statValue, fontSize: 18, color: a.totalGGR >= 0 ? "var(--up)" : "var(--down)" }}>{fmtR(a.totalGGR)}</div>
              <div style={S.statSub}>{approx}{fmtR(a.ggrRepEst)} vindo dos repetidos</div>
            </div>
            <div style={S.statCard}>
              <div style={S.statCardTop}><div style={S.statLabel}>Resultado dos Repetidos</div><div style={S.statIconWrap(a.ggrRepEst >= 0 ? "var(--up)" : "var(--down)")}><IconHistory /></div></div>
              <div style={{ ...S.statValue, fontSize: 18, color: a.ggrRepEst >= 0 ? "var(--up)" : "var(--down)" }}>{a.ggrRepEst >= 0 ? fmtR(a.ggrRepEst) : "-" + fmtR(Math.abs(a.ggrRepEst))}</div>
              <div style={S.statSub}>{a.ggrRepEst >= 0 ? `lucro${estLbl}` : `prejuízo${estLbl}`}</div>
            </div>
          </div>

          {/* Destaque: top tier */}
          {topTier && (
            <div style={{ marginBottom: 24, padding: "20px 22px", borderRadius: "var(--r-lg)", border: `1px solid ${topTier.ggr_est < 0 ? "var(--down)" : "var(--up)"}`, background: topTier.ggr_est < 0 ? "var(--down-soft)" : "var(--up-soft)", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <div style={{ fontSize: 34, lineHeight: 1 }}>{topTier.ggr_est < 0 ? "⚠️" : "🏆"}</div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--t1)" }}>
                  {topTier.count.toLocaleString("pt-BR")} jogador{topTier.count !== 1 ? "es" : ""} {topTier.count !== 1 ? "pegaram" : "pegou"} {a.maxFreq === a.numBoosts ? `as ${a.maxFreq} welcomes (todas)` : `${a.maxFreq} de ${a.numBoosts} welcomes (o máximo)`} do período
                </div>
                <div style={{ fontSize: 12.5, color: "var(--t2)", marginTop: 3 }}>
                  {`Stake${estLbl} de `}{fmtR(topTier.stake_est)} ·{" "}
                  {topTier.ggr_est < 0
                    ? <span style={{ color: "var(--down)", fontWeight: 700 }}>{`prejuízo${estLbl} de `}{fmtR(Math.abs(topTier.ggr_est))}</span>
                    : <span style={{ color: "var(--up)", fontWeight: 700 }}>{`GGR${estLbl} de `}{fmtR(topTier.ggr_est)}</span>}
                </div>
              </div>
              <button style={{ ...S.btnSecondary, padding: "9px 16px", fontSize: 12, display: "flex", alignItems: "center", gap: 7 }} onClick={() => downloadTierIds(topTier)}>
                <IconDownload /> Baixar {topTier.count} IDs
              </button>
            </div>
          )}

          {/* Comparativo por faixa de repetição */}
          <div style={sec}>
            <div style={secHead}>
              <span>Comparativo de Repetição</span>
              <span style={{ fontSize: 10.5, fontWeight: 400, color: "var(--t3)", textTransform: "none" }}>
                quantos IDs pegaram N welcomes e o resultado gerado{a.exact ? " · valores exatos por jogador" : ""}
              </span>
            </div>
            <div style={{ overflowX: "auto" }} className="table-wrap">
              <table style={S.table}>
                <thead><tr>
                  {["Participação", "Jogadores", "%", `Stake${estLbl}`, `Resultado${estLbl}`, ""].map(h => <th key={h} style={{ ...S.th, padding: "9px 11px", whiteSpace: "nowrap" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {[...a.tiers].sort((x, y) => y.freq - x.freq).map(t => {
                    const isRep = t.freq >= 2;
                    const isTop = t.freq === a.maxFreq && a.maxFreq > 1;
                    const accent = !isRep ? "var(--t3)" : isTop ? "var(--down)" : t.freq >= 3 ? "var(--warn)" : "var(--info)";
                    const cell = { ...S.td, padding: "9px 11px" };
                    return (
                      <tr key={t.freq} style={{ background: isTop ? "var(--down-soft)" : "transparent" }}>
                        <td style={cell}>
                          <span style={{ fontWeight: isRep ? 700 : 500, color: accent }}>{tierLabel(t.freq)}</span>
                        </td>
                        <td style={{ ...cell, fontFamily: "var(--mono)", fontWeight: 700, color: "var(--t1)", whiteSpace: "nowrap" }}>{t.count.toLocaleString("pt-BR")}</td>
                        <td style={{ ...cell, fontFamily: "var(--mono)", color: "var(--t3)", whiteSpace: "nowrap" }}>{pct(t.count, a.totalUnique)}</td>
                        <td style={{ ...cell, fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>{fmtR(t.stake_est)}</td>
                        <td style={{ ...cell, fontFamily: "var(--mono)", fontWeight: 700, whiteSpace: "nowrap", color: t.ggr_est >= 0 ? "var(--up)" : "var(--down)" }}>
                          {t.ggr_est >= 0 ? fmtR(t.ggr_est) : "-" + fmtR(Math.abs(t.ggr_est))}
                          {t.ggr_est < 0 && <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 5, color: "var(--down)" }}>prej.</span>}
                        </td>
                        <td style={cell}>
                          {isRep && t.ids.length > 0 && (
                            <button style={{ ...S.btnSecondary, padding: "5px 10px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => downloadTierIds(t)}>
                              <IconDownload /> IDs
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Comparativo Detalhado — combinação por combinação (visualização em barras) */}
          {shownCombos.length > 0 && (
            <div style={sec}>
              <div style={secHead}>
                <span>Comparativo Detalhado — Combinação por Combinação</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => setComboMinFreq(comboMinFreq === 2 ? 1 : 2)}
                    style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, borderRadius: 8, cursor: "pointer", textTransform: "none", letterSpacing: 0, border: "1px solid var(--line)", background: comboMinFreq === 1 ? "var(--acc)" : "var(--surface)", color: comboMinFreq === 1 ? "#fff" : "var(--t2)" }}>
                    {comboMinFreq === 1 ? "✓ " : ""}Incluir exclusivos
                  </button>
                  <div style={{ display: "flex", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
                    {[["count", "Jogadores"], ["stake_est", "Stake"], ["ggr_est", "Resultado"]].map(([k, lbl], idx) => (
                      <button key={k} onClick={() => setComboMetric(k)}
                        style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, border: "none", borderLeft: idx > 0 ? "1px solid var(--line)" : "none", cursor: "pointer", textTransform: "none", letterSpacing: 0, background: comboMetric === k ? "var(--acc)" : "var(--surface)", color: comboMetric === k ? "#fff" : "var(--t2)" }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                {[...new Set(shownCombos.map(c => c.freq))].sort((x, y) => y - x).map((freq) => {
                  const group = shownCombos.filter(c => c.freq === freq);
                  const tier = a.tiers.find(t => t.freq === freq);
                  const groupLabel = freq === 1 ? "Pegaram 1 welcome (exclusivos)" : freq === a.numBoosts ? `Pegaram TODAS as ${freq} welcomes` : `Pegaram ${freq} welcomes`;
                  const tierColor = freq === a.maxFreq && a.maxFreq > 1 ? "var(--down)" : freq >= 3 ? "var(--warn)" : freq === 2 ? "var(--info)" : "var(--t3)";
                  return (
                    <div key={freq}>
                      <div style={{ padding: "10px 20px", background: "var(--surface-2)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: tierColor }}>{groupLabel}</span>
                        <span style={{ fontSize: 11, color: "var(--t3)", fontFamily: "var(--mono)" }}>
                          {tier?.count.toLocaleString("pt-BR")} jogadores · {fmtR(tier?.stake_est ?? 0)} · <span style={{ color: (tier?.ggr_est ?? 0) < 0 ? "var(--down)" : "var(--up)" }}>{(tier?.ggr_est ?? 0) < 0 ? "-" : ""}{fmtR(Math.abs(tier?.ggr_est ?? 0))}</span>
                        </span>
                      </div>
                      {group.map((c) => {
                        const val = comboGet(comboMetric)(c);
                        const w = Math.max(2, Math.round((val / maxComboVal) * 100));
                        const key = `${freq}-${c.labels.join("|")}`;
                        const active = hoverCombo === key;
                        const barColor = comboMetric === "ggr_est" ? (c.ggr_est < 0 ? "var(--down)" : "var(--up)") : tierColor;
                        return (
                          <div key={key}
                            onMouseEnter={() => setHoverCombo(key)} onMouseLeave={() => setHoverCombo(null)}
                            onClick={() => setHoverCombo(active ? null : key)}
                            style={{ padding: "11px 20px", cursor: "pointer", background: active ? "var(--surface-2)" : "transparent", borderBottom: "1px solid var(--line)", transition: "background .15s" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 14, marginBottom: 7 }}>
                              <div style={{ fontSize: 12.5, color: "var(--t1)", fontWeight: 600, lineHeight: 1.4, wordBreak: "break-word" }}>
                                {c.labels.map((lb, li) => (
                                  <span key={li}>{li > 0 && <span style={{ color: "var(--t3)", margin: "0 7px", fontWeight: 400 }}>+</span>}{lb}</span>
                                ))}
                              </div>
                              <div style={{ fontFamily: "var(--mono)", fontWeight: 700, color: barColor, fontSize: 13, whiteSpace: "nowrap", flexShrink: 0 }}>{comboFmt(comboMetric, c)}</div>
                            </div>
                            <div style={{ background: "var(--surface-2)", borderRadius: 6, height: 18, overflow: "hidden" }}>
                              <div style={{ width: `${w}%`, height: "100%", background: barColor, opacity: active ? 1 : 0.82, borderRadius: 6, transition: "width .35s ease, opacity .15s" }} />
                            </div>
                            {active && (
                              <div style={{ marginTop: 9, display: "flex", gap: "6px 18px", fontSize: 11.5, color: "var(--t3)", flexWrap: "wrap", alignItems: "center" }}>
                                <span><strong style={{ color: "var(--t2)" }}>{c.count.toLocaleString("pt-BR")}</strong> jogadores ({pct(c.count, a.totalUnique)})</span>
                                <span>{`Stake${estLbl}: `}<strong style={{ color: "var(--t2)" }}>{fmtR(c.stake_est)}</strong></span>
                                <span>Resultado: <strong style={{ color: c.ggr_est < 0 ? "var(--down)" : "var(--up)" }}>{c.ggr_est < 0 ? "-" : ""}{fmtR(Math.abs(c.ggr_est))}</strong>{c.ggr_est < 0 ? " (prejuízo)" : ""}</span>
                                <button style={{ ...S.btnSecondary, padding: "4px 9px", fontSize: 10.5, display: "inline-flex", alignItems: "center", gap: 5 }} onClick={(e) => { e.stopPropagation(); downloadComboIds(c); }}>
                                  <IconDownload /> Baixar IDs
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: "10px 20px", fontSize: 10.5, color: "var(--t3)" }}>
                {shownCombos.length} combinaç{shownCombos.length !== 1 ? "ões" : "ão"} · cada barra é um grupo que pegou exatamente aquelas welcomes · a soma de cada grupo bate com o "Comparativo de Repetição"
              </div>
            </div>
          )}

        </>)}
      </div>
    </div>
  );
}
