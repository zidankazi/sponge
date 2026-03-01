import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'
import Badge from './Badge'

const SCORE_LABELS = {
  request_timing: 'Request Timing',
  request_quality: 'Request Quality',
  response_handling: 'Response Handling',
  verification_discipline: 'Verification Discipline',
  iterative_collaboration: 'Iterative Collaboration',
  penalties: 'Penalties',
}

const METRIC_LABELS = {
  blind_adoption_rate: { label: 'Blind Adoption Rate', good: 'low' },
  ai_modification_rate: { label: 'AI Modification Rate', good: 'high' },
  test_after_ai_rate: { label: 'Test After AI Rate', good: 'high' },
  passive_reprompt_rate: { label: 'Passive Reprompt Rate', good: 'low' },
  grounded_prompt_rate: { label: 'Grounded Prompt Rate', good: 'high' },
  evidence_grounded_followup_rate: { label: 'Evidence-Grounded Followup', good: 'high' },
  ai_apply_without_edit_rate: { label: 'AI Apply Without Edit', good: 'low' },
  test_pass_rate: { label: 'Test Pass Rate', good: 'high' },
}

const TIER_LABELS = {
  strength: 'Strengths',
  improvement: 'Improvements',
  weakness: 'Weaknesses',
}

function ScoreBar({ label, value, max = 10, negative }) {
  const safeValue = typeof value === 'number' ? value : 0
  const pct = negative ? 0 : (safeValue / max) * 100

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
        {negative ? safeValue : `${safeValue}/${max}`}
      </div>
    </div>
  )
}

