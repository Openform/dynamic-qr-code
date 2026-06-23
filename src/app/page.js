import Link from "next/link"

export default function LandingPage() {
  return (
    <div className="page-wrapper">
      {/* Gradient Orb Decorations */}
      <div
        className="gradient-orb gradient-orb-cyan"
        style={{
          width: "500px",
          height: "500px",
          top: "-200px",
          right: "-100px",
          position: "absolute"
        }}
      />
      <div
        className="gradient-orb gradient-orb-purple"
        style={{
          width: "400px",
          height: "400px",
          bottom: "200px",
          left: "-150px",
          position: "absolute"
        }}
      />
      <div
        className="gradient-orb gradient-orb-pink"
        style={{
          width: "350px",
          height: "350px",
          bottom: "-100px",
          right: "20%",
          position: "absolute"
        }}
      />

      {/* ---- Navigation ---- */}
      <nav style={styles.nav}>
        <div className="container" style={styles.navInner}>
          <Link href="/" style={styles.logo}>
            <span className="gradient-text" style={styles.logoText}>
              QRFlow
            </span>
          </Link>
          <div style={styles.navLinks}>
            <Link
              href="/login"
              className="btn btn-primary btn-sm"
              id="nav-signin"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* ---- Hero Section ---- */}
      <main>
        <section style={styles.hero}>
          <div className="container" style={styles.heroContent}>
            <div style={styles.heroText}>
              <h1 style={styles.heroHeading}>
                Create <span className="gradient-text">Dynamic QR Codes</span>{" "}
                That Evolve With You
              </h1>
              <p style={styles.heroSubtitle}>
                Generate beautiful QR codes with real-time analytics. Change
                destinations anytime without reprinting. Track every scan with
                precision.
              </p>
              <div style={styles.heroCTAs}>
                <Link
                  href="/login"
                  className="btn btn-primary"
                  id="hero-signin"
                  style={{ padding: "14px 32px", fontSize: "1.05rem" }}
                >
                  Sign In
                </Link>
              </div>
            </div>

            {/* Decorative QR Code Visual */}
            <div className="animate-float" style={styles.heroVisual}>
              <div style={styles.qrVisualCard}>
                <svg
                  viewBox="0 0 200 200"
                  width="220"
                  height="220"
                  style={styles.qrSvg}
                >
                  {/* QR-code-like decorative grid */}
                  {[
                    [0, 0],
                    [0, 1],
                    [0, 2],
                    [0, 3],
                    [0, 4],
                    [0, 5],
                    [0, 6],
                    [0, 12],
                    [0, 13],
                    [0, 14],
                    [0, 15],
                    [0, 16],
                    [0, 17],
                    [0, 18],
                    [1, 0],
                    [1, 6],
                    [1, 8],
                    [1, 10],
                    [1, 12],
                    [1, 18],
                    [2, 0],
                    [2, 2],
                    [2, 3],
                    [2, 4],
                    [2, 6],
                    [2, 8],
                    [2, 9],
                    [2, 12],
                    [2, 14],
                    [2, 15],
                    [2, 16],
                    [2, 18],
                    [3, 0],
                    [3, 2],
                    [3, 3],
                    [3, 4],
                    [3, 6],
                    [3, 10],
                    [3, 12],
                    [3, 14],
                    [3, 15],
                    [3, 16],
                    [3, 18],
                    [4, 0],
                    [4, 2],
                    [4, 3],
                    [4, 4],
                    [4, 6],
                    [4, 9],
                    [4, 10],
                    [4, 12],
                    [4, 14],
                    [4, 15],
                    [4, 16],
                    [4, 18],
                    [5, 0],
                    [5, 6],
                    [5, 8],
                    [5, 12],
                    [5, 18],
                    [6, 0],
                    [6, 1],
                    [6, 2],
                    [6, 3],
                    [6, 4],
                    [6, 5],
                    [6, 6],
                    [6, 8],
                    [6, 10],
                    [6, 12],
                    [6, 13],
                    [6, 14],
                    [6, 15],
                    [6, 16],
                    [6, 17],
                    [6, 18],
                    [7, 8],
                    [7, 9],
                    [7, 10],
                    [8, 0],
                    [8, 1],
                    [8, 3],
                    [8, 4],
                    [8, 6],
                    [8, 8],
                    [8, 10],
                    [8, 11],
                    [8, 13],
                    [8, 15],
                    [8, 17],
                    [8, 18],
                    [9, 1],
                    [9, 2],
                    [9, 5],
                    [9, 7],
                    [9, 9],
                    [9, 12],
                    [9, 14],
                    [9, 16],
                    [10, 0],
                    [10, 3],
                    [10, 5],
                    [10, 6],
                    [10, 8],
                    [10, 10],
                    [10, 11],
                    [10, 13],
                    [10, 15],
                    [10, 17],
                    [10, 18],
                    [11, 1],
                    [11, 4],
                    [11, 8],
                    [11, 9],
                    [11, 10],
                    [11, 14],
                    [11, 16],
                    [12, 0],
                    [12, 1],
                    [12, 2],
                    [12, 3],
                    [12, 4],
                    [12, 5],
                    [12, 6],
                    [12, 8],
                    [12, 10],
                    [12, 12],
                    [12, 14],
                    [12, 16],
                    [12, 17],
                    [12, 18],
                    [13, 0],
                    [13, 6],
                    [13, 9],
                    [13, 10],
                    [13, 13],
                    [13, 15],
                    [14, 0],
                    [14, 2],
                    [14, 3],
                    [14, 4],
                    [14, 6],
                    [14, 8],
                    [14, 11],
                    [14, 12],
                    [14, 14],
                    [14, 17],
                    [14, 18],
                    [15, 0],
                    [15, 2],
                    [15, 3],
                    [15, 4],
                    [15, 6],
                    [15, 9],
                    [15, 13],
                    [15, 16],
                    [16, 0],
                    [16, 2],
                    [16, 3],
                    [16, 4],
                    [16, 6],
                    [16, 8],
                    [16, 10],
                    [16, 12],
                    [16, 14],
                    [16, 15],
                    [16, 17],
                    [16, 18],
                    [17, 0],
                    [17, 6],
                    [17, 10],
                    [17, 12],
                    [17, 13],
                    [17, 16],
                    [18, 0],
                    [18, 1],
                    [18, 2],
                    [18, 3],
                    [18, 4],
                    [18, 5],
                    [18, 6],
                    [18, 8],
                    [18, 10],
                    [18, 11],
                    [18, 14],
                    [18, 15],
                    [18, 17],
                    [18, 18]
                  ].map(([row, col], i) => (
                    <rect
                      key={i}
                      x={col * 10.5 + 2}
                      y={row * 10.5 + 2}
                      width="9"
                      height="9"
                      rx="1.5"
                      fill={`url(#qrGradient)`}
                      opacity={0.85}
                    />
                  ))}
                  <defs>
                    <linearGradient
                      id="qrGradient"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="100%"
                    >
                      <stop offset="0%" stopColor="#00d4ff" />
                      <stop offset="50%" stopColor="#7c3aed" />
                      <stop offset="100%" stopColor="#f472b6" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Features Section ---- */}
        <section style={styles.section}>
          <div className="container">
            <h2 style={styles.sectionTitle}>
              Everything You Need to{" "}
              <span className="gradient-text">Succeed</span>
            </h2>
            <p style={styles.sectionSubtitle}>
              Powerful features designed for modern businesses and creators.
            </p>
            <div className="grid-responsive" style={{ marginTop: "48px" }}>
              {/* Feature Card 1 */}
              <div className="glass-card" style={styles.featureCard}>
                <div style={styles.featureIcon}>🔗</div>
                <h3 style={styles.featureTitle}>Dynamic Links</h3>
                <p style={styles.featureDesc}>
                  Update your QR code destinations anytime. No need to reprint
                  or redistribute — your links stay current.
                </p>
              </div>

              {/* Feature Card 2 */}
              <div className="glass-card" style={styles.featureCard}>
                <div style={styles.featureIcon}>📊</div>
                <h3 style={styles.featureTitle}>Real-time Analytics</h3>
                <p style={styles.featureDesc}>
                  Track every scan with detailed analytics. Know when, where,
                  and how your QR codes are being used.
                </p>
              </div>

              {/* Feature Card 3 */}
              <div className="glass-card" style={styles.featureCard}>
                <div style={styles.featureIcon}>⚡</div>
                <h3 style={styles.featureTitle}>Easy Management</h3>
                <p style={styles.featureDesc}>
                  Create, edit, and organize all your QR codes from a single
                  beautiful dashboard. No complexity.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- How It Works Section ---- */}
        <section style={styles.section}>
          <div className="container">
            <h2 style={styles.sectionTitle}>
              How It <span className="gradient-text">Works</span>
            </h2>
            <p style={styles.sectionSubtitle}>
              Three simple steps to get started with dynamic QR codes.
            </p>
            <div style={styles.stepsGrid}>
              {/* Step 1 */}
              <div style={styles.step}>
                <div style={styles.stepNumber}>1</div>
                <h3 style={styles.stepTitle}>Create</h3>
                <p style={styles.stepDesc}>
                  Enter your destination URL and customize colors. Your dynamic
                  QR code is generated instantly.
                </p>
              </div>

              {/* Step 2 */}
              <div style={styles.step}>
                <div style={styles.stepNumber}>2</div>
                <h3 style={styles.stepTitle}>Share</h3>
                <p style={styles.stepDesc}>
                  Download your QR code and place it anywhere — print materials,
                  websites, products, or social media.
                </p>
              </div>

              {/* Step 3 */}
              <div style={styles.step}>
                <div style={styles.stepNumber}>3</div>
                <h3 style={styles.stepTitle}>Track</h3>
                <p style={styles.stepDesc}>
                  Monitor scans in real time. Update destinations whenever you
                  want without changing the QR code.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- CTA Section ---- */}
        <section style={{ ...styles.section, paddingBottom: "120px" }}>
          <div className="container" style={{ textAlign: "center" }}>
            <h2 style={{ ...styles.sectionTitle, marginBottom: "16px" }}>
              Ready to Get <span className="gradient-text">Started</span>?
            </h2>
            <p style={{ ...styles.sectionSubtitle, marginBottom: "32px" }}>
              Join thousands of businesses using QRFlow to create smarter QR
              codes.
            </p>
            <Link
              href="/login"
              className="btn btn-primary"
              id="cta-get-started"
              style={{ padding: "16px 40px", fontSize: "1.1rem" }}
            >
              Sign In
            </Link>
          </div>
        </section>
      </main>

      {/* ---- Footer ---- */}
      <footer style={styles.footer}>
        <div className="container" style={styles.footerInner}>
          <span
            className="gradient-text"
            style={{ fontWeight: 600, fontSize: "1.1rem" }}
          >
            QRFlow
          </span>
          <p style={{ color: "var(--text-tertiary)", fontSize: "0.85rem" }}>
            © {new Date().getFullYear()} QRFlow. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}

