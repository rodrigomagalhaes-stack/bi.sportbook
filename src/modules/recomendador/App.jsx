import { useEffect, useMemo, useState } from 'react'
import Resumo from '../../shell/Resumo.jsx'
import { achatar, diagnostico } from './lib/historico.js'
import { preverFator, tabelaAprendida, treinar } from './lib/aprendizado.js'
import { apagarDica, buscarDias, buscarDicas, salvarDica } from './lib/dados.js'
import { apurar, compartilhamento, naoMarcadas, resumo } from './lib/comparacao.js'
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

// As vertentes em que uma boost é cadastrada. O modelo aprende cada uma
// separado: o que puxa volume no Sportsbook não é o que puxa no Tipster.
const CADASTROS = [
  { id: 'sportsbook', label: 'Sportsbook' },
  { id: 'tipster', label: 'Tipster' },
  { id: 'welcome', label: 'Welcome' },
]

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
  // Para qual vertente a boost vai ser cadastrada. Muda as dicas inteiras.
  const [cadastro, setCadastro] = useState('sportsbook')
  const [verAprendido, setVerAprendido] = useState(false)
  // Vertentes abertas além do top 5.
  const [expandidas, setExpandidas] = useState([])
  const [dicas, setDicas] = useState([])
  const [erroDicas, setErroDicas] = useState('')
  // Chave da dica sendo gravada, para o botão não aceitar dois cliques.
  const [gravando, setGravando] = useState(null)
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

    buscarDicas()
      .then((d) => vivo && setDicas(d || []))
      .catch((e) => vivo && setErroDicas(e.message))

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
  // O modelo é retreinado quando o histórico muda — que é a cada importação de
  // dia no Controle de Boost. Não há passo manual de "aprender".
  const modelo = useMemo(() => treinar(linhas), [linhas])
  const aprendido = useMemo(() => tabelaAprendida(modelo, { minAmostra: 2 }), [modelo])
  const diag = useMemo(() => diagnostico(linhas), [linhas])
  // O porte do confronto sai do mesmo modelo: fator de cada time, combinados
  // pela média geométrica, refinado pelo confronto exato quando ele já se
  // repetiu no histórico.
  const porte = useMemo(
    () => preverFator(modelo, dados?.evento?.competidores || []),
    [modelo, dados],
  )

  const { candidatos, single, betbuilder, noAr } = useMemo(
    () =>
      dados
        ? ranquear(dados, { modelo, vertente: cadastro, fator: porte.fator, lift })
        : { candidatos: [], single: [], betbuilder: [], noAr: [] },
    [dados, modelo, cadastro, porte, lift],
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

  // As dicas deste jogo, para o botão saber se já está marcada.
  const marcadaDe = (c) =>
    dicas.find(
      (d) =>
        String(d.event_id) === String(dados?.evento?.eventId) &&
        d.mercado === c.mercado &&
        d.selecao === c.rotulo,
    )

  /**
   * Marca ou desmarca uma dica.
   *
   * A previsão vai gravada como a tela a mostra AGORA, e não é recalculada na
   * comparação: recalcular avaliaria o modelo de hoje contra o resultado de
   * ontem — e a mediana de volume já teria absorvido aquele mesmo jogo, então
   * ele sempre pareceria certo.
   */
  const alternarMarca = async (c, posicao) => {
    if (gravando) return
    setGravando(c.chave)
    setErroDicas('')
    const jaMarcada = marcadaDe(c)
    try {
      if (jaMarcada) {
        await apagarDica(jaMarcada.id)
        setDicas((v) => v.filter((d) => d.id !== jaMarcada.id))
      } else {
        const [nova] = await salvarDica({
          event_id: dados.evento.eventId,
          event_name: dados.evento.eventName,
          champ_name: dados.evento.champName || null,
          event_start: dados.evento.startDate,
          vertente: c.vertente,
          familia: c.familia,
          mercado: c.mercado,
          selecao: c.rotulo,
          item_id: c.itemId ?? null,
          no_ar: c.noAr,
          odd_base: c.basePrice,
          odd_boost: c.price,
          prev_volume: c.volume.stake,
          prev_margem: c.margem.margemBoost,
          prev_custo: c.margem.custo,
          prev_resultado: c.ev,
          prev_amostra: c.volume.n,
          prev_fator: porte.fator,
          margem_estimada: c.margem.estimado,
          posicao,
        })
        if (nova) setDicas((v) => [nova, ...v])
      }
    } catch (e) {
      setErroDicas(e.message)
    } finally {
      setGravando(null)
    }
  }

  // ── o placar ────────────────────────────────────────────────────────────────
  const apuradas = useMemo(() => apurar(dicas, linhas), [dicas, linhas])
  const placar = useMemo(() => resumo(apuradas), [apuradas])
  const foraDoPlacar = useMemo(() => naoMarcadas(dicas, linhas), [dicas, linhas])

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
      {erroDicas && (
        <p className="pf-aviso">
          Não consegui gravar a marcação: {erroDicas} Se a tabela ainda não existe, aplique{' '}
          <code>supabase/boost_dicas.sql</code> no SQL Editor do Supabase.
        </p>
      )}
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
              <span>Cadastrar para</span>
              <div className="pf-abas">
                {CADASTROS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`pf-aba${cadastro === v.id ? ' ativa' : ''}`}
                    onClick={() => setCadastro(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </label>

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
              As dicas mudam com a vertente: o modelo aprendeu o que puxa volume em cada uma
              separadamente. A turbinada é a que você pretende aplicar — as boosts já no ar usam a
              odd turbinada real e não são afetadas por ela.
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
                marcadaDe={marcadaDe}
                onMarcar={alternarMarca}
                gravando={gravando}
              />
            ))
          )}

          <Aprendido
            modelo={modelo}
            linhas={aprendido}
            cadastro={cadastro}
            expandido={verAprendido}
            onExpandir={() => setVerAprendido((v) => !v)}
          />

          {noAr.length > 0 && (
            <JaNoAr
              candidatos={noAr}
              expandido={expandidas.includes('noar')}
              onExpandir={() => alternarExpansao('noar')}
            />
          )}

          <Placar
            placar={placar}
            apuradas={apuradas}
            fora={foraDoPlacar}
            temHistorico={Boolean(historico)}
          />

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
                corrigida pelo <strong>porte do confronto</strong>: {porte.fator.toFixed(2).replace('.', ',')}× o
                jogo mediano, aprendido de {porte.nivel.rotulo}
                {porte.n > 0 && ` sobre ${porte.n} boosts`}. Cada time tem o fator dele e os dois se
                combinam pela média geométrica — um time de 2× com um de 0,5× dá 1×, e não os 1,25×
                que a média aritmética daria. Confronto que já se repetiu refina isso por cima.
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
function BlocoVertente({ vertente, candidatos, expandido, onExpandir, marcadaDe, onMarcar, gravando }) {
  const visiveis = expandido ? candidatos : candidatos.slice(0, TOP)

  return (
    <div className="pf-bloco rb-vertente">
      <div className="pf-bloco-topo">
        <h3>
          {vertente.label}
          <span className="rb-vertente-cont">
            {candidatos.length
              ? `top ${Math.min(TOP, candidatos.length)} para subir`
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
              <Dica
                key={c.chave}
                c={c}
                posicao={i + 1}
                destaque={i === 0}
                marcada={Boolean(marcadaDe(c))}
                gravando={gravando === c.chave}
                onMarcar={() => onMarcar(c, i + 1)}
              />
            ))}
          </ol>
          <p className="pf-hint rb-vertente-nota">{vertente.descricao}</p>
        </>
      )}
    </div>
  )
}

