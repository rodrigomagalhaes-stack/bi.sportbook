// Acesso à API REST do Supabase assinado com o usuário logado.
//
// Com o RLS ligado (supabase/rls.sql), a chave anon não enxerga mais nada: para
// o Postgres ela é o papel `anon`, e a única política que existe é para
// `authenticated`. Quem precisa assinar a requisição é a pessoa. A chave anon
// continua indo no header `apikey`, que é o que identifica o projeto.
//
// O Welcome Boost tem uma cópia disto em modules/welcome-boost/lib/api.js, de
// quando era o único módulo a falar REST na mão. Módulo novo usa este.
import { supabase } from './supabase.js'

const URL = import.meta.env.VITE_SUPABASE_URL
const CHAVE = import.meta.env.VITE_SUPABASE_ANON_KEY

const tokenDoUsuario = async () => {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** Quem está logado, para carimbar autoria em quem grava. */
export async function usuarioAtual() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.email ?? null
}

export async function rest(caminho, { method = 'GET', body, headers = {} } = {}) {
  if (!URL || !CHAVE) throw new Error('Supabase não configurado neste ambiente.')
  const token = await tokenDoUsuario()
  const res = await fetch(`${URL}/rest/v1/${caminho}`, {
    method,
    headers: {
      apikey: CHAVE,
      Authorization: `Bearer ${token ?? CHAVE}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const detalhe = await res.text()
    // Sem sessão o RLS devolve lista vazia ou 401 — dizer "erro 401" não ajuda
    // ninguém a entender que o caso é fazer login de novo.
    if (res.status === 401 || res.status === 403) {
      throw new Error('sua sessão expirou — entre no portal de novo para carregar os dados.')
    }
    throw new Error(detalhe || `erro ${res.status} na consulta ao Supabase`)
  }
  if (res.status === 204) return null
  return res.json()
}
