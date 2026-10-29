import Link from "next/link"
import { PauseIcon, QuestionIcon, AlertIcon } from "@/app/components/icons"

/**
 * Shown to someone who scans a QR code that can't redirect (see /r/[shortId]):
 *   ?reason=inactive  — the owner's account is disabled, so its codes are paused
 *   ?reason=not-found — no such code (deleted, or a mistyped link)
 *   ?reason=error     — the lookup failed (e.g. the database is briefly down)
 *
 * The visitor is usually a member of the public, so this never says whose code
 * it is or why the account was disabled.
 */

export const metadata = {
  title: "QR code unavailable — QR Go",
  robots: { index: false, follow: false }
}

const MESSAGES = {
  inactive: {
    icon: PauseIcon,
    title: "This QR code is inactive",
    body:
      "The owner of this QR code has paused it, so it isn't linking anywhere right now. " +
      "If you were expecting a page here, please contact the business that shared it."
  },
  "not-found": {
    icon: QuestionIcon,
    title: "QR code not found",
    body:
      "This QR code doesn't exist or has been removed. " +
      "Please check with the business that shared it."
  },
  error: {
    icon: AlertIcon,
    title: "This QR code can't be opened right now",
    body: "Something went wrong on our side. Please try scanning it again in a moment."
  }
}

export default async function CodeUnavailablePage({ searchParams }) {
  const { reason } = await searchParams
  const message = MESSAGES[reason] ?? MESSAGES["not-found"]
  const Icon = message.icon

  return (
    <div style={styles.page}>
      <div
        className="gradient-orb gradient-orb-cyan"
        style={{ ...styles.orb, width: "380px", height: "380px", top: "-100px", left: "-100px" }}
      />
      <div
        className="gradient-orb gradient-orb-purple"
        style={{ ...styles.orb, width: "320px", height: "320px", bottom: "-80px", right: "-80px" }}
      />

      <main className="animate-slideUp" style={styles.card}>
        <div style={styles.icon} aria-hidden="true">
          <Icon size={28} strokeWidth={2.25} />
        </div>
        <h1 style={styles.title}>{message.title}</h1>
        <p style={styles.body}>{message.body}</p>
        <p style={styles.footer}>
          Powered by{" "}
          <Link href="/" style={styles.link}>
            QR Go
          </Link>
        </p>
      </main>
    </div>
  )
}

const styles = {
  page: {
    position: "relative",
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    overflow: "hidden"
  },
  orb: {
    position: "absolute"
  },
  card: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: "440px",
    textAlign: "center",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderRadius: "24px",
    padding: "40px 28px"
  },
  icon: {
    width: "64px",
    height: "64px",
    margin: "0 auto 20px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--cyan)",
    background: "rgba(0, 212, 255, 0.1)",
    border: "1px solid rgba(0, 212, 255, 0.25)"
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    lineHeight: 1.25
  },
  body: {
    color: "var(--text-secondary)",
    fontSize: "0.98rem",
    lineHeight: 1.6,
    marginTop: "12px"
  },
  footer: {
    color: "var(--text-tertiary)",
    fontSize: "0.82rem",
    marginTop: "28px"
  },
  link: {
    color: "var(--cyan)",
    fontWeight: 500
  }
}
