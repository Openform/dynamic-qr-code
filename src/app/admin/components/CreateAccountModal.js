"use client"

import { useEffect, useState } from "react"
import { PACKAGES, DEFAULT_PACKAGE, describeLimit } from "@/lib/packages"
import { MIN_PASSWORD_LENGTH } from "@/lib/accounts"

// No look-alike characters (0/O, 1/l/I), so a password read out over the
// phone or copied by hand isn't mistyped.
const PASSWORD_CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"

function generatePassword(length = 12) {
  const values = new Uint32Array(length)
  crypto.getRandomValues(values)
  return Array.from(values, (v) => PASSWORD_CHARS[v % PASSWORD_CHARS.length]).join("")
}

/**
 * Modal for an admin to create a client account on a chosen package.
 * `onSubmit(fields)` should throw an Error (shown inline) when the server
 * rejects the account, and resolve when it succeeds — the parent closes the
 * modal on success.
 */
export default function CreateAccountModal({ onClose, onSubmit }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [packageId, setPackageId] = useState(DEFAULT_PACKAGE)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    setSaving(true)
    setError("")
    try {
      await onSubmit({ name, email, password, package: packageId })
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.")
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: "480px" }}>
        <div className="modal-header">
          <h2 className="modal-title">Create Client Account</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="new-account-name" className="input-label">
              Full name or company
            </label>
            <input
              id="new-account-name"
              type="text"
              className="input-field"
              placeholder="e.g. Acme Ltd"
              value={name}
              maxLength={255}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              autoComplete="off"
            />
          </div>

          <div className="input-group">
            <label htmlFor="new-account-email" className="input-label">
              Email address
            </label>
            <input
              id="new-account-email"
              type="email"
              className="input-field"
              placeholder="client@example.com"
              value={email}
              maxLength={255}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </div>

          <div className="input-group">
            <label htmlFor="new-account-password" className="input-label">
              Temporary password
            </label>
            <div style={styles.passwordRow}>
              <input
                id="new-account-password"
                type="text"
                className="input-field"
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="off"
                spellCheck={false}
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPassword(generatePassword())}
                style={{ flexShrink: 0 }}
              >
                Generate
              </button>
            </div>
            <p style={styles.help}>
              Share this with the client. They can change it in Profile Settings.
            </p>
          </div>

          <div className="input-group" style={{ marginBottom: error ? "8px" : "var(--space-lg)" }}>
            <label htmlFor="new-account-package" className="input-label">
              Package
            </label>
            <select
              id="new-account-package"
              className="input-field"
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
            >
              {PACKAGES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {describeLimit(p.id)}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="error-message" role="alert" style={{ marginBottom: "var(--space-lg)" }}>
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
                  <span className="spinner" /> Creating…
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  passwordRow: {
    display: "flex",
    gap: "10px",
    alignItems: "center"
  },
  help: {
    color: "var(--text-tertiary)",
    fontSize: "0.8rem",
    marginTop: "8px"
  }
}
