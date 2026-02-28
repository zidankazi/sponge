// ScoreReveal — animated score reveal sequence
// Designer's domain.
// Count-up on score, fade/slide badge, stagger reveal.

import { useState, useEffect } from 'react'
import Badge from './Badge'

const COUNT_UP_DURATION_MS = 1200

export default function ScoreReveal({ score, badge, interpretation, onComplete }) {
  const [displayScore, setDisplayScore] = useState(0)
  const [badgeVisible, setBadgeVisible] = useState(false)

  useEffect(() => {
    if (score <= 0) {
      setDisplayScore(0)
      setBadgeVisible(true)
      return
    }
    const start = performance.now()
    const tick = (now) => {
      const elapsed = now - start
      const t = Math.min(elapsed / COUNT_UP_DURATION_MS, 1)
      const eased = 1 - (1 - t) ** 2
      setDisplayScore(Math.round(eased * score))
      if (t >= 1) {
        setBadgeVisible(true)
      } else {
        requestAnimationFrame(tick)
      }
    }
    requestAnimationFrame(tick)
  }, [score])

  const summary = interpretation
    ? (interpretation.includes('.') ? interpretation.split('.')[0] + '.' : interpretation)
    : ''

  return (
    <div className="score-reveal">
      <div className="score-reveal-content">
        <div className="score-reveal-number score-reveal-number--animate">{displayScore}</div>
        <div className="score-reveal-label score-reveal-label--stagger">Your Score</div>
        <div
          className={`score-reveal-badge score-reveal-badge--stagger ${badgeVisible ? 'score-reveal-badge--visible' : ''}`}
        >
          <Badge badge={badge} />
        </div>
        {summary && (
          <p className="score-reveal-summary score-reveal-summary--stagger">{summary}</p>
        )}
        <button className="score-reveal-continue score-reveal-continue--stagger" onClick={onComplete}>
          See Full Breakdown
        </button>
      </div>
    </div>
  )
}
