import { useState } from 'react'
import { useSession } from '../../hooks/useSession'

const TEST_LABELS = {
  test_enqueue_in_exists: 'enqueue_in method exists',
  test_enqueue_at_exists: 'enqueue_at method exists',
  test_existing_enqueue_unchanged: 'Existing enqueue unchanged',
  test_enqueue_in_returns_job: 'enqueue_in returns a Job',
  test_enqueue_at_returns_job: 'enqueue_at returns a Job',
  test_scheduled_job_not_in_queue_immediately: 'Scheduled job not in queue immediately',
  test_scheduled_job_in_scheduled_registry: 'Scheduled job in registry',
  test_enqueue_at_past_datetime: 'Past datetime executes immediately',
  test_enqueue_in_zero_delay: 'Zero delay executes immediately',
  test_worker_moves_ready_jobs: 'Worker moves ready jobs',
  test_multiple_scheduled_jobs_ordering: 'Multiple jobs ordered correctly',
  test_job_status_lifecycle: 'Job status lifecycle',
}

function TestRow({ result }) {
  const [expanded, setExpanded] = useState(false)
  const label = TEST_LABELS[result.test_name] || result.test_name
  const hasFailed = !result.passed && result.error_message

  return (
    <div className={`test-item ${result.passed ? 'test-item--passed' : 'test-item--failed'}`}>
      <button
        className="test-item-row"
        onClick={() => hasFailed && setExpanded(!expanded)}
        style={{ cursor: hasFailed ? 'pointer' : 'default' }}
      >
        <span className="test-item-icon">
          {result.passed ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </span>
        <span className="test-item-name">{label}</span>
        {result.is_core && <span className="test-core-badge">CORE</span>}
        {hasFailed && (
          <span className={`test-item-chevron ${expanded ? 'test-item-chevron--open' : ''}`}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </button>
      {expanded && hasFailed && (
        <div className="test-error">
          <code>{result.error_message}</code>
        </div>
      )}
    </div>
  )
}

export default function TestResultsPanel() {
  const { testResults, isRunningTests } = useSession()

  if (isRunningTests) {
    return (
      <div className="test-results">
        <div className="test-running">
          <div className="test-running-spinner" />
          <span>Running tests...</span>
        </div>
      </div>
    )
  }

  if (!testResults) {
    return (
      <div className="test-results">
        <div className="test-empty">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M4 2l8 0 0 12-8 0z" />
            <path d="M6 5.5h4M6 8h4M6 10.5h2" />
          </svg>
          <p>Run tests to validate your implementation.</p>
        </div>
      </div>
    )
  }

  const coreTests = testResults.results?.filter((r) => r.is_core) || []
  const featureTests = testResults.results?.filter((r) => !r.is_core) || []
  const allPassed = testResults.failed === 0

  return (
    <div className="test-results">
      <div className={`test-summary ${allPassed ? 'test-summary--pass' : 'test-summary--fail'}`}>
        <span className="test-summary-count">
          <strong>{testResults.passed}</strong>/{testResults.total} passed
        </span>
        <div className="test-summary-bar">
          <div
            className="test-summary-bar-fill"
            style={{ width: `${(testResults.pass_rate || 0) * 100}%` }}
          />
        </div>
      </div>

      <div className="test-list">
        {coreTests.length > 0 && (
          <div className="test-section-label">Core Requirements</div>
        )}
        {coreTests.map((r) => (
          <TestRow key={r.test_name} result={r} />
        ))}

        {featureTests.length > 0 && (
          <div className="test-section-label">Feature Tests</div>
        )}
        {featureTests.map((r) => (
          <TestRow key={r.test_name} result={r} />
        ))}
      </div>
    </div>
  )
}
