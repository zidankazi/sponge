// API client — all endpoints hit the live backend.
// Every function signature matches the API contract in AGENTS.md.

const API_BASE = import.meta.env.VITE_API_URL || 'https://sponge-backend.vercel.app'

// ─── Error handling ───────────────────────────────────────────────────

// Subscribers get called with { message, endpoint, retriable }
const errorListeners = new Set()
export function onApiError(fn) {
  errorListeners.add(fn)
  return () => errorListeners.delete(fn)
}
export function emitError(message, endpoint, retriable = false) {
  errorListeners.forEach((fn) => fn({ message, endpoint, retriable }))
}

async function safeFetch(url, options, { endpoint, silent = false } = {}) {
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const msg = `${endpoint} failed (${res.status})`
    if (!silent) emitError(msg, endpoint)
    throw new Error(msg + ': ' + text)
  }
  return res
}

// ─── POST /session/start ─────────────────────────────────────────────

export async function startSession(username) {
  try {
    const res = await safeFetch(`${API_BASE}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    }, { endpoint: 'session/start' })
    return res.json()
  } catch (err) {
    emitError('Could not start session — is the backend running?', 'session/start')
    throw err
  }
}

// ─── POST /prompt ────────────────────────────────────────────────────

export async function sendPrompt({ session_id, prompt_text, conversation_history, active_file, file_contents }) {
  try {
    const res = await safeFetch(`${API_BASE}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id, prompt_text, conversation_history, active_file, file_contents }),
    }, { endpoint: 'prompt' })
    return res.json()
  } catch (err) {
    emitError('AI assistant unavailable — try again', 'prompt', true)
    throw err
  }
}

// ─── POST /session/event ─────────────────────────────────────────────

export async function logEvent({ session_id, event, file, ts }) {
  try {
    await safeFetch(`${API_BASE}/session/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id, event, file, ts }),
    }, { endpoint: 'session/event', silent: true })
  } catch {
    // Non-critical — swallow silently so the session doesn't break
  }
  return {}
}

// ─── POST /run-tests ─────────────────────────────────────────────────

export async function runTests({ session_id, file_contents }) {
  try {
    const res = await safeFetch(`${API_BASE}/run-tests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id, file_contents }),
    }, { endpoint: 'run-tests' })
    return res.json()
  } catch (err) {
    emitError('Test run failed — try again', 'run-tests', true)
    throw err
  }
}

// ─── POST /submit ────────────────────────────────────────────────────

export async function submitSession({ session_id, final_code, username }) {
  try {
    const res = await safeFetch(`${API_BASE}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id, final_code, username }),
    }, { endpoint: 'submit' })
    return res.json()
  } catch (err) {
    emitError('Submission failed — please try again', 'submit', true)
    throw err
  }
}
