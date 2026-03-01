import { useState, useEffect } from 'react'
import { useSession } from '../../hooks/useSession'
import '@fontsource/newsreader/400.css' // Regular
import '@fontsource/newsreader/400-italic.css' // Italic

const ROTATING_WORDS = [
  'workflow.',
  'ecosystem.',
  'stack.',
  'craft.',
  'engineering.',
  'future.'
]

export default function LandingScreen() {
  const { beginSession } = useSession()
  const [loading, setLoading] = useState(false)

  // Typing effect state
  const [wordIndex, setWordIndex] = useState(0)
  const [text, setText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    let timeout
    const currentWord = ROTATING_WORDS[wordIndex]

    if (isDeleting) {
      if (text.length > 0) {
        timeout = setTimeout(() => setText(currentWord.substring(0, text.length - 1)), 40) // fast delete
      } else {
        setIsDeleting(false)
        setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length)
        timeout = setTimeout(() => { }, 200) // slight pause before typing next
      }
    } else {
      if (text.length < currentWord.length) {
        timeout = setTimeout(() => setText(currentWord.substring(0, text.length + 1)), 70) // type speed
      } else {
        timeout = setTimeout(() => setIsDeleting(true), 2000) // pause at end of word
      }
    }

    return () => clearTimeout(timeout)
  }, [text, isDeleting, wordIndex])

  const handleStart = async () => {
    setLoading(true)
    try {
      await beginSession('Guest') // Skip name prompt for cleaner hero, or we can add it back later
    } finally {
      setLoading(false)
    }
  }

  // Only verified-working SVGs (atlassian/cursor/rippling files are corrupt)
  // imgStyle overrides per-logo to compensate for different aspect ratios
  const companies = [
    { name: 'Google', logo: '/logos/google.svg' },
    { name: 'Meta', logo: '/logos/meta.svg' },
    { name: 'OpenAI', logo: '/logos/openai.svg' },
    { name: 'Shopify', logo: '/logos/shopify.svg' },
    { name: 'Nvidia', logo: '/logos/nvidia.svg' },
    { name: 'Canva', logo: '/logos/canva.svg', imgStyle: { height: '48px', width: 'auto' } },
    { name: 'Oracle', logo: '/logos/oracle.svg' },
  ]

  return (
    <div className="landing">
      <div className="hero-container">

        <div className="hero-header">
          <div className="hero-logo">
            <img
              src="/brand/logo-full.png"
              alt="Sponge"
              className="hero-logo-img"
              height={34}
            />
          </div>
          <div className="hero-nav">
            <button className="hero-nav-link" onClick={handleStart}>View demo &rarr;</button>
          </div>
        </div>

        <div className="hero-main">
          <h1 className="hero-tagline">
            Master the <br />
            <span className="hero-tagline-italic">
              AI-native <span className="typing-text">{text}</span>
              <span className="typing-cursor">|</span>
            </span>
          </h1>
          <p className="hero-subline">
            Stop memorizing syntax. Start architecting systems. Practice building real-world software side-by-side with an AI pair programmer.
          </p>
          <button className="hero-cta" onClick={handleStart} disabled={loading}>
            {loading ? 'Starting Demo...' : 'View demo'}
          </button>
        </div>

        <div className="hero-social-proof">
          <p className="hero-social-proof-label">COMPANIES ADOPTING AI-ASSISTED INTERVIEWS</p>
          <div className="marquee-container">
            <div className="marquee-content">
              {companies.map((company, i) => (
                <div key={i} className="marquee-item">
                  <img src={company.logo} alt={`${company.name} logo`} className="marquee-logo" style={company.imgStyle} />
                </div>
              ))}
              {/* Duplicate for infinite seamless scrolling */}
              {companies.map((company, i) => (
                <div key={`dup-${i}`} className="marquee-item">
                  <img src={company.logo} alt={`${company.name} logo`} className="marquee-logo" style={company.imgStyle} />
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
