import Cartao from './Cartao.jsx'

/**
 * Uma das duas caixas: A Pagar e Paga.
 *
 * O cabeçalho carrega a contagem e o total, e o corpo rola sozinho — com a
 * caixa inteira rolando junto com a página, a outra sairia da tela e as duas
 * deixariam de ser comparáveis de relance, que é a razão de estarem lado a lado.
 */
export default function Quadro({ titulo, contagem, resumo, filtro, vazio, bilhetes, hoje, aoAbrir }) {
  return (
    <section className="pr-quadro">
      <header className="pr-quadro-topo">
        <h3>
          {titulo}
          <span className="pr-quadro-num">{contagem}</span>
        </h3>
        {resumo && <span className="pr-quadro-resumo">{resumo}</span>}
      </header>

      {filtro && <div className="pr-quadro-filtro">{filtro}</div>}

      <div className="pr-quadro-corpo">
        {bilhetes.length === 0 ? (
          <p className="pr-quadro-vazio">{vazio}</p>
        ) : (
          bilhetes.map((b) => <Cartao key={b.id} bilhete={b} hoje={hoje} aoAbrir={aoAbrir} />)
        )}
      </div>
    </section>
  )
}
