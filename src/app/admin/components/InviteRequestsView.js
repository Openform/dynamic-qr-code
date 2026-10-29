"use client"

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { getPackage, describeLimit } from "@/lib/packages"
import { REPLY_PROMISE, REPLY_WINDOW_MS } from "@/lib/inviteRequests"
import styles from "./InviteRequestsView.module.css"

const HOUR_MS = 60 * 60 * 1000
// Open requests with less than this left before the reply promise is up are
// flagged so they get answered first.
const DUE_SOON_MS = 6 * HOUR_MS

// The current time, refreshed every minute. null while rendering on the
// server, so times are only written in the admin's own time zone.
let minuteNow = 0
function subscribeToClock(onChange) {
  const timer = setInterval(onChange, 60_000)
  return () => clearInterval(timer)
}
function getNow() {
  const now = Date.now()
  if (now - minuteNow >= 60_000) minuteNow = now
  return minuteNow
}
const getServerNow = () => null

function useNow() {
  return useSyncExternalStore(subscribeToClock, getNow, getServerNow)
}

/** 90 seconds → "just now", 3 hours → "3 h ago", 2 days → "2 days ago". */
function timeAgo(iso, now) {
  const ms = now - Date.parse(iso)
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 2) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.floor(hours / 24)} days ago`
}

/** "29 Oct 2026, 09:15" in the admin's time zone. */
function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })
}

/** 1 → "1 h", 0.4 → "under an hour". */
function hoursLabel(ms) {
  const hours = Math.floor(ms / HOUR_MS)
  return hours < 1 ? "under an hour" : `${hours} h`
}

/** Overdue or due-soon flag for an open request, or null. */
function replyFlag(request, now) {
  if (request.handledAt || now === null) return null
  const left = Date.parse(request.createdAt) + REPLY_WINDOW_MS - now
  if (left <= 0) return { tone: "overdue", text: `Overdue by ${hoursLabel(-left)}` }
  if (left <= DUE_SOON_MS) return { tone: "soon", text: `Reply within ${hoursLabel(left)}` }
  return null
}

function planLabel(packageId) {
  if (!packageId) return "Plan: not sure yet"
  return `${getPackage(packageId).name} · ${describeLimit(packageId).toLowerCase()}`
}

function replyHref(request) {
  const subject = encodeURIComponent("Your QR Go invite")
  return `mailto:${request.email}?subject=${subject}`
}

function RequestCard({ request, now, busy, onSetHandled, onDelete }) {
  const flag = replyFlag(request, now)
  const done = Boolean(request.handledAt)

  return (
    <li className={`glass-card-static ${styles.card} ${done ? styles.cardDone : ""}`}>
      <div className={styles.cardTop}>
        <div className={styles.who}>
          <h2 className={styles.name}>{request.name}</h2>
          {request.company && <span className={styles.company}>{request.company}</span>}
        </div>
        <span className={styles.received} title={now === null ? undefined : formatDateTime(request.createdAt)}>
          {now === null ? "" : `Received ${timeAgo(request.createdAt, now)}`}
        </span>
      </div>

      <div className={styles.contact}>
        <a href={`mailto:${request.email}`} className={styles.contactLink}>
          {request.email}
        </a>
        {request.phone && (
          <a href={`tel:${request.phone.replace(/[^\d+]/g, "")}`} className={styles.contactLink}>
            {request.phone}
          </a>
        )}
      </div>

      <div className={styles.tags}>
        <span className={`badge ${request.package ? "badge-cyan" : styles.tagPlain} ${styles.tag}`}>
          {planLabel(request.package)}
        </span>
        {request.hasAccount && (
          <span className={`badge badge-purple ${styles.tag}`}>Already has an account</span>
        )}
        {flag && (
          <span className={`badge ${styles.tag} ${flag.tone === "overdue" ? styles.flagOverdue : styles.flagSoon}`}>
            {flag.text}
          </span>
        )}
      </div>

      <div className={styles.cardFooter}>
        {done ? (
          <p className={styles.doneNote}>
            Marked done
            {request.handledByName && ` by ${request.handledByName}`}
            {now !== null && `, ${formatDateTime(request.handledAt)}`}
          </p>
        ) : (
          <span />
        )}
        <div className={styles.actions}>
          {!done && (
            <a href={replyHref(request)} className="btn btn-secondary btn-sm">
              Reply by email
            </a>
          )}
          <button
            type="button"
            className={`btn btn-sm ${done ? "btn-secondary" : "btn-primary"}`}
            onClick={() => onSetHandled(request, !done)}
            disabled={busy}
          >
            {done ? "Reopen" : "Mark done"}
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn-sm ${styles.deleteButton}`}
            onClick={() => onDelete(request)}
            disabled={busy}
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  )
}

