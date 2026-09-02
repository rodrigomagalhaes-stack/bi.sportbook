function fmtBRL(n) {
  if (n == null) return '–'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmt(n, dec = 0) {
  if (n == null) return '–'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export default function KPICards({ meta, gastoReal }) {
  const cards = [
    {
      label: 'USUÁRIOS',
      value: fmt(meta.usuariosUnicos),
      sub: `${fmt(meta.totalEntradas ?? meta.usuariosUnicos)} entradas`,
    },
    {
      label: 'GANHADORES',
      value: fmt(meta.ganhadores),
      sub: meta.winThreshold != null ? `${meta.winThreshold}+ acertos` : '–',
      accent: true,
    },
    {
      label: 'MÉDIA DE ACERTOS',
      value: fmt(meta.mediaAcertos, 2),
      sub: `de ${meta.noQuestions ?? 8}`,
    },
    {
      label: 'GASTO REAL',
      value: gastoReal != null ? fmtBRL(gastoReal) : '–',
      sub: gastoReal != null ? 'pelo modelo de premiação' : 'selecione um modelo',
      accent: true,
    },
  ]

  return (
    <div className="kpi-grid">
      {cards.map((c) => (
        <div key={c.label} className="kpi-card">
          <span className="kpi-label">{c.label}</span>
          <span className={`kpi-value${c.accent ? ' kpi-accent' : ''}`}>{c.value}</span>
          <span className="kpi-sub">{c.sub}</span>
        </div>
      ))}
    </div>
  )
}
