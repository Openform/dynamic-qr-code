"use client"

import { useEffect, useReducer, useRef } from "react"
import { useInView, usePrefersReducedMotion } from "./hooks"
import styles from "./DestinationHistory.module.css"

/**
 * Example destination history for one code. While it's on screen, the live
 * link's scans tick up and every few seconds a new link takes over at the top,
 * pushing the older ones down — the same code, pointed somewhere new.
 */

const DOMAIN = "yoursite.com"
// Each link, and roughly how many scans it collects while it's live. The live
// count runs like a time-lapse: about this many in the few seconds it's on top.
const POOL = [
  { path: "/summer-menu", total: 644 },
  { path: "/autumn-specials", total: 1204 },
  { path: "/winter-menu", total: 612 },
  { path: "/spring-launch", total: 938 }
]
const FIRST_LIVE = 2 // the winter menu is live on first paint
const LABELS = ["Live", "Before", "Earlier"]
const VISIBLE_ROWS = LABELS.length

const TICK_MS = 450
const TICKS_PER_CHANGE = 12 // a new link roughly every 5 seconds

function linkFor(gen) {
  const n = POOL.length
  return POOL[(((FIRST_LIVE + gen) % n) + n) % n]
}

// Scan counts by "generation": 0 is the link that's live on first paint,
// -1 the one before it, and so on.
const INITIAL = { gen: 0, ticks: 0, counts: { 0: 612, [-1]: 1204, [-2]: 644, [-3]: 938 } }

function reducer(state, action) {
  if (state.ticks + 1 >= TICKS_PER_CHANGE) {
    const gen = state.gen + 1
    const counts = { [gen]: 0 }
    // Keep only the rows still on screen (plus the one sliding out).
    for (let g = gen - VISIBLE_ROWS; g < gen; g++) counts[g] = state.counts[g]
    return { gen, ticks: 0, counts }
  }
  const add = Math.round((linkFor(state.gen).total / TICKS_PER_CHANGE) * action.jitter)
  return {
    ...state,
    ticks: state.ticks + 1,
    counts: { ...state.counts, [state.gen]: state.counts[state.gen] + add }
  }
}

export default function DestinationHistory() {
  const ref = useRef(null)
  const inView = useInView(ref)
  const reduce = usePrefersReducedMotion()
  const [state, dispatch] = useReducer(reducer, INITIAL)

  useEffect(() => {
    if (!inView || reduce) return
    const id = setInterval(
      () => dispatch({ jitter: 0.6 + Math.random() * 0.8 }),
      TICK_MS
    )
    return () => clearInterval(id)
  }, [inView, reduce])

  // One extra row below the fold of the list, so the oldest slides out.
  const rows = []
  for (let pos = 0; pos <= VISIBLE_ROWS; pos++) {
    const gen = state.gen - pos
    rows.push({ gen, pos, path: linkFor(gen).path, scans: state.counts[gen] ?? 0 })
  }

  return (
    <div
      ref={ref}
      className={styles.table}
      role="img"
      aria-label="Example: a code's current link and the links it pointed to before, with their scans"
    >
      <div className={`${styles.row} ${styles.head}`}>
        <span>Destination</span>
        <span>When</span>
        <span className={styles.num}>Scans</span>
      </div>
      <div className={styles.rows}>
        {rows.map(({ gen, pos, path, scans }) => (
          <div
            key={gen}
            className={`${styles.row} ${pos === 0 && gen > 0 ? styles.entering : ""}`}
            style={{ transform: `translateY(${pos * 100}%)` }}
          >
            <span className={styles.url}>
              <span className={styles.domain}>{DOMAIN}</span>
              {path}
            </span>
            <span>
              {pos === 0 ? (
                <span className={styles.live}>
                  <span className={styles.liveDot} />
                  Live
                </span>
              ) : (
                <span className={styles.when}>{LABELS[pos] ?? ""}</span>
              )}
            </span>
            <span className={styles.num}>{scans.toLocaleString("en-US")}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
