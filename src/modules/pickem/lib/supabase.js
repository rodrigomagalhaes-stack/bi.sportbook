import { createClient } from '@supabase/supabase-js'

// Variaveis proprias do Pick'em, e nao as VITE_SUPABASE_* do portal: as
// tabelas dele (pickem_eventos / pickem_entradas) podem morar em outro projeto
// Supabase. Enquanto estiverem vazias o modulo segue no modo "Local", que e o
// comportamento que ele ja tinha antes de entrar no portal — apontar para um
// banco sem o schema aplicado (supabase/schema.sql) e o que quebraria.
const supabaseUrl = import.meta.env.VITE_PICKEM_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_PICKEM_SUPABASE_ANON_KEY

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