const styles = {
  /* Nav */
  nav: {
    position: "sticky",
    top: 0,
    zIndex: 100,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    background: "rgba(10, 10, 26, 0.8)",
    borderBottom: "1px solid rgba(255,255,255,0.06)"
  },
  navInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "64px"
  },
  logo: {
    display: "flex",
    alignItems: "center"
  },
  logoText: {
    fontSize: "1.5rem",
    fontWeight: 700,
    letterSpacing: "-0.02em"
  },
  navLinks: {
    display: "flex",
    alignItems: "center",
    gap: "8px"
  },

  /* Hero */
  hero: {
    paddingTop: "80px",
    paddingBottom: "80px",
    position: "relative",
    minHeight: "90dvh",
    display: "flex",
    alignItems: "center"
  },
  heroContent: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "48px",
    flexWrap: "wrap"
  },
  heroText: {
    flex: "1 1 480px",
    maxWidth: "600px"
  },
  heroHeading: {
    fontSize: "clamp(2.2rem, 5vw, 3.5rem)",
    fontWeight: 700,
    lineHeight: 1.15,
    letterSpacing: "-0.03em",
    marginBottom: "24px"
  },
  heroSubtitle: {
    fontSize: "1.15rem",
    color: "var(--text-secondary)",
    lineHeight: 1.7,
    marginBottom: "36px",
    maxWidth: "520px"
  },
  heroCTAs: {
    display: "flex",
    gap: "16px",
    flexWrap: "wrap"
  },
  heroVisual: {
    flex: "0 1 auto",
    display: "flex",
    justifyContent: "center"
  },
  qrVisualCard: {
    padding: "32px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "24px",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)"
  },
  qrSvg: {
    display: "block"
  },

  /* Sections */
  section: {
    padding: "80px 0",
    position: "relative"
  },
  sectionTitle: {
    fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)",
    fontWeight: 700,
    textAlign: "center",
    letterSpacing: "-0.02em",
    marginBottom: "12px"
  },
  sectionSubtitle: {
    textAlign: "center",
    color: "var(--text-secondary)",
    fontSize: "1.05rem",
    maxWidth: "500px",
    margin: "0 auto"
  },

  /* Feature Cards */
  featureCard: {
    padding: "32px",
    textAlign: "center"
  },
  featureIcon: {
    fontSize: "2.5rem",
    marginBottom: "20px"
  },
  featureTitle: {
    fontSize: "1.2rem",
    fontWeight: 600,
    marginBottom: "12px"
  },
  featureDesc: {
    color: "var(--text-secondary)",
    fontSize: "0.95rem",
    lineHeight: 1.7
  },

  /* Steps */
  stepsGrid: {
    display: "flex",
    justifyContent: "center",
    gap: "48px",
    marginTop: "48px",
    flexWrap: "wrap"
  },
  step: {
    textAlign: "center",
    maxWidth: "280px"
  },
  stepNumber: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #00d4ff, #7c3aed)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.4rem",
    fontWeight: 700,
    color: "#fff",
    margin: "0 auto 20px"
  },
  stepTitle: {
    fontSize: "1.15rem",
    fontWeight: 600,
    marginBottom: "10px"
  },
  stepDesc: {
    color: "var(--text-secondary)",
    fontSize: "0.95rem",
    lineHeight: 1.7
  },

  /* Footer */
  footer: {
    borderTop: "1px solid rgba(255,255,255,0.06)",
    padding: "24px 0"
  },
  footerInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "12px"
  }
}
