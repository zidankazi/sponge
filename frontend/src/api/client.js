// API client — mocked for frontend development.
// When the backend is ready, replace mock implementations with real fetch calls.
// Every function signature matches the API contract in AGENTS.md.

const API_BASE = import.meta.env.VITE_API_URL || 'https://sponge-backend.vercel.app'

// Flip individual flags as Sri's endpoints go live
const MOCK = {
  startSession: false,   // ✅ Sri done
  logEvent: false,   // ✅ Sri done
  sendPrompt: false,   // ✅ Gemini live
  submit: false,   // ✅ Sri done
  runTests: false,  // flip to true for local dev without backend
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms))

let eventLog = []

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
  if (MOCK.startSession) {
    await delay(300)
    return { session_id: 'sponge_' + Math.random().toString(36).slice(2, 10) }
  }
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
  if (MOCK.sendPrompt) {
    await delay(800 + Math.random() * 1200)
    return { response_text: getMockResponse(prompt_text) }
  }
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
  if (MOCK.logEvent) {
    eventLog.push({ session_id, event, file, ts })
    return {}
  }
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
  if (MOCK.runTests) {
    await delay(1200)
    return {
      total: 12, passed: 1, failed: 11, pass_rate: 0.08,
      core_failures: ['test_enqueue_in_exists', 'test_enqueue_at_exists'],
      results: [
        { test_name: 'test_enqueue_in_exists', passed: false, is_core: true, error_message: 'AssertionError: Queue is missing the enqueue_in method' },
        { test_name: 'test_enqueue_at_exists', passed: false, is_core: true, error_message: 'AssertionError: Queue is missing the enqueue_at method' },
        { test_name: 'test_existing_enqueue_unchanged', passed: true, is_core: true },
        { test_name: 'test_enqueue_in_returns_job', passed: false, is_core: false, error_message: "AttributeError: 'Queue' object has no attribute 'enqueue_in'" },
        { test_name: 'test_enqueue_at_returns_job', passed: false, is_core: false, error_message: "AttributeError: 'Queue' object has no attribute 'enqueue_at'" },
        { test_name: 'test_scheduled_job_not_in_queue_immediately', passed: false, is_core: false, error_message: "AttributeError: 'Queue' object has no attribute 'enqueue_in'" },
        { test_name: 'test_scheduled_job_in_scheduled_registry', passed: false, is_core: false, error_message: "AttributeError: 'Queue' object has no attribute 'enqueue_in'" },
        { test_name: 'test_enqueue_at_past_datetime', passed: false, is_core: false, error_message: "AttributeError: 'Queue' object has no attribute 'enqueue_at'" },
        { test_name: 'test_enqueue_in_zero_delay', passed: false, is_core: false, error_message: "AttributeError: 'Queue' object has no attribute 'enqueue_in'" },
        { test_name: 'test_worker_moves_ready_jobs', passed: false, is_core: false, error_message: "AttributeError: 'Queue' object has no attribute 'enqueue_in'" },
        { test_name: 'test_multiple_scheduled_jobs_ordering', passed: false, is_core: false, error_message: "AttributeError: 'Queue' object has no attribute 'enqueue_in'" },
        { test_name: 'test_job_status_lifecycle', passed: false, is_core: false, error_message: "AttributeError: 'Queue' object has no attribute 'enqueue_in'" },
      ],
    }
  }
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
  if (MOCK.submit) {
    await delay(1500)
    return {
      total_score: 72,
      breakdown: {
        request_timing: 8,
        request_quality: 9,
        response_handling: 7,
        verification_discipline: 5,
        iterative_collaboration: 8,
        penalties: -2,
      },
      headline_metrics: {
        blind_adoption_rate: 0.15,
        ai_modification_rate: 0.82,
        test_after_ai_rate: 0.40,
        passive_reprompt_rate: 0.10,
        grounded_prompt_rate: 0.75,
        evidence_grounded_followup_rate: 0.60,
      },
      interpretation:
        'Strong collaborative instincts — you asked targeted questions and modified most AI suggestions before applying them. Your verification discipline could improve: consider running tests or reading through AI-generated code more carefully before moving on. You showed good iterative back-and-forth, especially when exploring the worker execution flow. Minor penalty for one instance of copy-pasting a full code block without review.',
      badge: 'On Your Way',
    }
  }
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

// ─── Mock response generator ─────────────────────────────────────────

