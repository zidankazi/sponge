// ScoreReveal — score reveal skeleton (no animation yet)
// Designer's domain.
// Shows score prominently, badge, interpretation summary, and continue button.

import Badge from './Badge'

export default function ScoreReveal({ score, badge, interpretation, onComplete }) {
  // Extract first sentence of interpretation, or use full string if short
  const summary = interpretation
    ? (interpretation.includes('.') ? interpretation.split('.')[0] + '.' : interpretation)
    : ''

  return (
    <div className="score-reveal">
      <div className="score-reveal-content">
        <div className="score-reveal-number">{score}</div>
        <div className="score-reveal-label">Your Score</div>
        <div className="score-reveal-badge">
          <Badge badge={badge} />
        </div>
        {summary && (
          <p className="score-reveal-summary">{summary}</p>
        )}
        <button className="score-reveal-continue" onClick={onComplete}>
          See Full Breakdown
        </button>
      </div>
    </div>
  )
}
