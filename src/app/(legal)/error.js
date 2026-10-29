"use client"

import { useEffect } from "react"

/**
 * Shown inside the legal layout if a page's text can't be loaded (e.g. the
 * database is briefly down). We never fall back to the placeholder text here,
 * since that could show outdated terms.
 */
export default function LegalError({ error, unstable_retry }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div style={styles.wrap} role="alert">
      <h1 style={styles.title}>This page can&apos;t be loaded right now</h1>
      <p style={styles.body}>
        Something went wrong on our side. Please try again in a moment.
      </p>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => unstable_retry()}>
        Try again
      </button>
    </div>
  )
}

const styles = {
  wrap: {
    padding: "48px 0",
    textAlign: "center"
  },
  title: {
    fontSize: "1.6rem",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    marginBottom: "12px"
  },
  body: {
    color: "var(--text-secondary)",
    marginBottom: "24px"
  }
}
