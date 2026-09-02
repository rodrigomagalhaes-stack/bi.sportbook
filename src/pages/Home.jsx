import { Link } from 'react-router-dom'
import { secoes } from '../shell/nav.js'
import Icone from '../shell/Icone.jsx'

export default function Home() {
  const grupos = secoes.filter((s) => s.id !== 'inicio')
  const total = grupos.reduce((n, s) => n + s.itens.length, 0)

  return (
    <div className="pb-home">
      <div className="pb-home-intro">
        <h2>Portal de ferramentas</h2>
        <p>
          {total} ferramentas de sportsbook, campanhas e operação reunidas em um único acesso.
        </p>
      </div>

      {grupos.map((secao) => (
        <section className="pb-home-secao" key={secao.id}>
          <h3>
            <Icone nome={secao.icone} size={14} />
            {secao.label}
          </h3>

          <div className="pb-cards">
            {secao.itens.map((item) => (
              <Link className="pb-card" to={item.to} key={item.to + item.label}>
                <div className="pb-card-topo">
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
