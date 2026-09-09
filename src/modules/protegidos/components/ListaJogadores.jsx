import { useCallback, useEffect, useState } from 'react'
import Icone from '../../../shell/Icone.jsx'
import { buscarJogadores } from '../lib/dados.js'

const AMOSTRA = 200
const moeda = (n) => Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const inteiro = (n) => Number(n ?? 0).toLocaleString('pt-BR')

/**
 * Quem recebeu, com busca por um ID específico.
 *
 * A tela mostra uma AMOSTRA: uma base popular tem milhares de linhas, e trazer
 * todas para dentro do painel só para rolar a lista é peso sem uso. Quem precisa
 * de uma pessoa em particular usa a busca — e ela vai ao banco.
 *
 * Filtrar apenas o que já está carregado seria mais simples e responderia "não
 * achei" para alguém que está na base, logo abaixo do corte da amostra. Numa
 * conferência de pagamento essa é a pior resposta possível: parece prova de que
 * a pessoa não recebeu.
 */
export default function ListaJogadores({ bilheteId, total }) {
  const [termo, setTermo] = useState('')
  const [linhas, setLinhas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(
    async (busca) => {
      setCarregando(true)
      setErro('')
      try {
        setLinhas((await buscarJogadores(bilheteId, busca, AMOSTRA)) ?? [])
      } catch (e) {
        setErro(e?.message || 'Não consegui carregar os jogadores.')
      } finally {
        setCarregando(false)
      }
    },
    [bilheteId],
  )

  // Espera a digitação parar: sem isto, "esportivabetbr_321" dispara dezoito
  // consultas, e as respostas podem chegar fora de ordem.
  useEffect(() => {
    const t = setTimeout(() => carregar(termo), termo ? 300 : 0)
    return () => clearTimeout(t)
  }, [termo, carregar])

  const buscando = termo.trim().length > 0

  return (
    <div className="pr-jogadores">
      <div className="pr-jogadores-topo">
        <label className="pr-busca">
          <Icone nome="lupa" size={15} />
          <input
            type="search"
            value={termo}
            placeholder="procurar um ID nesta base"
            onChange={(e) => setTermo(e.target.value)}
          />
        </label>

        <span className="pr-jogadores-conta">
          {carregando
            ? 'procurando…'
            : buscando
              ? `${inteiro(linhas.length)} encontrado${linhas.length === 1 ? '' : 's'}`
              : total > linhas.length
                ? `${inteiro(linhas.length)} de ${inteiro(total)}`
                : `${inteiro(linhas.length)} jogadores`}
        </span>
      </div>

      {erro && <p className="pf-erro">{erro}</p>}

      {!carregando && linhas.length === 0 ? (
        <p className="pr-jogadores-vazio">
          {buscando
            ? 'Nenhum ID desta base casa com esse texto.'
            : 'Esta base não tem linhas gravadas.'}
        </p>
      ) : (
        <ul className="pr-jogadores-lista">
          {linhas.map((l) => (
            <li key={`${l.usuario}-${l.linha}`}>
              <span className="pr-jogador-id">{l.usuario}</span>
              <span className="pr-jogador-valor">{moeda(l.valor)}</span>
            </li>
          ))}
        </ul>
      )}

      {!buscando && !carregando && total > linhas.length && (
        <p className="pf-hint">
          Mostrando os {inteiro(linhas.length)} primeiros. A busca alcança a base inteira.
        </p>
      )}
    </div>
  )
}
