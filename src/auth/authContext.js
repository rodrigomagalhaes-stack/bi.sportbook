import { createContext } from 'react'

// O contexto mora fora do AuthProvider.jsx porque um arquivo .jsx que exporta
// componente e valor ao mesmo tempo derruba o Fast Refresh do Vite.
export const AuthContext = createContext(null)
