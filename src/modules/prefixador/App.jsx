import { useState } from 'react'
import PainelColar from './components/PainelColar.jsx'
import PainelArquivo from './components/PainelArquivo.jsx'
import { PREFIXO_PADRAO } from './lib/prefixar.js'

const ABAS = [
  { id: 'colar', label: 'Colar números' },
  { id: 'arquivo', label: 'Enviar arquivo' },
]

export default function App() {
  const [aba, setAba] = useState('colar')
  const [prefixo, setPrefixo] = useState(PREFIXO_PADRAO)

  return (
    <div className="pf-pagina">
      <div className="pf-intro">
        <h2>Prefixador de IDs</h2>
        <p>
          Cola a lista de números ou sobe a planilha: sai tudo com o prefixo na frente, pronto para
          copiar ou baixar em xlsx. Roda inteiro no navegador — nenhum id sai daqui.
        </p>
      </div>

      <div className="pf-barra">
        <div className="pf-abas">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`pf-aba${aba === a.id ? ' ativa' : ''}`}
              onClick={() => setAba(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="pf-prefixo">
          <label htmlFor="pf-prefixo-input">Prefixo</label>
          <input
            id="pf-prefixo-input"
            className="pf-input"
            value={prefixo}
            spellCheck={false}
            onChange={(e) => setPrefixo(e.target.value)}
            placeholder={PREFIXO_PADRAO}
          />
          {prefixo !== PREFIXO_PADRAO && (
            <button type="button" className="pf-link" onClick={() => setPrefixo(PREFIXO_PADRAO)}>
              restaurar padrão
            </button>
          )}
          <span className="pf-exemplo">
            28435851 <span className="pf-seta">→</span>
            <strong>{prefixo}28435851</strong>
          </span>
        </div>
      </div>

      {aba === 'colar' ? <PainelColar prefixo={prefixo} /> : <PainelArquivo prefixo={prefixo} />}
    </div>
  )
}
