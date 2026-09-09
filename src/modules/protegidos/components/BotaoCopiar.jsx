import { useState } from 'react'
import Icone from '../../../shell/Icone.jsx'
import { copiar } from '../../../lib/exportar.js'

/**
 * O link do bilhete, pronto para colar.
 *
 * Existe porque conferir um bilhete antes de pagar começa por abri-lo no site,
 * e o endereço estava só dentro do painel, sem como levá-lo para outro lugar
 * sem selecionar texto na mão.
 *
 * `copiar` do portal já traz o plano B para quando o navegador nega a área de
 * transferência (contexto sem HTTPS, permissão recusada): ele cai num campo
 * escondido e no `execCommand`. Por isso o retorno é conferido — dizer
 * "copiado" sem ter copiado é pior do que não ter o botão.
 */
export default function BotaoCopiar({ link, rotulo = 'copiar link' }) {
  const [copiado, setCopiado] = useState(false)

  return (
    <button
      type="button"
      className={`pr-copiar${copiado ? ' copiado' : ''}`}
      title={link}
      onClick={async (e) => {
        // No cartão, o corpo inteiro abre o painel; este clique não é para isso.
        e.stopPropagation()
        const ok = await copiar(link)
        setCopiado(ok)
        if (ok) setTimeout(() => setCopiado(false), 1600)
      }}
    >
      {/* O portal não tem ícone de visto, e `grade` é uma grelha — a cor e a
          palavra dão o retorno sem fingir um símbolo que não existe. */}
      <Icone nome="copias" size={13} />
      {copiado ? 'copiado' : rotulo}
    </button>
  )
}
