// Faixa de indicadores. Só mostra o que for maior que zero, para o "0
// duplicados / 0 já prefixados" não competir com o que interessa.
export default function Resumo({ itens }) {
  const visiveis = itens.filter((i) => i.sempre || i.valor > 0)
  if (!visiveis.length) return null

  return (
    <div className="pf-resumo">
      {visiveis.map((i) => (
        <div className={`pf-chip${i.tom ? ' ' + i.tom : ''}`} key={i.label} title={i.dica}>
          <strong>{i.valor.toLocaleString('pt-BR')}</strong>
          <span>{i.label}</span>
        </div>
      ))}
    </div>
  )
}
