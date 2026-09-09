import { useCallback, useEffect, useState } from 'react'
import Resumo from '../../../shell/Resumo.jsx'
import { PERIODOS, periodoPara } from '../lib/filtros.js'
import { buscarIdsRepetidos } from '../lib/dados.js'
import { formatarDia, hojeISO } from '../lib/situacao.js'

const moeda = (n) => Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// "Tudo" precisa virar um intervalo, porque quem agrega é o banco e a função
// recebe duas datas. Estas duas bastam para qualquer histórico que esta tabela
// venha a ter.
const SEMPRE = { de: '2000-01-01', ate: '2999-12-31' }

/**
 * O mesmo jogador reembolsado em mais de um bilhete protegido.
 *
 * A contagem roda no banco, não aqui: um bilhete popular reembolsa milhares de
 * pessoas, e trazer as linhas de um mês inteiro para o navegador só para
 * agrupá-las seriam dezenas de MB a cada abertura de tela.
 *
 * Aparecer nesta lista NÃO é prova de nada. Seguir dois tipsters é normal, e a
 * proteção vale para os dois bilhetes. O que a tela entrega é a ponta do fio —
 * quem aparece em muitos bilhetes, de muitos tipsters, é onde vale olhar.
 */
export default function IdsRepetidos({ periodoInicial = 'mes' }) {
  const [periodo, setPeriodo] = useState(periodoInicial)
  const [linhas, setLinhas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const { de, ate } = periodoPara(periodo, hojeISO()) ?? SEMPRE
      setLinhas((await buscarIdsRepetidos(de, ate)) ?? [])
    } catch (e) {
      setErro(e?.message || 'Não consegui carregar o cruzamento.')
    } finally {
      setCarregando(false)
    }
  }, [periodo])

  useEffect(() => {
    carregar()
  }, [carregar])

  const total = linhas.reduce((s, l) => s + Number(l.total ?? 0), 0)
  const emVarios = linhas.filter((l) => l.tipsters > 1).length

  return (
    <>
      <div className="pf-barra">
        <div className="pf-abas">
          {PERIODOS.filter((p) => p.id !== 'custom').map((p) => (
            <button
              key={p.id}
              type="button"
              className={`pf-aba${periodo === p.id ? ' ativa' : ''}`}
              onClick={() => setPeriodo(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="pf-hint">por data do confronto</span>
      </div>

      {erro && <p className="pf-erro">{erro}</p>}

      <Resumo
        itens={[
          { label: 'jogadores em mais de um bilhete', valor: linhas.length, sempre: true, tom: 'alerta' },
          {
            label: 'destes, em bilhetes de tipsters diferentes',
            valor: emVarios,
            tom: 'erro',
            dica: 'Seguir dois tipsters é normal. Muitos tipsters, muitas vezes, já é outra conversa.',
          },
        ]}
      />

      <div className="pf-bloco pf-bloco-tabela">
        <div className="pf-bloco-topo">
          <h3>
            Jogadores reembolsados em mais de um bilhete
            {total > 0 && <span className="pr-sub">{moeda(total)} no total para eles</span>}
          </h3>
        </div>

        {carregando ? (
          <div className="pf-vazio">Cruzando as bases…</div>
        ) : linhas.length === 0 ? (
          <div className="pf-vazio">
            Ninguém apareceu em dois bilhetes diferentes neste período. Se ainda não há base paga
            anexada, não há o que cruzar.
          </div>
        ) : (
          <div className="pf-tabela-rolagem">
            <table className="pf-tabela">
              <thead>
                <tr>
                  <th>Jogador</th>
                  <th className="num">Bilhetes</th>
                  <th className="num">Tipsters</th>
                  <th className="num">Reembolsos</th>
                  <th className="num">Total recebido</th>
                  <th>Último confronto</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.usuario} className={l.tipsters > 1 ? 'pr-suspeito' : undefined}>
                    <td className="mono forte">{l.usuario}</td>
                    <td className="num forte">{l.bilhetes}</td>
                    <td className="num">{l.tipsters}</td>
                    <td className="num">{l.reembolsos}</td>
                    <td className="num">{moeda(l.total)}</td>
                    <td>{formatarDia(l.ultimo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
