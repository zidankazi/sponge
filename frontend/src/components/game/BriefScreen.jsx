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
    <div className="brief">

      <header className="brief-header">
        <div className="brief-header-left">
          <img
            src="/brand/logo-full.png"
            alt="Sponge"
            className="nav-logo-img"
            height={20}
          />
        </div>
        <div className="brief-header-right">
          <div className={`timer ${timerClass}`}>
            <span className="timer-text">{formatTime(timeLeft)}</span>
          </div>
          <div className="timer-bar">
            <div className="timer-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </header>

      <main className="brief-main">

        <div className="brief-meta">
          <span className="brief-label">CHALLENGE</span>
          <span className="brief-sep">/</span>
          <span className="brief-time">{formatTime(timeLeft)} remaining</span>
        </div>

        <h1 className="brief-title">
          Add Delayed Job Execution
        </h1>

        <p className="brief-desc">
          RQ is a Python job queue backed by Redis. Producers enqueue jobs onto
          named queues. Workers run in separate processes — each worker
          continuously pulls the next available job off a queue and executes it.
          When a job finishes or fails, it moves into a registry. Right now,
          every enqueued job is eligible to run immediately.
        </p>

        <div className="brief-divider" />

        <div className="brief-grid">

          <section className="brief-col">
            <h2 className="brief-section-label">Objective</h2>
            <p className="brief-section-text">
              Extend RQ so jobs can be scheduled to run at a specific time in the future.
            </p>

            <h2 className="brief-section-label brief-section-label--spaced">Requirements</h2>
            <div className="brief-req">
              <div className="brief-req-row">
                <span className="brief-req-num">1</span>
                <span className="brief-req-text">
                  Add <code>enqueue_in(seconds, func, *args, **kwargs)</code> to <code>Queue</code>
                </span>
              </div>
              <div className="brief-req-row">
                <span className="brief-req-num">2</span>
                <span className="brief-req-text">
                  Add <code>enqueue_at(datetime, func, *args, **kwargs)</code> to <code>Queue</code>
                </span>
              </div>
            </div>
          </section>

          <section className="brief-col">
            <h2 className="brief-section-label">Constraints</h2>
            <ul className="brief-constraints">
              <li>A job scheduled for time <em>T</em> must not execute before <em>T</em></li>
              <li>A job scheduled in the past should be treated as immediately ready</li>
              <li>All existing behavior must continue to work unchanged</li>
            </ul>

            <div className="brief-note">
              60 min &mdash; Use the AI as a collaborator, not a crutch.
            </div>
          </section>

        </div>

        <div className="brief-actions">
          <button className="brief-start" onClick={startCoding}>
            Start coding
          </button>
        </div>

      </main>

    </div>
  )
}
