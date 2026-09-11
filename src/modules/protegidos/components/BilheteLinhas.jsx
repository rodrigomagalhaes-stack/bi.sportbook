import { useEffect, useState } from 'react'
import { buscarLinhas, salvarLinhas } from '../lib/dados.js'
import { codigoDoBilhete, formatarOdd, inicioLocal, oddTotal } from '../lib/bilhete.js'
import { diaDoTimestamp, formatarDia } from '../lib/situacao.js'

/**
 * O bilhete impresso: as linhas lidas da Esportiva pelo código do link.
 *
 * Se o bilhete já tem as linhas guardadas, a tela usa essas e não chama nada.
 * Se não tem, lê pelo código e guarda — a leitura é de uma API não oficial, e o
 * que foi conferido na análise não pode sumir porque ela mudou depois.
 */
export default function BilheteLinhas({ bilhete }) {
  const codigo = codigoDoBilhete(bilhete)
  const guardado = bilhete.bilhete ?? null

  const [lido, setLido] = useState(guardado)
  const [carregando, setCarregando] = useState(!guardado && Boolean(codigo))
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (guardado || !codigo) return
    let vivo = true

    buscarLinhas(codigo)
      .then((dados) => {
        // Guarda mesmo que o painel já tenha fechado: a leitura custou uma
        // chamada, e a próxima abertura não precisa repeti-la.
        salvarLinhas(bilhete.id, dados).catch((e) =>
          console.warn('bilhete: as linhas não foram guardadas —', e.message),
        )
        if (vivo) setLido(dados)
      })
      .catch((e) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false))

    return () => {
      vivo = false
    }
  }, [bilhete.id, guardado, codigo])

  const linhas = lido?.linhas ?? []
  const total = oddTotal(lido)

  return (
    <section className="pr-bilhete">
      <header className="pr-bilhete-topo">
        <strong>Bilhete</strong>
        {linhas.length > 0 && (
          <span className="pr-bilhete-total">
            {linhas.length} {linhas.length > 1 ? 'seleções' : 'seleção'}
            {total && (
              <>
                {' · odd '}
                <b>{formatarOdd(total)}</b>
              </>
            )}
          </span>
        )}
      </header>

      {!codigo ? (
        <p className="pr-bilhete-aviso">
          O link não tem o código de compartilhamento da Esportiva, então as linhas não dão para
          ler daqui — confira abrindo no site.
        </p>
      ) : carregando ? (
        <p className="pr-bilhete-aviso">Lendo o bilhete {codigo} na Esportiva…</p>
      ) : erro ? (
        <p className="pr-bilhete-aviso pr-bilhete-erro">{erro}</p>
      ) : (
        <>
          <ol className="pr-bilhete-linhas">
            {linhas.map((l, i) => (
              <li key={i}>
                <span className="pr-linha-evento" title={l.evento}>
                  {l.evento || '—'}
                </span>
                <span className="pr-linha-inicio">{inicioLocal(l.inicio)}</span>
                <span className="pr-linha-aposta">
                  {l.mercado}
                  {l.pernas.length === 0 && (
                    <>
                      {': '}
                      <b>{l.selecao || '—'}</b>
                    </>
                  )}
                </span>
                <span className="pr-linha-odd">
                  {l.odd_antes && <s>{formatarOdd(l.odd_antes)}</s>}
                  {l.odd ? formatarOdd(l.odd) : '—'}
                </span>
                {l.pernas.length > 0 && (
                  <ul className="pr-linha-pernas">
                    {l.pernas.map((p, j) => (
                      <li key={j}>
                        {p.mercado}: <b>{p.selecao}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          <p className="pr-bilhete-rodape">
            Código {lido.codigo} · lido em {formatarDia(diaDoTimestamp(lido.lido_em))}. São as seleções
            de quando o bilhete foi compartilhado — não provam que ele foi apostado.
          </p>
        </>
      )}
    </section>
  )
}
