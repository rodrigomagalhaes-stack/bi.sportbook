import { SITUACOES, diasNaFila, formatarDia, situacao, usuariosPagos, valorPago } from '../lib/situacao.js'

const moeda = (n) => Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const inteiro = (n) => Number(n ?? 0).toLocaleString('pt-BR')

/**
 * Um bilhete, como cartão.
 *
 * O cartão inteiro é o botão: clicar em qualquer parte abre o bilhete. Só o
 * link do site escapa disso — ele leva para fora, e um clique que às vezes abre
 * o painel e às vezes troca de site é um clique que ninguém confia.
 */
export default function Cartao({ bilhete, hoje, aoAbrir }) {
  const s = situacao(bilhete, hoje)
  const espera = diasNaFila(bilhete, hoje)
  const datas = bilhete.datas_confrontos ?? []
  const bases = bilhete.bases ?? []
  const pago = s === 'pago'

  return (
    <button type="button" className={`pr-cartao pr-cartao-${s}`} onClick={() => aoAbrir(bilhete)}>
      <div className="pr-cartao-topo">
        <strong>{bilhete.tipster_nome}</strong>
        <span className="pr-cartao-valor">
          {pago ? moeda(valorPago(bilhete)) : moeda(bilhete.stake)}
        </span>
      </div>

      <div className="pr-cartao-datas">
        {datas.length ? datas.map(formatarDia).join(' · ') : '—'}
      </div>

      <div className="pr-cartao-pe">
        {pago ? (
          <>
            <span>{inteiro(usuariosPagos(bilhete))} jogadores</span>
            {bases.length === 0 ? (
              // Pago sem base é furo de auditoria, não um detalhe de exibição:
              // ninguém marcou assim de propósito, e ninguém vai procurar.
              <span className="pf-tag erro">sem base</span>
            ) : (
              <span className="pr-cartao-arquivo" title={bases.map((b) => b.arquivo_nome).join(', ')}>
                {bases[0].arquivo_nome}
                {bases.length > 1 ? ` +${bases.length - 1}` : ''}
              </span>
            )}
          </>
        ) : (
          <>
            <span className={`pf-tag${SITUACOES[s].tom ? ' pr-tag-' + SITUACOES[s].tom : ''}`}>
              {SITUACOES[s].label}
            </span>
            {/* A espera é o único aviso de que alguém precisa agir: a caixa não
                avisa sozinha, e o bilhete antigo não se destaca por nada. */}
            {espera > 0 && (
              <span className={`pr-espera${espera >= 7 ? ' pr-espera-alta' : espera >= 3 ? ' pr-espera-media' : ''}`}>
                {espera}d esperando
              </span>
            )}
          </>
        )}
      </div>

      {bilhete.observacao && <div className="pr-cartao-obs">{bilhete.observacao}</div>}
    </button>
  )
}
