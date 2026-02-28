// Leaderboard — Fortnite-style (Paper): vertical cup strip + list + Player Stats panel
// Left: vertical SPONGE POP-UP CUP / Session 6, then ranked list. Right: Player Stats, WITH username, General stats, hint.

import { useState } from 'react'
import Badge from './Badge'

function formatTime(isoString) {
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return '—'
  }
}

export default function Leaderboard({ entries, currentUser, sessionLabel = 'Session 6' }) {
  const [selected, setSelected] = useState(null)

  if (!entries || entries.length === 0) {
    return (
      <div className="leaderboard">
        <div className="leaderboard-empty">No scores yet</div>
      </div>
    )
  }

  const selectedEntry = selected || entries[0]
  const selectedUsername = selectedEntry.username

  return (
    <div className="leaderboard leaderboard--fortnite">
      <div className="leaderboard-left">
        <div className="leaderboard-cup-strip" aria-label="Cup and session">
          <span className="leaderboard-cup-strip-title">SPONGE POP-UP CUP</span>
          <span className="leaderboard-cup-strip-session">{sessionLabel}</span>
        </div>
        <div className="leaderboard-list-panel">
          <div className="leaderboard-table">
            <div className="leaderboard-row leaderboard-row--header">
              <span className="leaderboard-col leaderboard-col--rank">#</span>
              <span className="leaderboard-col leaderboard-col--name">Name</span>
              <span className="leaderboard-col leaderboard-col--score">Score</span>
              <span className="leaderboard-col leaderboard-col--badge">Badge</span>
              <span className="leaderboard-col leaderboard-col--time">Time</span>
            </div>
            {entries.map((entry, i) => {
              const isCurrentUser = currentUser && entry.username === currentUser
              const isSelected = selectedEntry && entry.username === selectedEntry.username && entry.score === selectedEntry.score
              const rank = i + 1
              const rankClass =
                rank === 1 ? 'leaderboard-col--rank-1'
                  : rank === 2 ? 'leaderboard-col--rank-2'
                    : rank === 3 ? 'leaderboard-col--rank-3' : ''
              return (
                <div
                  key={entry.username + i}
                  role="button"
                  tabIndex={0}
                  className={`leaderboard-row ${isCurrentUser ? 'leaderboard-row--current' : ''} ${isSelected ? 'leaderboard-row--selected' : ''}`}
                  onClick={() => setSelected(entry)}
                  onKeyDown={e => e.key === 'Enter' && setSelected(entry)}
                >
                  <span className={`leaderboard-col leaderboard-col--rank ${rankClass}`}>{rank}</span>
                  <span className="leaderboard-col leaderboard-col--name">{entry.username}</span>
                  <span className="leaderboard-col leaderboard-col--score">{entry.score}</span>
                  <span className="leaderboard-col leaderboard-col--badge">
                    <Badge badge={entry.badge} />
                  </span>
                  <span className="leaderboard-col leaderboard-col--time">
                    {formatTime(entry.time_completed)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="leaderboard-stats-panel">
        <div className="leaderboard-stats-heading">
          <span className="leaderboard-stats-title">Player Stats</span>
          <span className="leaderboard-stats-with">WITH {selectedUsername}</span>
        </div>
        <div className="leaderboard-stats-radial">
          <svg viewBox="0 0 120 120" className="leaderboard-stats-ring">
            <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" strokeWidth="10" />
            <circle
              cx="60" cy="60" r="54"
              fill="none"
              stroke="var(--green-light)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${(selectedEntry.score / 100) * 339} 339`}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="leaderboard-stats-radial-inner">
            <span className="leaderboard-stats-score">{selectedEntry.score}</span>
            <span className="leaderboard-stats-max">/ 100</span>
          </div>
        </div>
        <div className="leaderboard-stats-name">{selectedUsername}</div>
        <div className="leaderboard-stats-badge">
          <Badge badge={selectedEntry.badge} />
        </div>
        <div className="leaderboard-stats-time">{formatTime(selectedEntry.time_completed)}</div>

        <div className="leaderboard-general-stats">
          <div className="leaderboard-general-stats-title">General stats</div>
          <div className="leaderboard-general-stats-grid">
            <div className="leaderboard-general-stat">
              <span className="leaderboard-general-stat-label">Matches</span>
              <span className="leaderboard-general-stat-value">1</span>
            </div>
            <div className="leaderboard-general-stat">
              <span className="leaderboard-general-stat-label">Blind adoption</span>
              <span className="leaderboard-general-stat-value">—%</span>
            </div>
            <div className="leaderboard-general-stat">
              <span className="leaderboard-general-stat-label">Test after AI</span>
              <span className="leaderboard-general-stat-value">—%</span>
            </div>
          </div>
        </div>

        <p className="leaderboard-stats-hint">
          Select a row to see why they're placed there · Breakdown = rubric categories.
        </p>
      </div>
    </div>
  )
}
