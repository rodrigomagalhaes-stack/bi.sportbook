import { useEffect, useMemo, useState } from 'react'
import { supabase, authConfigurado } from '../lib/supabase'
import { AuthContext } from './authContext'

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null)
  // `carregando` cobre o instante em que o Supabase ainda está lendo a sessão
  // guardada no navegador. Sem isso a tela de login pisca a cada F5 de quem
  // já está logado.
  const [carregando, setCarregando] = useState(authConfigurado)

  useEffect(() => {
    if (!authConfigurado) return
    let vivo = true

    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return
      setSessao(data.session)
      setCarregando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessao(s)
      setCarregando(false)
    })

    return () => {
      vivo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const valor = useMemo(
    () => ({
      sessao,
      usuario: sessao?.user ?? null,
      carregando,
      // Sem credenciais de Supabase configuradas o portal não tem como validar
      // ninguém. Em vez de trancar todo mundo do lado de fora, ele libera o
      // acesso e mostra um aviso — ver RequireAuth e o banner do Shell.
      autenticado: authConfigurado ? Boolean(sessao) : true,
      authConfigurado,

      entrar: (email, senha) =>
        supabase.auth.signInWithPassword({ email, password: senha }),

      // Cria a conta no Supabase Auth. Depende de "Allow new users to sign up"
      // estar ligado no projeto; se estiver desligado, o retorno é um erro
      // ("Signups not allowed"), que a tela de login traduz.
      //
      // Quando a confirmação de e-mail está ativa, o Supabase devolve o
      // usuário SEM sessão e manda o e-mail — por isso quem chama precisa
      // olhar `data.session` antes de dar a pessoa por logada.
      cadastrar: (email, senha) =>
        supabase.auth.signUp({ email, password: senha }),

      sair: () => supabase.auth.signOut(),
    }),
    [sessao, carregando],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}
