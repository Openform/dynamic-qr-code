import styles from "./ScansChart.module.css"

/**
 * Example "scans over time" chart for the landing page. The lines draw
 * themselves when the surrounding tile scrolls into view (see RevealObserver).
 */

const SCANS = [96, 88, 91, 76, 80, 66, 70, 54, 58, 44, 48, 32, 28]
const UNIQUE = [112, 107, 108, 100, 102, 94, 96, 86, 88, 78, 80, 70, 66]
const STEP = 25

const toPoints = (ys) => ys.map((y, i) => `${i * STEP},${y}`).join(" ")
const LAST_X = (SCANS.length - 1) * STEP
const LAST_Y = SCANS[SCANS.length - 1]

export default function ScansChart() {
  return (
    <div className={styles.chart}>
      <svg
        viewBox={`0 0 ${LAST_X} 130`}
        className={styles.svg}
        role="img"
        aria-label="Example chart: scans and unique scanners rising over time"
      >
        <defs>
          <linearGradient id="scansArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#00d4ff" stopOpacity="0.28" />
            <stop offset="1" stopColor="#00d4ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[30, 65, 100].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2={LAST_X}
            y2={y}
            stroke="rgba(255,255,255,0.06)"
          />
        ))}
        <path
          className={styles.area}
          d={`M${toPoints(SCANS).replaceAll(" ", " L")} L${LAST_X},130 L0,130 Z`}
          fill="url(#scansArea)"
        />
        <polyline
          className={`${styles.line} ${styles.unique}`}
          points={toPoints(UNIQUE)}
          pathLength="1"
          fill="none"
          stroke="#a78bfa"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <polyline
          className={styles.line}
          points={toPoints(SCANS)}
          pathLength="1"
          fill="none"
          stroke="#00d4ff"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle className={styles.pulse} cx={LAST_X} cy={LAST_Y} r="4" fill="#00d4ff" />
        <circle className={styles.dot} cx={LAST_X} cy={LAST_Y} r="4" fill="#00d4ff" />
      </svg>
      <div className={styles.legend}>
        <span>
          <span className={styles.keyScans} />
          Scans
        </span>
        <span>
          <span className={styles.keyUnique} />
          Unique scanners
        </span>
      </div>
    </div>
  )
}
