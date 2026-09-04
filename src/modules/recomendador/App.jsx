import { useEffect, useMemo, useState } from 'react'
import Resumo from '../../shell/Resumo.jsx'
import { achatar, diagnostico, fatorDoJogo, porFamilia } from './lib/historico.js'
import { buscarDias } from './lib/dados.js'
import { TOP, VERTENTES, ranquear } from './lib/score.js'
import { filtrarJogos, idDoTexto } from './lib/busca.js'

const moeda = (n) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const inteiro = (n) => (n == null ? '—' : Math.round(n).toLocaleString('pt-BR'))
const pct = (n, casas = 1) => (n == null ? '—' : `${(n * 100).toFixed(casas).replace('.', ',')}%`)
const pp = (n) => (n == null ? '—' : `${(n * 100).toFixed(1).replace('.', ',')} pp`)
const odd = (n) => (n == null ? '—' : Number(n).toFixed(2).replace('.', ','))
const sinal = (n) => (n == null ? '' : n >= 0 ? 'ok' : 'erro')

const horario = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// O calendário do Altenar traz 1.665 jogos de futebol. Um <select> com todos
// existe, mas ninguém acha nada nele: quem manda é a busca, e a lista só mostra
// o que ela deixou passar. O teto evita montar mil e seiscentas <option> a cada
// tecla digitada.
const TETO_LISTA = 150

const LIFTS = [0.05, 0.1, 0.15, 0.2]

