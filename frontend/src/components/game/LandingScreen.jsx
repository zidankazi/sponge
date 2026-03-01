import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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

// Component: Pixelated sponge orbiting the team names with a bubble trail
function OrbitingMascot() {
  const canvasRef = useRef(null)
  const mascotRef = useRef(null)
  const trailRef = useRef([])
  const angleRef = useRef(0)
  const frameCount = useRef(0)

  useEffect(() => {
    const mascot = mascotRef.current
    const canvas = canvasRef.current
    if (!mascot || !canvas) return

    const ctx = canvas.getContext('2d')
    let animId

    const speed = 0.006
    const mascotSize = 36
    const maxBubbles = 30
    const bubbleSpacing = 4 // record a bubble every N frames

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      canvas.width = parent.offsetWidth
      canvas.height = parent.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const tick = () => {
      angleRef.current += speed
      frameCount.current++
      const a = angleRef.current

      // Ellipse radii scale with the container so the orbit wraps around the text
      const radiusX = canvas.width * 0.40
      const radiusY = canvas.height * 0.42

      const cx = canvas.width / 2
      // Lower the entire orbit by 20px so the bottom clears the names
      const cy = (canvas.height / 2) + 20

      const x = cx + Math.cos(a) * radiusX
      const y = cy + Math.sin(a) * radiusY

      // Gentle wobble instead of full rotation
      const wobble = Math.sin(a * 3) * 12

      // Update mascot position and wobble
      mascot.style.left = `${x - mascotSize / 2}px`
      mascot.style.top = `${y - mascotSize / 2}px`
      mascot.style.transform = `rotate(${wobble}deg)`

      // Store bubble (spaced out)
      if (frameCount.current % bubbleSpacing === 0) {
        // Random size and slight horizontal offset for organic feel
        const bSize = 3 + Math.random() * 5
        const offsetX = (Math.random() - 0.5) * 8
        trailRef.current.push({ x: x + offsetX, y, size: bSize, age: 0 })
        if (trailRef.current.length > maxBubbles) trailRef.current.shift()
      }

      // Draw bubbles — they float upward and fade out
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const total = trailRef.current.length
      for (let i = 0; i < total; i++) {
        const b = trailRef.current[i]
        b.age++
        // Float upward over time
        b.y -= 0.3

        const t = i / total // 0=oldest, 1=newest
        const opacity = t * 0.3

        // Bubble ring
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(150, 210, 255, ${opacity})`
        ctx.lineWidth = 1
        ctx.stroke()

        // Subtle fill
        ctx.fillStyle = `rgba(150, 210, 255, ${opacity * 0.15})`
        ctx.fill()

        // Highlight dot (top-left of bubble)
        if (b.size > 3) {
          ctx.beginPath()
          ctx.arc(b.x - b.size * 0.3, b.y - b.size * 0.3, b.size * 0.2, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.6})`
          ctx.fill()
        }
      }

      animId = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} className="orbit-trail" />
      <img
        ref={mascotRef}
        src="/logos/sponge-pixel.svg"
        alt=""
        className="orbit-mascot"
      />
    </>
  )
}

