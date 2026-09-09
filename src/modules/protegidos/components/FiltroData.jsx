import { PERIODOS } from '../lib/filtros.js'

/**
 * O filtro da caixa Paga.
 *
 * Filtra pela **data do confronto** — a que foi preenchida no cadastro, como
 * você pediu. Não pela data em que o pagamento foi marcado: essa é quando
 * alguém clicou no botão, e não diz respeito à rodada que se está conferindo.
 */
export default function FiltroData({ periodo, de, ate, aoMudar }) {
  return (
    <>
      <div className="pf-abas pr-abas-filtro">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`pf-aba${periodo === p.id ? ' ativa' : ''}`}
            onClick={() => aoMudar({ periodo: p.id, de, ate })}
          >
            {p.label}
          </button>
        ))}
      </div>

      {periodo === 'custom' && (
        <div className="pr-intervalo">
          <label className="pf-campo">
            <span>de</span>
            <input
              type="date"
              className="pf-input"
              value={de ?? ''}
              onChange={(e) => aoMudar({ periodo, de: e.target.value || null, ate })}
            />
          </label>
          <label className="pf-campo">
            <span>até</span>
            <input
              type="date"
              className="pf-input"
              value={ate ?? ''}
              onChange={(e) => aoMudar({ periodo, de, ate: e.target.value || null })}
            />
          </label>
        </div>
      )}
    </>
  )
}
