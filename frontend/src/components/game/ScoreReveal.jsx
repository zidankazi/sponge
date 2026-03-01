// ScoreReveal — animated score reveal (Paper design)
// Count-up, radial score, 4 category cards, Socratic Feedback, stagger.

import { useState, useEffect } from 'react'
import Badge from './Badge'

const COUNT_UP_DURATION_MS = 1200

// Derive rubric-style category scores from API breakdown for display
function getCategoryScores(breakdown, totalScore) {
  if (!breakdown) return null
  const { request_timing, request_quality, response_handling, verification_discipline, iterative_collaboration, penalties } = breakdown
  const penaltiesVal = penalties || 0
  const sum = (request_timing || 0) + (request_quality || 0) + (response_handling || 0) + (verification_discipline || 0) + (iterative_collaboration || 0)
  if (sum <= 0) return null
  const scale = (totalScore - penaltiesVal) / sum
  return {
    problemSolving: Math.round(((request_timing || 0) + (request_quality || 0)) * scale),
    codeQuality: Math.round(((response_handling || 0) + (iterative_collaboration || 0)) * scale),
    verification: Math.round((verification_discipline || 0) * scale),
    communication: Math.max(0, totalScore - penaltiesVal - Math.round(((request_timing || 0) + (request_quality || 0)) * scale) - Math.round(((response_handling || 0) + (iterative_collaboration || 0)) * scale) - Math.round((verification_discipline || 0) * scale)),
  }
}

function getCategoryFeedback(category, score) {
  const high = score >= 18
  const mid = score >= 10
  switch (category) {
    case 'problemSolving':
      return high ? 'Excellent — you explored the codebase and planned before prompting.'
        : mid ? 'Solid start — try reading more files before your first AI prompt.'
          : 'Explore the code and plan your approach before asking AI for help.'
    case 'codeQuality':
      return high ? 'Strong — you reviewed and adapted AI suggestions thoughtfully.'
        : mid ? 'Good instincts — try modifying AI output more before accepting it.'
          : 'Avoid copy-pasting AI code directly; review and adapt it first.'
    case 'verification':
      return high ? 'Thorough — you tested consistently after making changes.'
        : mid ? 'Decent discipline — run tests more often after each AI interaction.'
          : 'Run tests after every change to catch issues early.'
    case 'communication':
      return high ? 'Clear, grounded prompts with strong iterative dialogue.'
        : mid ? 'Good discussion — reference specific code and tradeoffs more.'
          : 'Be more specific in prompts; mention files, functions, and tradeoffs.'
    default:
      return ''
  }
}

function getCategoryTier(score) {
  if (score >= 18) return 'good'
  if (score >= 10) return 'warn'
  return 'bad'
}

export default function ScoreReveal({ score, badge, interpretation, breakdown, onComplete }) {
  const [displayScore, setDisplayScore] = useState(0)
  const [badgeVisible, setBadgeVisible] = useState(false)

  const categories = getCategoryScores(breakdown, score)

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
      if (t >= 1) setBadgeVisible(true)
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [score])

  const summary = interpretation
    ? (interpretation.includes('.') ? interpretation.split('.')[0] + '.' : interpretation)
    : ''

  return (
    <div className="score-reveal score-reveal--paper">
      <div className="score-reveal-content">
        <div className="score-reveal-hero">
          <div className="score-reveal-radial">
            <svg viewBox="0 0 120 120" className="score-reveal-ring">
              <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" strokeWidth="10" />
              <circle
                cx="60" cy="60" r="54"
                fill="none"
                stroke="var(--green-light)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 339} 339`}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div className="score-reveal-radial-inner">
              <span className="score-reveal-number score-reveal-number--animate">{displayScore}</span>
              <span className="score-reveal-fraction">/ 100</span>
            </div>
          </div>
          <div className="score-reveal-hero-text">
            <h2 className="score-reveal-title">System Integrity Score</h2>
            <p className="score-reveal-subtitle">Your session was evaluated against the Meta-style rubric: Problem Solving, Code Quality, Verification, and Communication.</p>
            <div className={`score-reveal-badge score-reveal-badge--stagger ${badgeVisible ? 'score-reveal-badge--visible' : ''}`}>
              <Badge badge={badge} />
            </div>
          </div>
        </div>

        {categories && (
          <div className="score-reveal-categories">
            {[
              { key: 'problemSolving', label: 'Problem Solving' },
              { key: 'codeQuality', label: 'Code Quality' },
              { key: 'verification', label: 'Verification' },
              { key: 'communication', label: 'Communication' },
            ].map(({ key, label }) => (
              <div className="score-reveal-category-card" key={key}>
                <div className="score-reveal-category-label">{label}</div>
                <div className={`score-reveal-category-value score-reveal-category-value--${getCategoryTier(categories[key])}`}>
                  {categories[key]}
                </div>
                <div className="score-reveal-category-max">/ 25</div>
                <p className="score-reveal-category-feedback">{getCategoryFeedback(key, categories[key])}</p>
              </div>
            ))}
          </div>
        )}

        <div className="score-reveal-socratic score-reveal-socratic--stagger">
          <div className="score-reveal-socratic-label">Socratic Feedback</div>
          <p className="score-reveal-socratic-text">{interpretation || summary || 'Review your breakdown to see where to improve.'}</p>
        </div>

        <button className="score-reveal-continue score-reveal-continue--stagger" onClick={onComplete}>
          See Full Breakdown
        </button>
      </div>
    </div>
  )
}
