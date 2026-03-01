import { useEffect, useRef, useState } from 'react'
import { useSession } from '../hooks/useSession'
import BriefScreen from '../components/game/BriefScreen'
import Layout from '../components/shared/Layout'
import ResultsScreen from '../components/game/ResultsScreen'

export default function DemoPage() {
  const { view, beginSession } = useSession()
  const started = useRef(false)
  const [failed, setFailed] = useState(false)

  // Auto-start session when landing on /demo
  useEffect(() => {
    if (!started.current && view === 'idle') {
      started.current = true
      setFailed(false)
      beginSession('Guest').catch(() => setFailed(true))
    }
  }, [view, beginSession])

  if (view === 'idle') {
    if (failed) {
      return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', background: 'var(--bg-root)', color: 'var(--text-dim)' }}>
          <p>Could not start session.</p>
          <button
            onClick={() => { started.current = false; setFailed(false) }}
            style={{
              padding: '8px 20px',
              background: 'var(--green-dark)',
              color: 'var(--cream)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )
    }
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
