// Ponto de entrada do módulo Welcome Boost dentro do portal. Substitui o
// main.jsx do projeto original: em vez de montar em #root, devolve o app
// embrulhado na classe que dá escopo ao CSS dele (ver vite.config.js).
import './index.css'
import App from './App.jsx'

export default function WelcomeBoostModule() {
  return (
    <div className="m-welcome-boost">
      <App />
    </div>
  )
}