function MetricRow({ value, meta }) {
  if (!meta) return null
  const pctStr = typeof value === 'number' && value < 0 ? '\u2014' : `${Math.round(value * 100)}%`
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

function groupInsights(insights) {
  const groups = { strength: [], improvement: [], weakness: [] }
  if (!insights) return groups
  insights.forEach(i => { if (groups[i.type]) groups[i.type].push(i) })
  return groups
}

function InsightGroup({ type, insights, onSelect }) {
  if (!insights.length) return null
  return (
    <div className="insight-group">
      <div className="insight-group-header">
        <span className={`insight-dot insight-dot--${type}`} />
        <span className="insight-group-label">{TIER_LABELS[type]}</span>
        <span className="insight-group-count">{insights.length}</span>
      </div>
      {insights.map((insight, i) => (
        <div key={i} className="insight-row" onClick={() => onSelect(insight)}>
          <span className="insight-row-title">{insight.title}</span>
          <span className="insight-row-category">{insight.category}</span>
        </div>
      ))}
    </div>
  )
}

function InsightModal({ insight, userPrompts, onClose }) {
  if (!insight) return null

  const badgeClass =
    insight.type === 'strength' ? 'insight-badge--strength' :
      insight.type === 'weakness' ? 'insight-badge--weakness' :
        'insight-badge--improvement'

  const badgeLabel =
    insight.type === 'strength' ? 'Strength' :
      insight.type === 'weakness' ? 'Weakness' :
        'Improvement'

  const prompts = (insight.prompt_indices || [])
    .filter(idx => userPrompts && idx >= 0 && idx < userPrompts.length)
    .map(idx => ({ index: idx, text: userPrompts[idx] }))

  return (
    <div className="insight-modal-backdrop" onClick={onClose}>
      <div className="insight-modal" onClick={e => e.stopPropagation()}>
        <button className="insight-modal-close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4L14 14M14 4L4 14" />
          </svg>
        </button>

        <div className="insight-modal-header">
          <span className={`insight-card-badge ${badgeClass}`}>{badgeLabel}</span>
          <span className="insight-modal-category">{insight.category}</span>
        </div>

        <h3 className="insight-modal-title">{insight.title}</h3>
        <p className="insight-modal-desc">{insight.description}</p>

        {prompts.length > 0 && (
          <div className="insight-modal-prompts">
            <h4 className="insight-modal-prompts-label">Referenced Prompts</h4>
            {prompts.map(({ index, text }) => (
              <div key={index} className="insight-modal-prompt">
                <span className="insight-modal-prompt-idx">[{index + 1}]</span>
                {text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Ease-out cubic: fast start, smooth deceleration
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

export default function ResultsScreen() {
  const navigate = useNavigate()
  const { results, resetSession } = useSession()

  const [animatedScore, setAnimatedScore] = useState(0)
  const [insightsOpen, setInsightsOpen] = useState(true)
  const [selectedInsight, setSelectedInsight] = useState(null)
  const animRef = useRef(null)

  const totalScore = results?.total_score ?? 0

  // Score ring animation
  useEffect(() => {
    if (!results) return
    const duration = 1200
    let start = null

    function tick(ts) {
      if (!start) start = ts
      const elapsed = ts - start
      const t = Math.min(elapsed / duration, 1)
      setAnimatedScore(Math.round(easeOutCubic(t) * totalScore))
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick)
      }
    }

    animRef.current = requestAnimationFrame(tick)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [results, totalScore])

  // Escape key for modal
  useEffect(() => {
    if (!selectedInsight) return
    const onKey = (e) => { if (e.key === 'Escape') setSelectedInsight(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedInsight])

  if (!results) return null

  const {
    breakdown = {},
    headline_metrics = {},
    interpretation = '',
    badge = 'Just Vibing',
    insights = [],
    user_prompts = [],
  } = results

  const grade =
    totalScore >= 90 ? 'A' :
      totalScore >= 80 ? 'B+' :
        totalScore >= 70 ? 'B' :
          totalScore >= 60 ? 'C+' :
            totalScore >= 50 ? 'C' : 'D'

  const hasInsights = insights && insights.length > 0
  const grouped = groupInsights(insights)
  const ringDash = (animatedScore / 100) * 377

  return (
    <div className="results">

      <header className="results-header">
        <div className="results-header-left" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <img
            src="/brand/logo-full.png"
            alt="Sponge"
            className="nav-logo-img"
            height={20}
          />
        </div>
      </header>

      <main className="results-main">

        {/* ── Meta line ── */}
        <div className="results-meta">
          <span className="results-label">RESULTS</span>
          <span className="results-sep">/</span>
          <span className="results-meta-badge"><Badge badge={badge} /></span>
        </div>

        {/* ── Title + score hero ── */}
        <div className="results-hero">
          <div className="results-hero-text">
            <h1 className="results-title">Session Complete</h1>
            <p className="results-desc">
              Here&apos;s how you collaborated with AI during this session.
            </p>
          </div>
          <div className="results-score-ring">
            <svg viewBox="0 0 140 140" className="score-ring">
              <circle cx="70" cy="70" r="60" fill="none" stroke="var(--border)" strokeWidth="5" />
              <circle
                cx="70" cy="70" r="60"
                fill="none"
                stroke="var(--green-light)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${ringDash} 377`}
                transform="rotate(-90 70 70)"
              />
            </svg>
            <div className="score-center">
              <span className="score-number">{animatedScore}</span>
              <span className="score-grade">{grade}</span>
            </div>
          </div>
        </div>

        <div className="results-divider" />

        {/* ── Insights (collapsible grouped rows) ── */}
        {hasInsights && (
          <section className="results-section">
            <div className="insights-header">
              <h2 className="results-section-label">Insights</h2>
              <button
                className="insights-toggle"
                onClick={() => setInsightsOpen(!insightsOpen)}
                aria-label={insightsOpen ? 'Collapse insights' : 'Expand insights'}
              >
                <svg
                  className={`insights-toggle-icon ${insightsOpen ? '' : 'insights-toggle-icon--collapsed'}`}
                  width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                >
                  <path d="M3 5L7 9L11 5" />
                </svg>
              </button>
            </div>

            {insightsOpen && (
              <div className="insights-grouped">
                <InsightGroup type="strength" insights={grouped.strength} onSelect={setSelectedInsight} />
                <InsightGroup type="improvement" insights={grouped.improvement} onSelect={setSelectedInsight} />
                <InsightGroup type="weakness" insights={grouped.weakness} onSelect={setSelectedInsight} />
              </div>
            )}
          </section>
        )}

        {!hasInsights && interpretation && (
          <section className="results-section">
            <h2 className="results-section-label">Feedback</h2>
            <p className="results-feedback-text">{interpretation}</p>
          </section>
        )}

        <div className="results-divider" />

        {/* ── Detailed breakdown — two-column grid ── */}
        <div className="results-detail-grid">
          <section className="results-detail-col">
            <h2 className="results-section-label">Breakdown</h2>
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
          </section>

          <section className="results-detail-col">
            <h2 className="results-section-label">Metrics</h2>
            <div className="metrics-list">
              {headline_metrics && Object.entries(headline_metrics).map(([key, val]) => (
                <MetricRow key={key} value={val} meta={METRIC_LABELS[key]} />
              ))}
            </div>
          </section>
        </div>

        {/* ── Actions ── */}
        <div className="results-actions">
          <button className="results-cta" onClick={resetSession}>
            Start new session
          </button>
        </div>

      </main>

      {/* ── Fullscreen insight modal ── */}
      <InsightModal
        insight={selectedInsight}
        userPrompts={user_prompts}
        onClose={() => setSelectedInsight(null)}
      />
    </div>
  )
}
