import { useMemo, useState } from 'react'
import { lerArquivo, letraColuna, pareceCabecalho } from '../../lib/planilha.js'
import { baixarCSV, baixarXLSX, copiar, nomeComData } from '../../lib/exportar.js'
import {
  acharColunaUsuario,
  acharColunaUtm,
  acharColunaValor,
  contarUtms,
  rankingParaMatriz,
} from './lib/ranking.js'
import AreaUpload from '../../shell/AreaUpload.jsx'
import Resumo from '../../shell/Resumo.jsx'

const TOPOS = [
  { valor: 5, label: 'Top 5' },
  { valor: 10, label: 'Top 10' },
  { valor: 25, label: 'Top 25' },
  { valor: 0, label: 'Todas' },
]

const inteiro = (n) => n.toLocaleString('pt-BR')
const pct = (n) => `${n.toFixed(1).replace('.', ',')}%`
const moeda = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function App() {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [temCabecalho, setTemCabecalho] = useState(true)
  const [coluna, setColuna] = useState(0)
  const [colunaUsuario, setColunaUsuario] = useState(-1)
  const [colunaValor, setColunaValor] = useState(-1)
  const [ignorarCaixa, setIgnorarCaixa] = useState(true)
  const [topo, setTopo] = useState(5)
  const [aviso, setAviso] = useState('')

  async function carregar(file) {
    setCarregando(true)
    setErro('')
    try {
      const lido = await lerArquivo(file)
      const comCabecalho = pareceCabecalho(lido.linhas)
      const cab = comCabecalho ? lido.linhas[0] : null
      const iUtm = acharColunaUtm(cab)

      setDados(lido)
      setTemCabecalho(comCabecalho)
      setColuna(iUtm >= 0 ? iUtm : 0)
      setColunaUsuario(acharColunaUsuario(cab))
      setColunaValor(acharColunaValor(cab))
      if (cab && iUtm < 0) {
        setErro('Não achei uma coluna de UTM pelo nome — escolha a coluna certa abaixo.')
      }
    } catch (e) {
      setDados(null)
      setErro(e?.message || 'Não consegui ler esse arquivo.')
    } finally {
      setCarregando(false)
    }
  }

  const cabecalho = temCabecalho && dados ? dados.linhas[0] : null
  const corpo = useMemo(() => {
    if (!dados) return []
    return temCabecalho ? dados.linhas.slice(1) : dados.linhas
  }, [dados, temCabecalho])

  const { ranking, resumo } = useMemo(
    () => contarUtms(corpo, { coluna, colunaUsuario, colunaValor, ignorarCaixa }),
    [corpo, coluna, colunaUsuario, colunaValor, ignorarCaixa],
  )

  if (!dados) {
    return (
      <div className="pf-pagina">
        <Cabecalho />
        <div className="pf-painel">
          <div className="pf-coluna larga">
            <AreaUpload
              onArquivo={carregar}
              carregando={carregando}
              erro={erro}
              titulo="Solte aqui o arquivo de bilhetes"
              dica="ou clique para escolher — aceita .csv, .txt, .xlsx e .xls"
            />
          </div>
        </div>
      </div>
    )
  }

  const comValor = colunaValor >= 0
  const comJogadores = colunaUsuario >= 0
  const largura = corpo.length ? Math.max(...corpo.map((l) => l.length)) : 0
  const visiveis = topo > 0 ? ranking.slice(0, topo) : ranking
  // A barra compara cada UTM com a líder — é a leitura de ranking. A fatia do
  // total continua na coluna de percentual, ao lado.
  const maior = ranking[0]?.bilhetes ?? 0
  const base = (dados.nome ?? 'arquivo').replace(/\.[^.]+$/, '') + '_utms'
  const matriz = rankingParaMatriz(ranking, { comValor, comJogadores })

  const avisar = (msg) => {
    setAviso(msg)
    setTimeout(() => setAviso(''), 2200)
  }

  const opcoesColuna = (comNenhuma) => (
    <>
      {comNenhuma && <option value={-1}>— não usar —</option>}
      {Array.from({ length: largura }, (_, i) => (
        <option key={i} value={i}>
          {cabecalho?.[i]?.trim() ? `${cabecalho[i]} (${letraColuna(i)})` : `Coluna ${letraColuna(i)}`}
        </option>
      ))}
    </>
  )

  return (
    <div className="pf-pagina">
      <Cabecalho />

      <div className="pf-barra">
        <div className="ur-arquivo">
          <strong>{dados.nome}</strong>
          <span>{inteiro(corpo.length)} linhas</span>
          <button type="button" className="pf-link" onClick={() => { setDados(null); setErro('') }}>
            trocar arquivo
          </button>
        </div>

        <div className="pf-abas">
          {TOPOS.map((t) => (
            <button
              key={t.valor}
              type="button"
              className={`pf-aba${topo === t.valor ? ' ativa' : ''}`}
              onClick={() => setTopo(t.valor)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {erro && <p className="pf-erro">{erro}</p>}

      <div className="pf-painel">
        <div className="pf-coluna larga">
          <div className="pf-bloco">
            <div className="ur-controles">
              <label className="pf-campo">
                <span>Coluna da UTM</span>
                <select
                  className="pf-input"
                  value={coluna}
                  onChange={(e) => setColuna(Number(e.target.value))}
                >
                  {opcoesColuna(false)}
                </select>
              </label>

              <label className="pf-campo">
                <span>Coluna do jogador (opcional)</span>
                <select
                  className="pf-input"
                  value={colunaUsuario}
                  onChange={(e) => setColunaUsuario(Number(e.target.value))}
                >
                  {opcoesColuna(true)}
                </select>
              </label>

              <label className="pf-campo">
                <span>Coluna do valor (opcional)</span>
                <select
                  className="pf-input"
                  value={colunaValor}
                  onChange={(e) => setColunaValor(Number(e.target.value))}
                >
                  {opcoesColuna(true)}
                </select>
              </label>

              <div className="ur-checks">
                <label className="pf-check">
                  <input
                    type="checkbox"
                    checked={temCabecalho}
                    onChange={(e) => setTemCabecalho(e.target.checked)}
                  />
                  A primeira linha é cabeçalho
                </label>
                <label className="pf-check">
                  <input
                    type="checkbox"
                    checked={ignorarCaixa}
                    onChange={(e) => setIgnorarCaixa(e.target.checked)}
                  />
                  Juntar maiúsculas e minúsculas
                </label>
              </div>
            </div>
          </div>

          <Resumo
            itens={[
              { label: 'bilhetes no arquivo', valor: resumo.linhas, sempre: true },
              {
                label: 'utms distintas',
                valor: resumo.distintas,
                sempre: true,
                tom: 'ok',
                dica: 'Quantas UTMs diferentes aparecem na coluna escolhida.',
              },
              {
                label: 'bilhetes sem utm',
                valor: resumo.semUtm,
                tom: 'alerta',
                dica: 'Linhas com a coluna de UTM vazia — ficam fora do ranking.',
              },
            ]}
          />

          <div className="pf-bloco pf-bloco-tabela">
            <div className="pf-bloco-topo">
              <h3>
                {topo > 0 ? `Top ${Math.min(topo, ranking.length)} UTMs` : 'Todas as UTMs'}
                {ranking.length > 0 && (
                  <span className="ur-concentracao">
                    as 5 primeiras somam {pct(resumo.pctTop5)} dos bilhetes com UTM
                  </span>
                )}
              </h3>

              <div className="pf-acoes-dir">
                <button
                  type="button"
                  className="pf-btn"
                  disabled={!visiveis.length}
                  onClick={async () => {
                    const texto = visiveis
                      .map((r) => `${r.posicao}. ${r.utm} — ${inteiro(r.bilhetes)} bilhetes (${pct(r.pct)})`)
                      .join('\n')
                    const ok = await copiar(texto)
                    avisar(ok ? 'ranking copiado' : 'não consegui copiar')
                  }}
                >
                  Copiar
                </button>
                <button
                  type="button"
                  className="pf-btn"
                  disabled={!ranking.length}
                  onClick={() => baixarCSV(nomeComData(base, 'csv'), matriz)}
                >
                  Baixar CSV
                </button>
                <button
                  type="button"
                  className="pf-btn primario"
                  disabled={!ranking.length}
                  onClick={() => baixarXLSX(nomeComData(base, 'xlsx'), matriz, 'UTMs')}
                >
                  Baixar XLSX
                </button>
              </div>
            </div>

            {ranking.length === 0 ? (
              <div className="pf-vazio">
                Nenhuma UTM preenchida nessa coluna. Confira se a coluna escolhida é a certa.
              </div>
            ) : (
              <div className="pf-tabela-rolagem">
                <table className="pf-tabela ur-tabela">
                  <thead>
                    <tr>
                      <th className="num">#</th>
                      <th>UTM</th>
                      <th className="num">Bilhetes</th>
                      <th className="ur-col-barra" />
                      <th className="num">% dos bilhetes</th>
                      {comJogadores && <th className="num">Jogadores</th>}
                      {comValor && <th className="num">Apostado</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((r) => (
                      <tr key={r.utm} className={r.posicao <= 3 ? 'ur-topo' : undefined}>
                        <td className="num ur-posicao">{r.posicao}</td>
                        <td className="mono forte">{r.utm}</td>
                        <td className="num forte">{inteiro(r.bilhetes)}</td>
                        <td className="ur-col-barra">
                          <div
                            className="ur-barra"
                            title={`${r.utm}: ${inteiro(r.bilhetes)} bilhetes (${pct(r.pct)})`}
                          >
                            <span style={{ width: `${maior ? (r.bilhetes / maior) * 100 : 0}%` }} />
                          </div>
                        </td>
                        <td className="num">{pct(r.pct)}</td>
                        {comJogadores && <td className="num">{inteiro(r.jogadores)}</td>}
                        {comValor && <td className="num">{moeda(r.valor)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {aviso && <p className="pf-aviso">{aviso}</p>}
        </div>
      </div>
    </div>
  )
}

function Cabecalho() {
  return (
    <div className="pf-intro">
      <h2>Ranking de UTMs</h2>
      <p>
        Sobe o arquivo de bilhetes e ele conta quantas vezes cada UTM aparece, do maior para o
        menor. Roda inteiro no navegador — nenhum dado sai daqui.
      </p>
    </div>
  )
}
