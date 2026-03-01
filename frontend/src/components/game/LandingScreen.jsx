import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from '../../hooks/useSession'
import '@fontsource/newsreader/400.css'
import '@fontsource/newsreader/400-italic.css'

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

  // Parallax refs
  const scrollRef = useRef(null)
  const socialProofRef = useRef(null)
  const teamRef = useRef(null)
  const mascot1Ref = useRef(null)
  const mascot2Ref = useRef(null)
  const mascot3Ref = useRef(null)

  useEffect(() => {
    let timeout
    const currentWord = ROTATING_WORDS[wordIndex]

    if (isDeleting) {
      if (text.length > 0) {
        timeout = setTimeout(() => setText(currentWord.substring(0, text.length - 1)), 40)
      } else {
        setIsDeleting(false)
        setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length)
        timeout = setTimeout(() => { }, 200)
      }
    } else {
      if (text.length < currentWord.length) {
        timeout = setTimeout(() => setText(currentWord.substring(0, text.length + 1)), 70)
      } else {
        timeout = setTimeout(() => setIsDeleting(true), 2000)
      }
    }

    return () => clearTimeout(timeout)
  }, [text, isDeleting, wordIndex])

  // Parallax scroll handler
  const handleScroll = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    const scrollTop = container.scrollTop

    // Social proof parallax: scale up then back down
    if (socialProofRef.current) {
      const el = socialProofRef.current
      const rect = el.getBoundingClientRect()
      const windowH = window.innerHeight
      const center = (windowH / 2)
      const elCenter = rect.top + rect.height / 2
      const dist = Math.abs(elCenter - center)
      const maxDist = windowH / 2
      const progress = 1 - Math.min(dist / maxDist, 1)
      const scale = 1 + progress * 0.15
      el.style.transform = `scale(${scale})`
    }

    // Team section parallax
    if (teamRef.current) {
      const el = teamRef.current
      const rect = el.getBoundingClientRect()
      const windowH = window.innerHeight
      const center = windowH / 2
      const elCenter = rect.top + rect.height / 2
      const dist = Math.abs(elCenter - center)
      const maxDist = windowH / 2
      const progress = 1 - Math.min(dist / maxDist, 1)
      const scale = 1 + progress * 0.1
      const opacity = 0.3 + progress * 0.7
      el.style.transform = `scale(${scale})`
      el.style.opacity = opacity
    }

    // Claude mascots — each drifts at a different parallax rate
    if (mascot1Ref.current) {
      const y = scrollTop * -0.15
      const rotate = scrollTop * 0.02
      mascot1Ref.current.style.transform = `translateY(${y}px) rotate(${rotate}deg)`
    }
    if (mascot2Ref.current) {
      const y = scrollTop * -0.3
      const rotate = scrollTop * -0.015
      mascot2Ref.current.style.transform = `translateY(${y}px) rotate(${rotate}deg)`
    }
    if (mascot3Ref.current) {
      const y = scrollTop * -0.08
      const rotate = scrollTop * 0.01
      mascot3Ref.current.style.transform = `translateY(${y}px) rotate(${rotate}deg)`
    }
  }, [])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    container.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll() // initial
    return () => container.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const handleStart = async () => {
    setLoading(true)
    try {
      await beginSession('Guest')
    } finally {
      setLoading(false)
    }
  }

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
    <div className="landing" ref={scrollRef}>
      {/* ── Floating AI mascots ── */}
      <img ref={mascot1Ref} src="/logos/gemini.svg" alt="" className="ai-float ai-float--gemini" />
      <img ref={mascot2Ref} src="/logos/claude.svg" alt="" className="claude-float claude-float--2" />
      <img ref={mascot3Ref} src="/logos/claude.svg" alt="" className="claude-float claude-float--3" />

      {/* ── First viewport: Hero ── */}
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

        <div className="hero-social-proof" ref={socialProofRef}>
          <p className="hero-social-proof-label">COMPANIES ADOPTING AI-ASSISTED INTERVIEWS</p>
          <div className="marquee-container">
            <div className="marquee-content">
              {companies.map((company, i) => (
                <div key={i} className="marquee-item">
                  <img src={company.logo} alt={`${company.name} logo`} className="marquee-logo" style={company.imgStyle} />
                </div>
              ))}
              {companies.map((company, i) => (
                <div key={`dup-${i}`} className="marquee-item">
                  <img src={company.logo} alt={`${company.name} logo`} className="marquee-logo" style={company.imgStyle} />
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── Second viewport: Team Credits ── */}
      <div className="landing-section" ref={teamRef}>
        <div className="landing-section-inner">
          <p className="landing-section-label">BUILT BY</p>
          <div className="landing-team">
            <span className="landing-team-member">Zidan Kazi</span>
            <span className="landing-team-separator">&bull;</span>
            <span className="landing-team-member">Sriram Pankanti</span>
            <span className="landing-team-separator">&bull;</span>
            <span className="landing-team-member">Shreyas Ghosh Roy</span>
          </div>
        </div>
      </div>

      {/* Bottom spacer so there's room to scroll past */}
      <div className="landing-footer-spacer" />
    </div>
  )
}
