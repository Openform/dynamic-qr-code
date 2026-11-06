"use client"

/**
 * A popup at the bottom of the dashboard that says what just happened and
 * offers to undo it in one click: "Created 5 QR codes" (undo moves them to
 * Trash) or "Moved 3 QR codes to Trash" (undo restores them).
 *
 * - `title` / `subtitle`: the message, e.g. "Created 5 QR codes" + "in PPECB".
 * - `actions`: extra buttons shown before Undo, `[{ id, label, title, onClick }]`
 *   (bulk creation uses one to download a CSV).
 * - `onUndo()`: performs the undo and resolves to a result, or throws an Error
 *   whose message is shown to the user (the button stays so they can retry).
 *   Without it the popup is just a notice, with no Undo button.
 * - `doneMessage(result)`: the text shown after a successful undo.
 * - `autoDismissMs`: go away after this long (null = stay until dismissed).
 */

import { useState, useEffect, useRef } from "react"

// How long the outcome of an undo stays on screen.
const RESULT_VISIBLE_MS = 8000

export default function UndoToast({
  title,
  subtitle = "",
  actions = [],
  undoLabel = "Undo",
  onUndo,
  doneMessage,
  autoDismissMs = null,
  onDismiss
}) {
  const [phase, setPhase] = useState("ready") // ready | undoing | done
  const [error, setError] = useState("")
  const [result, setResult] = useState(null)

  // Keep the latest onDismiss and phase without re-arming the timers when they
  // change.
  const dismissRef = useRef(onDismiss)
  const phaseRef = useRef(phase)
  useEffect(() => {
    dismissRef.current = onDismiss
    phaseRef.current = phase
  })

  // Go away after autoDismissMs, unless an undo is in flight at that moment.
  useEffect(() => {
    if (autoDismissMs === null) return
    const timer = setTimeout(() => {
      if (phaseRef.current !== "undoing") dismissRef.current()
    }, autoDismissMs)
    return () => clearTimeout(timer)
  }, [autoDismissMs])

  // After an undo, show the outcome briefly and then go away.
  useEffect(() => {
    if (phase !== "done") return
    const timer = setTimeout(() => dismissRef.current(), RESULT_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [phase])

  async function handleUndo() {
    setPhase("undoing")
    setError("")
    try {
      setResult(await onUndo())
      setPhase("done")
    } catch (e) {
      setError(e?.message || "Couldn’t undo. Please try again.")
      setPhase("ready")
    }
  }

  return (
    <div
      id="undo-toast"
      className={`toast ${error ? "toast-error" : "toast-success"}`}
      style={styles.banner}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" style={styles.icon}>
        {phase === "done" ? "↩" : "✓"}
      </span>

      <div style={styles.text}>
        {phase === "done" ? (
          <span>{doneMessage ? doneMessage(result) : "Undone."}</span>
        ) : (
          <>
            <strong>{title}</strong>
            {subtitle ? <span style={styles.muted}> {subtitle}</span> : null}
            {error && <div style={styles.error}>{error}</div>}
          </>
        )}
      </div>

      {phase !== "done" && (
        <div style={styles.actions}>
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              id={action.id}
              className="btn btn-ghost btn-sm"
              onClick={action.onClick}
              disabled={phase === "undoing"}
              title={action.title}
            >
              {action.label}
            </button>
          ))}
          {onUndo && (
            <button
              type="button"
              id="undo-toast-btn"
              className="btn btn-secondary btn-sm"
              onClick={handleUndo}
              disabled={phase === "undoing"}
            >
              {phase === "undoing" ? (
                <>
                  <span className="spinner" /> Undoing…
                </>
              ) : (
                undoLabel
              )}
            </button>
          )}
        </div>
      )}

      {phase !== "undoing" && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={styles.close}
        >
          ✕
        </button>
      )}
    </div>
  )
}

const styles = {
  banner: {
    position: "fixed",
    left: "50%",
    bottom: "24px",
    transform: "translateX(-50%)",
    zIndex: 2000,
    flexWrap: "wrap",
    maxWidth: "min(680px, calc(100vw - 32px))",
    width: "max-content"
  },
  icon: {
    color: "var(--success)",
    fontSize: "1.1rem"
  },
  text: {
    flex: "1 1 180px",
    minWidth: 0
  },
  muted: {
    color: "var(--text-secondary)"
  },
  error: {
    marginTop: "4px",
    fontSize: "0.82rem",
    color: "var(--error)"
  },
  actions: {
    display: "flex",
    gap: "8px",
    alignItems: "center"
  },
  close: {
    color: "var(--text-tertiary)",
    fontSize: "1rem",
    padding: "4px"
  }
}
