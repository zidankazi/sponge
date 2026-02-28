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
    { name: 'Nvidia', logo: '/logos/nvidia.svg' },
    { name: 'Meta', logo: '/logos/meta.svg' },
    { name: 'Canva', logo: '/logos/canva.svg' },
    { name: 'Shopify', logo: '/logos/shopify.svg' },
    { name: 'Google', logo: '/logos/google.svg' },
    { name: 'Rippling', logo: '/logos/rippling.png' },
    { name: 'OpenAI', logo: '/logos/openai.svg' },
    { name: 'Cursor', logo: '/logos/cursor.png' },
    { name: 'LangChain', logo: '/logos/langchain.png' },
    { name: 'ElevenLabs', logo: '/logos/elevenlabs.png' },
    { name: 'Atlassian', logo: '/logos/atlassian.svg' },
    { name: 'Oracle', logo: '/logos/oracle.svg' }
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
            <button className="hero-nav-link" onClick={handleStart}>View demo &rarr;</button>
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
                <div key={i} className="marquee-item">
                  <img src={company.logo} alt={`${company.name} logo`} className="marquee-logo" />
                </div>
              ))}
              {/* Duplicate for infinite seamless scrolling */}
              {companies.map((company, i) => (
                <div key={`dup-${i}`} className="marquee-item">
                  <img src={company.logo} alt={`${company.name} logo`} className="marquee-logo" />
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
