import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          background: 'var(--bg-root, #0a0a0a)',
          color: 'var(--cream, #f5f0e8)',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ color: 'var(--text-dim, #888)', fontSize: '14px' }}>
            An unexpected error occurred.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              background: 'var(--green-dark, #1a3a2a)',
              color: 'var(--cream, #f5f0e8)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
