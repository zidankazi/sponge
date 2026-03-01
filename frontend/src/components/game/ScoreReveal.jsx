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

const CATEGORY_FEEDBACK = {
  problemSolving: 'Clear restatement and steps; add edge cases before coding.',
  codeQuality: 'Good structure; you explained AI output before adopting.',
  verification: 'Run tests more often after each change.',
  communication: 'Strong narration and tradeoff discussion.',
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
            <div className="score-reveal-category-card">
              <div className="score-reveal-category-label">Problem Solving</div>
              <div className="score-reveal-category-value score-reveal-category-value--good">{categories.problemSolving}</div>
              <div className="score-reveal-category-max">/ 25</div>
              <p className="score-reveal-category-feedback">{CATEGORY_FEEDBACK.problemSolving}</p>
            </div>
            <div className="score-reveal-category-card">
              <div className="score-reveal-category-label">Code Quality</div>
              <div className="score-reveal-category-value score-reveal-category-value--good">{categories.codeQuality}</div>
              <div className="score-reveal-category-max">/ 25</div>
              <p className="score-reveal-category-feedback">{CATEGORY_FEEDBACK.codeQuality}</p>
            </div>
            <div className="score-reveal-category-card">
              <div className="score-reveal-category-label">Verification</div>
              <div className="score-reveal-category-value score-reveal-category-value--warn">{categories.verification}</div>
              <div className="score-reveal-category-max">/ 25</div>
              <p className="score-reveal-category-feedback">{CATEGORY_FEEDBACK.verification}</p>
            </div>
            <div className="score-reveal-category-card">
              <div className="score-reveal-category-label">Communication</div>
              <div className="score-reveal-category-value score-reveal-category-value--good">{categories.communication}</div>
              <div className="score-reveal-category-max">/ 25</div>
              <p className="score-reveal-category-feedback">{CATEGORY_FEEDBACK.communication}</p>
            </div>
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
