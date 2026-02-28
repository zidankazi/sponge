// LeaderboardPage — standalone leaderboard view
// Designer's domain.
// Header, loading state, back button, passes currentUser for row highlight.

import { useState, useEffect } from 'react'
import { fetchLeaderboard } from '../api/client'
import { useSession } from '../hooks/useSession'
import Leaderboard from '../components/game/Leaderboard'

export default function LeaderboardPage({ onBack }) {
  const [entries, setEntries] = useState(null)
  const [loading, setLoading] = useState(true)
  const { username } = useSession()

  useEffect(() => {
    setLoading(true)
    fetchLeaderboard()
      .then(data => {
        setEntries(data)
        setLoading(false)
      })
      .catch(() => {
        setEntries([])
        setLoading(false)
      })
  }, [])

  return (
    <div className="leaderboard-page">
      <div className="leaderboard-page-header">
        {onBack && (
          <button className="leaderboard-back-btn" onClick={onBack}>
            ← Back
          </button>
        )}
        <div className="leaderboard-page-title">
          <div className="leaderboard-logo-icon">S</div>
          <h1>Leaderboard</h1>
        </div>
      </div>
      <div className="leaderboard-page-content">
        {loading ? (
          <div className="leaderboard-loading">
            <div className="leaderboard-spinner"></div>
            <span>Loading scores...</span>
          </div>
        ) : (
          <Leaderboard entries={entries} currentUser={username} />
        )}
      </div>
    </div>
  )
}
