"use client"

import { useEffect, useEffectEvent, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { PACKAGES, describeLimit } from "@/lib/packages"
import { HONEYPOT_FIELD, INVITE_FIELD_LIMITS, REPLY_PROMISE } from "@/lib/inviteRequests"
import styles from "./InviteRequest.module.css"

/** Link to "/" + this (e.g. from /register) to open the form on the landing page. */
export const INVITE_REQUEST_HASH = "#request-invite"

const EMPTY_FORM = {
  name: "",
  email: "",
  company: "",
  phone: "",
  package: "",
  [HONEYPOT_FIELD]: ""
}

function ClockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

/**
 * "Request an invite" button that opens the request form in a popup.
 * Whatever the visitor has typed is kept if they close the popup before
 * sending, and cleared once the request is sent.
 *
 * openOnHash: also open when the page's URL ends in #request-invite.
 */
export default function InviteRequestButton({
  className,
  id,
  openOnHash = false,
  children = "Request an invite"
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  // { name, email } once the request has been sent.
  const [sent, setSent] = useState(null)

  const openIfHashMatches = useEffectEvent(() => {
    if (window.location.hash === INVITE_REQUEST_HASH) setOpen(true)
  })

  useEffect(() => {
    if (!openOnHash) return
    const onHashChange = () => openIfHashMatches()
    onHashChange()
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [openOnHash])

  function handleClosed() {
    setOpen(false)
    if (sent) {
      setForm(EMPTY_FORM)
      setSent(null)
    }
    // Drop the #request-invite so a refresh doesn't open the form again.
    if (window.location.hash === INVITE_REQUEST_HASH) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        id={id}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <InviteRequestDialog
            form={form}
            setForm={setForm}
            sent={sent}
            onSent={setSent}
            onClosed={handleClosed}
          />,
          document.body
        )}
    </>
  )
}

function InviteRequestDialog({ form, setForm, sent, onSent, onClosed }) {
  const dialogRef = useRef(null)
  const firstFieldRef = useRef(null)
  const doneRef = useRef(null)
  const pressStartedOnBackdrop = useRef(false)
  const [error, setError] = useState("")
  const [sending, setSending] = useState(false)

  const uid = useId()
  const ids = {
    title: `${uid}-title`,
    intro: `${uid}-intro`,
    name: `${uid}-name`,
    email: `${uid}-email`,
    company: `${uid}-company`,
    phone: `${uid}-phone`,
    package: `${uid}-package`,
    trap: `${uid}-trap`
  }

  const notifyClosed = useEffectEvent(() => onClosed())

  // Open as a modal: the rest of the page can't be clicked or tabbed to, and
  // Escape closes it. Page scrolling is paused while it's open.
  useEffect(() => {
    const dialog = dialogRef.current
    // Ignore a close event that arrives while the dialog is open again (dev
    // mode runs this effect twice, and close events are delivered later).
    const handleClose = () => {
      if (!dialog.open) notifyClosed()
    }
    dialog.addEventListener("close", handleClose)
    if (!dialog.open) dialog.showModal()

    const root = document.documentElement
    const previousOverflow = root.style.overflow
    root.style.overflow = "hidden"

    return () => {
      dialog.removeEventListener("close", handleClose)
      if (dialog.open) dialog.close()
      root.style.overflow = previousOverflow
    }
  }, [])

  // Start in the first field (not on touch screens, where it would pop the
  // keyboard over the form), and on the Done button once it's sent.
  useEffect(() => {
    if (sent) {
      doneRef.current?.focus()
    } else if (window.matchMedia("(pointer: fine)").matches) {
      firstFieldRef.current?.focus()
    }
  }, [sent])

  function close() {
    dialogRef.current?.close()
  }

  // Clicking the dimmed backdrop closes the popup. Both the press and the
  // release must be on the backdrop, so selecting text in a field and letting
  // go outside doesn't close it.
  function handlePointerDown(e) {
    pressStartedOnBackdrop.current = e.target === e.currentTarget
  }
  function handleClick(e) {
    if (pressStartedOnBackdrop.current && e.target === e.currentTarget) close()
    pressStartedOnBackdrop.current = false
  }

  function update(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setError("")
    try {
      const res = await fetch("/api/invite-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || "We couldn't send your request. Please try again.")
      }
      onSent({ name: form.name.trim(), email: form.email.trim() })
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "We couldn't reach QR Go. Check your connection and try again."
          : err.message
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={ids.title}
      aria-describedby={ids.intro}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <div className={styles.panel}>
        <button
          type="button"
          className={`modal-close ${styles.close}`}
          onClick={close}
          aria-label="Close"
        >
          ✕
        </button>

        {sent ? (
          <div className={styles.success}>
            <span className={styles.successIcon} aria-hidden="true">
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" />
              </svg>
            </span>
            <h2 id={ids.title} className={styles.title}>
              Request sent
            </h2>
            <p id={ids.intro} className={styles.intro} role="status">
              Thanks, {sent.name.split(" ")[0]}. We&apos;ll get back to you at{" "}
              <strong className={styles.strong}>{sent.email}</strong> {REPLY_PROMISE}.
            </p>
            <button
              ref={doneRef}
              type="button"
              className={`btn btn-primary ${styles.doneButton}`}
              onClick={close}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 id={ids.title} className={styles.title}>
              Request an invite
            </h2>
            <p id={ids.intro} className={styles.intro}>
              Tell us a little about yourself and we&apos;ll get back to you{" "}
              <span className={styles.promise}>
                <ClockIcon />
                {REPLY_PROMISE}
              </span>
              .
            </p>

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label htmlFor={ids.name} className="input-label">
                    Full name
                  </label>
                  <input
                    ref={firstFieldRef}
                    id={ids.name}
                    type="text"
                    className="input-field"
                    value={form.name}
                    onChange={update("name")}
                    maxLength={INVITE_FIELD_LIMITS.name}
                    autoComplete="name"
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor={ids.email} className="input-label">
                    Email
                  </label>
                  <input
                    id={ids.email}
                    type="email"
                    className="input-field"
                    value={form.email}
                    onChange={update("email")}
                    maxLength={INVITE_FIELD_LIMITS.email}
                    autoComplete="email"
                    spellCheck={false}
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor={ids.company} className="input-label">
                    Company <span className={styles.optional}>(optional)</span>
                  </label>
                  <input
                    id={ids.company}
                    type="text"
                    className="input-field"
                    value={form.company}
                    onChange={update("company")}
                    maxLength={INVITE_FIELD_LIMITS.company}
                    autoComplete="organization"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor={ids.phone} className="input-label">
                    Phone <span className={styles.optional}>(optional)</span>
                  </label>
                  <input
                    id={ids.phone}
                    type="tel"
                    className="input-field"
                    value={form.phone}
                    onChange={update("phone")}
                    maxLength={INVITE_FIELD_LIMITS.phone}
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor={ids.package} className="input-label">
                  Plan you&apos;re interested in
                </label>
                <select
                  id={ids.package}
                  className="input-field"
                  value={form.package}
                  onChange={update("package")}
                >
                  <option value="">Not sure yet</option>
                  {PACKAGES.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} · {describeLimit(pkg.id).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Spam trap: hidden from people, filled in by simple bots. */}
              <div className={styles.trap} aria-hidden="true">
                <label htmlFor={ids.trap}>Leave this empty</label>
                <input
                  id={ids.trap}
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form[HONEYPOT_FIELD]}
                  onChange={update(HONEYPOT_FIELD)}
                />
              </div>

              {error && (
                <div className={`error-message ${styles.error}`} role="alert">
                  <span aria-hidden="true">⚠</span> {error}
                </div>
              )}

              <div className={styles.footer}>
                <p className={styles.privacy}>
                  We&apos;ll only use these details to reply to you. See our{" "}
                  <Link href="/privacy" target="_blank">
                    Privacy Policy
                  </Link>
                  .
                </p>
                <button
                  type="submit"
                  className={`btn btn-primary ${styles.submit}`}
                  disabled={sending}
                >
                  {sending ? (
                    <>
                      <span className="spinner" /> Sending…
                    </>
                  ) : (
                    "Send request"
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </dialog>
  )
}
