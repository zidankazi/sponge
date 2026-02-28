import { useState, useEffect, useRef, useCallback } from 'react'

export function useTimer(initialSeconds = 3600) {
  const [timeLeft, setTimeLeft] = useState(initialSeconds)
  const [isRunning, setIsRunning] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(intervalRef.current)
            setIsRunning(false)
            return 0
          }
          return t - 1
        })
      }, 1000)
      return () => clearInterval(intervalRef.current)
    }
  }, [isRunning])

  const start = useCallback(() => {
    setTimeLeft(initialSeconds)
    setIsRunning(true)
  }, [initialSeconds])

  const stop = useCallback(() => {
    clearInterval(intervalRef.current)
    setIsRunning(false)
  }, [])

  return { timeLeft, totalTime: initialSeconds, isRunning, start, stop }
}
