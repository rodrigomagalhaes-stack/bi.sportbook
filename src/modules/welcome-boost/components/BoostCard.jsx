import { S } from "../styles";
import {
  IconChart, IconTrash, IconEdit, IconCalendar, IconClock, IconUser, IconTag,
  IconChevronRight, IconTrophy, IconCashout, IconTicket, IconCoin, IconDownload,
} from "../icons";
import { fmt, fmtDate, computeStatus, statusConfig, splitConfronto, initials, colorFor, downloadIds } from "../lib/format";

// ─── CARD ─────────────────────────────────────────────────────────────────────
export default function BoostCard({ boost, report, onReport, onEdit, onDelete }) {
  const status = computeStatus(boost);
  const cfg = statusConfig[status] || statusConfig.ativo;
  const boost_pct = boost.odd_antiga > 0
    ? (((boost.odd_nova - boost.odd_antiga) / (boost.odd_antiga - 1)) * 100).toFixed(0)
    : 0;
  const [teamA, teamB] = splitConfronto(boost.confronto);
  const colorA = colorFor(teamA || "A");
  const colorB = colorFor((teamB || "B") + "·");

  return (
    <div style={S.card}>
      <div style={S.cardAccent(cfg.color)} />
      <div style={S.cardHeader} className="card-header">
        <div style={S.matchup} className="matchup">
          <div style={S.avatar(colorA)} className="avatar-circle">{initials(teamA)}</div>
          <div style={S.matchupCenter}>
            <div style={S.confronto} className="confronto">
              {teamA}{teamB && <> <span style={S.confrontoVs}>vs</span> {teamB}</>}
            </div>
            <div style={S.idJogo}>ID {boost.id_jogo}</div>
          </div>
          {teamB && <div style={S.avatar(colorB)} className="avatar-circle">{initials(teamB)}</div>}
        </div>
        <span style={S.badge(cfg.color, cfg.bg)}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: cfg.color, display: "inline-block" }} />
          {cfg.label}
        </span>
      </div>

      {boost.mercado && (
        <div style={S.marketBox}>
          <div style={S.marketBoxIcon}><IconTag /></div>
          <div>
            <div style={S.marketBoxLabel}>Mercado</div>
            <div style={S.marketBoxValue}>{boost.mercado}</div>
          </div>
        </div>
      )}

      <div style={S.oddRow}>
        <span style={S.oddOld}>{boost.odd_antiga}</span>
        <span style={S.oddArrow}>→</span>
        <span style={S.oddNew}>{boost.odd_nova}</span>
        <span style={{ ...S.badge("var(--up)", "var(--up-soft)"), marginLeft: 2 }}>+{boost_pct}%</span>
        <span style={S.maxStake}>Max <span className="num" style={{ fontWeight: 800, color: "var(--t1)" }}>{fmt(boost.max_stake)}</span></span>
      </div>

      {report && (
        <div style={S.reportBox}>
          <div style={S.reportBoxTitle}><IconChart /> Resultado do Relatório</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 16 }} className="result-stats-grid">
            <div style={S.resultStat}>
              <div style={S.statIconWrap("var(--up)")}><IconChart /></div>
              <div>
                <div style={S.resultStatLabel}>GGR</div>
                <div style={{ ...S.resultStatValue, color: report.ggr >= 0 ? "var(--up)" : "var(--down)" }}>{fmt(report.ggr)}</div>
              </div>
              <div style={S.resultStatBar(report.ggr >= 0 ? "var(--up)" : "var(--down)")} />
            </div>
            <div style={S.resultStat}>
              <div style={S.statIconWrap("var(--info)")}><IconCoin /></div>
              <div>
                <div style={S.resultStatLabel}>Total Stakes</div>
                <div style={S.resultStatValue}>{fmt(report.total_stake)}</div>
              </div>
              <div style={S.resultStatBar("var(--info)")} />
            </div>
            <div style={S.resultStat}>
              <div style={S.statIconWrap("var(--info)")}><IconUser /></div>
              <div>
                <div style={S.resultStatLabel}>Usuários</div>
                <div style={S.resultStatValue}>{report.ids_unicos}</div>
              </div>
              <div style={S.resultStatBar("var(--info)")} />
            </div>
          </div>

          <div style={{ height: 1, background: "var(--line)", margin: "16px 0" }} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 16 }} className="result-stats-grid">
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <div style={S.statIconWrap("var(--warn)")}><IconTicket /></div>
              <div>
                <div style={S.resultStatLabel}>Ticket Médio</div>
                <div style={{ ...S.resultStatValue, fontSize: 14 }}>{fmt(report.ticket_medio)}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <div style={S.statIconWrap("var(--up)")}><IconTrophy /></div>
              <div>
                <div style={S.resultStatLabel}>Wins / Lost</div>
                <div style={{ ...S.resultStatValue, fontSize: 14 }}>{report.wins} / {report.lost}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <div style={S.statIconWrap("var(--down)")}><IconCashout /></div>
              <div>
                <div style={S.resultStatLabel}>Cashout</div>
                <div style={{ ...S.resultStatValue, fontSize: 14 }}>{report.cashout}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={S.metaRow} className="meta-row">
        <div style={S.metaRowItem}>
          <span style={S.metaRowIconWrap}><IconCalendar /></span>
          <span style={S.metaRowText}>
            <span style={S.metaRowLabel}>Evento</span>
            <span style={S.metaRowValue}>{fmtDate(boost.data_evento)}</span>
          </span>
        </div>
        <div style={S.metaRowItem}>
          <span style={S.metaRowIconWrap}><IconClock /></span>
          <span style={S.metaRowText}>
            <span style={S.metaRowLabel}>Data e hora da welcome</span>
            <span style={S.metaRowValue}>{boost.data_welcome ? fmtDate(boost.data_welcome) : "—"}</span>
          </span>
        </div>
        <div style={S.metaRowItem}>
          <span style={S.metaRowIconWrap}><IconClock /></span>
          <span style={S.metaRowText}>
            <span style={S.metaRowLabel}>Cadastrado em</span>
            <span style={{ ...S.metaRowValue, color: "var(--t3)" }}>{fmtDate(boost.created_at)}</span>
          </span>
        </div>
        {boost.feito_em && (
          <div style={S.metaRowItem}>
            <span style={S.metaRowIconWrap}><IconClock /></span>
            <span style={S.metaRowText}>
              <span style={S.metaRowLabel}>Feito em</span>
              <span style={S.metaRowValue}>{fmtDate(boost.feito_em)}</span>
            </span>
          </div>
        )}
        <div style={S.metaRowItem}>
          <span style={S.metaRowIconWrap}><IconUser /></span>
          <span style={S.metaRowText}>
            <span style={S.metaRowLabel}>Feito por</span>
            <span style={{ ...S.metaRowValue, color: "var(--warn)" }}>{boost.feito_por}</span>
          </span>
        </div>
        <div style={S.metaRowItem}>
          <span style={S.metaRowIconWrap}><IconUser /></span>
          <span style={S.metaRowText}>
            <span style={S.metaRowLabel}>Pedido por</span>
            <span style={S.metaRowValue}>{boost.pedido_por}</span>
          </span>
        </div>
      </div>

      <div style={S.cardActions}>
        <button style={S.btnReport} onClick={() => onReport(boost)}>
          <span style={S.btnReportLeft}><IconChart /> Ver relatório completo</span>
          <IconChevronRight />
        </button>
        {Array.isArray(report?.player_ids) && report.player_ids.length > 0 && (
          <button
            style={{ ...S.btnSecondary, display: "flex", alignItems: "center", gap: 7, padding: "12px 16px", fontSize: 13.5 }}
            onClick={() => downloadIds(report.player_ids, boost)}
            title="Baixa em .csv os IDs (coluna Player) processados no relatório salvo desta boost"
          >
            <IconDownload /> Baixar Ids
          </button>
        )}
        <button
          style={{ ...S.btnSecondary, padding: "9px 12px" }}
          onClick={() => onEdit(boost)}
          title="Editar dados desta boost"
        >
          <IconEdit />
        </button>
        <button style={S.btnDelete} onClick={() => onDelete(boost.id)} title="Excluir">
          <IconTrash />
        </button>
      </div>
    </div>
  );
}