/** Whether new requests are emailed to the team, with a button to test it. */
function EmailAlertsPanel({ status }) {
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  async function sendTest() {
    setSending(true)
    setResult(null)
    try {
      const res = await fetch("/api/admin/invite-alert/test", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not send the test email.")
      setResult({
        ok: true,
        text: `Resend accepted the test email to ${data.to.join(", ")}. It should arrive within a minute. If it doesn't, check spam.`
      })
    } catch (err) {
      setResult({
        ok: false,
        text:
          err instanceof TypeError
            ? "Couldn't reach QR Go. Check your connection and try again."
            : `The test email wasn't sent: ${err.message}`
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <section className={`glass-card-static ${styles.alerts}`} aria-labelledby="email-alerts-title">
      <div className={styles.alertsTop}>
        <div className={styles.alertsBody}>
          <h2 id="email-alerts-title" className={styles.alertsTitle}>
            Email alerts
            <span
              className={`badge ${styles.tag} ${status.configured ? "badge-success" : styles.flagOverdue}`}
            >
              {status.configured ? "On" : "Off"}
            </span>
          </h2>
          {status.configured ? (
            <p className={styles.alertsText}>
              Each new request is emailed to <strong>{status.to.join(", ")}</strong> from{" "}
              <strong>{status.from}</strong>, through Resend.
            </p>
          ) : (
            <p className={styles.alertsText}>
              No emails are being sent: the server doesn&apos;t have <code>RESEND_API_KEY</code>.
              Add it to the app&apos;s environment variables, then restart or redeploy the app.
              Requests are still saved here.
            </p>
          )}
        </div>
        {status.configured && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={sendTest}
            disabled={sending}
          >
            {sending ? "Sending…" : "Send test email"}
          </button>
        )}
      </div>
      {result && (
        <p role="status" className={result.ok ? styles.alertsOk : styles.alertsError}>
          <span aria-hidden="true">{result.ok ? "✓" : "⚠"}</span> {result.text}
        </p>
      )}
    </section>
  )
}

export default function InviteRequestsView({ initialRequests, alertStatus }) {
  const [requests, setRequests] = useState(initialRequests)
  const [view, setView] = useState("open")
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState("")
  const now = useNow()

  const open = requests.filter((r) => !r.handledAt)
  const done = requests.filter((r) => r.handledAt)
  // Open requests oldest first, so the one closest to its deadline is on top.
  const shown = view === "open" ? [...open].reverse() : done

  async function handleSetHandled(request, handled) {
    setBusyId(request.id)
    setError("")
    try {
      const res = await fetch(`/api/admin/invite-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handled })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not update the request.")
      setRequests((prev) => prev.map((r) => (r.id === request.id ? data.request : r)))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(request) {
    const ok = confirm(
      `Delete the request from ${request.name} (${request.email})?\n\nThis can't be undone.`
    )
    if (!ok) return
    setBusyId(request.id)
    setError("")
    try {
      const res = await fetch(`/api/admin/invite-requests/${request.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not delete the request.")
      setRequests((prev) => prev.filter((r) => r.id !== request.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={`container ${styles.headerInner}`}>
          <div className={styles.headerGroup}>
            <Link href="/admin">
              <span className={`gradient-text ${styles.logo}`}>QR Go</span>
            </Link>
            <span className={`badge badge-purple ${styles.adminBadge}`}>Admin</span>
          </div>
          <Link href="/admin" className="btn btn-ghost btn-sm">
            ← Back to Accounts
          </Link>
        </div>
      </header>

      <main className={`container ${styles.main}`}>
        <h1 className={styles.pageTitle}>Invite requests</h1>
        <p className={styles.pageSubtitle}>
          People who asked for an invite on the website. They were told they&apos;d hear
          back {REPLY_PROMISE}. Reply, then mark the request done.
        </p>

        <EmailAlertsPanel status={alertStatus} />

        <div className={`qr-tabs ${styles.tabs}`} role="group" aria-label="Show requests">
          <button
            type="button"
            aria-pressed={view === "open"}
            className={`qr-tab ${view === "open" ? "qr-tab-active" : ""}`}
            onClick={() => setView("open")}
          >
            Open ({open.length})
          </button>
          <button
            type="button"
            aria-pressed={view === "done"}
            className={`qr-tab ${view === "done" ? "qr-tab-active" : ""}`}
            onClick={() => setView("done")}
          >
            Done ({done.length})
          </button>
        </div>

        {error && (
          <div className="error-message" role="alert" style={{ marginBottom: "var(--space-lg)" }}>
            <span>⚠</span> {error}
          </div>
        )}

        {shown.length === 0 ? (
          <div className={`glass-card-static ${styles.empty}`}>
            {view === "open"
              ? "No open requests. New ones from the website show up here."
              : "Nothing marked done yet."}
          </div>
        ) : (
          <ul className={styles.list}>
            {shown.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                now={now}
                busy={busyId === request.id}
                onSetHandled={handleSetHandled}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
