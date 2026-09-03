import { useMemo, useState } from 'react'
import { lerArquivo, letraColuna, pareceCabecalho } from '../../../lib/planilha.js'
import { colunaProvavel, processarMatriz } from '../lib/prefixar.js'
import { baixarCSV, baixarXLSX, nomeComData } from '../../../lib/exportar.js'
import Resumo from '../../../shell/Resumo.jsx'
import AreaUpload from '../../../shell/AreaUpload.jsx'

const LINHAS_PREVIA = 12

export default function PainelArquivo({ prefixo }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [temCabecalho, setTemCabecalho] = useState(false)
  const [coluna, setColuna] = useState(0)
  const [modo, setModo] = useState('nova')
  const [nomeColuna, setNomeColuna] = useState('')

  async function carregar(file) {
    if (!file) return
    setCarregando(true)
    setErro('')
    try {
      const lido = await lerArquivo(file)
      const comCabecalho = pareceCabecalho(lido.linhas)
      const corpo = comCabecalho ? lido.linhas.slice(1) : lido.linhas
      setDados(lido)
      setTemCabecalho(comCabecalho)
      setColuna(colunaProvavel(corpo, prefixo))
      setNomeColuna('')
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

  const nomeOriginal = cabecalho?.[coluna]?.trim()
  const nomeSugerido = nomeOriginal ? `${nomeOriginal}_prefixado` : 'id_prefixado'
  const nomeFinal = nomeColuna.trim() || nomeSugerido

  const saida = useMemo(
    () => processarMatriz(corpo, { coluna, prefixo, modo, nomeNovaColuna: nomeFinal, cabecalho }),
    [corpo, coluna, prefixo, modo, nomeFinal, cabecalho],
  )

  const base = (dados?.nome ?? 'arquivo').replace(/\.[^.]+$/, '') + '_prefixado'
  const largura = corpo.length ? Math.max(...corpo.map((l) => l.length)) : 0

  if (!dados) {
    return (
      <div className="pf-painel">
        <div className="pf-coluna larga">
          <AreaUpload onArquivo={carregar} carregando={carregando} erro={erro} />
        </div>
      </div>
    )
  }

  const inicioPrevia = cabecalho ? 1 : 0

  return (
    <div className="pf-painel">
      <div className="pf-coluna">
        <div className="pf-bloco">
          <div className="pf-bloco-topo">
            <h3>{dados.nome}</h3>
            <button type="button" className="pf-link" onClick={() => setDados(null)}>
              trocar arquivo
            </button>
          </div>

          <div className="pf-campos">
            <label className="pf-campo">
              <span>Coluna com os números</span>
              <select
                className="pf-input"
                value={coluna}
                onChange={(e) => { setColuna(Number(e.target.value)); setNomeColuna('') }}
              >
                {Array.from({ length: largura }, (_, i) => (
                  <option key={i} value={i}>
                    {cabecalho?.[i]?.trim()
                      ? `${cabecalho[i]} (coluna ${letraColuna(i)})`
                      : `Coluna ${letraColuna(i)}`}
                    {corpo[0] ? ` — ex.: ${corpo[0][i] || '—'}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="pf-check">
              <input
                type="checkbox"
                checked={temCabecalho}
                onChange={(e) => setTemCabecalho(e.target.checked)}
              />
              A primeira linha é cabeçalho
            </label>

            <div className="pf-campo">
              <span>O que fazer com a coluna</span>
              <div className="pf-radios">
                <label className="pf-check">
                  <input
                    type="radio"
                    name="pf-modo"
                    checked={modo === 'nova'}
                    onChange={() => setModo('nova')}
                  />
                  Criar uma coluna nova ao lado
                </label>
                <label className="pf-check">
                  <input
                    type="radio"
                    name="pf-modo"
                    checked={modo === 'substituir'}
                    onChange={() => setModo('substituir')}
                  />
                  Substituir os valores na própria coluna
                </label>
              </div>
            </div>

            {modo === 'nova' && cabecalho && (
              <label className="pf-campo">
                <span>Nome da coluna nova</span>
                <input
                  className="pf-input"
                  value={nomeColuna}
                  spellCheck={false}
                  placeholder={nomeSugerido}
                  onChange={(e) => setNomeColuna(e.target.value)}
                />
              </label>
            )}
          </div>

          <div className="pf-acoes">
            <div className="pf-acoes-dir">
              <button
                type="button"
                className="pf-btn"
                onClick={() => baixarCSV(nomeComData(base, 'csv'), saida.linhas)}
              >
                Baixar CSV
              </button>
              <button
                type="button"
                className="pf-btn primario"
                onClick={() => baixarXLSX(nomeComData(base, 'xlsx'), saida.linhas)}
              >
                Baixar XLSX
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="pf-coluna">
        <Resumo
          itens={[
            { label: 'linhas no arquivo', valor: corpo.length, sempre: true },
            { label: 'prefixadas', valor: saida.resumo.processados, sempre: true, tom: 'ok' },
            {
              label: 'linhas sem id (ignoradas)',
              valor: saida.resumo.vazios,
              tom: 'alerta',
              dica: 'Linhas em que a coluna escolhida estava vazia.',
            },
          ]}
        />

        <div className="pf-bloco pf-bloco-tabela">
          <div className="pf-bloco-topo">
            <h3>Prévia</h3>
            <span className="pf-hint">
              {LINHAS_PREVIA} primeiras linhas — o arquivo sai com todas
            </span>
          </div>

          <div className="pf-tabela-rolagem">
            <table className="pf-tabela">
              {cabecalho && (
                <thead>
                  <tr>
                    {saida.linhas[0].map((c, i) => (
                      <th key={i}>{c || letraColuna(i)}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {saida.linhas.slice(inicioPrevia, inicioPrevia + LINHAS_PREVIA).map((l, i) => (
                  <tr key={i}>
                    {l.map((c, j) => (
                      <td key={j} className={`mono${destaque(j, coluna, modo) ? ' forte' : ''}`}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// Qual célula da prévia é a que mudou: a coluna seguinte quando criamos uma
// nova, a própria quando substituímos.
function destaque(indice, coluna, modo) {
  return modo === 'nova' ? indice === coluna + 1 : indice === coluna
}
