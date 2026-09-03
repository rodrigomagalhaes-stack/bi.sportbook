// Ponto de entrada do Ranking de UTMs. Usa o chrome compartilhado das
// ferramentas nativas (namespace `pf-`) mais o CSS próprio da tela.
import '../../shell/ferramenta.css'
import './index.css'
import App from './App.jsx'

export default function UtmRankingModule() {
  return (
    <div className="m-ferramenta">
      <App />
    </div>
  )
}
