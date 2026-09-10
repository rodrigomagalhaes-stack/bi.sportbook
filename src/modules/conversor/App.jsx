import { useMemo, useState } from 'react'
import AreaUpload from '../../shell/AreaUpload.jsx'
import Resumo from '../../shell/Resumo.jsx'
import { baixarCSV, baixarXLSX } from '../../lib/exportar.js'
import { letraColuna, pareceCabecalho } from '../../lib/planilha.js'
import {
  FORMATOS_ACEITOS,
  SEPARADORES,
  celulasDaMatriz,
  contarNumericas,
  lerArquivo,
  nomeBase,
  nomeDeAba,
  nomeDeArquivo,
  rotuloSeparador,
} from './lib/converter.js'

const LINHAS_PREVIA = 12
const COLUNAS_PREVIA = 40

// A tela existe em dois estados (sem arquivo e com arquivo) e cada um tem seu
// return; a introdução é a mesma nos dois, então mora fora do componente.
const INTRO = (
  <div className="pf-intro">
    <h2>Conversor de Planilhas</h2>
    <p>
      Sobe o arquivo e ele sai do outro lado: planilha vira csv, csv vira planilha. Ninguém escolhe
      a direção — ela vem da extensão do que subiu. Roda inteiro no navegador, nenhum arquivo sai
      daqui.
    </p>
  </div>
)

