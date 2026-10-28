"use client"

import styles from "../analytics.module.css"
import { Delta } from "./TopCodesTable"
import { countryName, flag, formatCount, formatDate, formatExact, percentOf } from "./format"

function Tile({ label, value, small = false, sub, title }) {
  return (
    <div className={`glass-card-static ${styles.kpi}`}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={`${styles.kpiValue} ${small ? styles.kpiValueSmall : ""}`} title={title}>
        {value}
      </p>
      {sub && <p className={styles.kpiSub}>{sub}</p>}
    </div>
  )
}

/** Headline numbers: scans, unique scanners, top country, mobile share. */
export default function KpiRow({ data, rangeLabel }) {
  const { summary, countries, devices } = data
  const hasPrevious = summary.prevScans !== null
  const compareText = `vs previous ${rangeLabel.replace(/^Last /, "")}`

  const topCountry = countries.find((c) => c.code)
  const mobile = devices.find((d) => d.label === "mobile")?.scans ?? 0

  const deltaSub = (current, previous) =>
    hasPrevious ? (
      <>
        <Delta current={current} previous={previous} /> {compareText}
      </>
    ) : summary.trackingSince ? (
      `Since ${formatDate(summary.trackingSince)}`
    ) : null

  return (
    <div className={styles.kpiRow}>
      <Tile
        label="Scans"
        value={formatCount(summary.scans)}
        title={formatExact(summary.scans)}
        sub={deltaSub(summary.scans, summary.prevScans)}
      />
      <Tile
        label="Unique scanners"
        value={formatCount(summary.uniques)}
        title={formatExact(summary.uniques)}
        sub={deltaSub(summary.uniques, summary.prevUniques)}
      />
      <Tile
        label="Top country"
        small
        value={topCountry ? `${flag(topCountry.code)} ${countryName(topCountry.code)}` : "—"}
        title={topCountry ? countryName(topCountry.code) : undefined}
        sub={topCountry ? `${percentOf(topCountry.scans, summary.scans)}% of scans` : null}
      />
      <Tile
        label="On a phone"
        value={summary.scans ? `${percentOf(mobile, summary.scans)}%` : "—"}
        sub={summary.scans ? `${formatExact(mobile)} of ${formatExact(summary.scans)} scans` : null}
      />
    </div>
  )
}
