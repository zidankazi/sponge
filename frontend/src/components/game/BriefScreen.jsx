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

      {/* Identical chrome to the coding header */}
      <header className="header">
        <div className="header-left">
          <div className="header-logo">
            <img
              src="/brand/logo-full.png"
              alt="Sponge"
              className="nav-logo-img"
              height={22}
            />
          </div>
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
          <button className="submit-btn" onClick={startCoding}>
            Start coding &rarr;
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="brief-body">
        <div className="brief-content">

          <h1 className="brief-title">
            Add Delayed<br />
            Job Execution
          </h1>

          <div className="brief-text">
            <p>
              RQ is a Python job queue backed by Redis. Producers enqueue jobs onto named queues.
              Workers run in separate processes — each worker continuously pulls the next available
              job off a queue and executes it. When a job finishes or fails, it moves into a
              registry. Right now, every enqueued job is eligible to run immediately.
            </p>
            <p>
              Extend RQ so jobs can be scheduled to run at a specific time in the future.
            </p>
            <ul>
              <li>Add <code>enqueue_in(seconds, func, *args, **kwargs)</code> to <code>Queue</code></li>
              <li>Add <code>enqueue_at(datetime, func, *args, **kwargs)</code> to <code>Queue</code></li>
            </ul>
            <p>
              A job scheduled for time <em>T</em> must not execute before <em>T</em>.
              A job scheduled in the past should be treated as immediately ready.
              All existing behavior must continue to work unchanged.
            </p>
            <p className="brief-aside">
              You have 60 minutes. Use the AI as a collaborator, not a crutch.
            </p>
          </div>

          <button className="hero-cta" onClick={startCoding}>
            Start coding
          </button>

        </div>
      </div>

    </div>
  )
}
