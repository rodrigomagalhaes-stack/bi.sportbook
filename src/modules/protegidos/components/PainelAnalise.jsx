import { useState } from 'react'
import Ficha from './Ficha.jsx'
import { aprovar, recusar } from '../lib/dados.js'
import { diaDoTimestamp, formatarDia } from '../lib/situacao.js'

/**
 * Uma solicitação que chegou pelo formulário: aprovar ou recusar.
 *
 * Aprovar não paga nada. Só move o bilhete para A pagar, onde ele segue o
 * caminho de sempre — espera o jogo terminar, recebe a base, vira Paga. O que
 * se decide aqui é se o bilhete vale reembolso: o link abre, a stake bate, as
 * datas são as do bilhete.
 *
 * O motivo da recusa é obrigatório porque sai desta tela: o tipster lê
 * exatamente o que for escrito aqui, na lista dele.
 */
export default function PainelAnalise({ bilhete, aoFechar, aoConcluir }) {
  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function decidir(gravar, aviso) {
    setSalvando(true)
    setErro('')
    try {
      await gravar()
      aoConcluir(aviso)
    } catch (e) {
      setErro(e?.message || 'Não consegui gravar a decisão.')
      setSalvando(false)
    }
  }

  return (
    <div className="pr-fundo" onClick={aoFechar}>
      <div className="pr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pr-modal-topo">
          <h3>{bilhete.tipster_nome}</h3>
          <button type="button" className="pf-link" onClick={aoFechar}>
            fechar
          </button>
        </div>

        <div className="pr-modal-corpo">
          <Ficha bilhete={bilhete} copiar />

          <p className="pf-hint">
            Enviado em {formatarDia(diaDoTimestamp(bilhete.enviado_em))}
            {bilhete.enviado_por ? ` por ${bilhete.enviado_por}` : ''}
          </p>

          {bilhete.observacao && <p className="pf-hint">{bilhete.observacao}</p>}

          {recusando && (
            <div className="pr-recusa">
              <label className="pf-campo">
                <span>Motivo da recusa — o tipster vê este texto</span>
                <input
                  className="pf-input"
                  value={motivo}
                  placeholder="link não abre, stake diferente do bilhete…"
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="pf-btn"
                disabled={salvando || !motivo.trim()}
                onClick={() => decidir(() => recusar(bilhete.id, motivo), 'solicitação recusada')}
              >
                Confirmar recusa
              </button>
            </div>
          )}

          {erro && <p className="pf-erro">{erro}</p>}
        </div>

        <div className="pr-modal-pe">
          <button
            type="button"
            className="pf-link pr-recusar"
            onClick={() => setRecusando((v) => !v)}
          >
            {recusando ? 'cancelar recusa' : 'recusar'}
          </button>

          <button
            type="button"
            className="pf-btn primario"
            disabled={salvando || recusando}
            onClick={() => decidir(() => aprovar(bilhete.id), 'aprovada — o bilhete foi para A pagar')}
          >
            {salvando && !recusando ? 'Gravando…' : 'Aprovar'}
          </button>
        </div>
      </div>
    </div>
  )
}
