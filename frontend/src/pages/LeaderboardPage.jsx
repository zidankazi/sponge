// LeaderboardPage — standalone leaderboard view
// Designer's domain.
// TODO: fetch leaderboard data, render Leaderboard component

import { useState, useEffect } from 'react'
import { fetchLeaderboard } from '../api/client'
import Leaderboard from '../components/game/Leaderboard'

export default function LeaderboardPage() {
  const [entries, setEntries] = useState([])

  useEffect(() => {
    fetchLeaderboard().then(setEntries)
  }, [])

  return (
    <div className="leaderboard-page">
      <h1>Leaderboard</h1>
      <Leaderboard entries={entries} />
    </div>
  )
}
