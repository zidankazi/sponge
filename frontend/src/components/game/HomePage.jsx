import { useSession } from '../../hooks/useSession'

export default function HomePage() {
    const { setView } = useSession()

    return (
        <div className="home">
            {/* ── Nav ──────────────────────────────────────── */}
            <nav className="home-nav">
                <div className="home-nav-inner">
                    <div className="home-nav-brand">
                        <span className="home-nav-logo">S</span>
                        <span className="home-nav-name">Sponge</span>
                    </div>
                    <div className="home-nav-links">
                        <a href="#features" className="home-nav-link">Features</a>
                        <a href="#how" className="home-nav-link">How It Works</a>
                        <button className="home-nav-cta" onClick={() => setView('idle')}>
                            View Demo
                        </button>
                    </div>
                </div>
            </nav>

            {/* ── Hero ─────────────────────────────────────── */}
            <section className="home-hero">
                <div className="home-hero-inner">
                    <h1 className="home-hero-title">
                        AI changed how we code.
                        <span className="home-hero-highlight">We measure it.</span>
                    </h1>
                    <p className="home-hero-sub">
                        Assess how developers actually collaborate with AI — not whether they
                        can memorize algorithms. Real codebases, real tools, real signal.
                    </p>
                    <div className="home-hero-actions">
                        <button className="home-hero-btn" onClick={() => setView('idle')}>
                            View Demo
                        </button>
                        <button className="home-hero-btn-secondary" onClick={() => setView('leaderboard')}>
                            View Leaderboard
                        </button>
                    </div>
                </div>
            </section>

            {/* ── Features ─────────────────────────────────── */}
            <section className="home-features" id="features">
                <h2 className="home-features-title">
                    Built for the AI-native engineering era.
                </h2>
                <div className="home-features-grid">
                    <div className="home-feature-card">
                        <div className="home-feature-icon">⌨️</div>
                        <h3>Real Codebases</h3>
                        <p>
                            Candidates work inside actual open-source projects — not toy problems.
                            They read, navigate, and extend real code with a full IDE experience.
                        </p>
                    </div>
                    <div className="home-feature-card">
                        <div className="home-feature-icon">🤖</div>
                        <h3>AI Collaboration Scoring</h3>
                        <p>
                            We analyze how candidates prompt, validate, and iterate with an AI
                            assistant. Copy-paste coders score low. Thoughtful collaborators shine.
                        </p>
                    </div>
                    <div className="home-feature-card">
                        <div className="home-feature-icon">📊</div>
                        <h3>Transparent Metrics</h3>
                        <p>
                            Detailed breakdowns of prompting quality, verification discipline,
                            and iterative collaboration — not just "pass/fail".
                        </p>
                    </div>
                </div>
            </section>

            {/* ── How It Works ─────────────────────────────── */}
            <section className="home-how" id="how">
                <h2 className="home-how-title">How It Works</h2>
                <div className="home-how-steps">
                    <div className="home-how-step">
                        <div className="home-how-number">1</div>
                        <h3>Open the IDE</h3>
                        <p>Candidates get a full editor with a real codebase and an AI assistant panel.</p>
                    </div>
                    <div className="home-how-step">
                        <div className="home-how-number">2</div>
                        <h3>Solve the Task</h3>
                        <p>They implement a feature using the AI — prompting, reading, and writing code.</p>
                    </div>
                    <div className="home-how-step">
                        <div className="home-how-number">3</div>
                        <h3>Get Scored</h3>
                        <p>Our engine analyzes every interaction to produce a collaboration quality score.</p>
                    </div>
                </div>
            </section>

            {/* ── CTA ──────────────────────────────────────── */}
            <section className="home-cta-section">
                <h2>Ready to see it in action?</h2>
                <p>Try the full coding exercise — 60 minutes, real codebase, AI assistant included.</p>
                <button className="home-hero-btn" onClick={() => setView('idle')}>
                    View Demo
                </button>
            </section>

            {/* ── Footer ───────────────────────────────────── */}
            <footer className="home-footer">
                <div className="home-footer-inner">
                    <span className="home-footer-brand">Sponge</span>
                    <span className="home-footer-copy">AI-Assisted Coding Assessment Platform</span>
                </div>
            </footer>
        </div>
    )
}
