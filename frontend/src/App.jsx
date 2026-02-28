import { SessionProvider, useSession } from './hooks/useSession'
import LandingScreen from './components/game/LandingScreen'
import Layout from './components/shared/Layout'
import ResultsScreen from './components/game/ResultsScreen'
import LeaderboardPage from './pages/LeaderboardPage'

function AppInner() {
  const { view, setView, resetSession } = useSession()

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
      <AppInner />
    </SessionProvider>
  )
}
