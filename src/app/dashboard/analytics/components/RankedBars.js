"use client"

import { useState } from "react"
import styles from "../analytics.module.css"
import { formatExact, percentOf } from "./format"

/**
 * A ranked list with a bar per row, scaled to the largest value. Each row
 * shows the count and its share of `total`. Shows `initial` rows with a
 * "Show all" toggle for the rest.
 *
 * items: [{ key, label, icon?, scans }]
 */
export default function RankedBars({ items, total, initial = 8, emptyText = "No scans yet" }) {
  const [expanded, setExpanded] = useState(false)
  if (!items.length) return <p className={styles.empty}>{emptyText}</p>

  const max = items[0].scans || 1
  const visible = expanded ? items : items.slice(0, initial)

  return (
    <div>
      <ul className={styles.ranked}>
        {visible.map((item) => (
          <li key={item.key} className={styles.rankedRow}>
            <span className={styles.rankedLabel} title={item.label}>
              {item.icon && <span aria-hidden="true">{item.icon}</span>}
              <span>{item.label}</span>
            </span>
            <span className={styles.rankedValue}>
              {formatExact(item.scans)}
              <em>{percentOf(item.scans, total)}%</em>
            </span>
            <span className={styles.rankedTrack} aria-hidden="true">
              <span
                className={styles.rankedBar}
                style={{ display: "block", width: `${(item.scans / max) * 100}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
      {items.length > initial && (
        <button type="button" className={styles.linkButton} style={{ marginTop: 12 }} onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  )
}