// Uma dica. O número grande é o resultado esperado em reais — é a linguagem em
// que a boost é decidida. Odd, custo e volume ficam embaixo, menores, para
// conferir de onde o valor veio sem competir com ele.
function Dica({ c, posicao, destaque, marcada, gravando, onMarcar }) {
  return (
    <li className={`rb-dica${destaque ? ' destaque' : ''}`}>
      <span className="rb-dica-pos">{posicao}</span>

      <div className="rb-dica-corpo">
        {/* A dica é uma instrução, não um rótulo. Numa combinação, cada perna
            vem escrita por extenso — mercado e seleção — porque é assim que ela
            vai ser montada no back-office. */}
        <div className="rb-dica-nome">
          {c.pernas ? (
            c.pernas.map((perna, i) => (
              <span key={`${perna.market}|${perna.selection}`}>
                {i > 0 && <span className="rb-dica-mais"> + </span>}
                {perna.market} <strong>{perna.selection}</strong>
              </span>
            ))
          ) : (
            c.rotulo
          )}
        </div>
        <div className="rb-dica-mercado">
          {c.opcoes || c.pernas ? c.familiaLabel : c.mercado}
          {c.noAr && <span className="pf-tag">já no ar</span>}
          {c.betsLimit > 0 && <span className="pf-tag">trava {inteiro(c.betsLimit)}</span>}
          {c.isWelcome && <span className="pf-tag">welcome</span>}
          {c.oddEstimada && (
            <span
              className="pf-tag alerta"
              title="Não existe endpoint que precifique uma combinação nova. Esta odd sai do produto das pernas corrigido pelo desconto medido nas múltiplas que a casa publicou — em 33 delas a razão variou de 0,54 a 1,12. Confira o valor no back-office antes de subir."
            >
              odd a conferir
            </span>
          )}
          {c.margem.estimado && (
            <span className="pf-tag erro" title="O mercado não tem conjunto complementar para de-vigar; a margem assumida foi de 7% por perna.">
              margem estimada
            </span>
          )}
        </div>

        {/* Numa sugestão, TODAS as seleções do mercado dão a mesma margem e o
            mesmo volume — a conta de `candidatoDeMercado` mostra que o preço
            base se cancela. Então a tela não escolhe uma: lista as opções e
            deixa a escolha com quem conhece o jogo. */}
        {c.opcoes && (
          <div className="rb-dica-opcoes">
            {c.opcoes.map((o) => (
              <span key={o.selecao}>
                {o.selecao}{' '}
                <strong className="mono">
                  {odd(o.basePrice)}
                  <span className="pf-seta">→</span>
                  {odd(o.price)}
                </strong>
              </span>
            ))}
            {c.opcoesOcultas > 0 && <span>+{c.opcoesOcultas} outras linhas</span>}
          </div>
        )}

        <div className="rb-dica-detalhe">
          {!c.opcoes && (
            <span>
              odd <strong className="mono">{odd(c.basePrice)}</strong>
              <span className="pf-seta"> → </span>
              <strong className="mono">{odd(c.price)}</strong>
            </span>
          )}
          <span>
            entrega <strong className="mono">{pp(c.margem.custo)}</strong> de margem
          </span>
          <span>
            volume esperado <strong className="mono">{moeda(c.volume.stake)}</strong>
          </span>
          {/* De onde a estimativa de volume veio. "Tipster · Escanteios" vale
              muito mais que "todas as boosts", e sem dizer qual dos dois foi o
              número não dá para julgar. */}
          <span
            className={c.volume.confianca.tom === 'erro' ? 'rb-fraco' : undefined}
            title="O nível do modelo que informou a estimativa e quantas boosts o sustentam."
          >
            {c.volume.nivel
              ? `aprendido de ${c.volume.nivel.rotulo} · ${c.volume.n} boosts`
              : 'sem histórico'}
          </span>
        </div>
      </div>

      <div className="rb-dica-fim">
        <div className={`rb-dica-valor ${sinal(c.ev)}`}>
          <strong>{moeda(c.ev)}</strong>
          <span>resultado esperado</span>
        </div>
        {/* Marcar congela esta previsão. Depois, quando o dia for importado no
            Controle de Boost, o placar compara o que foi previsto aqui com
            o que a boost de fato puxou. */}
        <button
          type="button"
          className={`pf-btn rb-marcar${marcada ? ' marcada' : ''}`}
          onClick={onMarcar}
          disabled={gravando}
          title={
            marcada
              ? 'Esta dica está no placar. Clique para tirar.'
              : 'Marque se você subiu esta boost — a previsão fica gravada e o placar compara com o resultado.'
          }
        >
          {gravando ? '…' : marcada ? '✓ subi essa' : 'subi essa'}
        </button>
      </div>
    </li>
  )
}

