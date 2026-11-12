"use client"

import styles from "../analytics.module.css"
import { formatDate, formatExact } from "./format"
import { describeWeekly, displayUrl, viewerTimeZone } from "../../components/scheduledChanges"

function safeHref(url) {
  // Email, phone and text message destinations aren't web pages: show them
  // as text rather than opening the mail or phone app from here.
  if (/^(mailto|tel|sms):/i.test(String(url ?? ""))) return undefined
  try {
    const parsed = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`)
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : undefined
  } catch {
    return undefined
  }
}

/** "Mar 1, 2026 – Jun 1, 2026", or "Since Jun 1, 2026" while it's current. */
function periodDates(period) {
  return period.endedAt
    ? `${formatDate(period.startedAt)} – ${formatDate(period.endedAt)}`
    : `Since ${formatDate(period.startedAt)}`
}

/**
 * A destination filter value ("main", "period-12", "schedule-5") in words,
 * from the analytics data's `destinations`.
 */
export function destinationName(key, destinations) {
  if (key === "main") return "Main destination"
  const period = destinations?.periods.find((p) => p.key === key)
  if (period) return `${displayUrl(period.url)} (${periodDates(period)})`
  const schedule = destinations?.scheduleList.find((s) => s.key === key)
  if (schedule) return schedule.label
  // A deleted schedule: named by where it sent scans, when that's known.
  const row = destinations?.schedules.find((r) => r.key === key)
  return row ? `Deleted schedule · ${displayUrl(row.url)}` : "Deleted schedule"
}

/** When a schedule sends scans, for its row. */
function scheduleTimes(schedule, zone) {
  if (!schedule) return <span className={styles.muted}>Deleted</span>
  const when =
    schedule.kind === "weekly"
      ? `${describeWeekly(schedule)}${schedule.timeZone !== zone ? ` · ${schedule.timeZone} time` : ""}`
      : `${formatDate(schedule.startsAt)} – ${formatDate(schedule.endsAt)}`
  return (
    <>
      {when}
      {!schedule.enabled && <span className={`badge ${styles.currentBadge}`}>Off</span>}
    </>
  )
}

/** A destination's URL, opening in a new tab. */
function UrlLink({ url, children, className, label }) {
  return (
    <a
      href={safeHref(url)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={url}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  )
}

/**
 * Where the code's scans went in the period: each main destination while it
 * was live, and each schedule, with scans and unique scanners. The rows add up
 * to the code's total. Selecting a row narrows the page to its scans.
 *
 * `selected` is the destination filter value ("main", "period-…",
 * "schedule-…") or null; `onSelect` sets it.
 */
export default function Destinations({ destinations, rangeLabel, selected, onSelect }) {
  const zone = viewerTimeZone()
  const { main, schedules, total } = destinations
  const isSelected = (row) => selected === row.key || (selected === "main" && main.includes(row))

  function select(key) {
    onSelect(selected === key ? null : key)
  }

  function nameButton(row, children) {
    return (
      <button
        type="button"
        className={`${styles.codeTitle} ${styles.ellipsis}`}
        style={{ textAlign: "left", maxWidth: "100%" }}
        aria-pressed={isSelected(row)}
        onClick={(e) => {
          e.stopPropagation()
          select(row.key)
        }}
      >
        {children}
      </button>
    )
  }

  const rowProps = (row) => ({
    className: `${styles.clickableRow}${isSelected(row) ? ` ${styles.selectedRow}` : ""}`,
    onClick: () => select(row.key)
  })

  return (
    <section className={`glass-card-static ${styles.card} ${styles.full}`} aria-labelledby="destinations-title">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="destinations-title" className={styles.cardTitle}>
            Destinations
          </h2>
          <p className={styles.cardSub}>
            {rangeLabel} · where scans were sent. Select one to see only its scans.
          </p>
        </div>
        {selected && (
          <button type="button" className={styles.linkButton} onClick={() => onSelect(null)}>
            Show all destinations
          </button>
        )}
      </div>
      <div className={styles.tableScroll}>
        <table className={`${styles.table} ${styles.destinationsTable}`}>
          <thead>
            <tr>
              <th>Destination</th>
              <th>Live</th>
              <th className={styles.num}>Scans</th>
              <th className={styles.num}>Unique scanners</th>
              <th className={styles.num}>Per day</th>
            </tr>
          </thead>
          <tbody>
            {schedules.length > 0 && (
              <tr className={styles.sectionRow}>
                <th colSpan={5} scope="colgroup">
                  Main destination
                </th>
              </tr>
            )}
            {main.map((row) => (
              <tr key={`${row.key}-${row.url}`} {...rowProps(row)}>
                <td style={{ maxWidth: 380 }}>
                  {row.otherUrl ? (
                    <>
                      {nameButton(row, displayUrl(row.url))}
                      <span className={styles.muted}>Sent here as the destination changed</span>
                    </>
                  ) : (
                    <div className={styles.destinationName}>
                      {nameButton(row, displayUrl(row.url))}
                      <UrlLink url={row.url} className={styles.openLink} label={`Open ${displayUrl(row.url)}`}>
                        ↗
                      </UrlLink>
                      {row.current && <span className={`badge badge-cyan ${styles.currentBadge}`}>Current</span>}
                    </div>
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{periodDates(row)}</td>
                <td className={styles.num} data-label="Scans">
                  {formatExact(row.scans)}
                </td>
                <td className={styles.num} data-label="Unique">
                  {formatExact(row.uniques)}
                </td>
                <td className={styles.num} data-label="Per day">
                  {row.otherUrl ? "—" : (row.scans / Math.max(1, row.liveDays)).toFixed(1)}
                </td>
              </tr>
            ))}

            {schedules.length > 0 && (
              <tr className={styles.sectionRow}>
                <th colSpan={5} scope="colgroup">
                  Schedules
                </th>
              </tr>
            )}
            {schedules.map((row) => (
              <tr key={`${row.key}-${row.url}`} {...rowProps(row)}>
                <td style={{ maxWidth: 380 }}>
                  {nameButton(row, row.schedule ? row.schedule.label : "Deleted schedule")}
                  <UrlLink url={row.url} className={`${styles.ellipsis} ${styles.scheduleUrl}`}>
                    {displayUrl(row.url)}
                  </UrlLink>
                  {row.otherUrl && <span className={styles.muted}>An earlier link of this schedule</span>}
                </td>
                <td>{scheduleTimes(row.schedule, zone)}</td>
                <td className={styles.num} data-label="Scans">
                  {formatExact(row.scans)}
                </td>
                <td className={styles.num} data-label="Unique">
                  {formatExact(row.uniques)}
                </td>
                <td className={styles.num} data-label="Per day" title="Schedules are live for only part of the time">
                  —
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={styles.totalRow}>
              <th scope="row">Total</th>
              <td />
              <td className={styles.num} data-label="Scans">
                {formatExact(total.scans)}
              </td>
              <td className={styles.num} data-label="Unique">
                {formatExact(total.uniques)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className={styles.cardFoot}>
        A scanner who reached more than one destination counts once in the total.
        {main.some((r) => r.otherUrl) && " A few scans can reach the old destination in the moment it changes."}
      </p>
    </section>
  )
}
