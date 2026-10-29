import styles from "./FeatureIcon.module.css"

/** Line icons for the landing page feature cards, drawn on a 24×24 grid. */
const ICONS = {
  // Two chain links: a link that stays the same while its destination changes.
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5" />
    </>
  ),
  // A chart trending upwards.
  analytics: (
    <>
      <path d="M4 4v16h16" />
      <path d="M8 15l3.5-3.5 3 3L20 9" />
      <path d="M16 9h4v4" />
    </>
  ),
  // A dashboard of panels.
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="9" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="15.5" width="7" height="5" rx="1.5" />
    </>
  )
}

/**
 * A feature card icon in a rounded tile, stroked with the brand gradient.
 * Decorative only: the card's heading says what the feature is.
 */
export default function FeatureIcon({ name }) {
  const gradientId = `feature-icon-gradient-${name}`
  return (
    <div className={styles.tile} aria-hidden="true">
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <defs>
          {/* userSpaceOnUse so straight lines (which have no height) still get the gradient */}
          <linearGradient id={gradientId} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#00d4ff" />
            <stop offset="0.55" stopColor="#a78bfa" />
            <stop offset="1" stopColor="#f472b6" />
          </linearGradient>
        </defs>
        {ICONS[name]}
      </svg>
    </div>
  )
}
