// Ponto de entrada do Conversor. Usa o chrome compartilhado das ferramentas
// nativas (namespace `pf-`) mais os poucos estilos próprios da tela.
import '../../shell/ferramenta.css'
import './index.css'
import App from './App.jsx'

export default function ConversorModule() {
  return (
    <div className="m-ferramenta">
      <App />
    </div>
  )
}
