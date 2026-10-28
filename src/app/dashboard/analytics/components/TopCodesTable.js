"use client"

import styles from "../analytics.module.css"
import { formatExact } from "./format"
import { percentChange } from "@/lib/analyticsFilters"

/** Small trend line for a table row, in the scans colour with a light wash. */
function Sparkline({ values }) {
  const W = 96
  const H = 26
  if (values.length < 2) return null
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 2 - (v / max) * (H - 4)])
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  return (
    <svg width={W} height={H} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill="var(--series-1)" opacity="0.1" />
      <polyline points={line} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function Delta({ current, previous }) {
  const change = percentChange(current, previous)
  if (change === null) return <span className={styles.muted}>—</span>
  if (change === 0) return <span className={styles.muted}>0%</span>
  return change > 0 ? (
    <span className={styles.deltaUp}>▲ {change}%</span>
  ) : (
    <span className={styles.deltaDown}>▼ {Math.abs(change)}%</span>
  )
}

/**
 * Codes with the most scans in the period. Selecting a row opens that code's
 * analytics; the admin view also shows each code's owner.
 */
export default function TopCodesTable({ codes, showOwner = false, hasPrevious, onSelect }) {
  return (
    <section className={`glass-card-static ${styles.card} ${styles.full}`} aria-labelledby="top-codes-title">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="top-codes-title" className={styles.cardTitle}>
            Top codes
          </h2>
          {onSelect && <p className={styles.cardSub}>Select a code to see its own analytics</p>}
        </div>
      </div>
      {codes.length === 0 ? (
        <p className={styles.empty}>No scans in this period</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                {showOwner && <th>Account</th>}
                <th className={styles.num}>Scans</th>
                {hasPrevious && <th className={styles.num}>Change</th>}
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr
                  key={code.id}
                  className={onSelect ? styles.clickableRow : undefined}
                  onClick={onSelect ? () => onSelect(code.id) : undefined}
                >
                  <td style={{ maxWidth: 320 }}>
                    {onSelect ? (
                      <button
                        type="button"
                        className={`${styles.codeTitle} ${styles.ellipsis}`}
                        style={{ textAlign: "left", maxWidth: "100%" }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelect(code.id)
                        }}
                      >
                        {code.title}
                      </button>
                    ) : (
                      <span className={`${styles.codeTitle} ${styles.ellipsis}`}>{code.title}</span>
                    )}
                    {code.shortId && <span className={styles.muted}>/r/{code.shortId}</span>}
                  </td>
                  {showOwner && (
                    <td style={{ maxWidth: 240 }}>
                      <span className={styles.ellipsis}>{code.owner?.name ?? "—"}</span>
                      <span className={`${styles.muted} ${styles.ellipsis}`}>{code.owner?.email}</span>
                    </td>
                  )}
                  <td className={styles.num}>{formatExact(code.scans)}</td>
                  {hasPrevious && (
                    <td className={styles.num}>
                      <Delta current={code.scans} previous={code.prevScans} />
                    </td>
                  )}
                  <td>
                    <Sparkline values={code.trend} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
