// Cliente Supabase do portal — usado só para autenticação (sessão única para
// todos os módulos). Os módulos continuam falando com o banco do jeito deles:
// o Welcome Boost pela REST em modules/welcome-boost/lib/api.js e o Pick'em
// pelo cliente próprio em modules/pickem/lib/supabase.js.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const authConfigurado = Boolean(url && anonKey)

export const supabase = authConfigurado
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
