"use client"

/**
 * The bar at the bottom of the dashboard while selecting codes: how many are
 * selected, quick select-all / clear, and the actions that apply to them.
 *
 *   count          — codes currently selected (and visible)
 *   selectAllCount — how many "Select all" would select (the codes in view, up to
 *                    the per-request cap)
 *   capped         — true when the view holds more than the cap, so the button
 *                    says "Select first N"
 *   actions        — [{ id, label, danger?, onClick }], disabled until something
 *                    is selected (Move to Trash; or Restore / Delete forever in
 *                    the Trash view)
 *   onDone         — when given, a "Done" button leaves select mode
 */

export default function SelectionBar({
  count,
  selectAllCount,
  capped = false,
  onSelectAll,
  onClear,
  actions = [],
  onDone = null
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
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            id={action.id}
            className={`btn ${action.danger ? "btn-danger" : "btn-secondary"} btn-sm`}
            onClick={action.onClick}
            disabled={count === 0}
          >
            {action.label}
          </button>
        ))}
        {onDone && (
          <button
            type="button"
            id="done-selecting-btn"
            className="btn btn-secondary btn-sm"
            onClick={onDone}
          >
            Done
          </button>
        )}
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
