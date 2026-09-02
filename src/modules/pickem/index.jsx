// Ponto de entrada do módulo Pick'em dentro do portal. Substitui o main.jsx do
// projeto original: em vez de montar em #root, ele devolve o app embrulhado na
// classe que dá escopo ao CSS dele (ver vite.config.js).
import './index.css'
import App from './App.jsx'

export default function PickemModule() {
  return (
    <div className="m-pickem">
      <App />
    </div>
  )
}
