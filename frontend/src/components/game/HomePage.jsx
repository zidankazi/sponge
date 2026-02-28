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
                    <button className="home-nav-cta" onClick={() => setView('idle')}>
                        Try Now
                    </button>
                </div>
            </nav>

            {/* ── Hero ─────────────────────────────────────── */}
            <section className="home-hero">
                <div className="home-hero-inner">
                    <div className="home-hero-text">
                        <h1 className="home-hero-title">
                            Measure how developers <span className="home-hero-highlight">collaborate with AI</span>
                        </h1>
                        <p className="home-hero-sub">
                            Give candidates a real codebase, a real AI assistant, and a real task.
                            Our scoring engine analyzes every interaction to measure collaboration
                            quality — not just whether the code compiles.
                        </p>
                        <div className="home-hero-actions">
                            <button className="home-hero-btn" onClick={() => setView('idle')}>
                                View Demo
                            </button>
                        </div>
                    </div>
                    <div className="home-hero-visual">
                        <div className="home-hero-video-placeholder">
                            <div className="home-hero-video-icon">▶</div>
                            <span>Product Demo</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Trusted By ───────────────────────────────── */}
            <section className="home-trust">
                <p className="home-trust-label">Built for teams that evaluate engineering talent</p>
                <div className="home-trust-logos">
                    <span>YC</span>
                    <span>Stanford</span>
                    <span>Google</span>
                    <span>Meta</span>
                    <span>Stripe</span>
                </div>
            </section>

            {/* ── How It Works ─────────────────────────────── */}
            <section className="home-how" id="how">
                <h2 className="home-how-title">How it works</h2>
                <div className="home-how-grid">
                    <div className="home-how-card">
                        <div className="home-how-card-visual">
                            <div className="home-how-card-mock">
                                <div className="home-how-tag">Python</div>
                                <div className="home-how-tag">Redis</div>
                                <div className="home-how-tag">Open Source</div>
                            </div>
                        </div>
                        <h3>Pick a challenge</h3>
                        <p>Candidates get a real open-source codebase with a feature to implement in 60 minutes.</p>
                    </div>
                    <div className="home-how-card">
                        <div className="home-how-card-visual">
                            <div className="home-how-card-mock">
                                <div className="home-how-chat-line home-how-chat-line--user" />
                                <div className="home-how-chat-line home-how-chat-line--ai" />
                                <div className="home-how-chat-line home-how-chat-line--user home-how-chat-line--short" />
                            </div>
                        </div>
                        <h3>Code with an AI assistant</h3>
                        <p>They use a Gemini-powered assistant to explore, ask questions, and write code.</p>
                    </div>
                    <div className="home-how-card">
                        <div className="home-how-card-visual">
                            <div className="home-how-card-mock">
                                <div className="home-how-score-row">
                                    <span>Prompt Quality</span>
                                    <div className="home-how-score-bar"><div className="home-how-score-fill" style={{ width: '85%' }} /></div>
                                </div>
                                <div className="home-how-score-row">
                                    <span>Verification</span>
                                    <div className="home-how-score-bar"><div className="home-how-score-fill" style={{ width: '60%' }} /></div>
                                </div>
                                <div className="home-how-score-row">
                                    <span>Iteration</span>
                                    <div className="home-how-score-bar"><div className="home-how-score-fill" style={{ width: '92%' }} /></div>
                                </div>
                            </div>
                        </div>
                        <h3>Get detailed scoring</h3>
                        <p>Our engine breaks down collaboration quality across 6 dimensions with actionable insights.</p>
                    </div>
                </div>
            </section>

            {/* ── CTA ──────────────────────────────────────── */}
            <section className="home-cta-section">
                <h2>Ready to see it in action?</h2>
                <p>Try the full 60-minute coding exercise with a real AI assistant.</p>
                <button className="home-hero-btn" onClick={() => setView('idle')}>
                    View Demo
                </button>
            </section>

            {/* ── Footer ───────────────────────────────────── */}
            <footer className="home-footer">
                <div className="home-footer-inner">
                    <span className="home-footer-brand">Sponge</span>
                    <span className="home-footer-copy">© 2025 Sponge · AI-Assisted Coding Assessment</span>
                </div>
            </footer>
        </div>
    )
}