function getMockResponse(prompt_text) {
  const lower = prompt_text.toLowerCase()

  if (lower.includes('schedule') || lower.includes('delay') || lower.includes('enqueue_in') || lower.includes('enqueue_at')) {
    return `Here's how I'd approach adding delayed job execution to RQ:

**1. Create a ScheduledJobRegistry** in \`rq/registry.py\` — a Redis sorted set where each job is scored by its scheduled execution timestamp. Jobs with score <= now are ready to run.

**2. Add \`enqueue_in\` and \`enqueue_at\` to \`rq/queue.py\`**:

\`\`\`python
def enqueue_at(self, datetime, func, *args, **kwargs):
    """Schedule a job to run at a specific UTC datetime."""
    job = self.enqueue_call(func, args=args, kwargs=kwargs)
    # Instead of pushing to queue, add to scheduled registry
    # with the datetime as the score
    return job

def enqueue_in(self, time_delta, func, *args, **kwargs):
    """Schedule a job to run after time_delta seconds."""
    scheduled_datetime = utcnow() + timedelta(seconds=time_delta)
    return self.enqueue_at(scheduled_datetime, func, *args, **kwargs)
\`\`\`

**3. Modify the worker loop** in \`rq/worker.py\` to periodically check the scheduled registry and move ready jobs to the main queue.

Want me to dig into any of these steps in detail?`
  }

  if (lower.includes('worker') || lower.includes('perform') || lower.includes('execute') || lower.includes('loop')) {
    return `The worker's main loop is in \`rq/worker.py\`, the \`work()\` method (around line 437). Here's the flow:

1. \`register_birth()\` — creates worker hash in Redis
2. Main loop: \`while True\`
   - Check if suspended
   - \`clean_registries()\` — cleanup expired jobs from registries
   - \`dequeue_job_and_maintain_ttl()\` — BLPOP from queue with timeout
   - \`execute_job()\` — fork a work horse process to run the job
3. \`register_death()\` — cleanup on exit

The \`dequeue_job_and_maintain_ttl\` method (line 500) is where the worker blocks waiting for jobs. It uses Redis BLPOP with a timeout, and sends heartbeats between attempts.

If you want scheduled jobs to be picked up, the worker needs to check for ready scheduled jobs somewhere in this loop — likely right next to the \`clean_registries()\` call.

What would you like to explore next?`
  }

  if (lower.includes('queue') || lower.includes('enqueue')) {
    return `Looking at \`rq/queue.py\`, the \`enqueue_call\` method (line 223) is where jobs get created and enqueued:

\`\`\`python
def enqueue_call(self, func, args=None, kwargs=None, timeout=None,
                 result_ttl=None, ttl=None, failure_ttl=None,
                 description=None, depends_on=None, job_id=None,
                 at_front=False, meta=None):
\`\`\`

It creates a Job via \`Job.create()\`, saves it to Redis, then either:
- Adds to DeferredJobRegistry (if it has unfinished dependencies)
- Pushes the job ID onto the queue list (via \`self.push_job_id()\`)

For delayed execution, you'd add a third path: if a scheduled time is specified, add the job to a ScheduledJobRegistry instead of pushing it to the queue immediately.

The \`enqueue_job\` method (line 330) is also relevant — it's the lower-level method that actually pushes to Redis.`
  }

  if (lower.includes('registry') || lower.includes('sorted set')) {
    return `The registry system in \`rq/registry.py\` uses Redis sorted sets. Each registry stores job IDs with a score (usually a timestamp).

The base class \`BaseRegistry\` provides:
- \`add(job, ttl, ...)\` — adds job to sorted set with score = now + ttl
- \`remove(job)\` — removes from set
- \`get_job_ids()\` — returns all job IDs in the set
- \`cleanup()\` — removes expired entries (score < now)

Existing registries:
- **StartedJobRegistry** — jobs currently executing (score = timeout expiry)
- **FinishedJobRegistry** — completed jobs (score = result_ttl expiry)
- **FailedJobRegistry** — failed jobs (score = failure_ttl expiry)
- **DeferredJobRegistry** — jobs waiting on dependencies

A \`ScheduledJobRegistry\` would follow the same pattern but with score = scheduled execution time. Jobs with score <= now are ready.`
  }

  if (lower.includes('test')) {
    return `Good idea to think about testing. The existing test infrastructure uses \`SimpleWorker\` which runs jobs synchronously (no forking), making it easy to test.

Here's a pattern you could follow:

\`\`\`python
def test_enqueue_in(self):
    """Job scheduled with enqueue_in should not run immediately."""
    q = Queue(connection=self.testconn)
    job = q.enqueue_in(60, say_hello, 'world')

    # Job should be in scheduled registry, not in queue
    scheduled = ScheduledJobRegistry(queue=q)
    assert job.id in scheduled.get_job_ids()
    assert q.count == 0  # Not in the regular queue yet
\`\`\`

You'll also want to test:
- \`enqueue_at\` with a past datetime (should run immediately)
- That the worker moves ready scheduled jobs to the queue
- That existing \`enqueue()\` behavior is unchanged`
  }

  return `That's a good question. Let me look at the relevant parts of the codebase.

The key files for this task are:
- **\`rq/queue.py\`** — Queue class, where you'll add \`enqueue_in\` and \`enqueue_at\`
- **\`rq/registry.py\`** — Registry system, where you'll likely add a ScheduledJobRegistry
- **\`rq/worker.py\`** — Worker loop, which needs to check for ready scheduled jobs
- **\`rq/job.py\`** — Job class, may need a \`scheduled_at\` field

The current flow: Queue.enqueue() creates a Job and pushes it directly to the Redis queue list. Workers BLPOP from this list. For delayed execution, you need a way to hold jobs until their scheduled time.

What specific part would you like to dig into first?`
}
