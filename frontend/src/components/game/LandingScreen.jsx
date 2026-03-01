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

  // Only verified-working SVGs (atlassian/cursor/rippling files are corrupt)
  // imgStyle overrides per-logo to compensate for different aspect ratios
  const companies = [
    { name: 'Google',  logo: '/logos/google.svg'  },
    { name: 'Meta',    logo: '/logos/meta.svg'    },
    { name: 'OpenAI',  logo: '/logos/openai.svg'  },
    { name: 'Shopify', logo: '/logos/shopify.svg' },
    { name: 'Nvidia',  logo: '/logos/nvidia.svg'  },
    { name: 'Canva',   logo: '/logos/canva.svg',   imgStyle: { height: '48px', width: 'auto' } },
    { name: 'Oracle',  logo: '/logos/oracle.svg'  },
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
