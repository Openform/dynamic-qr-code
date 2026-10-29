import Link from "next/link"

/** Top bar for the public pages (landing, legal). */
export default function SiteHeader() {
  return (
    <nav style={styles.nav}>
      <div className="container" style={styles.navInner}>
        <Link href="/" style={styles.logo}>
          <span className="gradient-text" style={styles.logoText}>
            QR Go
          </span>
        </Link>
        <div style={styles.navLinks}>
          <Link href="/login" className="btn btn-primary btn-sm" id="nav-signin">
            Sign In
          </Link>
        </div>
      </div>
    </nav>
  )
}

const styles = {
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
  }
}
