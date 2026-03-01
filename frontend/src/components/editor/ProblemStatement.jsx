export default function ProblemStatement({ onCollapse }) {
  return (
    <div className="problem-statement">
      <div className="problem-header">
        <div className="problem-header-left">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>Problem</span>
        </div>
        {onCollapse && (
          <button className="panel-collapse-btn" onClick={onCollapse} title="Collapse problem panel">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
      <h3 className="problem-title">Add Delayed Job Execution</h3>

      <div className="problem-context">
        <h4>Context</h4>
        <p>
          RQ is a Python job queue backed by Redis. Producers enqueue jobs onto named queues.
          Workers run in separate processes — each worker continuously pulls the next available
          job off a queue and executes it. When a job finishes or fails, it moves into a
          registry. Right now, every enqueued job is eligible to run immediately.
        </p>
      </div>

      <div className="problem-requirements">
        <h4>Task</h4>
        <p>Extend RQ so jobs can be scheduled to run at a specific time in the future.</p>
        <ul>
          <li>
            Add <code>enqueue_in(seconds, func, *args, **kwargs)</code> to <code>Queue</code>
          </li>
          <li>
            Add <code>enqueue_at(datetime, func, *args, **kwargs)</code> to <code>Queue</code>
          </li>
        </ul>
      </div>

      <div className="problem-requirements">
        <h4>Expected Behavior</h4>
        <ul>
          <li>A job scheduled for time <em>T</em> must not execute before <em>T</em></li>
          <li>A job scheduled in the past is treated as immediately ready</li>
          <li>All existing behavior must continue to work unchanged</li>
        </ul>
      </div>

      <div className="problem-footer">
        You have <strong>60 minutes</strong>. Use AI as a collaborator, not a crutch.
      </div>
    </div>
  )
}
