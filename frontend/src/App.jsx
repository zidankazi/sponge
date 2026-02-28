import { SessionProvider, useSession } from './hooks/useSession'
import LandingScreen from './components/game/LandingScreen'
import Layout from './components/shared/Layout'
import ResultsScreen from './components/game/ResultsScreen'
import ErrorBanner from './components/ErrorBanner'

function AppInner() {
  const { view } = useSession()

  if (view === 'idle') return <LandingScreen />
  if (view === 'results') return <ResultsScreen />
  return <Layout />
}

export default function App() {
  return (
    <SessionProvider>
      <ErrorBanner />
      <AppInner />
    </SessionProvider>
  )
}
