import { useState } from 'react'
import { useSession } from '../../hooks/useSession'
import Badge from './Badge'
import ScoreReveal from './ScoreReveal'

const SCORE_LABELS = {
  request_timing: 'Request Timing',
  request_quality: 'Request Quality',
  response_handling: 'Response Handling',
  verification_discipline: 'Verification Discipline',
  iterative_collaboration: 'Iterative Collaboration',
  penalties: 'Penalties',
}

const METRIC_LABELS = {
  blind_adoption_rate: { label: 'Blind Adoption Rate', good: 'low', format: 'pct' },
  ai_modification_rate: { label: 'AI Modification Rate', good: 'high', format: 'pct' },
  test_after_ai_rate: { label: 'Test After AI Rate', good: 'high', format: 'pct' },
  passive_reprompt_rate: { label: 'Passive Reprompt Rate', good: 'low', format: 'pct' },
  grounded_prompt_rate: { label: 'Grounded Prompt Rate', good: 'high', format: 'pct' },
  evidence_grounded_followup_rate: { label: 'Evidence-Grounded Followup', good: 'high', format: 'pct' },
  ai_apply_without_edit_rate: { label: 'AI Apply Without Edit', good: 'low', format: 'pct' },
  test_pass_rate: { label: 'Test Pass Rate', good: 'high', format: 'pct' },
}

function ScoreBar({ label, value, max = 10, negative }) {
  const pct = negative ? 0 : (value / max) * 100

  return (
    <div className="score-bar-row">
      <div className="score-bar-label">{label}</div>
      <div className="score-bar-track">
        {negative ? (
          <div className="score-bar-fill score-bar-fill--negative" style={{ width: `${Math.min((Math.abs(value) / 5) * 100, 100)}%` }} />
        ) : (
          <div className="score-bar-fill" style={{ width: `${pct}%` }} />
        )}
      </div>
      <div className={`score-bar-value ${negative ? 'score-bar-value--negative' : ''}`}>
        {negative ? value : `${value}/${max}`}
      </div>
    </div>
  )
}

function MetricRow({ metricKey, value, meta }) {
  if (!meta) return null
  const pctStr = typeof value === 'number' && value < 0 ? '—' : `${Math.round(value * 100)}%`
  const isGood = (meta.good === 'high' && value >= 0.6) || (meta.good === 'low' && value <= 0.3)
  const isBad = (meta.good === 'high' && value < 0.3) || (meta.good === 'low' && value > 0.6)

  return (
    <div className="metric-row">
      <span className="metric-label">{meta.label}</span>
      <span className={`metric-value ${isGood ? 'metric-value--good' : ''} ${isBad ? 'metric-value--bad' : ''}`}>
        {pctStr}
      </span>
    </div>
  )
}

export default function ResultsScreen() {
  const { results, resetSession } = useSession()
  const [revealed, setRevealed] = useState(false)

  if (!results) return null

  const { total_score, breakdown, headline_metrics, interpretation, badge } = results

  // Phase 1: ScoreReveal (before user clicks Continue)
  if (!revealed) {
    return (
      <ScoreReveal
        score={total_score}
        badge={badge}
        interpretation={interpretation}
        breakdown={breakdown}
        onComplete={() => setRevealed(true)}
      />
    )
  }

  // Full breakdown
  const grade =
    total_score >= 90 ? 'A' :
      total_score >= 80 ? 'B+' :
        total_score >= 70 ? 'B' :
          total_score >= 60 ? 'C+' :
            total_score >= 50 ? 'C' : 'D'

  return (
    <div className="results-screen">
      <div className="results-container">
        <div className="results-header">
          <h1>Session Complete</h1>
          <p>Here's how you collaborated with AI</p>
        </div>

        <div className="results-score-hero">
          <div className="score-circle">
            <svg viewBox="0 0 120 120" className="score-ring">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="6" />
              <circle
                cx="60" cy="60" r="52"
                fill="none"
                stroke="var(--green-light)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(total_score / 100) * 327} 327`}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div className="score-center">
              <span className="score-number">{total_score}</span>
              <span className="score-grade">{grade}</span>
            </div>
          </div>
          <div className="results-badge">
            <Badge badge={badge} />
          </div>
        </div>

        <div className="results-grid">
          <div className="results-card">
            <h3>Breakdown</h3>
            <div className="score-bars">
              {breakdown && Object.entries(breakdown).map(([key, val]) => (
                <ScoreBar
                  key={key}
                  label={SCORE_LABELS[key] || key}
                  value={val}
                  negative={key === 'penalties'}
                />
              ))}
            </div>
          </div>

          <div className="results-card">
            <h3>Headline Metrics</h3>
            <div className="metrics-list">
              {headline_metrics && Object.entries(headline_metrics).map(([key, val]) => (
                <MetricRow key={key} metricKey={key} value={val} meta={METRIC_LABELS[key]} />
              ))}
            </div>
          </div>
        </div>

        <div className="results-card results-interpretation">
          <h3>Interpretation</h3>
          <p>{interpretation}</p>
        </div>

        <div className="results-actions">
          <h3 className="results-actions-title">What&apos;s next?</h3>
          <button className="results-bottleneck-btn" onClick={() => setRevealed(false)}>
            Watch score again
          </button>
          <button className="results-restart" onClick={resetSession}>
            Start New Session
          </button>
        </div>
      </div>
    </div>
  )
}
