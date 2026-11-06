"use client"

/**
 * The bar at the bottom of the dashboard while selecting codes: how many are
 * selected, quick select-all / clear, and the action (move to Trash).
 *
 *   count          — codes currently selected (and visible)
 *   selectAllCount — how many "Select all" would select (the codes in view, up to
 *                    the per-request cap)
 *   capped         — true when the view holds more than the cap, so the button
 *                    says "Select first N"
 */

export default function SelectionBar({
  count,
  selectAllCount,
  capped = false,
  onSelectAll,
  onClear,
  onTrash,
  onDone
}) {
  return (
    <div
      id="selection-bar"
      className="toast"
      style={styles.bar}
      role="region"
      aria-label="Selected codes"
    >
      <span style={styles.count} aria-live="polite">
        <strong>{count}</strong> selected
      </span>

      <div style={styles.actions}>
        {count < selectAllCount && (
          <button
            type="button"
            id="select-all-btn"
            className="btn btn-ghost btn-sm"
            onClick={onSelectAll}
          >
            {capped ? `Select first ${selectAllCount}` : `Select all ${selectAllCount}`}
          </button>
        )}
        {count > 0 && (
          <button
            type="button"
            id="clear-selection-btn"
            className="btn btn-ghost btn-sm"
            onClick={onClear}
          >
            Clear
          </button>
        )}
        <button
          type="button"
          id="trash-selected-btn"
          className="btn btn-danger btn-sm"
          onClick={onTrash}
          disabled={count === 0}
        >
          Move to Trash
        </button>
        <button
          type="button"
          id="done-selecting-btn"
          className="btn btn-secondary btn-sm"
          onClick={onDone}
        >
          Done
        </button>
      </div>
    </div>
  )
}

const styles = {
  // Below modals (z-index 1000) so a confirmation dialog covers it.
  bar: {
    position: "fixed",
    left: "50%",
    bottom: "24px",
    transform: "translateX(-50%)",
    zIndex: 900,
    flexWrap: "wrap",
    maxWidth: "min(720px, calc(100vw - 32px))",
    width: "max-content",
    justifyContent: "space-between"
  },
  count: {
    whiteSpace: "nowrap"
  },
  actions: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    flexWrap: "wrap"
  }
}
