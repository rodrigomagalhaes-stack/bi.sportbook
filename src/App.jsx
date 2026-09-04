import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth.jsx'
import Shell from './shell/Shell.jsx'
import EmbeddedApp from './shell/EmbeddedApp.jsx'
import Home from './pages/Home.jsx'
import { todosItens } from './shell/nav.js'

// Cada módulo React carrega sob demanda: quem só abre o Boost Dashboard não
// baixa o xlsx do Welcome Boost nem o papaparse do Quiz.
const WelcomeBoost = lazy(() => import('./modules/welcome-boost/index.jsx'))
const Quiz = lazy(() => import('./modules/pickem/index.jsx'))
const Prefixador = lazy(() => import('./modules/prefixador/index.jsx'))
const UtmRanking = lazy(() => import('./modules/utm-ranking/index.jsx'))
const Recomendador = lazy(() => import('./modules/recomendador/index.jsx'))

const Carregando = () => <div className="pb-boot"><div className="pb-boot-spinner" /></div>

const comSuspense = (elemento) => <Suspense fallback={<Carregando />}>{elemento}</Suspense>

export default function App() {
  return (
    <Routes>
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />

        {/* As páginas embutidas saem direto do catálogo de navegação — não há
            uma segunda lista de rotas para manter em sincronia. */}
        {todosItens
          .filter((i) => i.tipo === 'embutido')
          .map((i) => (
            <Route
              key={i.to}
              path={i.to}
              element={<EmbeddedApp src={i.src} titulo={i.label} />}
            />
          ))}

        {/* `/*` porque o próprio módulo lê a sub-rota (mensal, relatórios,
            ids-repetidos) e assim ele não desmonta ao trocar de tela — o mês
            escolhido e o período dos filtros sobrevivem à navegação. */}
        <Route path="/welcome-boost/*" element={comSuspense(<WelcomeBoost />)} />

        <Route path="/quiz" element={comSuspense(<Quiz />)} />

        <Route path="/prefixador" element={comSuspense(<Prefixador />)} />

        <Route path="/utms" element={comSuspense(<UtmRanking />)} />

        <Route path="/recomendador" element={comSuspense(<Recomendador />)} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
