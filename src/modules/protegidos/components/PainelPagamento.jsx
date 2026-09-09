import { useMemo, useState } from 'react'
import AreaUpload from '../../../shell/AreaUpload.jsx'
import Resumo from '../../../shell/Resumo.jsx'
import { lerArquivo, letraColuna, pareceCabecalho } from '../../../lib/planilha.js'
import { acharColunaUsuario, montarLinhas, valorDaBase } from '../lib/base.js'
import { formatarDia, situacao, usuariosPagos, valorPago } from '../lib/situacao.js'
import { linkDaBase, marcarPago, recusar, salvarBase } from '../lib/dados.js'

const moeda = (n) => Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const inteiro = (n) => Number(n ?? 0).toLocaleString('pt-BR')

/**
 * O bilhete aberto: confere, sobe a base e marca como paga.
 *
 * A base sobe ANTES de o bilhete virar pago, e não depois. Na ordem inversa,
 * uma falha no meio deixaria um bilhete marcado como pago sem nada por trás — e
 * pagamento sem base é justamente o registro que ninguém audita depois, porque
 * na tela ele já parece resolvido.
 */
export default function PainelPagamento({ bilhete, hoje, aoFechar, aoConcluir, aoReabrir }) {
  const [dados, setDados] = useState(null)
  const [temCabecalho, setTemCabecalho] = useState(true)
  const [colUsuario, setColUsuario] = useState(-1)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [recusando, setRecusando] = useState(false)

  const s = situacao(bilhete, hoje)
  const pago = s === 'pago'
  const bases = bilhete.bases ?? []

  async function carregar(file) {
    setErro('')
    try {
      const lido = await lerArquivo(file)
      const comCabecalho = pareceCabecalho(lido.linhas)
      const cab = comCabecalho ? lido.linhas[0] : null

      setDados({ ...lido, file })
      setTemCabecalho(comCabecalho)
      const iu = acharColunaUsuario(cab)
      setColUsuario(iu >= 0 ? iu : 0)
      if (cab && iu < 0) {
        setErro('Não reconheci a coluna do jogador pelo nome — escolha a coluna certa abaixo.')
      }
    } catch (e) {
      setDados(null)
      setErro(e?.message || 'Não consegui ler esse arquivo.')
    }
  }

  const cabecalho = temCabecalho && dados ? dados.linhas[0] : null
  const corpo = useMemo(() => {
    if (!dados) return []
    return temCabecalho ? dados.linhas.slice(1) : dados.linhas
  }, [dados, temCabecalho])

  const { linhas, resumo } = useMemo(
    () => montarLinhas(corpo, { colUsuario, deslocamento: temCabecalho ? 1 : 0 }),
    [corpo, colUsuario, temCabecalho],
  )

  const largura = corpo.length ? Math.max(...corpo.map((l) => l.length)) : 0
  const nomeColuna = (i) => (i < 0 ? null : cabecalho?.[i]?.trim() || `Coluna ${letraColuna(i)}`)

  const opcoes = () =>
    Array.from({ length: largura }, (_, i) => (
      <option key={i} value={i}>
        {cabecalho?.[i]?.trim() ? `${cabecalho[i]} (${letraColuna(i)})` : `Coluna ${letraColuna(i)}`}
      </option>
    ))

  async function confirmar(comBase) {
    setSalvando(true)
    setErro('')
    try {
      if (comBase) {
        await salvarBase(bilhete.id, {
          arquivo: dados.file,
          colUsuario: nomeColuna(colUsuario),
          stake: bilhete.stake,
          resumo,
          linhas,
        })
      }
      await marcarPago(bilhete.id)
      aoConcluir()
    } catch (e) {
      setErro(traduzir(e?.message))
      setSalvando(false)
    }
  }

  async function confirmarRecusa() {
    setSalvando(true)
    setErro('')
    try {
      await recusar(bilhete.id, motivo)
      aoConcluir()
    } catch (e) {
      setErro(e?.message || 'Não consegui recusar o bilhete.')
      setSalvando(false)
    }
  }

  async function baixar(base) {
    try {
      const url = await linkDaBase(base.arquivo_caminho)
      if (url) window.open(url, '_blank', 'noopener')
      else setErro('Esta base não tem arquivo guardado — só as linhas foram gravadas.')
    } catch (e) {
      setErro(e?.message ?? 'Não consegui abrir o arquivo.')
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
          <dl className="pr-ficha">
            <div>
              <dt>Stake</dt>
              <dd>{moeda(bilhete.stake)}</dd>
            </div>
            <div>
              <dt>Confrontos</dt>
              <dd>{(bilhete.datas_confrontos ?? []).map(formatarDia).join(' · ') || '—'}</dd>
            </div>
            <div>
              <dt>Bilhete</dt>
              <dd>
                <a className="pf-link" href={bilhete.link_bilhete} target="_blank" rel="noreferrer noopener">
                  abrir no site
                </a>
              </dd>
            </div>
          </dl>

          {bilhete.observacao && <p className="pf-hint">{bilhete.observacao}</p>}

          {pago ? (
            /* ── já pago: o que foi pago, e o caminho de volta ─────────────── */
            <>
              <Resumo
                itens={[
                  { label: 'jogadores reembolsados', valor: usuariosPagos(bilhete), sempre: true, tom: 'ok' },
                ]}
              />
              <p className="pr-total">
                Reembolsado: <strong>{moeda(valorPago(bilhete))}</strong>
              </p>

              {bases.length === 0 ? (
                <p className="pf-erro">
                  Este bilhete foi marcado como pago sem base anexada. Não há como conferir quem
                  recebeu.
                </p>
              ) : (
                <ul className="pr-bases">
                  {bases.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        className="pf-link"
                        disabled={!b.arquivo_caminho}
                        onClick={() => baixar(b)}
                      >
                        {b.arquivo_nome}
                      </button>
                      <span>
                        {inteiro(b.usuarios)} jogadores · {moeda(b.valor_total)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {erro && <p className="pf-erro">{erro}</p>}
            </>
          ) : (
            /* ── a pagar: a base e a confirmação ───────────────────────────── */
            <>
              {s === 'aguardando' && (
                <p className="pf-erro">
                  O último confronto é {formatarDia(bilhete.confronto_fim)} e ainda não terminou. Dá
                  para pagar assim mesmo, mas confira antes se o bilhete já resolveu.
                </p>
              )}

              {!dados ? (
                <AreaUpload
                  onArquivo={carregar}
                  erro={erro}
                  titulo="Solte aqui o CSV da base reembolsada"
                  dica="ou clique para escolher — aceita .csv, .txt, .xlsx e .xls"
                />
              ) : (
                <>
                  <div className="pr-arquivo-linha">
                    <strong>{dados.nome}</strong>
                    <span>{corpo.length.toLocaleString('pt-BR')} linhas</span>
                    <button
                      type="button"
                      className="pf-link"
                      onClick={() => {
                        setDados(null)
                        setErro('')
                      }}
                    >
                      trocar arquivo
                    </button>
                  </div>

                  <div className="pr-mapa">
                    <label className="pf-campo">
                      <span>Coluna do jogador</span>
                      <select
                        className="pf-input"
                        value={colUsuario}
                        onChange={(e) => setColUsuario(Number(e.target.value))}
                      >
                        {opcoes()}
                      </select>
                    </label>

                    <label className="pf-check pr-check-solto">
                      <input
                        type="checkbox"
                        checked={temCabecalho}
                        onChange={(e) => setTemCabecalho(e.target.checked)}
                      />
                      A primeira linha é cabeçalho
                    </label>
                  </div>

                  <Resumo
                    itens={[
                      { label: 'jogadores na base', valor: resumo.jogadores, sempre: true, tom: 'ok' },
                      {
                        label: 'linhas sem jogador',
                        valor: resumo.semUsuario,
                        tom: 'alerta',
                        dica: 'Ficam de fora da gravação — confira se a coluna escolhida é a certa.',
                      },
                      {
                        label: 'repetidos, descartados',
                        valor: resumo.repetidos,
                        tom: 'erro',
                        dica: 'O mesmo jogador aparecia mais de uma vez no arquivo. Entra uma vez só: senão seria a mesma pessoa reembolsada duas vezes pelo mesmo bilhete.',
                      },
                    ]}
                  />

                  {/* O arquivo diz QUEM recebe; a stake do bilhete diz QUANTO.
                      A conta aparece por extenso para poder ser conferida de
                      cabeça antes de o dinheiro sair. */}
                  <p className="pr-total">
                    {resumo.jogadores} jogadores × {moeda(bilhete.stake)} ={' '}
                    <strong>{moeda(valorDaBase(bilhete.stake, resumo.jogadores))}</strong>
                  </p>

                  {erro && <p className="pf-erro">{erro}</p>}
                </>
              )}

              {recusando && (
                <div className="pr-recusa">
                  <label className="pf-campo">
                    <span>Motivo da recusa</span>
                    <input
                      className="pf-input"
                      value={motivo}
                      placeholder="bilhete fora das regras, link errado…"
                      onChange={(e) => setMotivo(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="pf-btn"
                    disabled={salvando || !motivo.trim()}
                    onClick={confirmarRecusa}
                  >
                    Confirmar recusa
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="pr-modal-pe">
          {pago ? (
            <>
              <span className="pf-hint">
                Pago em {formatarDia(bilhete.pago_em?.slice(0, 10))}
                {bilhete.pago_por ? ` por ${bilhete.pago_por}` : ''}
              </span>
              <button
                type="button"
                className="pf-btn"
                onClick={() => aoReabrir(bilhete)}
                title="Volta o bilhete para A pagar. A base anexada continua nele."
              >
                Reabrir
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="pf-link pr-recusar"
                onClick={() => setRecusando((v) => !v)}
              >
                {recusando ? 'cancelar recusa' : 'recusar bilhete'}
              </button>

              <div className="pf-acoes-dir">
                <button
                  type="button"
                  className="pf-btn"
                  disabled={salvando}
                  onClick={() => confirmar(false)}
                  title="Fica marcado como pago e aparece na caixa Paga com o aviso de que falta a base."
                >
                  Marcar paga sem base
                </button>
                <button
                  type="button"
                  className="pf-btn primario"
                  disabled={salvando || !dados || resumo.jogadores === 0}
                  onClick={() => confirmar(true)}
                >
                  {salvando ? 'Gravando…' : 'Anexar base e marcar paga'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// O erro mais provável é o do índice único de arquivo por bilhete, e "duplicate
// key value violates unique constraint" não diz a ninguém que o arquivo já
// subiu antes.
function traduzir(msg) {
  const texto = String(msg ?? '')
  if (texto.includes('protegidos_bases_arquivo_uk')) {
    return 'Este arquivo já foi anexado a este bilhete. Se a base mudou, renomeie o arquivo ou remova a anterior.'
  }
  return texto || 'Não consegui gravar o pagamento.'
}
