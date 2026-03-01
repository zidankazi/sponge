import { useEffect, useRef } from 'react'
import { useSession } from '../hooks/useSession'
import BriefScreen from '../components/game/BriefScreen'
import Layout from '../components/shared/Layout'
import ResultsScreen from '../components/game/ResultsScreen'

export default function DemoPage() {
  const { view, beginSession } = useSession()
  const started = useRef(false)

  // Auto-start session when landing on /demo
  useEffect(() => {
    if (!started.current && view === 'idle') {
      started.current = true
      beginSession('Guest')
    }
  }, [view, beginSession])

  if (view === 'idle') {
    // Still loading / starting session
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-root)', color: 'var(--text-dim)' }}>
        Starting demo...
      </div>
    )
  }

  if (view === 'brief') return <BriefScreen />
  if (view === 'results') return <ResultsScreen />

  return <Layout />
}
