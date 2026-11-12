import Link from "next/link"
import { redirect } from "next/navigation"
import { ContentTypeIcon } from "@/app/components/icons"
import { contentFromDestination, destinationFor, getContentType } from "@/lib/contentTypes"

const { getQRCodeByShortId } = require("@/lib/db")

/**
 * GET /r/[shortId]/open — the page an email, phone call or text message code
 * lands on (see /r/[shortId]). It shows what will happen and has one button
 * that opens the mail, phone or messages app. Scanner apps and phone
 * browsers don't reliably follow a redirect straight to a mailto:, tel: or
 * sms: link, but they always follow a tap.
 *
 * The scan has already been counted by /r/[shortId], so opening this page
 * directly isn't counted.
 *
 * The visitor is usually a member of the public, so the page shows only the
 * content the code's owner chose to share (an address or number, and the
 * subject and message they set). The code's title is an internal label and
 * isn't shown. The link on the button is rebuilt from checked fields
 * (lib/contentTypes.js), so a bad stored value shows the error page rather
 * than a link of another kind.
 */

export const metadata = {
  title: "QR Go",
  robots: { index: false, follow: false },
  // Don't tell the mail or messages app, or anything else, which code this was.
  referrer: "no-referrer"
}

const SHORT_ID = /^[A-Za-z0-9_-]{1,32}$/

const TEXT = {
  email: {
    title: "Send an email",
    to: "To",
    button: "Write email"
  },
  phone: {
    title: "Call this number",
    to: null,
    button: "Call"
  },
  sms: {
    title: "Send a text message",
    to: "To",
    button: "Write message"
  }
}

/** The code's checked content, or the reason to show /code-unavailable instead. */
async function loadAction(shortId) {
  if (!SHORT_ID.test(shortId)) return { reason: "not-found" }
  let qrcode
  try {
    qrcode = await getQRCodeByShortId(shortId)
  } catch (error) {
    console.error("Action page lookup error:", error)
    return { reason: "error" }
  }
  if (!qrcode) return { reason: "not-found" }
  const type = getContentType(qrcode.content_type)
  // Only email, phone and text message codes use this page.
  if (type.kind !== "action") return { reason: "not-found" }
  if (qrcode.owner_disabled_at) return { reason: "inactive" }

  const content = contentFromDestination(type.id, qrcode.destination_url)
  const href = content && destinationFor(type.id, content)
  if (!href) return { reason: "error" }
  return { type: type.id, content, href }
}

export default async function ActionPage({ params }) {
  const { shortId } = await params
  const action = await loadAction(shortId)
  // redirect() works by throwing, so it's called outside any try/catch.
  if (action.reason) redirect(`/code-unavailable?reason=${action.reason}`)

  const { type, content, href } = action
  const text = TEXT[type]
  const recipient = type === "email" ? content.to : content.number
  const subject = type === "email" ? content.subject : ""
  const message = type === "email" ? content.body : type === "sms" ? content.message : ""

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
          <ContentTypeIcon type={type} size={28} strokeWidth={2.25} />
        </div>
        <h1 style={styles.title}>{text.title}</h1>
        <p style={styles.recipient}>
          {text.to && <span style={styles.muted}>{text.to} </span>}
          <span style={styles.strong}>{recipient}</span>
        </p>

        {(subject || message) && (
          <dl style={styles.preview}>
            {subject && (
              <>
                <dt style={styles.previewLabel}>Subject</dt>
                <dd style={styles.previewText}>{subject}</dd>
              </>
            )}
            {message && (
              <>
                <dt style={styles.previewLabel}>Message</dt>
                <dd style={{ ...styles.previewText, ...styles.message }}>{message}</dd>
              </>
            )}
          </dl>
        )}

        <a href={href} className="btn btn-primary" style={styles.button}>
          {text.button}
        </a>
        {type !== "phone" && (
          <p style={styles.hint}>You can change the message before you send it.</p>
        )}

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
  recipient: {
    fontSize: "1.05rem",
    lineHeight: 1.5,
    marginTop: "10px",
    overflowWrap: "anywhere"
  },
  muted: {
    color: "var(--text-secondary)"
  },
  strong: {
    fontWeight: 600
  },
  preview: {
    textAlign: "left",
    marginTop: "20px",
    padding: "14px 16px",
    borderRadius: "14px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)"
  },
  previewLabel: {
    fontSize: "0.75rem",
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginTop: "2px"
  },
  previewText: {
    margin: "2px 0 10px",
    fontSize: "0.95rem",
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere"
  },
  message: {
    whiteSpace: "pre-wrap",
    maxHeight: "180px",
    overflowY: "auto",
    marginBottom: 0
  },
  button: {
    width: "100%",
    marginTop: "24px",
    padding: "14px 20px",
    fontSize: "1rem",
    justifyContent: "center"
  },
  hint: {
    color: "var(--text-tertiary)",
    fontSize: "0.82rem",
    marginTop: "10px"
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
