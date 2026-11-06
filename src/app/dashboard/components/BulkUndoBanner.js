"use client"

/**
 * The popup shown after a bulk creation: confirms what was created, lets the
 * user download a CSV of the new links, and undo the whole batch in one click.
 *
 * `batch` is `{ qrcodes, collectionName, expiresAt }` where `expiresAt` is a
 * timestamp (ms) a little before the server stops accepting an undo for the
 * batch (see BULK_UNDO_WINDOW_MINUTES), so the button never outlives it.
 *
 * `onUndo(batch)` performs the undo and resolves to `{ deleted, skipped }`, or
 * throws an Error whose message is shown to the user.
 */

import { useState, useEffect, useRef } from "react"
import { BULK_UNDO_WINDOW_MINUTES, bulkCodesCsv } from "@/lib/bulk"

// How long the "undone" result stays on screen.
const RESULT_VISIBLE_MS = 8000

function downloadCsv(codes) {
  const blob = new Blob([bulkCodesCsv(codes)], {
    type: "text/csv;charset=utf-8"
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `qr-go-codes-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`
}

export default function BulkUndoBanner({ batch, onUndo, onDismiss }) {
  const [phase, setPhase] = useState("ready") // ready | undoing | done
  const [error, setError] = useState("")
  const [result, setResult] = useState(null)

  // Keep the latest onDismiss without re-arming the timers when it changes.
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  })

  // Go away when the undo window closes.
  useEffect(() => {
    const wait = Math.max(0, batch.expiresAt - Date.now())
    const timer = setTimeout(() => dismissRef.current(), wait)
    return () => clearTimeout(timer)
  }, [batch.expiresAt])

  // After an undo, show the outcome briefly and then go away.
  useEffect(() => {
    if (phase !== "done") return
    const timer = setTimeout(() => dismissRef.current(), RESULT_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [phase])

  const count = batch.qrcodes.length

  async function handleUndo() {
    const sure = window.confirm(
      `Undo this bulk creation? ${count === 1 ? "The QR code" : `All ${count} QR codes`} will be deleted. This can’t be undone.`
    )
    if (!sure) return

    setPhase("undoing")
    setError("")
    try {
      setResult(await onUndo(batch))
      setPhase("done")
    } catch (e) {
      setError(e?.message || "Couldn’t undo. Please try again.")
      setPhase("ready")
    }
  }

  let outcome = ""
  if (phase === "done" && result) {
    const { deleted, skipped } = result
    if (skipped === 0) {
      outcome = `Undone — ${plural(deleted, "QR code", "QR codes")} deleted.`
    } else if (deleted === 0) {
      outcome = `Nothing to undo — ${skipped === 1 ? "that code was" : "those codes were"} already deleted, or created more than ${BULK_UNDO_WINDOW_MINUTES} minutes ago.`
    } else {
      outcome = `Deleted ${deleted}. ${plural(skipped, "code couldn’t", "codes couldn’t")} be undone (already deleted, or created more than ${BULK_UNDO_WINDOW_MINUTES} minutes ago).`
    }
  }

  return (
    <div
      id="bulk-undo-banner"
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
          <span>{outcome}</span>
        ) : (
          <>
            <strong>
              Created {plural(count, "QR code", "QR codes")}
            </strong>
            {batch.collectionName ? (
              <span style={styles.muted}> in {batch.collectionName}</span>
            ) : null}
            {error && <div style={styles.error}>{error}</div>}
          </>
        )}
      </div>

      {phase !== "done" && (
        <div style={styles.actions}>
          <button
            type="button"
            id="bulk-download-csv"
            className="btn btn-ghost btn-sm"
            onClick={() => downloadCsv(batch.qrcodes)}
            disabled={phase === "undoing"}
            title="Download the new codes’ links as a spreadsheet"
          >
            Download CSV
          </button>
          <button
            type="button"
            id="bulk-undo-btn"
            className="btn btn-danger btn-sm"
            onClick={handleUndo}
            disabled={phase === "undoing"}
          >
            {phase === "undoing" ? (
              <>
                <span className="spinner" /> Undoing…
              </>
            ) : (
              "Undo"
            )}
          </button>
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
