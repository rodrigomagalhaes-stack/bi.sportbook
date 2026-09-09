import BotaoCopiar from './BotaoCopiar.jsx'
import { SITUACOES, diasNaFila, formatarDia, situacao, usuariosPagos, valorPago } from '../lib/situacao.js'

const moeda = (n) => Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const inteiro = (n) => Number(n ?? 0).toLocaleString('pt-BR')

/**
 * Um bilhete, como cartão.
 *
 * O corpo é o botão que abre o painel. O rodapé fica FORA dele: o "copiar
 * link" é um botão, e botão dentro de botão não é HTML válido — o navegador
 * desmonta a marcação e o clique passa a cair no lugar errado.
 */
export default function Cartao({ bilhete, hoje, aoAbrir }) {
  const s = situacao(bilhete, hoje)
  const espera = diasNaFila(bilhete, hoje)
  const datas = bilhete.datas_confrontos ?? []
  const bases = bilhete.bases ?? []
  const pago = s === 'pago'

  return (
    <div className={`pr-cartao pr-cartao-${s}`}>
      <button type="button" className="pr-cartao-corpo" onClick={() => aoAbrir(bilhete)}>
        <span className="pr-cartao-topo">
          <strong>{bilhete.tipster_nome}</strong>
          <span className="pr-cartao-valor">
            {pago ? moeda(valorPago(bilhete)) : moeda(bilhete.stake)}
          </span>
        </span>

        <span className="pr-cartao-datas">
          {datas.length ? datas.map(formatarDia).join(' · ') : '—'}
        </span>
      </button>

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
            <BotaoCopiar link={bilhete.link_bilhete} />
          </>
        )}
      </div>

      {bilhete.observacao && <div className="pr-cartao-obs">{bilhete.observacao}</div>}
    </div>
  )
}
