import { useState, useEffect, useCallback } from 'react'
import { useSession } from '../../hooks/useSession'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function Header() {
  const {
    timeLeft, totalTime, submit, isSubmitting,
    checkpoints, saveCheckpoint, fileBuffers, setShowHistory,
  } = useSession()

  const [showToast, setShowToast] = useState(false)

  const pct = (timeLeft / totalTime) * 100
  const timerClass = timeLeft <= 10 ? 'timer--critical' : timeLeft <= 60 ? 'timer--urgent' : ''

  // Unsaved changes detection
  const hasUnsaved = checkpoints.length === 0 ||
    JSON.stringify(fileBuffers) !== JSON.stringify(checkpoints[0].buffers)

  const handleSave = useCallback(() => {
    const label = window.prompt('Checkpoint label (optional):') || ''
    saveCheckpoint(label)
    setShowToast(true)
  }, [saveCheckpoint])

  // Cmd/Ctrl+S shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveCheckpoint('')
        setShowToast(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [saveCheckpoint])

  // Auto-hide toast
  useEffect(() => {
    if (!showToast) return
    const t = setTimeout(() => setShowToast(false), 1500)
    return () => clearTimeout(t)
  }, [showToast])

  return (
    <>
      <header className="header">
        <div className="header-left">
          <div className="header-logo">
            <img
              src="/brand/logo-full.png"
              srcSet="/brand/logo-full.png 1x"
              alt="Sponge"
              className="nav-logo-img"
              height={22}
            />
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
          <button className="save-btn" onClick={handleSave}>
            Save
            {hasUnsaved && <span className="save-btn-dot" />}
          </button>
          <button className="history-btn" onClick={() => setShowHistory(true)}>
            History
          </button>
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
      {showToast && <div className="save-toast">Saved ✓</div>}
    </>
  )
}
