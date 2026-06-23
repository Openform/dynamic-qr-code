"use client"

/**
 * The "Collections" tab strip on the dashboard. Renders a pill for "All Codes",
 * the built-in "Default" collection, and one per user collection — each showing
 * a live count. Selecting a pill filters the grid. When a user collection is
 * selected, Rename/Delete actions for it appear alongside "+ New Collection".
 *
 * Props:
 *   collections      — [{ id, name }]
 *   activeCollection — "all" | "default" | <collectionId number>
 *   countFor(key)    — returns the number of codes for a pill key
 *   onSelect(key), onNew(), onRename(collection), onDelete(collection)
 */
export default function CollectionsBar({
  collections = [],
  activeCollection,
  countFor,
  onSelect,
  onNew,
  onRename,
  onDelete
}) {
  const activeCustom =
    typeof activeCollection === "number"
      ? collections.find((c) => c.id === activeCollection)
      : null

  return (
    <section style={styles.wrap} className="animate-fadeIn">
      <div style={styles.header}>
        <div>
          <h2 style={styles.heading}>Collections</h2>
          <p style={styles.subtitle}>
            Group related codes — for example, every code for one client.
          </p>
        </div>
        <div style={styles.actions}>
          {activeCustom && (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onRename(activeCustom)}
                title={`Rename "${activeCustom.name}"`}
              >
                ✏️ Rename
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => onDelete(activeCustom)}
                title={`Delete "${activeCustom.name}"`}
              >
                🗑️ Delete
              </button>
            </>
          )}
          <button
            type="button"
            id="new-collection-btn"
            className="btn btn-secondary btn-sm"
            onClick={onNew}
          >
            + New Collection
          </button>
        </div>
      </div>

      <div style={styles.pills}>
        <Pill
          label="All Codes"
          count={countFor("all")}
          active={activeCollection === "all"}
          onClick={() => onSelect("all")}
        />
        <Pill
          label="Default"
          count={countFor("default")}
          active={activeCollection === "default"}
          onClick={() => onSelect("default")}
        />
        {collections.map((c) => (
          <Pill
            key={c.id}
            label={c.name}
            count={countFor(c.id)}
            active={activeCollection === c.id}
            onClick={() => onSelect(c.id)}
          />
        ))}
      </div>
    </section>
  )
}

function Pill({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="glass-card-static"
      style={{ ...styles.pill, ...(active ? styles.pillActive : null) }}
    >
      <span style={styles.pillLabel}>{label}</span>
      <span
        style={{ ...styles.pillCount, ...(active ? styles.pillCountActive : null) }}
      >
        {count}
      </span>
    </button>
  )
}

const styles = {
  wrap: {
    marginBottom: "28px"
  },
  header: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "16px"
  },
  heading: {
    fontSize: "1.15rem",
    fontWeight: 600,
    letterSpacing: "-0.01em"
  },
  subtitle: {
    fontSize: "0.82rem",
    color: "var(--text-tertiary)",
    marginTop: "2px"
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap"
  },
  pills: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap"
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 14px",
    borderRadius: "var(--radius-full)",
    fontSize: "0.85rem",
    fontWeight: 500,
    color: "var(--text-secondary)",
    transition: "all var(--transition-fast)"
  },
  pillActive: {
    borderColor: "var(--cyan)",
    color: "var(--cyan)",
    background: "rgba(0, 212, 255, 0.08)",
    boxShadow: "0 0 20px rgba(0, 212, 255, 0.12)"
  },
  pillLabel: {
    maxWidth: "180px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  pillCount: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "20px",
    height: "20px",
    padding: "0 6px",
    borderRadius: "var(--radius-full)",
    fontSize: "0.72rem",
    fontWeight: 600,
    background: "rgba(255,255,255,0.06)",
    color: "var(--text-tertiary)"
  },
  pillCountActive: {
    background: "rgba(0, 212, 255, 0.18)",
    color: "var(--cyan)"
  }
}
