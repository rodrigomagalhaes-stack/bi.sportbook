import { createClient } from '@supabase/supabase-js'
import { supabase as clientePortal, authConfigurado } from '../../../lib/supabase'

// Variaveis proprias do Quiz, e nao as VITE_SUPABASE_* do portal: as tabelas
// dele (pickem_eventos / pickem_entradas) podem morar em outro projeto
// Supabase. Enquanto estiverem vazias o modulo segue no modo "Local", que e o
// comportamento que ele ja tinha antes de entrar no portal — apontar para um
// banco sem o schema aplicado (supabase/pickem_schema.sql) e o que quebraria.
const supabaseUrl = import.meta.env.VITE_PICKEM_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_PICKEM_SUPABASE_ANON_KEY

// Quando o Quiz aponta para o mesmo projeto do login, ele usa o cliente do
// portal em vez de criar um segundo.
//
// Dois clientes do supabase-js sobre o mesmo projeto compartilham a chave de
// sessão no localStorage e ficam ambos renovando o token, o que dá corrida na
// hora do refresh. Reusar também é o que faz as consultas saírem assinadas
// pelo usuário logado — sem isso elas iriam como `anon` e, com o RLS ligado,
// não enxergariam nada.
const mesmoProjeto = authConfigurado && supabaseUrl === import.meta.env.VITE_SUPABASE_URL

export const supabase = mesmoProjeto
  ? clientePortal
  : supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null
