"use client"

import { useState } from "react"
import styles from "../analytics.module.css"
import { countryName, deviceLabel, flag, formatDateTime, placeLabel, timeAgo } from "./format"

/** The latest scans in the period: where, on what, and when. */
export default function RecentScans({ recent, showCode, now, initial = 8 }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? recent : recent.slice(0, initial)
  return (
    <section className={`glass-card-static ${styles.card}`} aria-labelledby="recent-title">
      <div className={styles.cardHeader}>
        <h2 id="recent-title" className={styles.cardTitle}>
          Recent scans
        </h2>
      </div>
      {recent.length === 0 ? (
        <p className={styles.empty}>No scans in this period</p>
      ) : (
        <ul className={styles.list}>
          {visible.map((scan, i) => (
            <li key={`${scan.scannedAt}-${i}`} className={styles.listRow}>
              <span aria-hidden="true" style={{ fontSize: "1.1rem" }}>
                {flag(scan.countryCode)}
              </span>
              <div className={styles.listMain}>
                <span className={styles.ellipsis} style={{ color: "var(--text-primary)" }}>
                  {scan.city ? `${placeLabel(scan)}, ${countryName(scan.countryCode)}` : countryName(scan.countryCode)}
                </span>
                <span className={`${styles.muted} ${styles.ellipsis}`}>
                  {[deviceLabel(scan.deviceType), scan.os, scan.browser].filter(Boolean).join(" · ")}
                  {showCode && ` — ${scan.codeTitle}`}
                </span>
              </div>
              <time className={styles.listSide} dateTime={scan.scannedAt} title={formatDateTime(scan.scannedAt)}>
                {timeAgo(scan.scannedAt, now)}
              </time>
            </li>
          ))}
        </ul>
      )}
      {recent.length > initial && (
        <button type="button" className={styles.linkButton} style={{ marginTop: 8 }} onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show fewer" : `Show last ${recent.length}`}
        </button>
      )}
    </section>
  )
}
