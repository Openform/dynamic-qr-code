"use client"

import { useState } from "react"
import Link from "next/link"
import { REASON_NAMES, groupReportsByPage } from "@/lib/pageReports"
import { adminPagePath } from "@/lib/pageReference"
import { formatDateTime, timeAgo, useNow } from "./adminTime"
import PageModerationButtons from "./PageModerationButtons"
import shared from "./InviteRequestsView.module.css"
import styles from "./PageReportsView.module.css"

const TABS = [
  { id: "open", label: "Open" },
  { id: "down", label: "Taken down" },
  { id: "closed", label: "Closed" }
]

/** Which tab a reported page is listed under. */
function tabOf(page) {
  if (page.open.length > 0) return "open"
  return page.takenDownAt ? "down" : "closed"
}

function Report({ report, now }) {
  return (
    <li className={styles.report}>
      <div className={styles.reportTop}>
        <strong>{REASON_NAMES[report.reason] ?? report.reason}</strong>
        <span className={shared.received} title={now === null ? undefined : formatDateTime(report.createdAt)}>
          {now === null ? "" : timeAgo(report.createdAt, now)}
        </span>
      </div>
      {report.message ? <p className={styles.message}>{report.message}</p> : <p className={styles.noMessage}>No message.</p>}
    </li>
  )
}

function PageCard({ page, now, onReports, onError }) {
  const title = page.title || page.name
  const lastClosed = page.closed[0]
  return (
    <li className={`glass-card-static ${shared.card}`}>
      <div className={shared.cardTop}>
        <div className={shared.who}>
          <h2 className={shared.name}>{title}</h2>
          {page.title && page.title !== page.name && <span className={shared.company}>named “{page.name}” by its owner</span>}
        </div>
        <span className={shared.received} title={now === null ? undefined : formatDateTime(page.latestAt)}>
          {now === null ? "" : `Last report ${timeAgo(page.latestAt, now)}`}
        </span>
      </div>

      <div className={shared.contact}>
        <span className={styles.owner}>Owner: {page.ownerName}</span>
        <a href={`mailto:${page.ownerEmail}`} className={shared.contactLink}>
          {page.ownerEmail}
        </a>
      </div>

      <div className={shared.tags}>
        {page.takenDownAt ? (
          <span className={`badge ${shared.tag} ${shared.flagOverdue}`}>Taken down</span>
        ) : page.published ? (
          <span className={`badge badge-success ${shared.tag}`}>Live</span>
        ) : (
          <span className={`badge ${shared.tag} ${shared.tagPlain}`}>Switched off by its owner</span>
        )}
        {page.ownerDisabled && <span className={`badge ${shared.tag} ${shared.flagSoon}`}>Owner’s account disabled</span>}
        {page.open.length > 0 && (
          <span className={`badge ${shared.tag} ${shared.flagSoon}`}>
            {page.open.length} open report{page.open.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {page.open.length > 0 && (
        <ul className={styles.reports}>
          {page.open.map((report) => (
            <Report key={report.id} report={report} now={now} />
          ))}
        </ul>
      )}
      {page.closed.length > 0 && (
        <details className={styles.closed} open={page.open.length === 0}>
          <summary>
            {page.closed.length} closed report{page.closed.length === 1 ? "" : "s"}
          </summary>
          <ul className={styles.reports}>
            {page.closed.map((report) => (
              <Report key={report.id} report={report} now={now} />
            ))}
          </ul>
        </details>
      )}

      <div className={shared.cardFooter}>
        <p className={shared.doneNote}>
          {page.takenDownAt
            ? `Taken down${page.takenDownByName ? ` by ${page.takenDownByName}` : ""}${now === null ? "" : `, ${formatDateTime(page.takenDownAt)}`}`
            : page.open.length === 0 && lastClosed
              ? `Reports closed${lastClosed.handledByName ? ` by ${lastClosed.handledByName}` : ""}${now === null ? "" : `, ${formatDateTime(lastClosed.handledAt)}`}`
              : ""}
        </p>
        <div className={shared.actions}>
          <Link href={adminPagePath(page.id)} className="btn btn-secondary btn-sm">
            View page
          </Link>
          <PageModerationButtons
            pageId={page.id}
            title={title}
            takenDown={Boolean(page.takenDownAt)}
            hasOpenReports={page.open.length > 0}
            onDone={(reports) => onReports(page.id, reports)}
            onError={onError}
          />
        </div>
      </div>
    </li>
  )
}

/**
 * Page reports (/admin/reports): reported campaign pages, each with its
 * reports, under Open (reports nobody has dealt with), Taken down and
 * Closed (reports closed, page left up).
 */
export default function PageReportsView({ initialReports, alertStatus }) {
  const [reports, setReports] = useState(initialReports)
  const [tab, setTab] = useState("open")
  const [error, setError] = useState("")
  const now = useNow()

  const pages = groupReportsByPage(reports)
  const counts = Object.fromEntries(TABS.map(({ id }) => [id, pages.filter((page) => tabOf(page) === id).length]))
  const shown = pages.filter((page) => tabOf(page) === tab)

  function replaceReports(pageId, pageReports) {
    setError("")
    setReports((list) => [...list.filter((report) => report.pageId !== pageId), ...pageReports])
  }

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={`container ${shared.headerInner}`}>
          <div className={shared.headerGroup}>
            <Link href="/admin">
              <span className={`gradient-text ${shared.logo}`}>QR Go</span>
            </Link>
            <span className={`badge badge-purple ${shared.adminBadge}`}>Admin</span>
          </div>
          <Link href="/admin" className="btn btn-ghost btn-sm">
            ← Back to Accounts
          </Link>
        </div>
      </header>

      <main className={`container ${shared.main}`}>
        <h1 className={shared.pageTitle}>Page reports</h1>
        <p className={shared.pageSubtitle}>
          Visitors report campaign pages from the link at the bottom of each one. Look at the page, then take it down if it breaks the
          Terms, or close the reports if it doesn’t. Reports never say who sent them.
        </p>

        <p className={`glass-card-static ${styles.alerts}`}>
          {alertStatus.configured ? (
            <>
              The first report about a page is emailed to <strong>{alertStatus.to.join(", ")}</strong>. More reports about it are only
              listed here until it’s dealt with.
            </>
          ) : (
            <>
              No emails are sent about reports: the server doesn’t have <code>RESEND_API_KEY</code>. Reports are still listed here.
            </>
          )}
        </p>

        <div className={`qr-tabs ${shared.tabs}`} role="group" aria-label="Show pages">
          {TABS.map(({ id, label }) => (
            <button key={id} type="button" aria-pressed={tab === id} className={`qr-tab ${tab === id ? "qr-tab-active" : ""}`} onClick={() => setTab(id)}>
              {label} ({counts[id]})
            </button>
          ))}
        </div>

        {error && (
          <div className="error-message" role="alert" style={{ marginBottom: "var(--space-lg)" }}>
            <span>⚠</span> {error}
          </div>
        )}

        {shown.length === 0 ? (
          <div className={`glass-card-static ${shared.empty}`}>
            {tab === "open" ? "No open reports. New ones show up here." : tab === "down" ? "No pages taken down." : "No closed reports yet."}
          </div>
        ) : (
          <ul className={shared.list}>
            {shown.map((page) => (
              <PageCard key={page.id} page={page} now={now} onReports={replaceReports} onError={setError} />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