export default function App() {
  const [jogos, setJogos] = useState([])
  const [eventId, setEventId] = useState('')
  const [dados, setDados] = useState(null)
  const [historico, setHistorico] = useState(null)

  const [carregandoJogos, setCarregandoJogos] = useState(true)
  // O jogo cuja leitura já voltou — de sucesso ou de erro. "Está carregando" é
  // derivado disso, e não um estado escrito dentro do efeito: um setState
  // síncrono no corpo do efeito dispara uma renderização em cascata.
  const [resolvido, setResolvido] = useState(null)
  const [erro, setErro] = useState('')
  const [erroHistorico, setErroHistorico] = useState('')

  const [busca, setBusca] = useState('')
  const [soComBoost, setSoComBoost] = useState(false)
  const [idDigitado, setIdDigitado] = useState('')
  const [erroId, setErroId] = useState('')

  const [lift, setLift] = useState(0.1)
  // Vertentes abertas além do top 5.
  const [expandidas, setExpandidas] = useState([])
  const [verDiagnostico, setVerDiagnostico] = useState(false)

  // Os jogos em promoção e o histórico não dependem um do outro: as duas
  // leituras saem juntas, e a tela já mostra o que chegar primeiro.
  useEffect(() => {
    let vivo = true
    fetch('/api/recomendador/jogos')
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return
        if (d.erro) throw new Error(d.erro)
        setJogos(d.jogos || [])
        // Abre já com alguma coisa na tela, e o mais útil de ver é um jogo que
        // já tem boost no ar. Sem nenhum, o próximo do calendário serve.
        const inicial = d.jogos?.find((j) => j.qtdBoosts > 0) || d.jogos?.[0]
        if (inicial) setEventId(String(inicial.eventId))
      })
      .catch((e) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregandoJogos(false))

    buscarDias()
      .then((dias) => vivo && setHistorico(achatar(dias)))
      .catch((e) => vivo && setErroHistorico(e.message))

    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    if (!eventId) return
    let vivo = true
    fetch(`/api/recomendador/evento?eventId=${eventId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return
        if (d.erro) throw new Error(d.erro)
        setDados(d)
        setErro('')
      })
      .catch((e) => {
        if (!vivo) return
        setDados(null)
        setErro(e.message)
      })
      .finally(() => vivo && setResolvido(eventId))
    return () => {
      vivo = false
    }
  }, [eventId])

  const carregandoEvento = Boolean(eventId) && resolvido !== eventId

  // `historico || []` criava um array novo a cada render e refazia os três
  // useMemo abaixo sem necessidade.
  const linhas = useMemo(() => historico || [], [historico])
  const estatisticas = useMemo(() => porFamilia(linhas), [linhas])
  const diag = useMemo(() => diagnostico(linhas), [linhas])
  const porte = useMemo(
    () => fatorDoJogo(linhas, dados?.evento?.competidores || []),
    [linhas, dados],
  )

  const { candidatos, single, betbuilder } = useMemo(
    () =>
      dados
        ? ranquear(dados, { estatisticas, fator: porte.fator, lift })
        : { candidatos: [], single: [], betbuilder: [] },
    [dados, estatisticas, porte, lift],
  )
  const porVertente = { single, betbuilder }

  const filtrados = useMemo(
    () => filtrarJogos(jogos, { busca, soComBoost }),
    [jogos, busca, soComBoost],
  )

  // O jogo escolhido pode ter saído do filtro, ou ter vindo por ID e nem estar
  // no calendário. Nos dois casos ele precisa continuar no <select>: sem uma
  // opção que case com o valor, o campo mostraria a primeira da lista enquanto
  // a tela exibe os candidatos de outro jogo — foi assim que a busca por ID
  // pareceu estar abrindo a partida errada.
  const escolhido =
    jogos.find((j) => String(j.eventId) === String(eventId)) ||
    (dados?.evento && String(dados.evento.eventId) === String(eventId)
      ? {
          eventId: dados.evento.eventId,
          eventName: dados.evento.eventName,
          champName: dados.evento.champName,
          categoryName: dados.evento.categoryName,
          startDate: dados.evento.startDate,
          qtdBoosts: dados.boosts.length,
        }
      : null)
  const naLista =
    escolhido && !filtrados.some((j) => String(j.eventId) === String(escolhido.eventId))
      ? [escolhido, ...filtrados]
      : filtrados
  const listados = naLista.slice(0, TETO_LISTA)

  const abrirPorId = () => {
    const id = idDoTexto(idDigitado)
    if (!id) {
      setErroId('Não achei um ID aí. Vale o número (16462691), o final do endereço (le-16462691) ou a URL inteira do jogo.')
      return
    }
    setErroId('')
    setBusca('')
    setEventId(id)
  }

  const dias = new Set((historico || []).map((l) => l.date)).size

  // Que fatia das boosts DESTE jogo teve a margem medida de verdade, e não
  // assumida em 7%. É a pergunta mais importante da tela e ela não pode ficar
  // só na marca de cada linha: numa auditoria de 94 boosts reais, só 24%
  // fecharam com margem medida — mercado de marcador, de assistência e escada
  // de limiar por jogador não têm conjunto complementar para de-vigar.
  const dasBoosts = candidatos.filter((c) => c.tipo === 'boost')
  const medidas = dasBoosts.filter((c) => !c.margem.estimado).length
  const pctMedida = dasBoosts.length ? Math.round((medidas / dasBoosts.length) * 100) : 0

  const alternarExpansao = (id) =>
    setExpandidas((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))

  return (
    <div className="pf-pagina">
      <div className="pf-intro">
        <h2>Recomendador de Boosts</h2>
        <p>
          Escolha o jogo e a tela entrega as <strong>cinco melhores dicas</strong> de cada vertente,
          Single e Bet Builder, ordenadas pelo resultado esperado em reais — a margem que sobra
          depois da turbinada, multiplicada pelo volume que aquele mercado costuma puxar. A margem
          sai da própria odd, antes de a boost ir ao ar; o volume sai do histórico de{' '}
          <em>boost_days</em>. O lucro que cada mercado deu no passado aparece como conferência,
          nunca no ranking: com a amostra que existe, ele é quase todo sorte.
        </p>
      </div>

      <div className="pf-bloco rb-busca">
        <div className="rb-busca-campos">
          <label className="pf-campo rb-busca-texto">
            <span>Buscar jogo</span>
            <input
              className="pf-input"
              placeholder="time, campeonato ou país — ex.: flamengo, brasileirão"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>

          <label className="pf-campo rb-busca-lista">
            <span>
              Jogo
              {!carregandoJogos && ` · ${filtrados.length} de ${jogos.length}`}
            </span>
            <select
              className="pf-input"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              disabled={carregandoJogos}
            >
              {carregandoJogos && <option value="">carregando o calendário…</option>}
              {!carregandoJogos && !listados.length && <option value="">nenhum jogo com esse termo</option>}
              {listados.map((j) => (
                <option key={j.eventId} value={j.eventId}>
                  {j.qtdBoosts ? '● ' : ''}
                  {j.eventName} — {j.champName} · {horario(j.startDate)}
                </option>
              ))}
            </select>
          </label>

          <label className="pf-campo">
            <span>ou o ID do evento</span>
            <div className="rb-id">
              <input
                className="pf-input"
                inputMode="numeric"
                placeholder="16462690"
                value={idDigitado}
                onChange={(e) => setIdDigitado(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && abrirPorId()}
              />
              <button type="button" className="pf-btn primario" onClick={abrirPorId}>
                Abrir
              </button>
            </div>
          </label>
        </div>

        {erroId && <p className="pf-erro rb-erro-id">{erroId}</p>}

        <div className="rb-busca-rodape">
          <label className="pf-check">
            <input
              type="checkbox"
              checked={soComBoost}
              onChange={(e) => setSoComBoost(e.target.checked)}
            />
            Só jogos que já têm boost no ar
          </label>
          <span className="pf-hint">
            <strong>●</strong> marca quem já tem Super Odds publicada. O calendário vai umas seis
            semanas à frente; o campo de ID abre qualquer evento, mesmo fora dele.
            {filtrados.length > TETO_LISTA &&
              ` A lista mostra os ${TETO_LISTA} primeiros — refine a busca.`}
          </span>
        </div>
      </div>

      <div className="pf-barra">
        {/* Qual jogo está na tela, dito pela resposta do Altenar — não pelo que
            o seletor acha que está escolhido. É a confirmação de que o ID
            digitado abriu o que se queria. */}
        <div className="rb-carregado">
          {carregandoEvento ? (
            <span className="pf-hint">carregando…</span>
          ) : dados?.evento ? (
            <>
              <strong>{dados.evento.eventName}</strong>
              <span>
                {[dados.evento.champName, horario(dados.evento.startDate)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className="pf-tag">id {dados.evento.eventId}</span>
              {/* As odds se movem durante o dia, e a tela não recarrega
                  sozinha: sem a hora da leitura não dá para saber se o que
                  está na frente ainda vale. */}
              <span className="pf-hint">odds lidas {horario(dados.lidoEm)}</span>
            </>
          ) : (
            <span className="pf-hint">nenhum jogo carregado</span>
          )}
        </div>

        <span className="pf-hint">ordenado pelo resultado esperado em R$</span>
      </div>

      {erro && <p className="pf-erro">{erro}</p>}
      {erroHistorico && (
        <p className="pf-aviso">
          Não consegui ler o histórico de volume: {erroHistorico} O ranking continua mostrando
          margem e custo, que não dependem dele — só a coluna de volume fica vazia.
        </p>
      )}

      <div className="pf-painel">
        <div className="pf-coluna larga">
          <div className="pf-bloco rb-controles">
            <label className="pf-campo">
              <span>Turbinada pretendida</span>
              <div className="pf-abas">
                {LIFTS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`pf-aba${lift === l ? ' ativa' : ''}`}
                    onClick={() => setLift(l)}
                  >
                    +{Math.round(l * 100)}%
                  </button>
                ))}
              </div>
            </label>
            <p className="pf-hint">
              Quanto você pretende turbinar a odd nas dicas de <strong>subir</strong>. As que já
              estão no ar usam a odd turbinada real, e este botão não as afeta.
            </p>
          </div>

          <Resumo
            itens={[
              {
                label: '% das boosts com margem medida',
                valor: pctMedida,
                sempre: true,
                tom: pctMedida >= 60 ? 'ok' : 'alerta',
                dica: 'O resto usa a margem assumida de 7% por perna, porque o mercado não tem conjunto complementar para de-vigar (marcador, assistências, chutes por jogador). Nessas linhas a margem sai mais pessimista que a real.',
              },
              {
                label: 'dias de histórico',
                valor: dias,
                sempre: true,
                tom: dias >= 30 ? 'ok' : 'alerta',
                dica: 'Dias importados em boost_days. Quanto menos, mais frouxa a estimativa de volume.',
              },
              {
                label: '% do histórico classificado',
                valor: diag.pctClassificadas,
                sempre: true,
                tom: diag.pctClassificadas >= 70 ? 'ok' : 'alerta',
                dica: 'Quanto das linhas do histórico caiu numa família conhecida. Se cair muito, os rótulos da planilha mudaram.',
              },
            ]}
          />

          {carregandoEvento ? (
            <div className="pf-bloco">
              <p className="pf-vazio">Lendo as odds do jogo…</p>
            </div>
          ) : (
            VERTENTES.map((v) => (
              <BlocoVertente
                key={v.id}
                vertente={v}
                candidatos={porVertente[v.id] || []}
                expandido={expandidas.includes(v.id)}
                onExpandir={() => alternarExpansao(v.id)}
              />
            ))
          )}

          <div className="pf-bloco">
            <div className="pf-bloco-topo">
              <h3>Como ler estes números</h3>
              <button type="button" className="pf-link" onClick={() => setVerDiagnostico((v) => !v)}>
                {verDiagnostico ? 'esconder o diagnóstico' : 'ver o diagnóstico do histórico'}
              </button>
            </div>

            <ul className="rb-notas">
              <li>
                <strong>Resultado esperado</strong> é o número grande de cada dica: a margem que
                sobra depois da turbinada, vezes o volume que o mercado deve puxar. Negativo quer
                dizer que a boost paga mais do que a casa espera receber — o que pode ser
                exatamente a intenção, quando ela serve para trazer gente.
              </li>
              <li>
                <strong>Entrega X de margem</strong> é quanto da margem a boost dá ao apostador, por
                real apostado. É o número mais firme da tela: sai da distância entre a odd original
                e a turbinada e não depende de estimativa de volume nenhuma.
              </li>
              <li>
                <strong>Volume esperado</strong> é a mediana de stake da família neste tipo de jogo,
                corrigida pelo porte do confronto ({porte.fator.toFixed(2).replace('.', ',')}× o
                jogo mediano, de {porte.n} boosts destes times no histórico). Com amostra curta ele
                é um chute educado, e o número de boosts ao lado de cada dica diz o quanto.
              </li>
              <li>
                <strong>Bet Builder só lista o que já está no ar</strong>, e não sugere combinação
                nova. Para avaliar uma múltipla é preciso o preço que a casa daria à combinação, e
                multiplicar as pernas não serve: nas 33 múltiplas publicadas que foram medidas, a
                razão entre o preço publicado e o produto das pernas foi de 0,54 a 1,12 conforme as
                pernas se correlacionam. Com essa dispersão, um preço inventado erraria a margem por
                muito mais do que ela vale. As que já estão no ar têm o preço real da casa, e essas
                a tela avalia.
              </li>
              <li>
                Linha marcada <span className="pf-tag erro">estimado</span> é aquela em que o
                mercado não tem conjunto complementar para de-vigar — marcador (Primeiro / Último /
                Qualq. Altura acontecem juntas), assistências, resultado correto e as escadas de
                limiar por jogador (Mais de 0.5 / 1.5 / 2.5, sem o "menos de" do outro lado). Aí a
                margem assumida é de 7% por perna.
              </li>
              <li>
                <strong>O viés dessas linhas tem direção conhecida.</strong> Mercado de jogador
                costuma carregar mais margem que os 7% assumidos; assumindo menos, o sistema
                calcula uma probabilidade maior que a real e reporta <em>menos</em> margem e{' '}
                <em>mais</em> custo do que existe de fato. Ou seja: erra para o lado conservador,
                mas empurra as boosts de mercado de jogador para baixo no ranking.
              </li>
            </ul>

            {verDiagnostico && (
              <div className="rb-diagnostico">
                <p className="pf-hint">
                  {diag.classificadas.toLocaleString('pt-BR')} de {diag.total.toLocaleString('pt-BR')}{' '}
                  linhas do histórico caíram numa família conhecida. Os rótulos abaixo são os que
                  não caíram — se algum deles for um mercado que você turbina com frequência, ele
                  merece uma regra em <code>lib/familias.js</code>.
                </p>
                {diag.naoClassificados.length ? (
                  <table className="pf-tabela">
                    <thead>
                      <tr>
                        <th>Rótulo não classificado</th>
                        <th className="num">Linhas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diag.naoClassificados.map((r) => (
                        <tr key={r.market}>
                          <td className="mono">{r.market || '(vazio)'}</td>
                          <td className="num">{inteiro(r.n)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="pf-vazio">Todo o histórico foi classificado.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Um bloco por vertente, com as cinco melhores dicas dela.
//
// A primeira linha ganha corpo maior: é a resposta do bloco, e ler cinco linhas
// iguais para descobrir qual é a primeira seria trabalho à toa.
function BlocoVertente({ vertente, candidatos, expandido, onExpandir }) {
  const visiveis = expandido ? candidatos : candidatos.slice(0, TOP)
  const paraSubir = candidatos.filter((c) => !c.noAr).length

  return (
    <div className="pf-bloco rb-vertente">
      <div className="pf-bloco-topo">
        <h3>
          {vertente.label}
          <span className="rb-vertente-cont">
            {candidatos.length
              ? `${Math.min(TOP, candidatos.length)} de ${candidatos.length}`
              : 'nada a recomendar'}
          </span>
        </h3>
        {candidatos.length > TOP && (
          <button type="button" className="pf-link" onClick={onExpandir}>
            {expandido ? `mostrar só o top ${TOP}` : `ver as ${candidatos.length}`}
          </button>
        )}
      </div>

      {!candidatos.length ? (
        <p className="pf-vazio">{vertente.descricao}</p>
      ) : (
        <>
          <ol className="rb-dicas">
            {visiveis.map((c, i) => (
              <Dica key={c.chave} c={c} posicao={i + 1} destaque={i === 0} />
            ))}
          </ol>
          {!paraSubir && (
            <p className="pf-hint rb-vertente-nota">{vertente.descricao}</p>
          )}
        </>
      )}
    </div>
  )
}

// Uma dica. O número grande é o resultado esperado em reais — é a linguagem em
// que a boost é decidida. Odd, custo e volume ficam embaixo, menores, para
// conferir de onde o valor veio sem competir com ele.
function Dica({ c, posicao, destaque }) {
  return (
    <li className={`rb-dica${destaque ? ' destaque' : ''}`}>
      <span className="rb-dica-pos">{posicao}</span>

      <div className="rb-dica-corpo">
        <div className="rb-dica-nome">{c.rotulo}</div>
        <div className="rb-dica-mercado">
          {c.mercado}
          {c.noAr ? (
            <span className="pf-tag">já no ar</span>
          ) : (
            <span className="pf-tag ok">subir</span>
          )}
          {c.betsLimit > 0 && <span className="pf-tag">trava {inteiro(c.betsLimit)}</span>}
          {c.isWelcome && <span className="pf-tag">welcome</span>}
          {c.margem.estimado && (
            <span className="pf-tag erro" title="O mercado não tem conjunto complementar para de-vigar; a margem assumida foi de 7% por perna.">
              margem estimada
            </span>
          )}
        </div>

        <div className="rb-dica-detalhe">
          <span>
            odd <strong className="mono">{odd(c.basePrice)}</strong>
            <span className="pf-seta"> → </span>
            <strong className="mono">{odd(c.price)}</strong>
          </span>
          <span>
            entrega <strong className="mono">{pp(c.margem.custo)}</strong> de margem
          </span>
          <span>
            volume esperado <strong className="mono">{moeda(c.volume.stake)}</strong>
          </span>
          <span className={c.volume.confianca.tom === 'erro' ? 'rb-fraco' : undefined}>
            {c.volume.n ? `${c.volume.n} boosts no histórico` : 'sem histórico da família'}
            {c.volume.n > 0 && ` · ROI ${pct(c.volume.roiHistorico)}`}
          </span>
        </div>
      </div>

      <div className={`rb-dica-valor ${sinal(c.ev)}`}>
        <strong>{moeda(c.ev)}</strong>
        <span>resultado esperado</span>
      </div>
    </li>
  )
}
