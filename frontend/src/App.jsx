import { SessionProvider, useSession } from './hooks/useSession'
import HomePage from './components/game/HomePage'
import LandingScreen from './components/game/LandingScreen'
import Layout from './components/shared/Layout'
import ResultsScreen from './components/game/ResultsScreen'
import LeaderboardPage from './pages/LeaderboardPage'
import ErrorBanner from './components/ErrorBanner'

function AppInner() {
  const { view, setView, resetSession } = useSession()

  if (view === 'home') return <HomePage />
  if (view === 'idle') return <LandingScreen />
  if (view === 'results') return <ResultsScreen />
  if (view === 'leaderboard') {
    return (
      <LeaderboardPage
        onBack={() => setView('idle')}
        onStartNewSession={resetSession}
      />
    )
  }
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
