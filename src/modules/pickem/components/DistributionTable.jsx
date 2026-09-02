import { downloadCSV } from '../lib/downloadCSV'

function fmtBRL(n) {
  if (n == null) return '–'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function DistributionTable({ dist, winThreshold, totalUsers, prizeModel, onFetchEntries, localEntries }) {
  const total = dist.reduce((s, d) => s + d.count, 0) || totalUsers || 1
  const maxCount = Math.max(...dist.map((d) => d.count), 1)
  const hasPrize = !!prizeModel

  // custo total = soma dos prêmios fixos de cada faixa com ganhadores
  const custoTotal = hasPrize
    ? dist.reduce((sum, row) => {
        const prize = prizeModel.prizes[row.acertos]
        return sum + (prize && row.count > 0 ? prize : 0)
      }, 0)
    : 0

  function formatDate(val) {
    if (!val) return ''
    const d = new Date(val)
    if (isNaN(d)) return String(val)
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  async function handleDownload(acertos) {
    let raw = []

    if (localEntries) {
      raw = localEntries.filter((e) => e.acertos === acertos)
    } else if (onFetchEntries) {
      raw = await onFetchEntries(acertos)
    }

    if (!raw.length) { alert('Nenhum registro encontrado.'); return }

    const rows = raw.map((e) => ({
      user_external_id: e.user_external_id,
      acertos: e.acertos ?? '',
      status: e.status ?? '',
      premio: e.premio ?? 0,
      data_aposta: formatDate(e.data_aposta),
    }))

    downloadCSV(
      `acertos_${acertos}.csv`,
      rows,
      ['user_external_id', 'acertos', 'status', 'premio', 'data_aposta'],
      ['ID do Usuário', 'Acertos', 'Status', 'Prêmio (BRL)', 'Data da Aposta']
    )
  }

  return (
    <div>
      <div className="table-wrap">
        <table className="dist-table">
          <thead>
            <tr>
              <th style={{ width: 130 }}>Acertos</th>
              <th></th>
              <th style={{ width: 90, textAlign: 'right' }}>Usuários</th>
              <th style={{ width: 60, textAlign: 'right' }}>%</th>
              {hasPrize && <th style={{ width: 130, textAlign: 'right' }}>Prêmio/jogador</th>}
              {hasPrize && <th style={{ width: 140, textAlign: 'right' }}>Custo total</th>}
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {[...dist].reverse().map((row) => {
              const isWinner = winThreshold != null && row.acertos >= winThreshold
              const pct = total > 0 ? ((row.count / total) * 100).toFixed(1) : '0.0'
              const barPct = maxCount > 0 ? (row.count / maxCount) * 100 : 0
              const label = row.acertos === 1 ? '1 acerto' : `${row.acertos} acertos`
              const prize = hasPrize ? prizeModel.prizes[row.acertos] : null
              // prize = custo total da faixa; por jogador = prize / count
              const premioPorJogador = prize && row.count > 0 ? prize / row.count : null

              return (
                <tr key={row.acertos} className={isWinner ? 'row-winner' : ''}>
                  <td className="td-acertos">
                    {label}
                    {isWinner && <span className="check">✓</span>}
                  </td>
                  <td className="td-bar">
                    <div className="bar-bg">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${barPct}%`,
                          background: isWinner ? 'var(--pb-verde)' : 'var(--pb-surface-3)',
                        }}
                      />
                    </div>
                  </td>
                  <td className="td-num">{row.count.toLocaleString('pt-BR')}</td>
                  <td className="td-pct">{pct}%</td>
                  {hasPrize && (
                    <td className="td-num" style={{ color: premioPorJogador ? 'var(--pb-t1)' : 'var(--pb-t3)' }}>
                      {premioPorJogador ? fmtBRL(premioPorJogador) : '–'}
                    </td>
                  )}
                  {hasPrize && (
                    <td className="td-num" style={{ color: prize && row.count > 0 ? 'var(--pb-verde)' : 'var(--pb-t3)', fontWeight: prize && row.count > 0 ? 600 : 400 }}>
                      {prize && row.count > 0 ? fmtBRL(prize) : '–'}
                    </td>
                  )}
                  <td className="td-download">
                    {row.count > 0 && (localEntries || onFetchEntries) && (
                      <button
                        className="btn-dl"
                        title={`Baixar IDs com ${label}`}
                        onClick={() => handleDownload(row.acertos)}
                      >
                        ↓
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {hasPrize && custoTotal > 0 && (
            <tfoot>
              <tr className="row-total">
                <td colSpan={4} style={{ textAlign: 'right', color: 'var(--pb-t2)', fontSize: 12 }}>
                  Custo total do evento ({prizeModel.label})
                </td>
                <td className="td-num" style={{ color: 'var(--pb-t2)' }}></td>
                <td className="td-num" style={{ color: 'var(--pb-verde)', fontWeight: 700, fontSize: 15 }}>
                  {fmtBRL(custoTotal)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
