"use client"

import { useEffect, useRef, useState } from "react"
import styles from "../analytics.module.css"
import { formatBucket, formatCount, formatExact, niceTicks } from "./format"

const HEIGHT = 240
const PAD = { top: 12, right: 8, bottom: 26, left: 40 }
const MAX_BAR = 24
const MAX_X_LABELS = 7

/** Bar path with a 4px rounded top and a square base. */
function barPath(x, y, w, h) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/**
 * Scans per day/week/month as bars, with unique scanners as a line on the
 * same axis (both are counts of the same thing). Hovering a column shows
 * both values; "Table" shows every value without hovering.
 */
export default function ScansOverTime({ series, bucket }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const [showTable, setShowTable] = useState(false)

  const max = Math.max(0, ...series.map((d) => d.scans))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const band = series.length ? plotW / series.length : 0
  const barW = Math.max(1, Math.min(MAX_BAR, band - 2))
  const y = (v) => PAD.top + plotH - (v / top) * plotH
  const cx = (i) => PAD.left + band * i + band / 2

  const labelEvery = Math.max(1, Math.ceil(series.length / MAX_X_LABELS))
  const linePoints = series.map((d, i) => `${cx(i)},${y(d.uniques)}`).join(" ")
  const last = series.length - 1
  const bucketWord = bucket === "month" ? "month" : bucket === "week" ? "week" : "day"

  const hovered = hover !== null ? series[hover] : null
  const tooltipLeft = hover !== null ? Math.min(Math.max(cx(hover) - 80, 0), Math.max(0, width - 170)) : 0

  return (
    <section className={`glass-card-static ${styles.card} ${styles.full}`} aria-labelledby="scans-over-time">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="scans-over-time" className={styles.cardTitle}>
            Scans over time
          </h2>
          <p className={styles.cardSub}>Per {bucketWord}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.swatchRect} style={{ background: "var(--series-1)" }} />
              Scans
            </span>
            <span className={styles.legendItem}>
              <span className={styles.swatchLine} style={{ background: "var(--series-2)" }} />
              Unique scanners
            </span>
          </div>
          <button type="button" className={styles.linkButton} onClick={() => setShowTable((s) => !s)}>
            {showTable ? "Chart" : "Table"}
          </button>
        </div>
      </div>

      {showTable ? (
        <div className={styles.tableScroll} style={{ maxHeight: HEIGHT + 40, overflowY: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{bucketWord[0].toUpperCase() + bucketWord.slice(1)}</th>
                <th className={styles.num}>Scans</th>
                <th className={styles.num}>Unique scanners</th>
              </tr>
            </thead>
            <tbody>
              {[...series].reverse().map((d) => (
                <tr key={d.key}>
                  <td>{formatBucket(d.key, bucket, { long: true })}</td>
                  <td className={styles.num}>{formatExact(d.scans)}</td>
                  <td className={styles.num}>{formatExact(d.uniques)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className={styles.chartWrap} style={{ height: HEIGHT }} onPointerLeave={() => setHover(null)}>
          {width > 0 && (
            <svg width={width} height={HEIGHT} role="img" aria-label={`Scans and unique scanners per ${bucketWord}. Use the Table button for the values.`}>
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={y(t)}
                    y2={y(t)}
                    stroke={t === 0 ? "var(--baseline)" : "var(--grid)"}
                    strokeWidth="1"
                    shapeRendering="crispEdges"
                  />
                  <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className={styles.axisText}>
                    {formatCount(t)}
                  </text>
                </g>
              ))}

              {series.map((d, i) =>
                d.scans > 0 ? (
                  <path
                    key={d.key}
                    d={barPath(cx(i) - barW / 2, y(d.scans), barW, y(0) - y(d.scans))}
                    fill="var(--series-1)"
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                ) : null
              )}

              {series.length > 1 && (
                <polyline
                  points={linePoints}
                  fill="none"
                  stroke="var(--series-2)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {series.length > 0 && (
                <circle
                  cx={cx(hover ?? last)}
                  cy={y(series[hover ?? last].uniques)}
                  r="4"
                  fill="var(--series-2)"
                  stroke="var(--chart-surface)"
                  strokeWidth="2"
                />
              )}

              {series.map((d, i) =>
                i % labelEvery === 0 ? (
                  <text key={d.key} x={cx(i)} y={HEIGHT - 6} textAnchor="middle" className={styles.axisText}>
                    {formatBucket(d.key, bucket)}
                  </text>
                ) : null
              )}

              {/* Hit targets: the whole column, not just the painted bar */}
              {series.map((d, i) => (
                <rect
                  key={d.key}
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  onPointerEnter={() => setHover(i)}
                />
              ))}
            </svg>
          )}

          {max === 0 && (
            <p className={styles.chartEmpty}>
              No scans in this period yet. They&apos;ll appear here as soon as someone scans a code.
            </p>
          )}

          {hovered && (
            <div className={styles.tooltip} style={{ left: tooltipLeft }}>
              <div className={styles.tooltipTitle}>{formatBucket(hovered.key, bucket, { long: true })}</div>
              <div className={styles.tooltipRow}>
                <span className={styles.tooltipKey} style={{ background: "var(--series-1)" }} />
                <strong>{formatExact(hovered.scans)}</strong> scans
              </div>
              <div className={styles.tooltipRow}>
                <span className={styles.tooltipKey} style={{ background: "var(--series-2)" }} />
                <strong>{formatExact(hovered.uniques)}</strong> unique scanners
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
