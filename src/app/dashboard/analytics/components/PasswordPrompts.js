"use client"

import styles from "../analytics.module.css"
import { formatExact, percentOf } from "./format"
import { UNLOCK_DAYS } from "@/lib/accessPassword"

/**
 * For codes with a password: how many times people were asked for it in the
 * period, and how many got through or stopped there. A scan only counts once
 * someone gets through, so the people who stopped aren't in the scan numbers.
 *
 * prompts: { shown, unlocked, stopped }
 */
export default function PasswordPrompts({ prompts, rangeLabel }) {
  const { shown, unlocked, stopped } = prompts
  const parts = [
    { key: "through", label: "Got through", value: unlocked, color: "var(--series-1)" },
    { key: "stopped", label: "Stopped at the password page", value: stopped, color: "var(--series-muted)" }
  ].filter((p) => p.value > 0)

  return (
    <section className={`glass-card-static ${styles.card} ${styles.full}`} aria-labelledby="password-page-title">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="password-page-title" className={styles.cardTitle}>
            Password page
          </h2>
          <p className={styles.cardSub}>
            {shown > 0
              ? `People were asked for a password ${formatExact(shown)} ${shown === 1 ? "time" : "times"} · ${rangeLabel.toLowerCase()}`
              : "How often people are asked for the password, and how many get through"}
          </p>
        </div>
      </div>

      {shown === 0 ? (
        <p className={styles.empty}>No one was asked for the password in this period</p>
      ) : (
        <>
          <div className={styles.splitBar} aria-hidden="true">
            {parts.map((p) => (
              <div
                key={p.key}
                style={{ flexGrow: p.value, flexBasis: 0, background: p.color }}
                title={`${p.label}: ${formatExact(p.value)}`}
              />
            ))}
          </div>
          <ul className={styles.splitLegend}>
            {parts.map((p) => (
              <li key={p.key} className={styles.legendItem}>
                <span className={styles.swatchRect} style={{ background: p.color }} />
                {p.label} <strong>{percentOf(p.value, shown)}%</strong>
                <span className={styles.muted}>({formatExact(p.value)})</span>
              </li>
            ))}
          </ul>
          <p className={styles.muted} style={{ marginTop: 12 }}>
            Scans only count people who got through. A browser that has entered the password skips the page for {UNLOCK_DAYS} days.
          </p>
        </>
      )}
    </section>
  )
}
