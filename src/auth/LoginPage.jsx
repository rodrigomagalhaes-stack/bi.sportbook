import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import './auth.css'

const FRASES = [
  {
    titulo: 'Jogo Responsável',
    texto: 'Lembre-se: você trabalha com vidas reais. Cada interação importa.',
    citacao: 'Por trás de cada aposta, há uma vida real. Seja empático e responsável.',
  },
  {
    titulo: 'Dado bom é dado conferido',
    texto: 'Antes de virar decisão, todo número passa por uma segunda leitura.',
    citacao: 'Um relatório errado vira uma escolha errada. Confira duas vezes.',
  },
  {
    titulo: 'Risco se vigia de perto',
    texto: 'Trava de bilhete esgotada é informação com hora marcada — quanto antes, melhor.',
    citacao: 'O que você percebe primeiro é o que dá tempo de corrigir.',
  },
]

// Domínios liberados no cadastro, separados por vírgula. Vazio = sem restrição.
//
// Isto aqui é conveniência, não segurança: serve para a pessoa descobrir na
// hora que o e-mail dela não serve, em vez de esperar o servidor recusar. Quem
// bloqueia de verdade é o hook "Before User Created" no Supabase — está em
// supabase/restringir_cadastro_por_dominio.sql, e sem ele esta validação é
// contornável por qualquer um que chame a API direto.
const DOMINIOS = (import.meta.env.VITE_DOMINIOS_PERMITIDOS || '')
  .split(',')
  .map((d) => d.trim().replace(/^@/, '').toLowerCase())
  .filter(Boolean)

const dominioAutorizado = (email) => {
  if (DOMINIOS.length === 0) return true
  const dominio = email.split('@')[1]?.toLowerCase()
  return Boolean(dominio) && DOMINIOS.includes(dominio)
}

const listaDominios = DOMINIOS.map((d) => '@' + d).join(', ')

// O Supabase responde em inglês e com frases que não dizem nada para quem está
// só tentando entrar. Cada uma destas tem uma ação clara do outro lado.
function traduzirErro(mensagem) {
  const m = (mensagem || '').toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar — procure a mensagem na caixa de entrada.'
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'Já existe uma conta com esse e-mail. Use "Entrar".'
  }
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return 'O cadastro está desativado no projeto do Supabase. Peça para ligarem "Allow new users to sign up".'
  }
  // O hook do Supabase já recusa em português ("Cadastro permitido apenas para
  // e-mails @esportiva.bet."), então essa mensagem passa direto. Este ramo é a
  // rede de segurança para quando a recusa vier genérica.
  if (m.includes('not allowed') && !m.includes('signups not allowed')) {
    return listaDominios
      ? `Cadastro permitido apenas para e-mails ${listaDominios}.`
      : 'Este e-mail não tem permissão para se cadastrar.'
  }
  if (m.includes('password should be at least')) {
    return 'A senha precisa ter pelo menos 6 caracteres.'
  }
  if (m.includes('for security purposes') || m.includes('rate limit')) {
    return 'Muitas tentativas seguidas. Espere alguns segundos e tente de novo.'
  }
  return mensagem
}

