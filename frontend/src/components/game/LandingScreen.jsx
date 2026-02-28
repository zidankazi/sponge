import { useState } from 'react'
import { useSession } from '../../hooks/useSession'

export default function LandingScreen() {
  const { beginSession, setView } = useSession()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleStart = async () => {
    setLoading(true)
    try {
      await beginSession(name)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="landing">
      <div className="landing-content">
        <div className="landing-logo">
          <span className="landing-logo-icon">S</span>
        </div>
        <h1 className="landing-title">sponge</h1>
        <p className="landing-subtitle">AI-Assisted Coding Interview Practice</p>

        <div className="landing-card">
          <h2>Add Delayed Job Execution</h2>
          <p>
            You'll work inside a real codebase with an AI assistant. You'll be scored
            on <em>how</em> you collaborated with AI. Working code is the baseline —
            it won't save a bad score, but broken code is an automatic zero.
          </p>
          <div className="landing-details">
            <div className="landing-detail">
              <span className="landing-detail-label">Codebase</span>
              <span className="landing-detail-value">Redis Queue</span>
            </div>
            <div className="landing-detail">
              <span className="landing-detail-label">Duration</span>
              <span className="landing-detail-value">60 minutes</span>
            </div>
            <div className="landing-detail">
              <span className="landing-detail-label">AI Assistant</span>
              <span className="landing-detail-value">Gemini</span>
            </div>
          </div>
        </div>

        <div className="landing-name-input">
          <label className="landing-name-label" htmlFor="username-input">Your name</label>
          <input
            id="username-input"
            className="landing-name-field"
            type="text"
            placeholder="Anonymous"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <button className="landing-start" onClick={handleStart} disabled={loading}>
          {loading ? 'Starting...' : 'Start Session'}
        </button>

        <button type="button" className="landing-leaderboard-link" onClick={() => setView('leaderboard')}>
          View Leaderboard
        </button>

        <p className="landing-footnote">
          Your interactions with AI will be analyzed for collaboration quality.
        </p>
      </div>
    </div>
  )
}
