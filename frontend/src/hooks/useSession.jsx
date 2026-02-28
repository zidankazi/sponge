import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { startSession, sendPrompt, logEvent, submitSession } from '../api/client'
import fileContents from '../data/fileContents'

const SessionContext = createContext(null)

const TOTAL_TIME = 60 * 60 // 60 minutes in seconds

export function SessionProvider({ children }) {
  const [sessionId, setSessionId] = useState(null)
  const [view, setView] = useState('idle') // idle | session | results
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME)
  const [activeFile, setActiveFile] = useState('rq/job.py')
  const [openFiles, setOpenFiles] = useState(['rq/job.py'])
  const [fileBuffers, setFileBuffers] = useState(() => ({ ...fileContents }))
  const [chatHistory, setChatHistory] = useState([])
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [username, setUsername] = useState('Anonymous')
  const timerRef = useRef(null)

  // Start countdown timer
  useEffect(() => {
    if (view === 'session' && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(timerRef.current)
            return 0
          }
          return t - 1
        })
      }, 1000)
      return () => clearInterval(timerRef.current)
    }
  }, [view])

  // Auto-submit when timer expires
  useEffect(() => {
    if (view === 'session' && timeLeft === 0 && !isSubmitting) {
      submit()
    }
  }, [timeLeft, view, isSubmitting, submit])

  const beginSession = useCallback(async (name) => {
    setUsername(name && name.trim() ? name.trim() : 'Anonymous')
    const { session_id } = await startSession()
    setSessionId(session_id)
    setView('session')
    setTimeLeft(TOTAL_TIME)
    setChatHistory([])
    setResults(null)
    setActiveFile('rq/job.py')
    setOpenFiles(['rq/job.py'])
    setFileBuffers({ ...fileContents })
  }, [])

  const openFile = useCallback((path) => {
    setActiveFile(path)
    setOpenFiles((prev) => (prev.includes(path) ? prev : [...prev, path]))
    logEvent({ session_id: sessionId, event: 'file_open', file: path, ts: Date.now() })
  }, [sessionId])

  const closeFile = useCallback((path) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f !== path)
      if (path === activeFile && next.length > 0) {
        setActiveFile(next[next.length - 1])
      } else if (next.length === 0) {
        setActiveFile(null)
      }
      return next
    })
  }, [activeFile])

  const updateFileContent = useCallback((path, content) => {
    setFileBuffers((prev) => ({ ...prev, [path]: content }))
    logEvent({ session_id: sessionId, event: 'file_edit', file: path, ts: Date.now() })
  }, [sessionId])

  const sendChat = useCallback(async (text) => {
    const userMsg = { role: 'user', content: text }
    setChatHistory((prev) => [...prev, userMsg])
    setIsAiLoading(true)

    logEvent({ session_id: sessionId, event: 'prompt_sent', file: activeFile, ts: Date.now() })

    try {
      const { response_text } = await sendPrompt({
        session_id: sessionId,
        prompt_text: text,
        conversation_history: [...chatHistory, userMsg],
      })
      const aiMsg = { role: 'assistant', content: response_text }
      setChatHistory((prev) => [...prev, aiMsg])
    } catch {
      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Try again.' },
      ])
    } finally {
      setIsAiLoading(false)
    }
  }, [sessionId, activeFile, chatHistory])

  const submit = useCallback(async () => {
    setIsSubmitting(true)
    clearInterval(timerRef.current)

    const allCode = Object.entries(fileBuffers)
      .map(([path, content]) => `// --- ${path} ---\n${content}`)
      .join('\n\n')

    try {
      const res = await submitSession({ session_id: sessionId, final_code: allCode, username })
      setResults(res)
      setView('results')
    } catch {
      // fallback
    } finally {
      setIsSubmitting(false)
    }
  }, [sessionId, fileBuffers, username])

  const resetSession = useCallback(() => {
    setView('idle')
    setSessionId(null)
    setResults(null)
    setChatHistory([])
    setTimeLeft(TOTAL_TIME)
  }, [])

  return (
    <SessionContext.Provider
      value={{
        sessionId,
        view,
        timeLeft,
        totalTime: TOTAL_TIME,
        activeFile,
        openFiles,
        fileBuffers,
        chatHistory,
        isAiLoading,
        results,
        isSubmitting,
        username,
        beginSession,
        openFile,
        closeFile,
        updateFileContent,
        sendChat,
        submit,
        resetSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be inside SessionProvider')
  return ctx
}
