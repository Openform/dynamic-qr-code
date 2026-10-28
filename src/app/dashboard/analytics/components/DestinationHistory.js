"use client"

import styles from "../analytics.module.css"
import { formatDate, formatExact } from "./format"

const DAY_MS = 24 * 60 * 60 * 1000

function safeHref(url) {
  try {
    const parsed = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`)
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : undefined
  } catch {
    return undefined
  }
}

/**
 * Every destination this code has pointed to, newest first, with the scans it
 * got while live (all time) and the average per day, so a change of
 * destination can be compared fairly.
 */
export default function DestinationHistory({ destinations, now }) {
  return (
    <section className={`glass-card-static ${styles.card} ${styles.full}`} aria-labelledby="destinations-title">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="destinations-title" className={styles.cardTitle}>
            Destination history
          </h2>
          <p className={styles.cardSub}>All time · scans while each destination was live</p>
        </div>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Destination</th>
              <th>Live</th>
              <th className={styles.num}>Scans</th>
              <th className={styles.num}>Per day</th>
            </tr>
          </thead>
          <tbody>
            {destinations.map((d, i) => {
              const end = d.endedAt ? new Date(d.endedAt).getTime() : now
              const days = Math.max(1, (end - new Date(d.startedAt).getTime()) / DAY_MS)
              return (
                <tr key={`${d.startedAt}-${i}`}>
                  <td style={{ maxWidth: 380 }}>
                    <a
                      href={safeHref(d.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.ellipsis}
                      style={{ color: "var(--cyan)" }}
                      title={d.url}
                    >
                      {d.url}
                    </a>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {d.endedAt ? (
                      `${formatDate(d.startedAt)} – ${formatDate(d.endedAt)}`
                    ) : (
                      <>
                        Since {formatDate(d.startedAt)}
                        <span className={`badge badge-cyan ${styles.currentBadge}`}>Current</span>
                      </>
                    )}
                  </td>
                  <td className={styles.num}>{formatExact(d.scans)}</td>
                  <td className={styles.num}>{(d.scans / days).toFixed(1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
