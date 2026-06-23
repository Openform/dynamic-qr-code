"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Small modal for creating or renaming a collection. `onSubmit(name)` should
 * throw an Error (whose message is shown inline) when the server rejects the
 * name, and resolve when it succeeds — the parent closes the modal on success.
 *
 * The parent renders this with a `key` per open (and only while open), so state
 * initializes straight from props on mount — no reset effect needed.
 */
export default function CollectionModal({
  title,
  submitLabel,
  initialName = "",
  onClose,
  onSubmit
}) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  // Focus + select the field on open so renaming is a single keystroke away.
  useEffect(() => {
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError("Collection name is required.")
      return
    }
    setSaving(true)
    setError("")
    try {
      await onSubmit(trimmed)
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.")
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: "440px" }}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group" style={{ marginBottom: error ? "8px" : "var(--space-lg)" }}>
            <label htmlFor="collection-name" className="input-label">
              Collection name
            </label>
            <input
              id="collection-name"
              ref={inputRef}
              type="text"
              className={`input-field${error ? " input-error" : ""}`}
              placeholder="e.g. PPECB"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {error && (
            <div className="error-message" style={{ marginBottom: "var(--space-lg)" }}>
              {error}
            </div>
          )}

          <div className="modal-footer" style={{ marginTop: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? (
                <>
                  <span className="spinner" /> Saving…
                </>
              ) : (
                submitLabel
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
