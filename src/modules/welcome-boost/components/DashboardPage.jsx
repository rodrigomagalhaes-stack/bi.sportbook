import { useState, useEffect, useMemo } from "react";
import XLSX from "xlsx-js-style";
import { S } from "../styles";
import { IconChart, IconDownload } from "../icons";
import { fmt, fmtDate } from "../lib/format";
import { fetchLatestReports } from "../lib/api";
import { filterReportsByEventDate, computeIdsAnalysis, round2 } from "../lib/analysis";
import PeriodFilter from "./PeriodFilter";

// ─── RELATÓRIOS GERAIS (DASHBOARD) ───────────────────────────────────────────
// O período vem do App e é compartilhado com "Ids Repetidos".
export default function DashboardPage({ period, onPeriodChange }) {
  const [reports, setReports] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Mesma busca (já deduplicada pelo relatório mais recente de cada boost) usada em
        // "Ids Repetidos", para que os dois dashboards somem exatamente os mesmos dados.
        const data = await fetchLatestReports();
        if (!cancelled) setReports(data);
      } catch (e) {
        console.error(e);
        if (!cancelled) setReports([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Só exibe os dados depois que um período é informado — nada aparece
  // automaticamente ao abrir a tela.
  const hasDateFilter = !!(period.from || period.to);
  const filtered = useMemo(
    () => (hasDateFilter ? filterReportsByEventDate(reports || [], period.from, period.to) : []),
    [reports, period.from, period.to, hasDateFilter]
  );

  const totals = filtered.reduce(
    (acc, r) => {
      acc.totalStake += Number(r.total_stake) || 0;
      acc.ggr += Number(r.ggr) || 0;
      acc.qtdApostas += Number(r.qtd_apostas) || 0;
      acc.wins += Number(r.wins) || 0;
      acc.lost += Number(r.lost) || 0;
      acc.cashout += Number(r.cashout) || 0;
      return acc;
    },
    { totalStake: 0, ggr: 0, qtdApostas: 0, wins: 0, lost: 0, cashout: 0 }
  );
  const ticketMedio = totals.qtdApostas > 0 ? totals.totalStake / totals.qtdApostas : 0;
  const maxAbsGgr = Math.max(1, ...filtered.map((r) => Math.abs(Number(r.ggr) || 0)));
  // Mesma análise cruzada de IDs usada em "Ids Repetidos" — garante que "Participações" e
  // "Jogadores Distintos" aqui batam exatamente com aquela tela.
  const a = useMemo(() => computeIdsAnalysis(filtered), [filtered]);

  // Exporta o consolidado do período em xlsx (abas: Resumo e Por Welcome)
  const exportXlsx = () => {
    if (!filtered.length) return;
    const wb = XLSX.utils.book_new();
    const resumo = [
      ["Relatórios Gerais — Welcome Boost"],
      ["Período (data do evento)", `${period.from || "início"} até ${period.to || "hoje"}`],
      [],
      ["Relatórios", filtered.length],
      ["Total Stakes (R$)", round2(totals.totalStake)],
      ["GGR (R$)", round2(totals.ggr)],
      ["Apostas", totals.qtdApostas],
      ["Wins", totals.wins],
      ["Lost", totals.lost],
      ["Cashout", totals.cashout],
      ["Ticket Médio (R$)", round2(ticketMedio)],
      ["Participações", a.totalParticipacoes],
      ["Jogadores Distintos", a.totalUnique],
      ["Pegaram 2+ Welcomes", a.totalRepeated],
    ];
    const wsResumo = XLSX.utils.aoa_to_sheet(resumo);
    wsResumo["!cols"] = [{ wch: 32 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

    const porWelcome = [
      ["Confronto", "Mercado", "Data do Evento", "Stake (R$)", "GGR (R$)", "Apostas", "Wins", "Lost", "Cashout", "Jogadores", "Ticket Médio (R$)"],
      ...filtered.map((r) => [
        r.welcome_boosts?.confronto || "-",
        r.welcome_boosts?.mercado || "",
        r.welcome_boosts?.data_evento ? fmtDate(r.welcome_boosts.data_evento) : "",
        round2(Number(r.total_stake) || 0),
        round2(Number(r.ggr) || 0),
        Number(r.qtd_apostas) || 0,
        Number(r.wins) || 0,
        Number(r.lost) || 0,
        Number(r.cashout) || 0,
        Number(r.ids_unicos) || 0,
        round2(Number(r.ticket_medio) || 0),
      ]),
    ];
    const wsWelcome = XLSX.utils.aoa_to_sheet(porWelcome);
    wsWelcome["!cols"] = porWelcome[0].map((_, i) => ({ wch: i < 3 ? 28 : 14 }));
    XLSX.utils.book_append_sheet(wb, wsWelcome, "Por Welcome");

    XLSX.writeFile(wb, `relatorios_gerais_${period.from || "inicio"}_a_${period.to || "hoje"}.xlsx`);
  };

  return (
    <div style={S.reportPage}>
      <div style={S.reportContent} className="report-content">
        <div style={S.reportTitle} className="report-title">Relatórios Gerais</div>
        <div style={S.reportSub}>Visão consolidada de todos os relatórios salvos — filtre pelo período do evento</div>

        <PeriodFilter label="Período do evento:" from={period.from} to={period.to} onChange={onPeriodChange}>
          {filtered.length > 0 && (
            <button
              style={{ ...S.btnSecondary, padding: "8px 14px", fontSize: 12, marginLeft: "auto", display: "flex", alignItems: "center", gap: 7 }}
              onClick={exportXlsx}
              title="Baixa um .xlsx com o resumo do período e uma linha por welcome"
            >
              <IconDownload /> Exportar xlsx
            </button>
          )}
        </PeriodFilter>

        {reports === null ? (
          <div style={{ textAlign: "center", padding: 80, color: "var(--t3)", fontSize: 14 }}>Carregando...</div>
        ) : !hasDateFilter ? (
          <div style={S.empty}>
            <div style={S.emptyTitle}>Informe um período para começar</div>
            <div style={{ fontSize: 13, color: "var(--t3)" }}>Selecione a data do evento no filtro acima para ver os relatórios consolidados.</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={S.empty}>
            <div style={S.emptyTitle}>Nenhum relatório no período</div>
            <div style={{ fontSize: 13, color: "var(--t3)" }}>Ajuste o filtro ou salve novos relatórios a partir de uma boost</div>
          </div>
        ) : (
          <>
            <div style={S.statsGrid} className="stats-grid">
              {[
                { label: "Relatórios", value: filtered.length, sub: "no período selecionado", color: "var(--t1)" },
                { label: "Total Stakes", value: fmt(totals.totalStake), sub: `${totals.qtdApostas} apostas`, color: "var(--t1)" },
                { label: "GGR", value: fmt(totals.ggr), sub: "Stake − Winnings", color: totals.ggr >= 0 ? "var(--up)" : "var(--down)" },
                { label: "Participações", value: a.totalParticipacoes.toLocaleString("pt-BR"), sub: "soma por welcome (repete entre welcomes) · ver distintos em Ids Repetidos", color: "var(--info)" },
                { label: "Jogadores Distintos", value: a.totalUnique.toLocaleString("pt-BR"), sub: `${a.totalRepeated.toLocaleString("pt-BR")} pegaram 2+ welcomes · ver Ids Repetidos`, color: "var(--info)" },
                { label: "Ticket Médio", value: fmt(ticketMedio), sub: "médio geral", color: "var(--warn)" },
                { label: "Wins", value: totals.wins, sub: "apostas ganhas", color: "var(--up)" },
                { label: "Lost", value: totals.lost, sub: "apostas perdidas", color: "var(--down)" },
                { label: "Cashout", value: totals.cashout, sub: "apostas encerradas", color: "var(--warn)" },
              ].map((s) => (
                <div key={s.label} style={S.statCard}>
                  <div style={S.statCardTop}>
                    <div style={S.statLabel}>{s.label}</div>
                    <div style={S.statIconWrap(s.color)}><IconChart /></div>
                  </div>
                  <div style={{ ...S.statValue, color: s.color }}>{s.value}</div>
                  <div style={S.statSub}>{s.sub}</div>
                </div>
              ))}
            </div>

            <div style={S.tableWrap} className="table-wrap">
              <div style={S.tableHeader}>GGR por Confronto ({filtered.length})</div>
              <div style={{ padding: "20px" }}>
                {filtered.map((r) => {
                  const ggr = Number(r.ggr) || 0;
                  const pct = Math.min(100, (Math.abs(ggr) / maxAbsGgr) * 100);
                  return (
                    <div key={r.id} style={S.barRow}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12 }}>
                        <span style={{ color: "var(--t1)", fontWeight: 600 }}>
                          {r.welcome_boosts?.confronto || "-"}
                          {r.welcome_boosts?.data_evento && (
                            <span style={{ color: "var(--t3)", fontWeight: 400, marginLeft: 8 }}>{fmtDate(r.welcome_boosts.data_evento)}</span>
                          )}
                        </span>
                        <span style={{ color: ggr >= 0 ? "var(--up)" : "var(--down)", fontWeight: 700 }}>{fmt(ggr)}</span>
                      </div>
                      <div style={S.barTrack}>
                        <div
                          style={{
                            height: "100%", borderRadius: 6, width: `${pct}%`,
                            background: ggr >= 0 ? "var(--up)" : "var(--down)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
