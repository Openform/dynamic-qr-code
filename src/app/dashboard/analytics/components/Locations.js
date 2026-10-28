"use client"

import { useState } from "react"
import styles from "../analytics.module.css"
import RankedBars from "./RankedBars"
import { countryName, flag, placeLabel } from "./format"

/** Countries or cities, ranked. Includes the DB-IP credit its licence requires. */
export default function Locations({ countries, cities, total }) {
  const [view, setView] = useState("countries")

  const items =
    view === "countries"
      ? countries.map((c) => ({ key: c.code ?? "unknown", icon: flag(c.code), label: countryName(c.code), scans: c.scans }))
      : cities.map((c) => ({
          key: `${c.countryCode}-${c.region}-${c.city}`,
          icon: flag(c.countryCode),
          label: placeLabel(c),
          scans: c.scans,
        }))

  return (
    <section className={`glass-card-static ${styles.card}`} aria-labelledby="locations-title">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="locations-title" className={styles.cardTitle}>
            Locations
          </h2>
          <p className={styles.cardSub}>Approximate, from the scanner&apos;s internet connection</p>
        </div>
        <div className={styles.segmented} role="group" aria-label="Location detail">
          <button type="button" aria-pressed={view === "countries"} onClick={() => setView("countries")}>
            Countries
          </button>
          <button type="button" aria-pressed={view === "cities"} onClick={() => setView("cities")}>
            Cities
          </button>
        </div>
      </div>
      <RankedBars key={view} items={items} total={total} />
      <p className={styles.muted} style={{ marginTop: 16 }}>
        <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
          IP Geolocation by DB-IP
        </a>
      </p>
    </section>
  )
}
