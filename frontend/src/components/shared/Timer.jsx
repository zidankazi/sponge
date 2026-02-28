// Shared Timer display component
// Both Zidan and Designer can use and modify this.

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function Timer({ timeLeft, totalTime }) {
  const pct = (timeLeft / totalTime) * 100
  const urgent = timeLeft < 300

  return (
    <div className={`timer ${urgent ? 'timer--urgent' : ''}`}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.5V8L10.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="timer-text">{formatTime(timeLeft)}</span>
    </div>
  )
}
