import { useEffect, useState } from 'react'
import Icone from './Icone.jsx'

// A chave é a mesma que o index.html lê antes de pintar e que as telas
// embutidas leem dentro do iframe (public/apps/_shared/tema.js). Uma chave só
// é o que faz a escolha valer para o portal inteiro, e não por tela.
const CHAVE = 'eb-theme'

const atual = () =>
  document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'

export default function BotaoTema() {
  const [tema, setTema] = useState(atual)

  // O <html> já nasce com o atributo certo (script inline no index.html); aqui
  // só o mantemos em dia depois de cada clique.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema)
  }, [tema])

  function alternar() {
    const proximo = tema === 'dark' ? 'light' : 'dark'
    setTema(proximo)
    // Gravar no localStorage também avisa os iframes: o evento `storage`
    // dispara em todo documento de mesma origem, e é assim que as telas
    // embutidas trocam de tema junto, sem postMessage.
    try {
      localStorage.setItem(CHAVE, proximo)
    } catch {
      /* modo privativo, sessão sem storage: o tema vale só para esta aba */
    }
  }

  const escuro = tema === 'dark'

  return (
    <button
      type="button"
      className="pb-icon-btn"
      onClick={alternar}
      title={escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
      aria-label="Alternar tema"
    >
      <Icone nome={escuro ? 'lua' : 'sol'} size={16} />
    </button>
  )
}
