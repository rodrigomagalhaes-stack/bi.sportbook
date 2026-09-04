import { Link } from 'react-router-dom'
import { secoes } from '../shell/nav.js'
import Icone from '../shell/Icone.jsx'

export default function Home() {
  const grupos = secoes.filter((s) => s.id !== 'inicio')
  const total = grupos.reduce((n, s) => n + s.itens.length, 0)

  return (
    <div className="pb-home">
      {/* O único número que esta tela tem de verdade é quantas ferramentas
          existem — e a barra ao lado é a divisão real delas por grupo, cada
          faixa proporcional ao tamanho do grupo. Nada aqui é estimado. */}
      <section className="pb-hero">
        <div className="pb-hero-num">
          <span className="pb-hero-rotulo">Portal de ferramentas</span>
          <span className="pb-hero-valor">
            {total}
            <small>ferramentas em {grupos.length} grupos</small>
          </span>
        </div>

        <div className="pb-hero-divisao">
          <div
            className="pb-barra"
            role="img"
            aria-label={grupos.map((s) => `${s.label}: ${s.itens.length}`).join(', ')}
          >
            {grupos.map((s) => (
              <span
                key={s.id}
                style={{
                  width: `${(s.itens.length / total) * 100}%`,
                  background: `var(--${s.cor})`,
                }}
              />
            ))}
          </div>

          <div className="pb-legenda">
            {grupos.map((s) => (
              <span className="pb-legenda-item" key={s.id}>
                <span className="pb-legenda-cor" style={{ background: `var(--${s.cor})` }} />
                {s.label} <b>{s.itens.length}</b>
              </span>
            ))}
          </div>
        </div>
      </section>

      {grupos.map((secao) => (
        <section className="pb-home-secao" key={secao.id}>
          <h3>
            <Icone nome={secao.icone} size={14} />
            {secao.label}
            <span className="pb-conta">{secao.itens.length}</span>
          </h3>

          <div className="pb-cards">
            {secao.itens.map((item) => (
              <Link
                className="pb-card"
                to={item.to}
                key={item.to + item.label}
                style={{ '--secao-cor': `var(--${secao.cor})` }}
              >
                <div className="pb-card-topo">
                  <span className="pb-card-ico">
                    <Icone nome={item.icone} size={16} />
                  </span>
                  <strong>{item.label}</strong>
                  <span className="pb-card-tipo">
                    {item.tipo === 'nativo' ? 'Integrado' : 'Embutido'}
                  </span>
                </div>
                <p>{item.desc}</p>
                {item.origem && <span className="pb-card-origem">{item.origem}</span>}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