// O que o modelo aprendeu, em tabela.
//
// Existe para a recomendação não ser uma caixa preta: dá para conferir de onde
// veio cada estimativa e, principalmente, VER a diferença entre Sportsbook e
// Tipster — que é o que separa "regra" de "aprendido". Nada aqui está escrito
// no código; tudo é mediana medida sobre o `boost_days`.
function Aprendido({ modelo, linhas, cadastro, expandido, onExpandir }) {
  const daVertente = linhas.filter((l) => l.vertente === cadastro)
  const visiveis = expandido ? linhas : daVertente.slice(0, 6)

  return (
    <div className="pf-bloco pf-bloco-tabela">
      <div className="pf-bloco-topo">
        <h3>
          O que ele aprendeu
          <span className="rb-vertente-cont">
            {modelo.total.toLocaleString('pt-BR')} boosts no histórico
            {modelo.comOdd > 0
              ? ` · ${modelo.comOdd.toLocaleString('pt-BR')} com a odd`
              : ' · nenhuma com a odd ainda'}
          </span>
        </h3>
        <button type="button" className="pf-link" onClick={onExpandir}>
          {expandido ? `ver só ${cadastro}` : 'ver todas as vertentes'}
        </button>
      </div>

      {!linhas.length ? (
        <p className="pf-vazio">
          Ainda não há histórico suficiente. Cada dia importado no Controle de Boost alimenta
          este modelo — não existe passo manual de treino.
        </p>
      ) : (
        <>
          <div className="pf-tabela-rolagem">
            <table className="pf-tabela">
              <thead>
                <tr>
                  <th>Vertente</th>
                  <th>Mercado</th>
                  <th className="num">Volume mediano</th>
                  <th className="num">Apostas</th>
                  <th className="num">Boosts</th>
                  <th className="num">ROI realizado</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={`${l.vertente}|${l.familia}`}>
                    <td className={l.vertente === cadastro ? 'forte' : undefined}>{l.vertente}</td>
                    <td>{l.familiaLabel}</td>
                    <td className="num mono forte">{moeda(l.stake)}</td>
                    <td className="num mono">{inteiro(l.apostas)}</td>
                    <td className="num">
                      <span className={`pf-tag${l.n >= 12 ? ' ok' : l.n >= 5 ? '' : ' alerta'}`}>
                        {l.n}
                      </span>
                    </td>
                    <td className={`num mono ${sinal(l.roi)}`}>{pct(l.roi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="pf-hint rb-vertente-nota">
            Volume mediano é a mediana do stake que aquela combinação puxou — mediana e não média
            porque um clássico sozinho distorceria a média. O <strong>ROI realizado</strong> está
            aqui como conferência e <strong>não entra no ranking</strong>: com esta amostra ele é
            quase todo sorte.
            {modelo.comOdd === 0 && (
              <>
                {' '}A faixa de odd ainda não afina nada — o Controle de Boost passou a gravar a
                odd agora, e a dimensão vai ligar sozinha conforme os dias forem importados.
              </>
            )}
          </p>
        </>
      )}
    </div>
  )
}

// As boosts que a casa já publicou neste jogo.
//
// Ficam fora das dicas de propósito: uma boost que já está no ar ocupando uma
// das cinco vagas é uma dica que não dá para agir. Aqui elas continuam servindo
// de conferência — dá para ver se alguma está entregando margem demais.
function JaNoAr({ candidatos, expandido, onExpandir }) {
  const visiveis = expandido ? candidatos : candidatos.slice(0, 3)
  return (
    <div className="pf-bloco pf-bloco-tabela">
      <div className="pf-bloco-topo">
        <h3>
          Já no ar neste jogo
          <span className="rb-vertente-cont">{candidatos.length} boosts publicadas</span>
        </h3>
        {candidatos.length > 3 && (
          <button type="button" className="pf-link" onClick={onExpandir}>
            {expandido ? 'mostrar só as 3 primeiras' : `ver as ${candidatos.length}`}
          </button>
        )}
      </div>

      <div className="pf-tabela-rolagem">
        <table className="pf-tabela">
          <thead>
            <tr>
              <th>Boost</th>
              <th className="num">Odd</th>
              <th className="num">Entrega</th>
              <th className="num">Margem final</th>
              <th className="num">Resultado esperado</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((c) => (
              <tr key={c.chave}>
                <td>
                  <span className="forte">{c.rotulo}</span>
                  <span className="rb-cand-sub">
                    {c.mercado}
                    {c.betsLimit > 0 && <span className="pf-tag">trava {inteiro(c.betsLimit)}</span>}
                    {c.margem.estimado && <span className="pf-tag erro">margem estimada</span>}
                  </span>
                </td>
                <td className="num mono">
                  {odd(c.basePrice)} → {odd(c.price)}
                </td>
                <td className="num mono">{pp(c.margem.custo)}</td>
                <td className={`num mono forte ${sinal(c.margem.margemBoost)}`}>
                  {pct(c.margem.margemBoost)}
                </td>
                <td className={`num mono forte ${sinal(c.ev)}`}>{moeda(c.ev)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── O PLACAR ─────────────────────────────────────────────────────────────────
// O que o recomendador previu contra o que aconteceu.
//
// Volume e resultado aparecem separados, e não somados num "acerto de X%": eles
// amadurecem em ritmos muito diferentes. O erro de volume vira sinal com poucas
// observações e é o que justifica mexer no modelo; o de resultado precisa de
// dezenas antes de significar algo, porque uma boost de odd alta ou paga muito
// ou não paga nada.
function Placar({ placar, apuradas, fora, temHistorico }) {
  const dividida = compartilhamento(apuradas)
  if (!placar.total) {
    return (
      <div className="pf-bloco">
        <div className="pf-bloco-topo">
          <h3>Placar do recomendador</h3>
        </div>
        <p className="pf-vazio">
          Marque <strong>subi essa</strong> nas dicas que você levar para o site. A previsão fica
          gravada como está agora e, quando você importar o dia no Controle de Boost, esta
          seção compara com o que a boost puxou de verdade.
        </p>
      </div>
    )
  }

  const fechadas = apuradas.filter((a) => a.status === 'apurada')
  const erro = placar.erroVolumeMediano

  return (
    <div className="pf-bloco">
      <div className="pf-bloco-topo">
        <h3>Placar do recomendador</h3>
        <span className="pf-hint">
          {placar.apuradas} apuradas · {placar.aguardando} aguardando o relatório
          {placar.naoApareceram > 0 && ` · ${placar.naoApareceram} não apareceram no relatório`}
        </span>
      </div>

      {!temHistorico && (
        <p className="pf-aviso">
          Sem o histórico de <em>boost_days</em> carregado não há com o que comparar.
        </p>
      )}

      <div className="rb-placar-topo">
        <div className="rb-placar-metrica">
          <span className="rb-mini-lbl">Erro de volume (mediana)</span>
          <strong className="rb-placar-val">
            {erro == null ? '—' : `${erro.toFixed(2).replace('.', ',')}×`}
          </strong>
          <span className="pf-hint">
            {erro == null
              ? 'nenhuma dica apurada ainda'
              : erro > 1
                ? `puxou ${erro.toFixed(2).replace('.', ',')}× o previsto — a estimativa está baixa`
                : `puxou ${erro.toFixed(2).replace('.', ',')}× o previsto — a estimativa está alta`}
            {placar.amostraVolume > 0 && ` · ${placar.amostraVolume} observações`}
          </span>
        </div>

        <div className="rb-placar-metrica">
          <span className="rb-mini-lbl">Resultado previsto × realizado</span>
          <strong className="rb-placar-val">
            {moeda(placar.previstoTotal)} <span className="pf-seta">→</span>{' '}
            <span className={sinal(placar.realizadoTotal)}>{moeda(placar.realizadoTotal)}</span>
          </strong>
          <span className="pf-hint">
            {placar.apuradas < 20
              ? `${placar.apuradas} boosts é pouco para isto significar algo — a variância de uma boost é maior que a diferença.`
              : 'amostra já dá para comparar.'}
          </span>
        </div>
      </div>

      {fechadas.length > 0 && (
        <div className="pf-tabela-rolagem">
          <table className="pf-tabela">
            <thead>
              <tr>
                <th>Dica</th>
                <th>Jogo</th>
                <th className="num">Volume previsto</th>
                <th className="num">Volume real</th>
                <th className="num">Erro</th>
                <th className="num">Resultado previsto</th>
                <th className="num">Net real</th>
              </tr>
            </thead>
            <tbody>
              {fechadas.map((a) => (
                <tr key={a.dica.id}>
                  <td>
                    <span className="forte">{a.dica.selecao}</span>
                    <span className="rb-cand-sub">{a.dica.mercado}</span>
                  </td>
                  <td>{a.dica.event_name}</td>
                  <td className="num mono">{moeda(a.dica.prev_volume)}</td>
                  <td className="num mono">
                    {moeda(a.realizado.stake)}
                    {dividida.get(a.chaveRealizado) > 1 && (
                      <span
                        className="pf-tag"
                        title="O relatório agrega por evento e mercado, sem separar a seleção. Este volume é do mercado inteiro, dividido com outra dica marcada — no placar acima ele conta uma vez só."
                      >
                        do mercado
                      </span>
                    )}
                  </td>
                  <td className="num mono">
                    {a.erroVolume == null ? '—' : `${a.erroVolume.toFixed(2).replace('.', ',')}×`}
                  </td>
                  <td className="num mono">{moeda(a.dica.prev_resultado)}</td>
                  <td className={`num mono forte ${sinal(a.realizado.net)}`}>
                    {moeda(a.realizado.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {fora.length > 0 && (
        <div className="rb-contraprova">
          <h4>Rodaram nos mesmos jogos e não foram marcadas</h4>
          <p className="pf-hint">
            A contraprova. Se só as marcadas entrassem no placar, nunca se saberia o que as boosts
            que o recomendador deixou de fora teriam rendido — e ele pareceria melhor do que é.
          </p>
          <div className="pf-tabela-rolagem">
            <table className="pf-tabela">
              <thead>
                <tr>
                  <th>Mercado</th>
                  <th>Jogo</th>
                  <th className="num">Stake</th>
                  <th className="num">Net</th>
                </tr>
              </thead>
              <tbody>
                {fora.slice(0, 10).map((l, i) => (
                  <tr key={`${l.date}-${l.event}-${l.market}-${i}`}>
                    <td>{l.market || '(sem nome)'}</td>
                    <td>{l.event}</td>
                    <td className="num mono">{moeda(l.stake)}</td>
                    <td className={`num mono forte ${sinal(l.net)}`}>{moeda(l.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
