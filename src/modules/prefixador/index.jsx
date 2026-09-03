// Ponto de entrada do módulo dentro do portal. O CSS aqui já nasce com o
// namespace `pf-` e usa as variáveis `--pb-*` do shell, então ele não precisa
// do escopo por PostCSS que Pick'em e Welcome Boost usam (ver vite.config.js).
import '../../shell/ferramenta.css'
import App from './App.jsx'

export default function PrefixadorModule() {
  return (
    <div className="m-ferramenta">
      <App />
    </div>
  )
}
