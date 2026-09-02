import { useAuth } from './useAuth'
import LoginPage from './LoginPage'

export default function RequireAuth({ children }) {
  const { autenticado, carregando } = useAuth()

  if (carregando) {
    return (
      <div className="pb-boot">
        <div className="pb-boot-spinner" />
      </div>
    )
  }

  return autenticado ? children : <LoginPage />
}
