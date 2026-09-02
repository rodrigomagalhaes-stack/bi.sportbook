import { useState, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { S } from "../styles";
import { IconArrow, IconUpload, IconChart, IconSave, IconDownload } from "../icons";
import { fmt, fmtDate, downloadIds } from "../lib/format";
import { round2 } from "../lib/analysis";

// ─── RELATÓRIO ───────────────────────────────────────────────────────────────
export default function ReportPage({ boost, onBack, onSaveReport }) {
  const [rows, setRows] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [savedReport, setSavedReport] = useState(false);
  const [selectedMarkets, setSelectedMarkets] = useState(null); // null = ainda não inicializado
  const [tableLimit, setTableLimit] = useState(100);

  const processFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
      setRows(data);
      setSelectedMarkets(null);
    };
    reader.readAsArrayBuffer(file);
  };

  // Lista os mercados (Market types) presentes no arquivo, com a contagem de apostas de cada um
  // (memoizado: só recalcula quando o arquivo muda, não a cada clique na caixinha)
  const marketOptions = useMemo(() => {
    if (!rows) return [];
    const counts = new Map();
    for (const r of rows) {
      const m = r["Market types"] || "(sem mercado informado)";
      counts.set(m, (counts.get(m) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  }, [rows]);

  // Na primeira leitura do arquivo, seleciona automaticamente os mercados que batem
  // com o texto cadastrado em "Mercado" da boost (ou todos, se não houver match / não houver mercado definido)
  useEffect(() => {
    if (!rows || selectedMarkets !== null || marketOptions.length === 0) return;
    const wanted = (boost.mercado || "").trim().toLowerCase();
    let initial;
    if (wanted) {
      const matches = marketOptions.filter((m) => m.value.toLowerCase().includes(wanted));
      initial = matches.length > 0 ? matches.map((m) => m.value) : marketOptions.map((m) => m.value);
    } else {
      initial = marketOptions.map((m) => m.value);
    }
    setSelectedMarkets(new Set(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, marketOptions]);

  const toggleMarket = useCallback((value) => {
    setTableLimit(100);
    setSelectedMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const onInput = (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
  };

  // Métricas — tudo memoizado e calculado em uma única passada pelas linhas,
  // recalculando somente quando o arquivo ou a seleção de mercados mudar
  // (evita travamentos ao marcar/desmarcar caixinhas em arquivos grandes)
  const { marketFiltered, removedByMarket, stats } = useMemo(() => {
    if (!rows) return { marketFiltered: null, removedByMarket: 0, stats: null };
    const filtered = selectedMarkets
      ? rows.filter((r) => selectedMarkets.has(r["Market types"] || "(sem mercado informado)"))
      : rows;

    const idGetter = (r) => r["Player"] || r["Player Id"] || r["External User Id"];
    const idsTodas = new Set();
    const idsValidas = new Set();
    // stake/GGR acumulado por jogador (apenas apostas válidas) — vai para player_stats
    // no banco e permite que "Ids Repetidos" mostre valores exatos em vez de estimados.
    const perPlayer = new Map();
    let totalStake = 0, totalWin = 0, qtdApostas = 0, wins = 0, lost = 0, cashout = 0;
    const valid = [];

    for (const r of filtered) {
      const status = (r["Status"] || "").toLowerCase();
      idsTodas.add(idGetter(r));
      if (status === "voidcashout" || status === "void") continue;

      valid.push(r);
      const pid = idGetter(r);
      idsValidas.add(pid);
      qtdApostas++;
      const stake = parseFloat(r["Stake"]) || 0;
      const win = parseFloat(r["Winnings"]) || 0;
      totalStake += stake;
      totalWin += win;
      if (pid !== undefined && pid !== null && pid !== "") {
        const k = String(pid);
        const e = perPlayer.get(k) || [0, 0];
        e[0] += stake; e[1] += stake - win;
        perPlayer.set(k, e);
      }
      if (status === "win") wins++;
      else if (status === "lost") lost++;
      else if (status === "cashout") cashout++;
    }

    const ggr = totalStake - totalWin;
    const ticketMedio = qtdApostas > 0 ? totalStake / qtdApostas : 0;

    const playerStats = {};
    for (const [k, e] of perPlayer) playerStats[k] = [round2(e[0]), round2(e[1])];

    const computedStats = {
      totalStake, ggr, qtdApostas,
      idsUnicos: idsTodas.size,
      idsUnicosValidas: idsValidas.size,
      // Apenas IDs de apostas VÁLIDAS (mesmo critério de stake/GGR/qtd_apostas) — é o que
      // vai para player_ids/ids_unicos no banco e alimenta "Ids Repetidos" e "Relatórios Gerais".
      idsProcessados: [...idsValidas].filter((id) => id !== undefined && id !== null && id !== ""),
      playerStats,
      totalApostasGeral: filtered.length,
      ticketMedio, wins, lost, cashout, valid,
    };

    return {
      marketFiltered: filtered,
      removedByMarket: rows.length - filtered.length,
      stats: computedStats,
    };
  }, [rows, selectedMarkets]);

  const saveReport = async () => {
    if (!stats) return;
    setSavingReport(true);
    try {
      const base = {
        boost_id: boost.id,
        total_stake: stats.totalStake,
        ggr: stats.ggr,
        // únicos em apostas válidas — mesmo universo de stake/GGR/qtd_apostas e dos player_ids salvos
        ids_unicos: stats.idsUnicosValidas,
        ticket_medio: stats.ticketMedio,
        qtd_apostas: stats.qtdApostas,
        wins: stats.wins,
        lost: stats.lost,
        cashout: stats.cashout,
        player_ids: stats.idsProcessados,
      };
      try {
        await onSaveReport({ ...base, player_stats: stats.playerStats });
      } catch (e) {
        // banco ainda sem a coluna player_stats (rodar supabase/add_player_stats_column.sql) —
        // salva sem ela para não bloquear o fluxo; os valores ficam estimados em Ids Repetidos
        if (String(e.message).includes("player_stats")) await onSaveReport(base);
        else throw e;
      }
      setSavedReport(true);
    } catch (e) {
      alert("Erro ao salvar relatório: " + e.message);
    }
    setSavingReport(false);
  };

  const statusColor = (s) => {
    const sl = (s || "").toLowerCase();
    if (sl === "win") return "var(--up)";
    if (sl === "lost") return "var(--down)";
    if (sl === "cashout") return "var(--warn)";
    return "var(--t3)";
  };

  return (
    <div style={S.reportPage}>
      <div style={S.reportHeader} className="report-header">
        <button style={S.btnBack} onClick={onBack}>
          <IconArrow left /> Voltar
        </button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--t1)" }}>{boost.confronto}</div>
          <div style={{ fontSize: 11, color: "var(--t3)", fontFamily: "var(--mono)" }}>ID {boost.id_jogo}</div>
        </div>
      </div>

      <div style={S.reportContent} className="report-content">
        <div style={S.reportTitle} className="report-title">Relatório de Resultado</div>
        <div style={S.reportSub}>
          Odd: {boost.odd_antiga} → {boost.odd_nova} &nbsp;·&nbsp; Max Stake: {fmt(boost.max_stake)} &nbsp;·&nbsp; Evento: {fmtDate(boost.data_evento)}
        </div>

        {!rows ? (
          <div
            style={{ ...S.uploadZone, borderColor: dragging ? "var(--acc)" : "var(--line-2)" }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById("xlsxInput").click()}
          >
            <input id="xlsxInput" type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={onInput} />
            <div style={{ color: "var(--acc)", marginBottom: 12 }}><IconUpload /></div>
            <div style={S.uploadTitle}>Solte o arquivo xlsx aqui</div>
            <div style={S.uploadSub}>ou clique para selecionar — relatório do Altenar</div>
          </div>
        ) : (
          <>
            <div style={{ ...S.uploadZone, padding: "16px 20px", textAlign: "left", marginBottom: 24, cursor: "default", background: "var(--surface-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", textTransform: "uppercase", letterSpacing: 0.6 }}>
                  Mercados encontrados no arquivo ({marketOptions.length})
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    style={{ ...S.btnSecondary, padding: "6px 14px", fontSize: 11 }}
                    onClick={() => setSelectedMarkets(new Set(marketOptions.map((m) => m.value)))}
                  >
                    Selecionar todos
                  </button>
                  <button
                    style={{ ...S.btnDelete, padding: "6px 14px", fontSize: 11 }}
                    onClick={() => setSelectedMarkets(new Set())}
                  >
                    Limpar seleção
                  </button>
                </div>
              </div>

              <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 10 }}>
                Marque os mercados que devem entrar no cálculo do relatório (ex: apenas "Vencedor do encontro" / "1x2") e desmarque o restante (ex: apostas combinadas / Bet Builder com condições extras).
              </div>

              <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 6 }}>
                {marketOptions.map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--t2)",
                      cursor: "pointer", padding: "7px 10px", borderRadius: 8,
                      background: selectedMarkets?.has(opt.value) ? "var(--acc-soft)" : "var(--surface)",
                      border: `1px solid ${selectedMarkets?.has(opt.value) ? "var(--acc-line)" : "var(--line)"}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMarkets?.has(opt.value) || false}
                      onChange={() => toggleMarket(opt.value)}
                    />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={opt.value}>
                      {opt.value}
                    </span>
                    <span style={{ color: "var(--t3)", fontSize: 11, flexShrink: 0 }}>{opt.count} apostas</span>
                  </label>
                ))}
              </div>

              <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 12 }}>
                {selectedMarkets ? (
                  removedByMarket > 0
                    ? `${selectedMarkets.size} de ${marketOptions.length} mercados selecionados — ${removedByMarket} de ${rows.length} apostas foram ignoradas, restaram ${marketFiltered.length} para o cálculo.`
                    : `${selectedMarkets.size} de ${marketOptions.length} mercados selecionados — todas as ${rows.length} apostas entram no cálculo.`
                ) : "Carregando mercados..."}
              </div>
            </div>

            <div style={S.statsGrid} className="stats-grid">
              {[
                { label: "Total Stakes", value: fmt(stats.totalStake), sub: `${stats.qtdApostas} apostas válidas de ${stats.totalApostasGeral}`, color: "var(--t1)" },
                { label: "GGR", value: fmt(stats.ggr), sub: "Stake − Winnings", color: stats.ggr >= 0 ? "var(--up)" : "var(--down)" },
                { label: "Usuários", value: stats.idsUnicosValidas, sub: `únicos em apostas válidas · ${stats.idsUnicos} incluindo anuladas`, color: "var(--info)" },
                { label: "Ticket Médio", value: fmt(stats.ticketMedio), sub: "por aposta", color: "var(--warn)" },
                { label: "Wins", value: stats.wins, sub: `${stats.qtdApostas > 0 ? ((stats.wins / stats.qtdApostas) * 100).toFixed(1) : 0}% do total`, color: "var(--up)" },
                { label: "Lost", value: stats.lost, sub: `${stats.qtdApostas > 0 ? ((stats.lost / stats.qtdApostas) * 100).toFixed(1) : 0}% do total`, color: "var(--down)" },
                { label: "Cashout", value: stats.cashout, sub: "apostas encerradas", color: "var(--warn)" },
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

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                style={{ ...S.btnSaveReport, opacity: savingReport ? 0.6 : 1 }}
                onClick={saveReport}
                disabled={savingReport || savedReport}
              >
                <IconSave /> {savedReport ? "Relatório Salvo ✓" : savingReport ? "Salvando..." : "Salvar Relatório"}
              </button>
              <button
                style={{ ...S.btnSecondary, display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", fontSize: 13.5, marginBottom: 20 }}
                onClick={() => downloadIds(stats.idsProcessados, boost)}
                disabled={!stats.idsProcessados.length}
                title="Baixa em .csv a lista de IDs de jogadores que entraram no cálculo deste relatório"
              >
                <IconDownload /> Baixar Ids ({stats.idsProcessados.length})
              </button>
            </div>

            <div style={S.tableWrap} className="table-wrap">
              <div style={S.tableHeader}>
                Apostas ({stats.valid.length}){stats.valid.length > tableLimit ? ` — exibindo ${Math.min(tableLimit, stats.valid.length)}` : ""}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      {["Player", "Stake", "Winnings", "GGR", "Status", "Data Aposta"].map((h) => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.valid.slice(0, tableLimit).map((r, i) => {
                      const stake = parseFloat(r["Stake"]) || 0;
                      const win = parseFloat(r["Winnings"]) || 0;
                      const rowGgr = stake - win;
                      const player = r["Player"] || r["External User Id"] || "-";
                      return (
                        <tr key={i}>
                          <td style={{ ...S.td, fontFamily: "var(--mono)", fontSize: 11.5 }}>{player}</td>
                          <td style={S.td}>{fmt(stake)}</td>
                          <td style={S.td}>{fmt(win)}</td>
                          <td style={{ ...S.td, color: rowGgr >= 0 ? "var(--up)" : "var(--down)", fontWeight: 600 }}>{fmt(rowGgr)}</td>
                          <td style={S.td}>
                            <span style={{ color: statusColor(r["Status"]), fontWeight: 600 }}>{r["Status"] || "-"}</span>
                          </td>
                          <td style={{ ...S.td, color: "var(--t3)" }}>{r["Bet date"] || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {stats.valid.length > tableLimit && (
                <div style={{ padding: "14px 20px", textAlign: "center", borderTop: "1px solid var(--line)" }}>
                  <button
                    style={{ ...S.btnSecondary, padding: "8px 18px", fontSize: 12 }}
                    onClick={() => setTableLimit((n) => n + 100)}
                  >
                    Carregar mais ({stats.valid.length - tableLimit} restantes)
                  </button>
                </div>
              )}
            </div>

            <button
              style={{ ...S.btnReport, marginTop: 20, width: "auto", padding: "10px 20px" }}
              onClick={() => { setRows(null); setSavedReport(false); setTableLimit(100); }}
            >
              Carregar outro arquivo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
