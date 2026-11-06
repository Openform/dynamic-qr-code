"use client"

/**
 * A code in the Trash view. It doesn't redirect, so there's no QR to show: just
 * what it was (title, destination, scans), when it was deleted, how long is
 * left before it's deleted for good, and Restore / Delete forever.
 *
 * Selectable like a normal card (checkbox, or click the card), so several can be
 * restored or deleted at once.
 */

import { describeAge, describeDaysLeft } from "@/lib/trash"
import { TrashIcon, RestoreIcon } from "@/app/components/icons"

// Under this many days left, the countdown is shown as a warning.
const URGENT_DAYS = 3

export default function TrashedCodeCard({
  qrcode,
  selected = false,
  onToggleSelect,
  onRestore,
  onPurge,
  disabled = false
}) {
  const urgent = qrcode.daysLeft <= URGENT_DAYS

  // Click anywhere on the card that isn't a control to select it.
  function handleCardClick(e) {
    if (e.target.closest("a, button, select, input, label")) return
    onToggleSelect?.(qrcode, e.shiftKey)
  }

  return (
    <div
      className="glass-card-static animate-fadeIn"
      style={{ ...styles.card, ...(selected ? styles.selected : null) }}
      onClick={handleCardClick}
      data-selected={selected}
      data-trashed-code={qrcode.id}
    >
      <input
        type="checkbox"
        id={`select-trashed-${qrcode.id}`}
        style={styles.checkbox}
        checked={selected}
        // The click handler does the work (it can see shift); onChange is only
        // here because React wants one for a controlled checkbox.
        onChange={() => {}}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect?.(qrcode, e.shiftKey)
        }}
        aria-label={`Select ${qrcode.title}`}
      />

      <div style={styles.header}>
        <div style={styles.placeholder} aria-hidden="true">
          <TrashIcon size={26} strokeWidth={1.5} />
        </div>
        <div style={styles.headerText}>
          <h3 style={styles.title} title={qrcode.title}>
            {qrcode.title}
          </h3>
          <span className="truncate" style={styles.destination} title={qrcode.destinationUrl}>
            {qrcode.destinationUrl}
          </span>
        </div>
      </div>

      <div style={styles.meta}>
        <span className="badge badge-cyan">
          {qrcode.scanCount ?? 0} {qrcode.scanCount === 1 ? "scan" : "scans"}
        </span>
        <span style={styles.muted}>Deleted {describeAge(qrcode.deletedMinutesAgo)}</span>
      </div>
      <p
        style={{ ...styles.countdown, ...(urgent ? styles.urgent : null) }}
        data-days-left={qrcode.daysLeft}
      >
        Deleted permanently {describeDaysLeft(qrcode.daysLeft)}
      </p>

      <div style={styles.actions}>
        <button
          type="button"
          id={`restore-${qrcode.id}`}
          className="btn btn-secondary btn-sm"
          onClick={() => onRestore(qrcode)}
          disabled={disabled}
        >
          <RestoreIcon size={14} /> Restore
        </button>
        <button
          type="button"
          id={`purge-${qrcode.id}`}
          className="btn btn-danger btn-sm"
          onClick={() => onPurge(qrcode)}
          disabled={disabled}
        >
          Delete forever
        </button>
      </div>
    </div>
  )
}

const styles = {
  card: {
    position: "relative",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    minWidth: 0,
    cursor: "pointer"
  },
  selected: {
    boxShadow: "0 0 0 2px var(--cyan)"
  },
  checkbox: {
    position: "absolute",
    top: "14px",
    right: "14px",
    width: "20px",
    height: "20px",
    accentColor: "var(--cyan)",
    cursor: "pointer",
    zIndex: 2
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    minWidth: 0,
    paddingRight: "28px"
  },
  placeholder: {
    flex: "none",
    width: "56px",
    height: "56px",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--text-tertiary)",
    background: "rgba(255,255,255,0.03)",
    border: "1px dashed rgba(255,255,255,0.1)"
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "4px"
  },
  title: {
    fontSize: "1.02rem",
    fontWeight: 600,
    lineHeight: 1.3,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    overflowWrap: "anywhere"
  },
  destination: {
    fontSize: "0.8rem",
    color: "var(--text-tertiary)",
    display: "block",
    maxWidth: "100%"
  },
  meta: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    flexWrap: "wrap"
  },
  muted: {
    fontSize: "0.78rem",
    color: "var(--text-tertiary)"
  },
  countdown: {
    margin: 0,
    fontSize: "0.82rem",
    color: "var(--text-secondary)"
  },
  urgent: {
    color: "var(--warning)"
  },
  actions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginTop: "4px"
  }
}
