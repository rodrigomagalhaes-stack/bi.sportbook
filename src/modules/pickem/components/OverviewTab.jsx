import { useState, useEffect } from 'react'
import { costAnalysis, recurrenceAnalysis } from '../lib/analytics'
import { downloadCSV } from '../lib/downloadCSV'
import KPICards from './KPICards'

function fmtBRL(n) {
  if (n == null || n === 0) return '–'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtNum(n) {
  return (n || 0).toLocaleString('pt-BR')
}
function fmtPct(n) {
  if (n == null) return '–'
  return n.toFixed(1).replace('.', ',') + '%'
}

export default function OverviewTab({ events, onSelectEvent, onFetchAllUserEvents }) {
  const [recurrence, setRecurrence] = useState(null)
  const [loadingRec, setLoadingRec] = useState(false)
  const [recError, setRecError] = useState('')

  // ordem cronológica (mais antigo → mais novo)
  const chronological = [...events].sort((a, b) => {
    const da = new Date(a.periodo_inicio || a.criado_em)
    const db = new Date(b.periodo_inicio || b.criado_em)
    return da - db
  })

  useEffect(() => {
    let cancelled = false
    if (!events.length || !onFetchAllUserEvents) { setRecurrence(null); return }
    setLoadingRec(true)
    setRecError('')
    onFetchAllUserEvents()
      .then((rows) => {
        if (cancelled) return
        setRecurrence(recurrenceAnalysis(chronological, rows))
      })
      .catch((e) => { if (!cancelled) setRecError(e.message) })
      .finally(() => { if (!cancelled) setLoadingRec(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, onFetchAllUserEvents])

  if (!events.length) {
    return <div className="empty-state tab-content">Nenhum evento salvo ainda.</div>
  }

  // ── Consolidado ──
  const totalUsuarios   = events.reduce((s, e) => s + (e.usuarios_unicos || 0), 0)
  const totalGanhadores = events.reduce((s, e) => s + (e.ganhadores || 0), 0)
  const mediaGeral      = events.reduce((s, e) => s + (e.media_acertos || 0), 0) / events.length
  const thresholds      = events.map((e) => e.win_threshold).filter((v) => v != null)

  const consolidated = {
    totalEntradas: events.reduce((s, e) => s + (e.total_entradas || 0), 0),
    usuariosUnicos: totalUsuarios,
    ganhadores: totalGanhadores,
    mediaAcertos: mediaGeral,
    winThreshold: thresholds.length ? Math.min(...thresholds) : null,
    noQuestions: 8,
  }

  // ── Gasto real (modelo) por evento ──
  const costs = costAnalysis(events) // alinhado à ordem de events
  const gastoById = new Map(costs.map((c) => [c.ev.id, { gastoReal: c.previsto, modelo: c.modelo }]))
  const totalGasto = costs.reduce((s, c) => s + (c.previsto || 0), 0)
  const algumModelo = costs.some((c) => c.previsto != null)

  // ── Máximos para destaque ──
  const maxUsuarios = Math.max(...events.map((e) => e.usuarios_unicos || 0))
  const maxGanhadores = Math.max(...events.map((e) => e.ganhadores || 0))
  const maxMedia = Math.max(...events.map((e) => e.media_acertos || 0))
  const maxGasto = Math.max(...costs.map((c) => c.previsto || 0))

  function exportFieis() {
    if (!recurrence) return
    downloadCSV(
      'jogadores_fieis.csv',
      recurrence.fieis,
      ['user_external_id', 'eventos_jogados', 'vitorias'],
      ['ID do Usuário', 'Eventos Jogados', 'Vitórias']
    )
  }

  return (
    <div className="tab-content">

      {/* KPIs consolidados */}
      <div className="overview-section">
        <h3 className="section-title">Consolidado — {events.length} evento{events.length > 1 ? 's' : ''}</h3>
        <KPICards meta={consolidated} gastoReal={algumModelo ? totalGasto : null} />
      </div>

      {/* ── Recorrência ── */}
      <div className="overview-section">
        <h3 className="section-title">Recorrência de jogadores</h3>
        {loadingRec && <p className="section-hint">Carregando dados de todos os eventos…</p>}
        {recError && <p className="section-hint" style={{ color: 'var(--danger)' }}>Erro: {recError}</p>}

        {recurrence && (
          <>
            <div className="mini-kpi-row">
              <div className="mini-kpi">
                <span className="mini-kpi-val">{fmtNum(recurrence.distinctUsers)}</span>
                <span className="mini-kpi-lbl">jogadores distintos (todos eventos)</span>
              </div>
              <div className="mini-kpi">
                <span className="mini-kpi-val kpi-accent">{fmtNum(recurrence.recorrentesGlobais)}</span>
                <span className="mini-kpi-lbl">jogaram 2+ eventos</span>
              </div>
              <div className="mini-kpi">
                <span className="mini-kpi-val kpi-accent">{fmtPct(recurrence.pctRecorrencia)}</span>
                <span className="mini-kpi-lbl">taxa de recorrência</span>
              </div>
              <div className="mini-kpi">
                <button className="btn-outline" onClick={exportFieis}>↓ Exportar fiéis</button>
              </div>
            </div>

            {events.length > 1 && (
              <div className="table-wrap" style={{ marginTop: 14 }}>
                <table className="cmp-table">
                  <thead>
                    <tr>
                      <th>Evento</th>
                      <th style={{ textAlign: 'right' }}>Jogadores</th>
                      <th style={{ textAlign: 'right' }}>Novos</th>
                      <th style={{ textAlign: 'right' }}>Recorrentes</th>
                      <th style={{ textAlign: 'right' }}>Retenção do anterior</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurrence.timeline.map(({ ev, jogadores, novos, recorrentes, retencao }) => (
                      <tr key={ev.id} className="row-clickable" onClick={() => onSelectEvent(ev.id)}>
                        <td className="td-name">{ev.nome}</td>
                        <td className="td-right">{fmtNum(jogadores)}</td>
                        <td className="td-right">{fmtNum(novos)}</td>
                        <td className="td-right">{fmtNum(recorrentes)}</td>
                        <td className="td-right" style={{ color: retencao != null ? 'var(--green)' : 'var(--pb-t3)' }}>
                          {retencao != null ? fmtPct(retencao) : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Comparativo geral ── */}
      <div className="overview-section">
        <h3 className="section-title">Comparativo por evento</h3>
        <p className="section-hint">
          Clique num evento para abri-lo. Gasto real = custo do modelo de premiação. Valores em verde são os maiores da coluna.
        </p>
        <div className="table-wrap">
          <table className="cmp-table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Período</th>
                <th style={{ textAlign: 'right' }}>Usuários</th>
                <th style={{ textAlign: 'right' }}>Ganhadores</th>
                <th style={{ textAlign: 'right' }}>Corte</th>
                <th style={{ textAlign: 'right' }}>Média acertos</th>
                <th>Modelo</th>
                <th style={{ textAlign: 'right' }}>Gasto real</th>
                <th style={{ textAlign: 'right' }}>Gasto/ganhador</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const { gastoReal, modelo } = gastoById.get(ev.id) || {}
                const gastoPorGanhador = gastoReal != null && ev.ganhadores > 0 ? gastoReal / ev.ganhadores : null
                return (
                  <tr key={ev.id} className="row-clickable" onClick={() => onSelectEvent(ev.id)}>
                    <td className="td-name">{ev.nome}</td>
                    <td className="td-periodo">{ev.periodo_label || '–'}</td>
                    <td className={`td-right${ev.usuarios_unicos === maxUsuarios ? ' td-best' : ''}`}>{fmtNum(ev.usuarios_unicos)}</td>
                    <td className={`td-right${ev.ganhadores === maxGanhadores && maxGanhadores > 0 ? ' td-best' : ''}`}>{ev.ganhadores}</td>
                    <td className="td-right">{ev.win_threshold != null ? `${ev.win_threshold}+` : '–'}</td>
                    <td className={`td-right${ev.media_acertos === maxMedia ? ' td-best' : ''}`}>{(ev.media_acertos || 0).toFixed(2)}</td>
                    <td className="td-modelo">{modelo || <span style={{ color: 'var(--pb-t3)' }}>sem modelo</span>}</td>
                    <td className={`td-right${gastoReal != null && gastoReal === maxGasto && maxGasto > 0 ? ' td-best' : ''}`}>
                      {gastoReal != null ? fmtBRL(gastoReal) : '–'}
                    </td>
                    <td className="td-right">{fmtBRL(gastoPorGanhador)}</td>
                  </tr>
                )
              })}
            </tbody>
            {events.length > 1 && (
              <tfoot>
                <tr className="row-total">
                  <td><strong>Total</strong></td>
                  <td className="td-periodo">{events.length} eventos</td>
                  <td className="td-right"><strong>{fmtNum(totalUsuarios)}</strong></td>
                  <td className="td-right"><strong>{totalGanhadores}</strong></td>
                  <td className="td-right">–</td>
                  <td className="td-right"><strong>{mediaGeral.toFixed(2)}</strong></td>
                  <td className="td-modelo">–</td>
                  <td className="td-right"><strong>{algumModelo ? fmtBRL(totalGasto) : '–'}</strong></td>
                  <td className="td-right">{algumModelo && totalGanhadores > 0 ? fmtBRL(totalGasto / totalGanhadores) : '–'}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
