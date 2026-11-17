"use client"

import { useState } from "react"
import { PAGE_LIMITS } from "@/lib/campaignPages"
import { PAGE_TEMPLATES, templateContent } from "@/lib/pageTemplates"
import styles from "./pages.module.css"

/**
 * "New campaign page": a name and a template to start from. Creates the
 * page and hands its id to `onCreated`.
 */
export default function NewPageDialog({ onClose, onCreated }) {
  const [name, setName] = useState("")
  const [template, setTemplate] = useState("offer")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError("Give the page a name.")
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, content: templateContent(template, trimmed) })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "The page couldn’t be created. Please try again.")
      onCreated(data.page)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="new-page-title">
      <div className="modal-card" style={{ maxWidth: "620px" }}>
        <div className="modal-header">
          <h2 id="new-page-title" className="modal-title">
            New campaign page
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="new-page-name" className="input-label">
              Name
            </label>
            <input
              id="new-page-name"
              type="text"
              className={`input-field${error && !name.trim() ? " input-error" : ""}`}
              placeholder="Black Friday weekend"
              value={name}
              maxLength={PAGE_LIMITS.name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <p className={styles.hint}>It’s also the page’s title to start with. You can change both later.</p>
          </div>

          <fieldset style={{ border: "none" }}>
            <legend className="input-label">Start from</legend>
            <div className={styles.templates}>
              {PAGE_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`${styles.template}${template === t.id ? ` ${styles.templateOn}` : ""}`}
                  aria-pressed={template === t.id}
                  onClick={() => setTemplate(t.id)}
                >
                  <span className={styles.templateName}>{t.name}</span>
                  <span className={styles.templateText}>{t.description}</span>
                </button>
              ))}
            </div>
          </fieldset>

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
                  <span className="spinner" /> Creating…
                </>
              ) : (
                "Create page"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
