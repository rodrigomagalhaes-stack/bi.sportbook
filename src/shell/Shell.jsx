import { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { secoes, itemDaRota } from './nav.js'
import Icone from './Icone.jsx'

const semAcento = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function Shell() {
  const { pathname } = useLocation()
  const { usuario, sair, authConfigurado } = useAuth()
  const [recolhida, setRecolhida] = useState(false)
  const [busca, setBusca] = useState('')
  const [fechadas, setFechadas] = useState(() => new Set())

  const atual = itemDaRota(pathname)

  const filtradas = useMemo(() => {
    const q = semAcento(busca.trim())
    if (!q) return secoes
    return secoes
      .map((s) => ({ ...s, itens: s.itens.filter((i) => semAcento(i.label).includes(q)) }))
      .filter((s) => s.itens.length > 0)
  }, [busca])

  const alternarSecao = (id) =>
    setFechadas((antes) => {
      const nova = new Set(antes)
      nova.has(id) ? nova.delete(id) : nova.add(id)
      return nova
    })

  const iniciais = (usuario?.email ?? 'EB').slice(0, 2).toUpperCase()

  return (
    <div className={`pb-shell${recolhida ? ' recolhida' : ''}`}>
      <aside className="pb-sidebar">
        <div className="pb-marca">
          <div className="pb-marca-badge">EB</div>
          <div className="pb-marca-txt">
            <strong>ESPORTIVA BET</strong>
            <span>BI Sportsbook</span>
          </div>
          <button
            className="pb-recolher"
            onClick={() => setRecolhida((r) => !r)}
            title={recolhida ? 'Expandir menu' : 'Recolher menu'}
            aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
          >
            <Icone nome="seta" size={15} />
          </button>
        </div>

        <div className="pb-busca">
          <Icone nome="lupa" size={14} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar..."
            aria-label="Buscar ferramenta"
          />
        </div>

        <nav className="pb-nav">
          {filtradas.map((secao) => {
            const aberta = !fechadas.has(secao.id) || Boolean(busca)
            return (
              <div key={secao.id} className="pb-secao">
                <button className="pb-secao-cab" onClick={() => alternarSecao(secao.id)}>
                  <Icone nome={secao.icone} size={16} />
                  <span className="pb-secao-label">{secao.label}</span>
                  <span className={`pb-chevron${aberta ? ' aberta' : ''}`}>
                    <Icone nome="seta" size={13} />
                  </span>
                </button>

                {aberta && (
                  <div className="pb-secao-itens">
                    {secao.itens.map((item) => (
                      <NavLink
                        key={item.to + item.label}
                        to={item.to}
                        end={Boolean(item.exato)}
                        className={({ isActive }) => `pb-item${isActive ? ' ativo' : ''}`}
                        title={item.label}
                      >
                        <span className="pb-item-marca" />
                        <span className="pb-item-txt">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {filtradas.length === 0 && <p className="pb-nav-vazio">Nada encontrado.</p>}
        </nav>
      </aside>

      <div className="pb-principal">
        <header className="pb-topo">
          <div className="pb-topo-titulo">
            <span className="pb-topo-secao">{atual?.secao ?? 'Portal'}</span>
            <h1>{atual?.label ?? 'BI Sportsbook'}</h1>
          </div>

          <div className="pb-topo-dir">
            {!authConfigurado && (
              <span className="pb-topo-aviso" title="Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY">
                sem autenticação
              </span>
            )}
            <div className="pb-avatar" title={usuario?.email ?? 'Visitante'}>{iniciais}</div>
            {authConfigurado && (
              <button className="pb-sair" onClick={sair} title="Sair">
                <Icone nome="sair" size={16} />
              </button>
            )}
          </div>
        </header>

        <main className="pb-conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