export default function App() {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [aba, setAba] = useState(0)
  const [separador, setSeparador] = useState(';')
  const [bom, setBom] = useState(true)
  const [numeros, setNumeros] = useState(true)
  const [formatar, setFormatar] = useState(true)
  const [aviso, setAviso] = useState('')

  async function carregar(file) {
    if (!file) return
    setCarregando(true)
    setErro('')
    setAviso('')
    try {
      const lido = await lerArquivo(file)
      setDados(lido)
      setAba(0)
    } catch (e) {
      setDados(null)
      setErro(e?.message || 'Não consegui ler esse arquivo.')
    } finally {
      setCarregando(false)
    }
  }

  const abaAtual = dados?.abas[aba] ?? null
  // useMemo para o `?? []` não devolver um array novo a cada render e refazer
  // a contagem lá embaixo à toa.
  const linhas = useMemo(() => abaAtual?.linhas ?? [], [abaAtual])
  const base = nomeBase(dados?.nome)

  // Só faz sentido contar o que viraria número quando o destino é xlsx — num
  // csv toda célula sai como texto de qualquer jeito.
  const viramNumero = useMemo(
    () => (dados?.destino === 'xlsx' && numeros ? contarNumericas(linhas) : 0),
    [dados?.destino, numeros, linhas],
  )

  if (!dados) {
    return (
      <div className="pf-pagina">
        {INTRO}
        <div className="pf-painel">
          <div className="pf-coluna larga">
            <AreaUpload
              onArquivo={carregar}
              carregando={carregando}
              erro={erro}
              titulo="Solte aqui a planilha ou o csv"
              formatos={FORMATOS_ACEITOS}
              dica="xlsx, xls e ods viram csv · csv, txt e tsv viram xlsx — a direção sai da extensão"
            />
          </div>
        </div>
      </div>
    )
  }

  // Um csv por aba: o formato não tem como guardar a segunda.
  function baixarUma(indice) {
    const alvo = dados.abas[indice]
    const sufixo = dados.abas.length > 1 ? ` - ${alvo.nome}` : ''
    const nome = nomeDeArquivo(base + sufixo, 'csv')
    baixarCSV(nome, alvo.linhas, { separador, bom })
    return nome
  }

  function baixarTodas() {
    // O navegador só topa vários downloads seguidos quando eles não saem no
    // mesmo instante — daí o intervalo entre um e outro.
    dados.abas.forEach((_, i) => setTimeout(() => baixarUma(i), i * 250))
    setAviso(`${dados.abas.length} arquivos csv baixados, um por aba.`)
  }

  function baixarPlanilha() {
    const nome = nomeDeArquivo(base, 'xlsx')
    // O cabeçalho que a planilha destaca é o mesmo que a prévia mostrou como
    // cabeçalho — nada de a formatação promover uma linha que a tela tratou
    // como dado.
    baixarXLSX(nome, celulasDaMatriz(linhas, { numeros }), nomeDeAba(base), {
      cabecalho: Boolean(cabecalho),
      formatar,
    })
    setAviso(`${nome} baixado.`)
  }

  const nomeSaida = nomeDeArquivo(
    base + (dados.destino === 'csv' && dados.abas.length > 1 ? ` - ${abaAtual.nome}` : ''),
    dados.destino,
  )

  const cabecalho = pareceCabecalho(linhas) ? linhas[0] : null
  const corpo = cabecalho ? linhas.slice(1) : linhas
  const largura = linhas[0]?.length ?? 0
  const colunasPrevia = Math.min(largura, COLUNAS_PREVIA)

  return (
    <div className="pf-pagina">
      {INTRO}
      <div className="pf-painel">
        <div className="pf-coluna">
          <div className="pf-bloco">
            <div className="pf-bloco-topo">
              <h3>Arquivo</h3>
              <button
                type="button"
                className="pf-link"
                onClick={() => {
                  setDados(null)
                  setAviso('')
                }}
              >
                trocar arquivo
              </button>
            </div>

            <div className="cv-rota">
              <span className="cv-arquivo" title={dados.nome}>
                {dados.nome}
              </span>
              <span className="pf-seta">→</span>
              <strong className="cv-arquivo cv-saida" title={nomeSaida}>
                {nomeSaida}
              </strong>
            </div>

            {dados.abas.length > 1 && (
              <div className="pf-campo">
                <span>Aba da planilha</span>
                <div className="pf-abas cv-abas">
                  {dados.abas.map((a, i) => (
                    <button
                      key={a.nome}
                      type="button"
                      className={`pf-aba${i === aba ? ' ativa' : ''}`}
                      onClick={() => setAba(i)}
                    >
                      {a.nome}
                      <span className="cv-conta">{a.linhas.length}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pf-campos">
              {dados.destino === 'csv' ? (
                <>
                  <label className="pf-campo">
                    <span>Separador do csv</span>
                    <select
                      className="pf-input"
                      value={separador}
                      onChange={(e) => setSeparador(e.target.value)}
                    >
                      {SEPARADORES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label} — {s.dica}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="pf-check">
                    <input type="checkbox" checked={bom} onChange={(e) => setBom(e.target.checked)} />
                    Abrir direto no Excel (BOM UTF-8, para os acentos saírem certos)
                  </label>
                </>
              ) : (
                <>
                  <label className="pf-check">
                    <input
                      type="checkbox"
                      checked={numeros}
                      onChange={(e) => setNumeros(e.target.checked)}
                    />
                    Reconhecer números — id com zero à esquerda continua texto
                  </label>

                  <label className="pf-check">
                    <input
                      type="checkbox"
                      checked={formatar}
                      onChange={(e) => setFormatar(e.target.checked)}
                    />
                    Formatar a planilha — cabeçalho destacado, filtro e colunas ajustadas
                  </label>
                </>
              )}
            </div>

            <div className="pf-acoes">
              {aviso && <p className="pf-aviso">{aviso}</p>}
              <div className="pf-acoes-dir">
                {dados.destino === 'csv' ? (
                  <>
                    {dados.abas.length > 1 && (
                      <button type="button" className="pf-btn" onClick={baixarTodas}>
                        Baixar as {dados.abas.length} abas
                      </button>
                    )}
                    <button
                      type="button"
                      className="pf-btn primario"
                      onClick={() => setAviso(`${baixarUma(aba)} baixado.`)}
                    >
                      Baixar CSV
                    </button>
                  </>
                ) : (
                  <button type="button" className="pf-btn primario" onClick={baixarPlanilha}>
                    Baixar XLSX
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="pf-coluna">
          <Resumo
            itens={[
              { label: 'linhas', valor: linhas.length, sempre: true },
              { label: 'colunas', valor: largura, sempre: true },
              { label: dados.abas.length > 1 ? 'abas na planilha' : '', valor: dados.abas.length },
              {
                label: 'células viram número',
                valor: viramNumero,
                tom: 'ok',
                dica: 'O resto sai como texto — é o que salva o id de virar 2,84e+07.',
              },
            ].filter((i) => i.label)}
          />

          {dados.codificacao === 'Windows-1252' && (
            <p className="cv-nota">
              O csv não estava em UTF-8: li como Windows-1252, o padrão do Excel em português, para os
              acentos não virarem símbolo.
            </p>
          )}

          <div className="pf-bloco pf-bloco-tabela">
            <div className="pf-bloco-topo">
              <h3>Prévia{dados.abas.length > 1 ? ` — ${abaAtual.nome}` : ''}</h3>
              <span className="pf-hint">
                {LINHAS_PREVIA} primeiras linhas
                {largura > colunasPrevia ? `, ${colunasPrevia} de ${largura} colunas` : ''} — o
                arquivo sai inteiro
                {dados.separadorOrigem ? ` · lido com ${rotuloSeparador(dados.separadorOrigem)}` : ''}
              </span>
            </div>

            <div className="pf-tabela-rolagem">
              <table className="pf-tabela">
                <thead>
                  <tr>
                    {Array.from({ length: colunasPrevia }, (_, i) => (
                      <th key={i}>{cabecalho?.[i]?.trim() || letraColuna(i)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {corpo.slice(0, LINHAS_PREVIA).map((l, i) => (
                    <tr key={i}>
                      {l.slice(0, colunasPrevia).map((c, j) => (
                        <td key={j} className="mono">
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
    </div>
  )
}
