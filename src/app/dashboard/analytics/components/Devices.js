"use client"

import styles from "../analytics.module.css"
import RankedBars from "./RankedBars"
import { deviceLabel, formatExact, percentOf } from "./format"

// Fixed order and colour per device type, so a type keeps its colour
// whatever the mix.
const DEVICE_TYPES = [
  { type: "mobile", color: "var(--series-1)" },
  { type: "tablet", color: "var(--series-2)" },
  { type: "desktop", color: "var(--series-3)" },
  { type: null, color: "var(--series-muted)" },
]

const toItems = (rows) =>
  rows.map((r) => ({ key: r.label ?? "unknown", label: r.label ?? "Unknown", scans: r.scans }))

/** Mobile / tablet / desktop split, then OS and browser/app rankings. */
export default function Devices({ devices, os, browsers, total }) {
  const byType = new Map(devices.map((d) => [d.label, d.scans]))
  const parts = DEVICE_TYPES.map((d) => ({ ...d, scans: byType.get(d.type) ?? 0 })).filter((d) => d.scans > 0)

  return (
    <section className={`glass-card-static ${styles.card}`} aria-labelledby="devices-title">
      <div className={styles.cardHeader}>
        <h2 id="devices-title" className={styles.cardTitle}>
          Devices
        </h2>
      </div>

      {total === 0 ? (
        <p className={styles.empty}>No scans yet</p>
      ) : (
        <>
          <div className={styles.splitBar} aria-hidden="true">
            {parts.map((p) => (
              <div
                key={p.type ?? "unknown"}
                style={{ flexGrow: p.scans, flexBasis: 0, background: p.color }}
                title={`${deviceLabel(p.type)}: ${formatExact(p.scans)} scans`}
              />
            ))}
          </div>
          <ul className={styles.splitLegend}>
            {parts.map((p) => (
              <li key={p.type ?? "unknown"} className={styles.legendItem}>
                <span className={styles.swatchRect} style={{ background: p.color }} />
                {deviceLabel(p.type)} <strong>{percentOf(p.scans, total)}%</strong>
                <span className={styles.muted}>({formatExact(p.scans)})</span>
              </li>
            ))}
          </ul>

          <div className={styles.cols2}>
            <div>
              <h3 className={styles.subheading}>Operating system</h3>
              <RankedBars items={toItems(os)} total={total} initial={5} />
            </div>
            <div>
              <h3 className={styles.subheading}>Browser or app</h3>
              <RankedBars items={toItems(browsers)} total={total} initial={5} />
            </div>
          </div>
        </>
      )}
    </section>
  )
}
