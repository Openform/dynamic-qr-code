"use client"

import { useId, useRef, useState } from "react"
import styles from "./unlock.module.css"

// Keys are the `error` values from POST /r/[shortId] (or the page's ?error=).
const MESSAGES = {
  wrong: "That password isn’t right. Check it and try again.",
  limited: "Too many wrong tries. Please wait a few minutes and try again.",
  network: "Couldn’t check the password. Check your connection and try again."
}

/**
 * The password field on a code's password page. It posts to the code's link
 * (`action`). With the script loaded, it checks the password without leaving
 * the page and then goes on to the destination; before then, the browser
 * posts the form itself and the server answers with a page (see the route).
 */
export default function UnlockForm({ action, promptId, initialError }) {
  const [password, setPassword] = useState("")
  const [shown, setShown] = useState(false)
  const [error, setError] = useState(MESSAGES[initialError] ? initialError : null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)
  const errorId = useId()

  async function handleSubmit(e) {
    e.preventDefault()
    if (busy) return
    if (password.trim() === "") {
      inputRef.current?.focus()
      return
    }
    const body = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(action, {
        method: "POST",
        body,
        headers: { Accept: "application/json" }
      })
      const data = await res.json().catch(() => ({}))
      // Replace, so Back doesn't return to this page.
      const next = res.ok ? data.url : data.redirect
      if (next) {
        window.location.replace(next)
        return // stay busy while the next page loads
      }
      setError(MESSAGES[data.error] ? data.error : "network")
    } catch {
      setError("network")
    }
    setBusy(false)
    inputRef.current?.select()
  }

  return (
    <form method="post" action={action} onSubmit={handleSubmit} className={styles.form} noValidate>
      {promptId && <input type="hidden" name="prompt" value={promptId} />}
      <label htmlFor="unlock-password" className="input-label">
        Password
      </label>
      <div className={`input-wrapper ${styles.field}`} data-invalid={error === "wrong" ? "true" : undefined}>
        <input
          ref={inputRef}
          id="unlock-password"
          name="password"
          type={shown ? "text" : "password"}
          className={`input-field ${styles.input}`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          // The only thing to do here, so open the keyboard straight away.
          autoFocus
          aria-invalid={error === "wrong" ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="button"
          className={styles.show}
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-controls="unlock-password"
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>

      {error && (
        <div id={errorId} className={`error-message ${styles.error}`} role="alert">
          {MESSAGES[error]}
        </div>
      )}

      <button
        type="submit"
        className={`btn btn-primary ${styles.submit}`}
        // Not disabled while empty: before the script loads, that would stop
        // the browser posting the form itself.
        disabled={busy}
      >
        {busy ? (
          <>
            <span className="spinner" /> Checking…
          </>
        ) : (
          "Continue"
        )}
      </button>
    </form>
  )
}