export default function LoginPage() {
  const { entrar, cadastrar, authConfigurado } = useAuth()

  // `#criar-conta` na URL abre direto no formulário de cadastro, para dar um
  // link pronto a quem ainda não tem acesso. O router não usa o hash.
  const [modo, setModo] = useState(() =>
    window.location.hash === '#criar-conta' ? 'cadastrar' : 'entrar',
  )
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [slide, setSlide] = useState(0)

  const criando = modo === 'cadastrar'

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % FRASES.length), 7000)
    return () => clearInterval(t)
  }, [])

  const trocarModo = () => {
    const proximo = criando ? 'entrar' : 'cadastrar'
    window.history.replaceState(null, '', proximo === 'cadastrar' ? '#criar-conta' : ' ')
    setModo(proximo)
    setErro('')
    setAviso('')
    setConfirmacao('')
  }

  const submeter = async (e) => {
    e.preventDefault()
    setErro('')
    setAviso('')

    if (criando) {
      if (!dominioAutorizado(email.trim())) {
        return setErro(`O cadastro é restrito a e-mails ${listaDominios}.`)
      }
      if (senha !== confirmacao) return setErro('As senhas não conferem.')
      if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.')
    }

    setEnviando(true)

    if (criando) {
      const { data, error } = await cadastrar(email.trim(), senha)
      if (error) {
        setErro(traduzirErro(error.message))
      } else if (data.session) {
        // Confirmação de e-mail desligada no projeto: já entrou. O
        // onAuthStateChange do AuthProvider troca a tela sozinho.
        setAviso('Conta criada. Entrando…')
      } else {
        setAviso(
          'Conta criada. Enviamos um e-mail de confirmação — confirme e depois entre por aqui.',
        )
        setModo('entrar')
        setSenha('')
        setConfirmacao('')
      }
    } else {
      const { error } = await entrar(email.trim(), senha)
      if (error) setErro(traduzirErro(error.message))
    }

    setEnviando(false)
  }

  const frase = FRASES[slide]

  return (
    <div className="pb-login">
      <div className="pb-login-form-side">
        <div className="pb-login-box">
          <div className="pb-login-logo">
            <span className="pb-login-logo-a">ESPORTIVA</span>
            <span className="pb-login-logo-b">BET</span>
          </div>

          <h1 className="pb-login-title">{criando ? 'Criar conta' : 'Entrar'}</h1>
          <p className="pb-login-sub">
            {criando
              ? 'Preencha os dados para criar seu acesso ao portal'
              : 'Digite suas credenciais para acessar o portal'}
          </p>

          {!authConfigurado && (
            <p className="pb-login-aviso">
              Autenticação não configurada — defina <code>VITE_SUPABASE_URL</code> e{' '}
              <code>VITE_SUPABASE_ANON_KEY</code>.
            </p>
          )}

          <form onSubmit={submeter}>
            <label className="pb-login-campo">
              <span>E-mail</span>
              <input
                type="email" value={email} required autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
              />
              {criando && listaDominios && (
                <small className="pb-login-dica">Somente e-mails {listaDominios}</small>
              )}
            </label>

            <label className="pb-login-campo">
              <span>Senha</span>
              <input
                type="password" value={senha} required
                autoComplete={criando ? 'new-password' : 'current-password'}
                minLength={criando ? 6 : undefined}
                onChange={(e) => setSenha(e.target.value)}
              />
              {criando && <small className="pb-login-dica">Mínimo de 6 caracteres</small>}
            </label>

            {criando && (
              <label className="pb-login-campo">
                <span>Confirmar senha</span>
                <input
                  type="password" value={confirmacao} required autoComplete="new-password"
                  onChange={(e) => setConfirmacao(e.target.value)}
                />
              </label>
            )}

            {erro && <div className="pb-login-erro">{erro}</div>}
            {aviso && <div className="pb-login-ok">{aviso}</div>}

            <button type="submit" className="pb-login-entrar" disabled={enviando || !authConfigurado}>
              {enviando
                ? criando ? 'Criando conta…' : 'Entrando…'
                : criando ? 'Criar conta' : 'Entrar'}
            </button>
          </form>

          <p className="pb-login-troca">
            {criando ? 'Já tem acesso?' : 'Ainda não tem conta?'}{' '}
            <button type="button" onClick={trocarModo}>
              {criando ? 'Entrar' : 'Criar conta'}
            </button>
          </p>
        </div>
      </div>

      <aside className="pb-login-arte">
        <div className="pb-login-arte-conteudo">
          <h2>{frase.titulo}</h2>
          <p>{frase.texto}</p>
          <blockquote>{frase.citacao}</blockquote>
        </div>
        <div className="pb-login-pontos">
          {FRASES.map((_, i) => (
            <button
              key={i} type="button" aria-label={`Mensagem ${i + 1}`}
              className={i === slide ? 'ativo' : ''} onClick={() => setSlide(i)}
            />
          ))}
        </div>
      </aside>
    </div>
  )
}
