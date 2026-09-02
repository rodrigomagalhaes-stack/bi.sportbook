import { useMemo, useRef, useEffect } from "react";
import { S } from "../styles";
import { IconArrow, IconChart, IconUser, IconCoin, IconTrophy, IconCalendar, IconTicket, IconCashout, IconTag } from "../icons";
import { fmt, fmtDate } from "../lib/format";
import {
  computeMonthSummary, firstMonthByPlayer, availableMonths, oddsDoMes,
  shiftMonth, monthLabel, monthKey,
} from "../lib/analysis";

// Como cada welcome (o card inteiro) terminou — a boost é de uma seleção só, então
// o resultado vem da maioria dos bilhetes resolvidos daquele confronto.
const RESULTADO = {
  green: { label: "Green", color: "var(--up)", bg: "var(--up-soft)" },
  red: { label: "Red", color: "var(--down)", bg: "var(--down-soft)" },
  misto: { label: "Misto", color: "var(--warn)", bg: "var(--warn-soft)" },
  sem_resultado: { label: "Sem bilhete", color: "var(--t3)", bg: "var(--surface-2)" },
};

// ─── RESUMO MENSAL ───────────────────────────────────────────────────────────
// Filtro de mês em um clique (setas / seletor / atalhos) + a caixa de fechamento do mês:
// GGR, Stake, novos registros e total de welcomes, sempre comparados com o mês anterior.
// Usa os mesmos dados já carregados no App (mesma fonte de "Relatórios Gerais").
export default function MonthlyPage({ boosts, reports, loading, month, onMonthChange, odd, onOddChange }) {
  // O histórico completo é necessário para saber quem já tinha aparecido antes (novos registros).
  const firstMonth = useMemo(() => firstMonthByPlayer(reports), [reports]);
  const months = useMemo(() => availableMonths(reports, boosts), [reports, boosts]);

  // odds finais do mês, para o filtro
  const odds = useMemo(() => oddsDoMes(boosts, month), [boosts, month]);
  // se o mês selecionado não tem a odd filtrada, mostra o mês inteiro
  const oddAtiva = odds.some((o) => o.odd === odd) ? odd : null;

  const cur = useMemo(
    () => computeMonthSummary({ reports, boosts, month, firstMonth, odd: oddAtiva }),
    [reports, boosts, month, firstMonth, oddAtiva]
  );
  // o mês anterior usa o MESMO filtro de odd, para a comparação ser justa
  const prev = useMemo(
    () => computeMonthSummary({ reports, boosts, month: shiftMonth(month, -1), firstMonth, odd: oddAtiva }),
    [reports, boosts, month, firstMonth, oddAtiva]
  );

  const thisMonth = monthKey(new Date().toISOString());

  // No celular a lista de odds rola na horizontal — mantém o chip ativo à vista.
  const chipsRef = useRef(null);
  const chipAtivoRef = useRef(null);
  useEffect(() => {
    const ajusta = () => {
      const lista = chipsRef.current, ativo = chipAtivoRef.current;
      if (!lista || !ativo) return;
      // distância medida entre os dois (offsetLeft seria relativo ao ancestral posicionado)
      const dx = ativo.getBoundingClientRect().left - lista.getBoundingClientRect().left;
      lista.scrollLeft = Math.max(0, lista.scrollLeft + dx - 48);
    };
    ajusta();
    // a fonte (Archivo) chega depois e muda a largura dos chips — remede quando carregar
    document.fonts?.ready.then(ajusta);
  }, [oddAtiva, month]);
  const hasData = cur.welcomes > 0 || cur.rows.length > 0;

  // Variação vs. mês anterior. `money` só muda a formatação do valor absoluto.
  const delta = (now, before, money) => {
    if (!before && !now) return null;
    const diff = now - before;
    if (before === 0) {
      const s = now >= 0 ? "+" : "−";
      const v = money ? fmt(Math.abs(now)) : Math.abs(now).toLocaleString("pt-BR");
      return { text: `${s}${v} vs. mês anterior (zerado)`, up: now >= 0 };
    }
    const pct = (diff / Math.abs(before)) * 100;
    const sign = diff >= 0 ? "+" : "−";
    const abs = money ? fmt(Math.abs(diff)) : Math.abs(diff).toLocaleString("pt-BR");
    return {
      text: `${sign}${abs} (${sign}${Math.abs(pct).toFixed(0)}%) vs. ${monthLabel(shiftMonth(month, -1))}`,
      up: diff >= 0,
    };
  };

  // As 4 caixas do fechamento do mês.
  const boxes = [
    {
      label: "GGR Total", value: fmt(cur.ggr), icon: <IconTrophy />,
      color: cur.ggr >= 0 ? "var(--up)" : "var(--down)",
      delta: delta(cur.ggr, prev.ggr, true),
    },
    {
      label: "Stake Total", value: fmt(cur.totalStake), icon: <IconCoin />,
      color: "var(--t1)",
      delta: delta(cur.totalStake, prev.totalStake, true),
    },
    {
      label: "Novos Registros", value: cur.novosRegistros.toLocaleString("pt-BR"), icon: <IconUser />,
      color: "var(--info)",
      delta: delta(cur.novosRegistros, prev.novosRegistros, false),
    },
    {
      label: "Total de Welcomes", value: cur.welcomes.toLocaleString("pt-BR"), icon: <IconCalendar />,
      color: "var(--acc)",
      delta: delta(cur.welcomes, prev.welcomes, false),
    },
  ];

  const fmtOdd = (o) => (o > 0 ? Number(o).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-");

  // % sobre as welcomes com relatório (é sobre elas que dá para saber green/red)
  const comRel = cur.welcomesComRelatorio;
  const pctW = (n) => (comRel > 0 ? `${((n / comRel) * 100).toFixed(0)}% das ${comRel} welcomes apuradas` : "nenhuma welcome apurada");

  const secundarios = [
    { label: "Welcomes Green", value: cur.welcomesGreen.toLocaleString("pt-BR"), sub: pctW(cur.welcomesGreen), color: "var(--up)", icon: <IconTrophy /> },
    { label: "Welcomes Red", value: cur.welcomesRed.toLocaleString("pt-BR"), sub: pctW(cur.welcomesRed), color: "var(--down)", icon: <IconChart /> },
    {
      label: "Bilhetes", value: cur.qtdApostas.toLocaleString("pt-BR"),
      sub: `${cur.wins.toLocaleString("pt-BR")} win · ${cur.lost.toLocaleString("pt-BR")} lost · ${cur.cashout.toLocaleString("pt-BR")} cashout`,
      color: "var(--t1)", icon: <IconTicket />,
    },
    { label: "Ticket Médio", value: fmt(cur.ticketMedio), sub: "por bilhete válido", color: "var(--warn)", icon: <IconCashout /> },
    {
      label: oddAtiva ? "Odd Final" : "Odd Final Média", value: fmtOdd(cur.oddMedia),
      sub: oddAtiva
        ? `filtrando ${cur.welcomes} welcome${cur.welcomes !== 1 ? "s" : ""} com esta odd`
        : cur.maiorOdd ? `maior do mês: ${fmtOdd(cur.maiorOdd.odd)} · ${cur.maiorOdd.confronto}` : "sem welcome no mês",
      color: "var(--acc)", icon: <IconTag />,
    },
    { label: "Jogadores Distintos", value: cur.jogadores.toLocaleString("pt-BR"), sub: `${cur.participacoes.toLocaleString("pt-BR")} participações no mês`, color: "var(--info)", icon: <IconUser /> },
    {
      label: "Com Relatório", value: `${cur.welcomesComRelatorio}/${cur.welcomes}`,
      sub: cur.welcomes > cur.welcomesComRelatorio ? "welcomes do mês ainda sem relatório salvo" : "todas as welcomes do mês têm relatório",
      color: cur.welcomes > cur.welcomesComRelatorio ? "var(--warn)" : "var(--up)",
      icon: <IconCalendar />,
    },
  ];

  const chipStyle = (active) => ({
    padding: "8px 13px", fontSize: 12, fontWeight: active ? 700 : 600,
    borderRadius: 99, cursor: "pointer", fontFamily: "var(--font)",
    background: active ? "var(--acc-soft)" : "var(--surface)",
    color: active ? "var(--acc)" : "var(--t2)",
    border: `1px solid ${active ? "var(--acc-line)" : "var(--line-2)"}`,
    transition: "all .12s", whiteSpace: "nowrap",
  });
  const arrowStyle = { ...S.btnSecondary, padding: "9px 12px", fontSize: 13 };

  return (
    <div style={S.reportPage}>
      <div style={S.reportContent} className="report-content">
        <div style={S.reportTitle} className="report-title">{monthLabel(month)}</div>
        <div style={S.reportSub}>Tudo que aconteceu no mês, pela data do evento das welcomes</div>

        {/* Filtro de mês: setas, seletor nativo e atalhos dos meses que têm dados */}
        <div style={S.filterBar} className="filter-bar">
          <div className="month-nav" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button style={arrowStyle} onClick={() => onMonthChange(shiftMonth(month, -1))} title="Mês anterior" aria-label="Mês anterior">
              <IconArrow left />
            </button>
            <input
              type="month"
              style={{ ...S.input, flex: 1, minWidth: 0, width: 170 }}
              value={month}
              onChange={(e) => e.target.value && onMonthChange(e.target.value)}
              aria-label="Mês"
            />
            <button style={arrowStyle} onClick={() => onMonthChange(shiftMonth(month, 1))} title="Próximo mês" aria-label="Próximo mês">
              <IconArrow />
            </button>
            {month !== thisMonth && (
              <button style={{ ...chipStyle(false), flexShrink: 0 }} onClick={() => onMonthChange(thisMonth)}>Mês atual</button>
            )}
          </div>
          <div className="month-chips" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {months.slice(0, 6).map((m) => (
              <button key={m} style={chipStyle(m === month)} onClick={() => onMonthChange(m)}>
                {monthLabel(m)}
              </button>
            ))}
          </div>
        </div>

        {/* Filtro por odd final: mostra todas as odds do mês e isola uma delas */}
        {odds.length > 1 && (
          <div style={{ ...S.filterBar, marginTop: -8 }} className="filter-bar">
            <div style={{ fontSize: 12, color: "var(--t3)", marginRight: 4 }}>Odd final:</div>
            <div className="month-chips" ref={chipsRef} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button style={chipStyle(!oddAtiva)} onClick={() => onOddChange(null)}>
                Todas ({odds.reduce((a, o) => a + o.welcomes, 0)})
              </button>
              {odds.map((o) => (
                <button
                  key={o.odd}
                  ref={oddAtiva === o.odd ? chipAtivoRef : null}
                  style={chipStyle(oddAtiva === o.odd)}
                  onClick={() => onOddChange(oddAtiva === o.odd ? null : o.odd)}
                  title={`${o.welcomes} welcome${o.welcomes !== 1 ? "s" : ""} com odd final ${fmtOdd(o.odd)}`}
                >
                  {fmtOdd(o.odd)} <span style={{ opacity: 0.6 }}>({o.welcomes})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 80, color: "var(--t3)", fontSize: 14 }}>Carregando...</div>
        ) : (
          <>
            {/* ── A CAIXA DO MÊS ── */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-lg)",
              boxShadow: "var(--shadow)", overflow: "hidden", marginBottom: 24,
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
                padding: "13px 20px", borderBottom: "1px solid var(--line)", background: "var(--surface-2)",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Resultados de {monthLabel(month)}
                  {oddAtiva && <span style={{ color: "var(--acc)" }}> · só odd final {fmtOdd(oddAtiva)}</span>}
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--t3)", whiteSpace: "nowrap" }}>
                  {cur.from} até {cur.to}
                </div>
              </div>

              {/* gap de 1px sobre o fundo da linha = separador que funciona em 4, 2 ou 1 coluna */}
              <div className="month-box-grid" style={{
                display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", minWidth: 0,
                gap: 1, background: "var(--line)",
              }}>
                {boxes.map((b) => (
                  <div key={b.label} style={{ padding: "22px 24px", background: "var(--surface)" }}>
                    <div style={S.statCardTop}>
                      <div style={S.statLabel}>{b.label}</div>
                      <div style={S.statIconWrap(b.color)}>{b.icon}</div>
                    </div>
                    <div className="month-box-value" style={{ ...S.statValue, fontSize: 23, color: b.color, overflowWrap: "anywhere" }}>{b.value}</div>
                    <div style={{ ...S.statSub, color: b.delta ? (b.delta.up ? "var(--up)" : "var(--down)") : "var(--t3)" }}>
                      {b.delta ? b.delta.text : "sem movimento no mês"}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                padding: "12px 20px", borderTop: "1px solid var(--line)", background: "var(--surface-2)",
                fontSize: 11.5, color: "var(--t3)", lineHeight: 1.5,
              }}>
                <strong style={{ color: "var(--t2)" }}>Novos registros</strong> = jogadores que apareceram pela
                primeira vez em uma welcome neste mês (olhando todo o histórico de relatórios salvos).
                Quem já tinha pego welcome antes entra em "Jogadores Distintos", não aqui.
              </div>
            </div>

            {/* Indicadores de apoio */}
            <div style={S.statsGrid} className="stats-grid month-stats">
              {secundarios.map((s) => (
                <div key={s.label} style={S.statCard}>
                  <div style={S.statCardTop}>
                    <div style={S.statLabel}>{s.label}</div>
                    <div style={S.statIconWrap(s.color)}>{s.icon}</div>
                  </div>
                  <div style={{ ...S.statValue, fontSize: 19, color: s.color, overflowWrap: "anywhere" }}>{s.value}</div>
                  <div style={S.statSub}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Welcomes do mês */}
            {!hasData ? (
              <div style={S.empty}>
                <div style={S.emptyTitle}>
                  Nenhuma welcome em {monthLabel(month)}{oddAtiva ? ` com odd final ${fmtOdd(oddAtiva)}` : ""}
                </div>
                <div style={{ fontSize: 13, color: "var(--t3)" }}>
                  {oddAtiva ? "Escolha outra odd no filtro acima ou volte para \"Todas\"." : "Use as setas ou os atalhos acima para escolher outro mês."}
                </div>
              </div>
            ) : cur.rows.length === 0 ? (
              <div style={S.empty}>
                <div style={S.emptyTitle}>Welcomes sem relatório salvo</div>
                <div style={{ fontSize: 13, color: "var(--t3)" }}>
                  {cur.welcomes} welcome{cur.welcomes !== 1 ? "s" : ""} cadastrada{cur.welcomes !== 1 ? "s" : ""} no mês, mas nenhum relatório foi salvo — por isso os totais estão zerados.
                </div>
              </div>
            ) : (
              <div style={S.tableWrap} className="table-wrap">
                <div style={S.tableHeader}>
                  Welcomes com relatório em {monthLabel(month)}{oddAtiva ? ` · odd ${fmtOdd(oddAtiva)}` : ""} ({cur.rows.length})
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={S.table} className="month-table">
                    <thead>
                      <tr>
                        {["Confronto", "Data do Evento", "Resultado", "Odd", "Stake", "GGR", "Bilhetes", "Jogadores"].map((h) => (
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cur.rows.map((r) => (
                        <tr key={r.id}>
                          <td style={{ ...S.td, color: "var(--t1)", fontWeight: 600 }}>
                            {r.confronto}
                            {r.mercado && <span style={{ color: "var(--t3)", fontWeight: 400 }}> · {r.mercado}</span>}
                          </td>
                          <td style={{ ...S.td, color: "var(--t3)", whiteSpace: "nowrap" }}>{r.data_evento ? fmtDate(r.data_evento) : "-"}</td>
                          <td style={S.td}>
                            <span
                              style={S.badge(RESULTADO[r.resultado].color, RESULTADO[r.resultado].bg)}
                              title={`${r.wins} bilhetes win · ${r.lost} lost · ${r.cashout} cashout`}
                            >
                              {RESULTADO[r.resultado].label}
                            </span>
                          </td>
                          <td style={{ ...S.td, whiteSpace: "nowrap" }} title={r.boost_pct ? `+${r.boost_pct}% de boost` : ""}>
                            {r.odd_nova > 0 ? (
                              <>
                                <span style={{ color: "var(--t3)", textDecoration: "line-through", fontFamily: "var(--mono)", fontSize: 11.5 }}>{fmtOdd(r.odd_antiga)}</span>
                                <span style={{ color: "var(--acc)", margin: "0 5px" }}>→</span>
                                <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--t1)" }}>{fmtOdd(r.odd_nova)}</span>
                              </>
                            ) : "-"}
                          </td>
                          <td style={{ ...S.td, whiteSpace: "nowrap" }}>{fmt(r.total_stake)}</td>
                          <td style={{ ...S.td, whiteSpace: "nowrap", color: r.ggr >= 0 ? "var(--up)" : "var(--down)", fontWeight: 600 }}>{fmt(r.ggr)}</td>
                          <td style={{ ...S.td, whiteSpace: "nowrap" }}>{r.qtd_apostas.toLocaleString("pt-BR")}</td>
                          <td style={{ ...S.td, whiteSpace: "nowrap" }}>{r.jogadores.toLocaleString("pt-BR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{
                  padding: "12px 20px", borderTop: "1px solid var(--line)", display: "flex",
                  justifyContent: "space-between", fontSize: 12.5, color: "var(--t2)", flexWrap: "wrap", gap: 10,
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}><IconChart /> Total do mês</span>
                  <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
                    {fmt(cur.totalStake)} em stake · GGR{" "}
                    <span style={{ color: cur.ggr >= 0 ? "var(--up)" : "var(--down)" }}>{fmt(cur.ggr)}</span>
                    {" · "}
                    <span style={{ color: "var(--up)" }}>{cur.welcomesGreen} green</span>
                    {" / "}
                    <span style={{ color: "var(--down)" }}>{cur.welcomesRed} red</span>
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
