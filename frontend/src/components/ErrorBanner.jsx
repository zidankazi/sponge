// ErrorBanner — auto-dismissing toast for API errors
// Subscribes to onApiError from client.js. Shows/hides automatically.

import { useState, useEffect, useCallback } from 'react'
import { onApiError } from '../api/client'

export default function ErrorBanner() {
  const [error, setError] = useState(null)
  const [visible, setVisible] = useState(false)

  const dismiss = useCallback(() => {
    setVisible(false)
    setTimeout(() => setError(null), 300)
  }, [])

  useEffect(() => {
    const unsub = onApiError((err) => {
      setError(err)
      setVisible(true)
      // Auto-dismiss after 5s
      const timer = setTimeout(dismiss, 5000)
      return () => clearTimeout(timer)
    })
    return unsub
  }, [dismiss])

  if (!error) return null

  return (
    <div className={`error-banner ${visible ? 'error-banner--visible' : ''}`}>
      <span className="error-banner-msg">{error.message}</span>
      <button className="error-banner-close" onClick={dismiss}>✕</button>
    </div>
  )
}
