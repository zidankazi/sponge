import { useSession } from '../../hooks/useSession'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function Header() {
  const { timeLeft, totalTime, submit, isSubmitting } = useSession()

  const pct = (timeLeft / totalTime) * 100
  const timerClass = timeLeft <= 10 ? 'timer--critical' : timeLeft <= 60 ? 'timer--urgent' : ''

  return (
    <header className="header">
      <div className="header-left">
        <div className="header-logo">
          <span className="logo-icon">S</span>
          <span className="logo-text">sponge</span>
        </div>
        <span className="header-divider" />
        <span className="header-problem-tag">Delayed Job Execution</span>
      </div>

      <div className="header-center">
        <div className={`timer ${timerClass}`}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.5V8L10.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="timer-text">{formatTime(timeLeft)}</span>
        </div>
        <div className="timer-bar">
          <div className="timer-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="header-right">
        <button
          className="submit-btn"
          onClick={submit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <span className="submit-spinner" />
              Evaluating...
            </>
          ) : (
            'Submit'
          )}
        </button>
      </div>
    </header>
  )
}
