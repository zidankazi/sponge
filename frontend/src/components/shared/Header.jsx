import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function Header({ onTestsTriggered }) {
  const navigate = useNavigate()
  const {
    timeLeft, totalTime, submit, isSubmitting,
    checkpoints, saveCheckpoint, fileBuffers, lastSavedBuffers, setShowHistory,
    runSessionTests, isRunningTests,
  } = useSession()

  const [showToast, setShowToast] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveLabel, setSaveLabel] = useState('')
  const saveLabelRef = useRef(null)

  const pct = (timeLeft / totalTime) * 100
  const timerClass = timeLeft <= 10 ? 'timer--critical' : timeLeft <= 60 ? 'timer--urgent' : ''

  // Dirty flag — set true on any file edit, cleared on save
  const dirtyRef = useRef(false)
  const prevBuffersRef = useRef(lastSavedBuffers)
  if (lastSavedBuffers !== prevBuffersRef.current) {
    prevBuffersRef.current = lastSavedBuffers
    dirtyRef.current = false
  }
  if (fileBuffers !== prevBuffersRef.current && fileBuffers !== lastSavedBuffers) {
    dirtyRef.current = true
  }
  const hasUnsaved = dirtyRef.current

  const handleSave = useCallback(() => {
    setShowSaveModal(true)
    setSaveLabel('')
  }, [])

  const confirmSave = useCallback(() => {
    saveCheckpoint(saveLabel)
    setShowSaveModal(false)
    setSaveLabel('')
    setShowToast(true)
    dirtyRef.current = false
  }, [saveCheckpoint, saveLabel])

  // Focus the input when modal opens
  useEffect(() => {
    if (showSaveModal && saveLabelRef.current) {
      saveLabelRef.current.focus()
    }
  }, [showSaveModal])

  // Cmd/Ctrl+S shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveCheckpoint('')
        setShowToast(true)
        dirtyRef.current = false
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
          <div className="header-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
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
            className="run-btn"
            onClick={() => { runSessionTests(); onTestsTriggered?.() }}
            disabled={isRunningTests}
          >
            {isRunningTests ? (
              <>
                <span className="run-spinner" />
                Running...
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2l10 6-10 6V2z" />
                </svg>
                Run
              </>
            )}
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

      {showSaveModal && (
        <div className="save-modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="save-modal" onClick={(e) => e.stopPropagation()}>
            <div className="save-modal-title">Save Checkpoint</div>
            <input
              ref={saveLabelRef}
              className="save-modal-input"
              type="text"
              placeholder="Label (optional)"
              value={saveLabel}
              onChange={(e) => setSaveLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmSave() }}
            />
            <div className="save-modal-actions">
              <button className="save-modal-cancel" onClick={() => setShowSaveModal(false)}>Cancel</button>
              <button className="save-modal-confirm" onClick={confirmSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
