// ScoreReveal — animated score reveal (Paper design)
// Count-up, radial score, 4 category cards, Socratic Feedback, stagger.

import { useState, useEffect } from 'react'
import Badge from './Badge'

const COUNT_UP_DURATION_MS = 1200

// Category max values from the backend rubric (A:12, B:13, C:12, D:13 = 50 total)
const CATEGORY_MAX = {
  problemSolving: 12,
  codeQuality: 13,
  verification: 12,
  communication: 13,
}

// Map rubric_breakdown from the API directly to display categories
function getCategoryScores(rubricBreakdown) {
  if (!rubricBreakdown) return null
  const { problem_solving, code_quality, verification, communication } = rubricBreakdown
  if (problem_solving == null && code_quality == null && verification == null && communication == null) return null
  return {
    problemSolving: Math.round(problem_solving || 0),
    codeQuality: Math.round(code_quality || 0),
    verification: Math.round(verification || 0),
    communication: Math.round(communication || 0),
  }
}

function getCategoryFeedback(category, score) {
  const max = CATEGORY_MAX[category] || 13
  const pct = score / max
  const high = pct >= 0.75
  const mid = pct >= 0.45
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

function getCategoryTier(category, score) {
  const max = CATEGORY_MAX[category] || 13
  const pct = score / max
  if (pct >= 0.75) return 'good'
  if (pct >= 0.45) return 'warn'
  return 'bad'
}

export default function ScoreReveal({ score, badge, interpretation, rubricBreakdown, onComplete }) {
  const [displayScore, setDisplayScore] = useState(0)
  const [badgeVisible, setBadgeVisible] = useState(false)

  const categories = getCategoryScores(rubricBreakdown)

  useEffect(() => {
    if (score <= 0) {
      setDisplayScore(0)
      setBadgeVisible(true)
      return
    }
    let cancelled = false
    const start = performance.now()
    const tick = (now) => {
      if (cancelled) return
      const elapsed = now - start
      const t = Math.min(elapsed / COUNT_UP_DURATION_MS, 1)
      const eased = 1 - (1 - t) ** 2
      setDisplayScore(Math.round(eased * score))
      if (t >= 1) setBadgeVisible(true)
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return () => { cancelled = true }
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
                <div className={`score-reveal-category-value score-reveal-category-value--${getCategoryTier(key, categories[key])}`}>
                  {categories[key]}
                </div>
                <div className="score-reveal-category-max">/ {CATEGORY_MAX[key]}</div>
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
