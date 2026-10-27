"use client"

import { useEffect, useState } from "react"

/**
 * Confirmation dialog for account actions (disable, delete).
 *
 * `onConfirm(typedText)` should throw an Error (shown inline) when the server
 * rejects the action, and resolve when it succeeds — the parent closes the
 * modal on success.
 *
 * When `requireText` is set, the confirm button stays disabled until that text
 * is typed (case-insensitive), so a destructive action can't be a misclick.
 */
export default function ConfirmActionModal({
  title,
  children,
  confirmLabel,
  busyLabel,
  danger = false,
  requireText = null,
  onConfirm,
  onClose
}) {
  const [typed, setTyped] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !busy) onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose, busy])

  const matches =
    !requireText || typed.trim().toLowerCase() === requireText.trim().toLowerCase()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!matches || busy) return
    setBusy(true)
    setError("")
    try {
      await onConfirm(typed.trim())
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.")
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-action-title"
        style={{ maxWidth: "480px" }}
      >
        <div className="modal-header">
          <h2 id="confirm-action-title" className="modal-title">
            {title}
          </h2>
          <button
            className="modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={styles.body}>{children}</div>

          {requireText && (
            <div className="input-group">
              <label htmlFor="confirm-action-text" className="input-label">
                Type <strong style={styles.requireText}>{requireText}</strong> to confirm
              </label>
              <input
                id="confirm-action-text"
                type="text"
                className="input-field"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}

          {error && (
            <div className="error-message" role="alert" style={{ marginBottom: "var(--space-lg)" }}>
              {error}
            </div>
          )}

          <div className="modal-footer" style={{ marginTop: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
              disabled={!matches || busy}
            >
              {busy ? (
                <>
                  <span className="spinner" /> {busyLabel}
                </>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  body: {
    color: "var(--text-secondary)",
    fontSize: "0.92rem",
    lineHeight: 1.6,
    marginBottom: "var(--space-lg)"
  },
  requireText: {
    color: "var(--text-primary)",
    fontWeight: 600,
    wordBreak: "break-all"
  }
}
