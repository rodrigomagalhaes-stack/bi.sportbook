export default function StatusIndicator({ connected }) {
  const label = connected === null ? 'Verificando…' : connected ? 'Banco conectado' : 'Banco desconectado'
  const color = connected === true ? 'var(--pb-verde)' : 'var(--pb-t3)'

  return (
    <div className="status-indicator">
      <span className="status-dot" style={{ background: color }} />
      <span style={{ color }}>{label}</span>
    </div>
  )
}