// Component to handle scroll-driven individual letter revealing
function TeamNameReveal({ name, containerRef, staggerIndex = 0 }) {
  const letters = name.split('')
  const nameRef = useRef(null)

  // We'll update inline styles on spans for performance instead of state
  const letterRefs = useRef([])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      if (!nameRef.current) return

      const rect = nameRef.current.getBoundingClientRect()
      const windowH = window.innerHeight

      // Calculate how far the element is from the bottom of the screen to the middle
      // We offset the reveal window based on the staggerIndex so they happen sequentially
      // Zidan (0) reveals earliest, Shreyas (2) reveals last
      const staggerOffset = staggerIndex * 0.08 * windowH

      // Because the footer spacer is only 35vh, the text physically cannot reach the center
      // of the screen (50%) when you scroll to the absolute bottom.
      // So, finish revealing much lower on the screen (around 80% to 70% from top)
      const startRevealY = windowH * 1.05 - staggerOffset
      const endRevealY = windowH * 0.80 - staggerOffset

      // 0 = just entered start bound, 1 = fully at end bound
      const progress = Math.max(0, Math.min(1, (startRevealY - rect.top) / (startRevealY - endRevealY)))

      // Stagger the letter opacities
      letterRefs.current.forEach((letterSpan, idx) => {
        if (!letterSpan) return

        // Calculate an individual threshold for this letter
        // letters at the start of the word reveal earlier
        const letterThreshold = idx / letters.length

        // Calculate opacity: 
        // We use a steep curve so a letter goes from minOpacity to 1 quickly once its threshold is met
        const letterProgress = Math.max(0, Math.min(1, (progress - (letterThreshold * 0.6)) * 4))

        const minOpacity = 0.25
        const currentOpacity = minOpacity + (1 - minOpacity) * letterProgress

        letterSpan.style.color = `rgba(255, 255, 255, ${currentOpacity})`
      })
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll() // initial
    return () => container.removeEventListener('scroll', handleScroll)
  }, [containerRef, letters.length])

  return (
    <span ref={nameRef} className="team-name-reveal">
      {letters.map((char, i) => (
        <span
          key={i}
          ref={(el) => (letterRefs.current[i] = el)}
          style={{ color: 'rgba(255, 255, 255, 0.25)', transition: 'color 0.1s ease-out' }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  )
}

export default function LandingScreen() {
  const navigate = useNavigate()
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
  const mascot4Ref = useRef(null)

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

    // Team section parallax (keep scaling, let the Reveal component handle opacity)
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
      el.style.transform = `scale(${scale})`
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
    // mascot3 is the orbiting Claude — no parallax override needed
    if (mascot4Ref.current) {
      const y = scrollTop * -0.22
      const rotate = scrollTop * -0.025
      mascot4Ref.current.style.transform = `translateY(${y}px) rotate(${rotate}deg)`
    }
  }, [])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    container.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll() // initial
    return () => container.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const handleStart = () => {
    navigate('/demo')
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
      {/* mascot3 is now rendered as OrbitingMascot inside the team section */}
      <img ref={mascot4Ref} src="/logos/chatgpt.svg" alt="" className="ai-float ai-float--chatgpt" />

      {/* ── First viewport: Hero ── */}
      <div className="hero-container">

        <div className="hero-header">
          <div className="hero-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
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
          <button className="hero-cta" onClick={handleStart}>
            View demo
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
        <OrbitingMascot />
        <div className="landing-section-inner">
          <p className="landing-section-label">BUILT BY</p>
          <div className="landing-team">
            <a href="https://www.zidankazi.com/" target="_blank" rel="noreferrer" className="landing-team-member">
              <TeamNameReveal name="Zidan Kazi" containerRef={scrollRef} staggerIndex={0} />
            </a>
            <span className="landing-team-separator">&bull;</span>
            <a href="https://www.linkedin.com/in/sriram-pankanti/" target="_blank" rel="noreferrer" className="landing-team-member">
              <TeamNameReveal name="Sriram Pankanti" containerRef={scrollRef} staggerIndex={1} />
            </a>
            <span className="landing-team-separator">&bull;</span>
            <a href="https://www.linkedin.com/in/shreyas-ghosh-roy/" target="_blank" rel="noreferrer" className="landing-team-member">
              <TeamNameReveal name="Shreyas Ghosh Roy" containerRef={scrollRef} staggerIndex={2} />
            </a>
          </div>
        </div>
      </div>

      {/* Bottom spacer so there's room to scroll past */}
      <div className="landing-footer-spacer">
        <a href="https://github.com/zidankazi/sponge" target="_blank" rel="noreferrer" className="github-pill">
          Check this out on Github
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
      </div>
    </div>
  )
}
