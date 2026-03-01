import { useSession } from '../../hooks/useSession'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function BriefScreen() {
  const { timeLeft, totalTime, startCoding } = useSession()

  const pct = (timeLeft / totalTime) * 100
  const timerClass = timeLeft <= 10 ? 'timer--critical' : timeLeft <= 60 ? 'timer--urgent' : ''

  return (
    <div className="brief-screen">

      {/* Slim top bar with logo + live timer */}
      <div className="brief-topbar">
        <img
          src="/brand/logo-full.png"
          alt="Sponge"
          className="brief-topbar-logo"
          height={20}
        />
        <div className={`brief-topbar-timer ${timerClass}`}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.5V8L10.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>{formatTime(timeLeft)}</span>
        </div>
        <div className="brief-topbar-bar">
          <div className="brief-topbar-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Main content */}
      <div className="brief-body">
        <div className="brief-content">

          <div className="brief-eyebrow">Your challenge</div>
          <h1 className="brief-title">Add Delayed Job Execution</h1>

          <div className="brief-section">
            <h3 className="brief-section-heading">Context</h3>
            <p className="brief-section-body">
              RQ is a Python job queue backed by Redis. Producers enqueue jobs onto named queues.
              Workers run in separate processes — each worker continuously pulls the next available
              job off a queue and executes it. When a job finishes or fails, it moves into a
              registry. Right now, every enqueued job is eligible to run immediately.
            </p>
          </div>

          <div className="brief-section">
            <h3 className="brief-section-heading">Task</h3>
            <p className="brief-section-body">
              Extend RQ so jobs can be scheduled to run at a specific time in the future.
            </p>
            <ul className="brief-list">
              <li>Add <code>enqueue_in(seconds, func, *args, **kwargs)</code> to <code>Queue</code></li>
              <li>Add <code>enqueue_at(datetime, func, *args, **kwargs)</code> to <code>Queue</code></li>
            </ul>
          </div>

          <div className="brief-section">
            <h3 className="brief-section-heading">Expected Behavior</h3>
            <ul className="brief-list">
              <li>A job scheduled for time <em>T</em> must not execute before <em>T</em></li>
              <li>A job scheduled in the past is treated as immediately ready</li>
              <li>All existing behavior must continue to work unchanged</li>
            </ul>
          </div>

          <div className="brief-footer">
            <p className="brief-note">
              You have <strong>60 minutes</strong>. Use the AI as a collaborator, not a crutch.
            </p>
            <button className="brief-cta" onClick={startCoding}>
              Start coding
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

        </div>
      </div>

    </div>
  )
}
