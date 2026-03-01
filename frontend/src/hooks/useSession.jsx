import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { startSession, sendPrompt, logEvent, submitSession } from '../api/client'
import fileContents from '../data/fileContents'

const SessionContext = createContext(null)

const TOTAL_TIME = 60 * 60 // 60 minutes in seconds

export function SessionProvider({ children }) {
  const [sessionId, setSessionId] = useState(null)
  const [view, setView] = useState('idle') // idle | brief | session | results
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME)
  const [activeFile, setActiveFile] = useState('rq/job.py')
  const [openFiles, setOpenFiles] = useState(['rq/job.py'])
  const [fileBuffers, setFileBuffers] = useState(() => ({ ...fileContents }))
  const [chatHistory, setChatHistory] = useState([])
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [username, setUsername] = useState('Anonymous')
  const [checkpoints, setCheckpoints] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [lastSavedBuffers, setLastSavedBuffers] = useState(() => ({ ...fileContents }))
  const timerRef = useRef(null)
  const editDebounceRef = useRef(null)
  const chatHistoryRef = useRef(chatHistory)
  chatHistoryRef.current = chatHistory
  const activeFileRef = useRef(activeFile)
  activeFileRef.current = activeFile
  const fileBuffersRef = useRef(fileBuffers)
  fileBuffersRef.current = fileBuffers
  const submittingRef = useRef(false)

  // Start countdown timer on brief + session screens
  useEffect(() => {
    if ((view === 'brief' || view === 'session') && timeLeft > 0) {
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

  const beginSession = useCallback(async (name) => {
    const resolvedName = name && name.trim() ? name.trim() : 'Anonymous'
    setUsername(resolvedName)
    try {
      const { session_id } = await startSession(resolvedName)
      setSessionId(session_id)
      setView('brief')
      setTimeLeft(TOTAL_TIME)
      setChatHistory([])
      setResults(null)
      setActiveFile('rq/job.py')
      setOpenFiles(['rq/job.py'])
      setFileBuffers({ ...fileContents })
    } catch (err) {
      // ErrorBanner already showing via onApiError — stay on landing screen
      setUsername('')
      throw err
    }
  }, [])

  const startCoding = useCallback(() => {
    setView('session')
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
    clearTimeout(editDebounceRef.current)
    editDebounceRef.current = setTimeout(() => {
      logEvent({ session_id: sessionId, event: 'file_edit', file: path, ts: Date.now() })
    }, 1500)
  }, [sessionId])

  const saveCheckpoint = useCallback((label) => {
    const id = Date.now()
    const resolvedLabel = label || `Checkpoint ${checkpoints.length + 1}`
    const cp = { id, label: resolvedLabel, ts: id, buffers: { ...fileBuffers } }
    setCheckpoints((prev) => [cp, ...prev].slice(0, 30))
    setLastSavedBuffers({ ...fileBuffers })
  }, [fileBuffers, checkpoints.length])

  const restoreCheckpoint = useCallback((id) => {
    const cp = checkpoints.find((c) => c.id === id)
    if (!cp) return
    setFileBuffers({ ...cp.buffers })
    setActiveFile((prev) => (cp.buffers[prev] !== undefined ? prev : 'rq/queue.py'))
  }, [checkpoints])

  const sendChat = useCallback(async (text) => {
    const userMsg = { role: 'user', content: text }
    setChatHistory((prev) => [...prev, userMsg])
    setIsAiLoading(true)

    logEvent({ session_id: sessionId, event: 'prompt_sent', file: activeFileRef.current, ts: Date.now() })

    try {
      const { response_text } = await sendPrompt({
        session_id: sessionId,
        prompt_text: text,
        conversation_history: [...chatHistoryRef.current.filter((m) => m.role !== 'error'), userMsg],
        active_file: activeFileRef.current,
        file_contents: fileBuffersRef.current,
      })
      const aiMsg = { role: 'assistant', content: response_text }
      setChatHistory((prev) => [...prev, aiMsg])
    } catch {
      // Error already emitted via onApiError — add a non-assistant marker
      // so this doesn't pollute conversation_history sent to the API
      setChatHistory((prev) => [
        ...prev,
        { role: 'error', content: 'Something went wrong. Try again.' },
      ])
    } finally {
      setIsAiLoading(false)
    }
  }, [sessionId])

  const submit = useCallback(async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)
    clearInterval(timerRef.current)

    const allCode = Object.entries(fileBuffersRef.current)
      .map(([path, content]) => `// --- ${path} ---\n${content}`)
      .join('\n\n')

    try {
      const res = await submitSession({ session_id: sessionId, final_code: allCode, username })
      setResults(res)
      setView('results')
    } catch {
      // ErrorBanner shows via onApiError — stay in session so user can retry
    } finally {
      setIsSubmitting(false)
      submittingRef.current = false
    }
  }, [sessionId, username])

  // Warn before closing tab during active session
  useEffect(() => {
    if (view === 'brief' || view === 'session') {
      const handler = (e) => { e.preventDefault(); e.returnValue = '' }
      window.addEventListener('beforeunload', handler)
      return () => window.removeEventListener('beforeunload', handler)
    }
  }, [view])

  // Auto-submit when timer expires (must be after submit is declared)
  useEffect(() => {
    if (view === 'session' && timeLeft === 0 && !isSubmitting) {
      submit()
    }
  }, [timeLeft, view, isSubmitting, submit])

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
        setView,
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
        checkpoints,
        lastSavedBuffers,
        showHistory,
        setShowHistory,
        beginSession,
        startCoding,
        openFile,
        closeFile,
        updateFileContent,
        sendChat,
        submit,
        resetSession,
        saveCheckpoint,
        restoreCheckpoint,
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
