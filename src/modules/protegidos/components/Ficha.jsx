import BotaoCopiar from './BotaoCopiar.jsx'
import { formatarDia } from '../lib/situacao.js'

const moeda = (n) => Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * O que o tipster enviou: stake, confrontos e o link.
 *
 * É a mesma ficha no painel da análise e no do pagamento, porque é a mesma
 * conferência nos dois momentos — abrir o bilhete no site e ver se bate.
 */
export default function Ficha({ bilhete, copiar = false }) {
  return (
    <dl className="pr-ficha">
      <div>
        <dt>Stake</dt>
        <dd>{moeda(bilhete.stake)}</dd>
      </div>
      <div>
        <dt>Confrontos</dt>
        <dd>{(bilhete.datas_confrontos ?? []).map(formatarDia).join(' · ') || '—'}</dd>
      </div>
      <div className="pr-ficha-bilhete">
        <dt>Bilhete</dt>
        <dd>
          <a className="pf-link" href={bilhete.link_bilhete} target="_blank" rel="noreferrer noopener">
            abrir no site
          </a>
          {copiar && <BotaoCopiar link={bilhete.link_bilhete} />}
        </dd>
      </div>
    </dl>
  )
}
