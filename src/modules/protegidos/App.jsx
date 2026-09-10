import { useCallback, useEffect, useMemo, useState } from 'react'
import Codigos from './components/Codigos.jsx'
import FiltroData from './components/FiltroData.jsx'
import IdsRepetidos from './components/IdsRepetidos.jsx'
import PainelAnalise from './components/PainelAnalise.jsx'
import PainelPagamento from './components/PainelPagamento.jsx'
import Quadro from './components/Quadro.jsx'
import { filtrar, ordenar, periodoPara, resumo } from './lib/filtros.js'
import { hojeISO, situacao } from './lib/situacao.js'
import { buscarBilhetes, reabrir } from './lib/dados.js'

const moeda = (n) => Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const inteiro = (n) => Number(n ?? 0).toLocaleString('pt-BR')

export default function App() {
  const [bilhetes, setBilhetes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [vista, setVista] = useState('quadros')
  const [aberto, setAberto] = useState(null)
  const [aviso, setAviso] = useState('')
  const [verRecusados, setVerRecusados] = useState(false)

  // O filtro da caixa Paga. A caixa A Pagar não tem: ela é fila de trabalho, e
  // um bilhete parado há três semanas — exatamente o que não pode ser
  // esquecido — sumiria dela se houvesse um recorte de data por padrão.
  const [filtro, setFiltro] = useState({ periodo: 'mes', de: null, ate: null })

  const hoje = hojeISO()

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      setBilhetes(await buscarBilhetes())
    } catch (e) {
      setErro(traduzir(e?.message))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  // O que chegou pelo formulário e ninguém analisou. Sem filtro de data pelo
  // mesmo motivo de A pagar: é fila de trabalho, e a mais antiga é a que mais
  // precisa aparecer.
  const pendentes = useMemo(
    () => ordenar(filtrar(bilhetes, { situacoes: ['pendente'] }, hoje), 'analise', hoje),
    [bilhetes, hoje],
  )

  const aPagar = useMemo(() => {
    const situacoes = verRecusados
      ? ['aguardando', 'liberado', 'recusado']
      : ['aguardando', 'liberado']
    return ordenar(filtrar(bilhetes, { situacoes }, hoje), 'fila', hoje)
  }, [bilhetes, verRecusados, hoje])

  const pagas = useMemo(() => {
    const janela =
      filtro.periodo === 'custom'
        ? { de: filtro.de, ate: filtro.ate }
        : (periodoPara(filtro.periodo, hoje) ?? { de: null, ate: null })

    // `campoData: 'confronto'` é o ponto: o recorte é pela data que foi
    // preenchida no cadastro, não pelo dia em que alguém clicou em "pago".
    const lista = filtrar(bilhetes, { situacoes: ['pago'], ...janela, campoData: 'confronto' }, hoje)
    return ordenar(lista, 'confronto', hoje)
  }, [bilhetes, filtro, hoje])

  const totalAnalise = useMemo(() => resumo(pendentes, hoje), [pendentes, hoje])
  const totalPagar = useMemo(() => resumo(aPagar, hoje), [aPagar, hoje])
  const totalPagas = useMemo(() => resumo(pagas, hoje), [pagas, hoje])

  const recusados = useMemo(
    () => filtrar(bilhetes, { situacoes: ['recusado'] }, hoje).length,
    [bilhetes, hoje],
  )

  const avisar = (msg) => {
    setAviso(msg)
    setTimeout(() => setAviso(''), 2600)
  }

  return (
    <div className="pf-pagina">
      <div className="pf-barra">
        <div className="pf-intro pr-intro">
          <h2>Bingos Protegidos</h2>
        </div>

        <div className="pf-acoes-dir">
          <button
            type="button"
            className={`pf-btn${vista === 'ids' ? ' primario' : ''}`}
            onClick={() => setVista(vista === 'ids' ? 'quadros' : 'ids')}
          >
            IDs repetidos
          </button>
          <button type="button" className="pf-btn" onClick={carregar} disabled={carregando}>
            {carregando ? 'Carregando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      {erro && <p className="pf-erro">{erro}</p>}

      {vista === 'ids' ? (
        <IdsRepetidos />
      ) : carregando ? (
        <p className="pr-carregando">Carregando os bilhetes…</p>
      ) : (
        <>
          <Codigos />

          <div className="pr-quadros">
            <Quadro
              titulo="Solicitações"
              classe="pr-quadro-solicitacoes"
              contagem={pendentes.length}
              resumo={
                totalAnalise.analiseMaxima > 0
                  ? `a mais antiga espera há ${inteiro(totalAnalise.analiseMaxima)}d`
                  : pendentes.length > 0
                    ? 'todas enviadas hoje'
                    : ''
              }
              bilhetes={pendentes}
              hoje={hoje}
              aoAbrir={setAberto}
              vazio="Nenhuma solicitação esperando análise. Elas chegam pelo formulário dos tipsters."
            />

            <Quadro
              titulo="A pagar"
              contagem={aPagar.length}
              resumo={
                totalPagar.liberados > 0
                  ? `${inteiro(totalPagar.liberados)} liberado${totalPagar.liberados > 1 ? 's' : ''}`
                  : 'nenhum liberado ainda'
              }
              bilhetes={aPagar}
              hoje={hoje}
              aoAbrir={setAberto}
              vazio="Nenhum bilhete aprovado esperando pagamento."
            />

            <Quadro
              titulo="Paga"
              contagem={pagas.length}
              resumo={`${moeda(totalPagas.pago)} · ${inteiro(totalPagas.usuarios)} jogadores`}
              filtro={
                <FiltroData
                  periodo={filtro.periodo}
                  de={filtro.de}
                  ate={filtro.ate}
                  aoMudar={setFiltro}
                />
              }
              bilhetes={pagas}
              hoje={hoje}
              aoAbrir={setAberto}
              vazio="Nenhum bilhete pago com confronto neste período."
            />
          </div>

          {recusados > 0 && (
            <button
              type="button"
              className="pf-link pr-ver-recusados"
              onClick={() => setVerRecusados((v) => !v)}
            >
              {verRecusados ? 'esconder os recusados' : `ver os ${recusados} recusados`}
            </button>
          )}
        </>
      )}

      {aberto && situacao(aberto, hoje) === 'pendente' && (
        <PainelAnalise
          bilhete={aberto}
          aoFechar={() => setAberto(null)}
          aoConcluir={async (msg) => {
            setAberto(null)
            await carregar()
            avisar(msg)
          }}
        />
      )}

      {aberto && situacao(aberto, hoje) !== 'pendente' && (
        <PainelPagamento
          bilhete={aberto}
          hoje={hoje}
          aoFechar={() => setAberto(null)}
          aoReabrir={async (b) => {
            await reabrir(b.id)
            setAberto(null)
            await carregar()
            avisar('bilhete de volta em A pagar — a base anexada continua nele')
          }}
          aoConcluir={async () => {
            setAberto(null)
            await carregar()
            avisar('pagamento registrado')
          }}
        />
      )}

      {aviso && <p className="pf-aviso">{aviso}</p>}
    </div>
  )
}

function traduzir(msg) {
  const texto = String(msg ?? '')
  if (texto.includes('protegidos_') && texto.includes('does not exist')) {
    return 'As tabelas ainda não existem no banco. Rode supabase/protegidos.sql no SQL Editor do Supabase.'
  }
  return texto || 'Não consegui carregar os bilhetes.'
}
