// Leaderboard — rankings table
// Designer's domain.
// Renders rank, username, score, badge, and time for each entry.
// Highlights current user's row; gold/silver/bronze for top 3; row hover.

import Badge from './Badge'

function formatTime(isoString) {
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return '—'
  }
}

export default function Leaderboard({ entries, currentUser }) {
  if (!entries || entries.length === 0) {
    return (
      <div className="leaderboard">
        <div className="leaderboard-empty">No scores yet</div>
      </div>
    )
  }

  return (
    <div className="leaderboard">
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
          const rank = i + 1
          const rankClass =
            rank === 1
              ? 'leaderboard-col--rank-1'
              : rank === 2
                ? 'leaderboard-col--rank-2'
                : rank === 3
                  ? 'leaderboard-col--rank-3'
                  : ''
          return (
            <div
              key={entry.username + i}
              className={`leaderboard-row ${isCurrentUser ? 'leaderboard-row--current' : ''}`}
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
  )
}
