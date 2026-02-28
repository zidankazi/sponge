import { useState } from 'react'
import { useSession } from '../../hooks/useSession'
import '@fontsource/newsreader/400.css' // Regular
import '@fontsource/newsreader/400-italic.css' // Italic

export default function LandingScreen() {
  const { beginSession } = useSession()
  const [loading, setLoading] = useState(false)

  const handleStart = async () => {
    setLoading(true)
    try {
      await beginSession('Guest') // Skip name prompt for cleaner hero, or we can add it back later
    } finally {
      setLoading(false)
    }
  }

  const companies = [
    'Nvidia', 'Meta', 'Canva', 'Shopify', 'Google',
    'Rippling', 'OpenAI', 'Cursor', 'LangChain',
    'ElevenLabs', 'Atlassian', 'Oracle'
  ]

  return (
    <div className="landing">
      <div className="hero-container">

        <div className="hero-header">
          <div className="hero-logo">
            <span className="hero-logo-icon">S</span>
            <span className="hero-logo-text">sponge</span>
          </div>
          <div className="hero-nav">
            <button className="hero-nav-link" onClick={handleStart}>Login &rarr;</button>
          </div>
        </div>

        <div className="hero-main">
          <h1 className="hero-tagline">
            Learn to build, <br />
            <span className="hero-tagline-italic">unbounded by syntax.</span>
          </h1>
          <p className="hero-subline">
            The AI-native environment where your logic matters more than memorized code. We make software engineering accessible to anyone with an idea.
          </p>
          <button className="hero-cta" onClick={handleStart} disabled={loading}>
            {loading ? 'Starting Demo...' : 'View demo'}
          </button>
        </div>

        <div className="hero-social-proof">
          <p className="hero-social-proof-label">COMPANIES USING AI-ASSISTED INTERVIEWS</p>
          <div className="marquee-container">
            <div className="marquee-content">
              {companies.map((company, i) => (
                <span key={i} className="marquee-item">{company}</span>
              ))}
              {/* Duplicate for infinite seamless scrolling */}
              {companies.map((company, i) => (
                <span key={`dup-${i}`} className="marquee-item">{company}</span>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
