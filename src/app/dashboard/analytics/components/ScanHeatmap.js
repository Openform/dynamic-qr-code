"use client"

import { useState } from "react"
import styles from "../analytics.module.css"
import { formatExact, utcOffsetLabel } from "./format"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
// One hue (the scans colour) mixed into the card surface: light → strong.
const STEPS = [22, 40, 58, 78, 100].map((p) => `color-mix(in oklab, var(--series-1) ${p}%, var(--chart-surface))`)
const EMPTY = "rgba(255, 255, 255, 0.04)"

const hourRange = (h) => `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`

/** Scans by day of week × hour of day, in the viewer's timezone. */
export default function ScanHeatmap({ heatmap, offsetMinutes }) {
  const [hover, setHover] = useState(null)

  const grid = Array.from({ length: 7 }, () => Array(24).fill(0))
  for (const { dow, hour, scans } of heatmap) grid[dow][hour] = scans
  const max = Math.max(0, ...heatmap.map((h) => h.scans))
  const colorFor = (v) => (v === 0 ? EMPTY : STEPS[Math.min(4, Math.ceil((v / max) * 5) - 1)])

  const busiest = [...heatmap].sort((a, b) => b.scans - a.scans)[0]
  const dayTotals = grid.map((row) => row.reduce((s, v) => s + v, 0))
  const busiestDay = dayTotals.indexOf(Math.max(...dayTotals))

  return (
    <section className={`glass-card-static ${styles.card}`} aria-labelledby="heatmap-title">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="heatmap-title" className={styles.cardTitle}>
            When people scan
          </h2>
          <p className={styles.cardSub}>Day and hour, in your timezone ({utcOffsetLabel(offsetMinutes)})</p>
        </div>
      </div>

      {max === 0 ? (
        <p className={styles.empty}>No scans yet</p>
      ) : (
        <>
          <div className={styles.heatmap} aria-hidden="true" onPointerLeave={() => setHover(null)}>
            {grid.map((row, dow) => (
              <div key={dow} style={{ display: "contents" }}>
                <span className={styles.heatDay}>{DAYS[dow]}</span>
                {row.map((v, hour) => (
                  <span
                    key={hour}
                    className={styles.heatCell}
                    style={{ background: colorFor(v) }}
                    onPointerEnter={() => setHover({ dow, hour, scans: v })}
                  />
                ))}
              </div>
            ))}
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className={styles.heatHour}>
                {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
              </span>
            ))}
          </div>

          <div className={styles.heatFooter}>
            <span aria-live="polite">
              {hover ? (
                <>
                  {DAY_NAMES[hover.dow]} {hourRange(hover.hour)} · <strong>{formatExact(hover.scans)}</strong> scans
                </>
              ) : (
                <>
                  Busiest: <strong>{DAY_NAMES[busiest.dow]} {hourRange(busiest.hour)}</strong> · Busiest day:{" "}
                  <strong>{DAY_NAMES[busiestDay]}</strong>
                </>
              )}
            </span>
            <span className={styles.heatScale} aria-hidden="true">
              Fewer
              {STEPS.map((c) => (
                <span key={c} aria-hidden style={{ background: c }} />
              ))}
              More
            </span>
          </div>

          <table className={styles.srOnly}>
            <caption>Scans per day of the week</caption>
            <tbody>
              {dayTotals.map((total, dow) => (
                <tr key={dow}>
                  <th scope="row">{DAY_NAMES[dow]}</th>
                  <td>{total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
