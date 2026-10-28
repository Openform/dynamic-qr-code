"use client"

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import Link from "next/link"
import styles from "../analytics.module.css"
import { RANGES } from "@/lib/analyticsFilters"
import KpiRow from "./KpiRow"
import ScansOverTime from "./ScansOverTime"
import Locations from "./Locations"
import Devices from "./Devices"
import ScanHeatmap from "./ScanHeatmap"
import RankedBars from "./RankedBars"
import TopCodesTable from "./TopCodesTable"
import DestinationHistory from "./DestinationHistory"
import RecentScans from "./RecentScans"
import { formatDate, formatDateTime, formatExact, languageName } from "./format"

// How often to refresh while the page is open and visible, and how stale the
// data must be before coming back to the tab triggers a refresh.
const POLL_MS = 30_000
const RETURN_REFRESH_MS = 10_000

/**
 * GET the analytics JSON. Signed-out viewers go to /login and non-admins on
 * the admin page to /dashboard (the returned promise then rejects with
 * `redirecting` set, so callers can ignore it).
 */
async function fetchAnalytics(url, signal) {
  const res = await fetch(url, { signal, cache: "no-store" })
  if (res.status === 401 || res.status === 403) {
    window.location.href = res.status === 401 ? "/login" : "/dashboard"
    throw Object.assign(new Error("Redirecting"), { redirecting: true })
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw Object.assign(new Error(body.error || "Could not load analytics."), { userMessage: body.error })
  }
  return body
}

function updatedLabel(loadedAt, now) {
  const seconds = Math.max(0, Math.floor((now - loadedAt) / 1000))
  if (seconds < 10) return "Updated just now"
  if (seconds < 60) return `Updated ${seconds} s ago`
  return `Updated ${Math.floor(seconds / 60)} min ago`
}

/**
 * The analytics dashboard. `mode="user"` shows the signed-in user's codes,
 * filterable by collection and code; `mode="admin"` shows every account,
 * filterable by account. `initial` holds the filters from the page URL.
 */
export default function AnalyticsView({ mode = "user", initial }) {
  const admin = mode === "admin"
  const apiBase = admin ? "/api/admin/analytics" : "/api/analytics"

  const [range, setRange] = useState(initial.range)
  const [codeId, setCodeId] = useState(initial.codeId)
  const [collectionId, setCollectionId] = useState(admin ? null : initial.collectionId)
  const [accountId, setAccountId] = useState(admin ? initial.accountId : null)

  const [codes, setCodes] = useState([])
  const [collections, setCollections] = useState([])
  const [accounts, setAccounts] = useState([])

  const [data, setData] = useState(null)
  const [loadedKey, setLoadedKey] = useState(null) // which filters `data` is for
  const [failure, setFailure] = useState({ key: null, message: "" })
  const [offsetMinutes, setOffsetMinutes] = useState(0)
  const [syncing, setSyncing] = useState(false) // background or manual refresh
  const [updateFailed, setUpdateFailed] = useState(false)
  const [clock, setClock] = useState(0) // drives the "Updated … ago" label

  // Options for the filter dropdowns.
  useEffect(() => {
    async function loadOptions() {
      try {
        if (admin) {
          const res = await fetch("/api/admin/accounts")
          if (res.ok) setAccounts((await res.json()).accounts ?? [])
        } else {
          const [qrRes, colRes] = await Promise.all([fetch("/api/qrcodes"), fetch("/api/collections")])
          if (qrRes.ok) {
            const body = await qrRes.json()
            setCodes(body.qrcodes ?? body ?? [])
          }
          if (colRes.ok) setCollections((await colRes.json()).collections ?? [])
        }
      } catch (err) {
        console.error("Failed to load analytics filters:", err)
      }
    }
    loadOptions()
  }, [admin])

  // The filters as a query string (API names), also mirrored into the page URL.
  const apiQuery = useMemo(() => {
    const p = new URLSearchParams({ range })
    if (codeId) p.set("codeId", codeId)
    else if (collectionId !== null) p.set("collectionId", collectionId)
    if (accountId) p.set("accountId", accountId)
    return p
  }, [range, codeId, collectionId, accountId])

  useEffect(() => {
    const page = new URLSearchParams({ range })
    if (codeId) page.set("code", codeId)
    else if (collectionId !== null) page.set("collection", collectionId)
    if (accountId) page.set("account", accountId)
    window.history.replaceState(null, "", `?${page}`)
  }, [range, codeId, collectionId, accountId])

  // The current filters as one key. While the data on screen is for other
  // filters (or there's none yet), the page is loading: it stays dimmed until
  // the new data arrives, or shows an error if loading failed.
  const requestKey = `${apiBase}?${apiQuery}`
  const error = failure.key === requestKey ? failure.message : ""
  const refreshing = loadedKey !== requestKey && !error

  // The request in flight (to cancel it when filters change) and when data
  // last arrived (to decide whether a background refresh is due).
  const requestRef = useRef(null)
  const lastLoadedRef = useRef(0)

  /**
   * Fetch the data for the current filters. A normal load (filter change)
   * shows errors as a banner. A `silent` load (auto or manual refresh) keeps
   * the page as it is and only swaps in new numbers; if it fails, the current
   * data stays and the header says so.
   */
  function load({ silent = false } = {}) {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    const key = requestKey
    const tz = new Date().getTimezoneOffset()

    fetchAnalytics(`${key}&tz=${tz}`, controller.signal)
      .then((body) => {
        const now = Date.now()
        lastLoadedRef.current = now
        setOffsetMinutes(-tz)
        // Stamped here (not during render) so relative times stay stable.
        setData({ ...body, loadedAt: now })
        setLoadedKey(key)
        setClock(now)
        setFailure({ key: null, message: "" })
        setUpdateFailed(false)
      })
      .catch((err) => {
        if (err.name === "AbortError" || err.redirecting) return
        console.error("Failed to load analytics:", err)
        if (silent) setUpdateFailed(true)
        else setFailure({ key, message: err.userMessage || "Could not load analytics. Please try again." })
      })
      .finally(() => {
        if (requestRef.current === controller) {
          requestRef.current = null
          setSyncing(false)
        }
      })
  }

  /** Refresh in the background, unless a load is already running. */
  function refresh() {
    if (requestRef.current) return
    setSyncing(true)
    load({ silent: true })
  }

  // Effect events always see the latest filters, so the timers below don't
  // need restarting when the filters change.
  const loadForFilters = useEffectEvent(() => load())
  const refreshIfStale = useEffectEvent((maxAgeMs) => {
    if (document.visibilityState === "visible" && Date.now() - lastLoadedRef.current >= maxAgeMs) refresh()
  })

  // Load whenever the filters change.
  useEffect(() => {
    loadForFilters()
    return () => requestRef.current?.abort()
  }, [requestKey])

  // Keep the numbers current: refresh every POLL_MS while the tab is visible,
  // and as soon as the viewer comes back to the tab or window.
  useEffect(() => {
    const poll = setInterval(() => refreshIfStale(POLL_MS - 1000), POLL_MS)
    const onReturn = () => refreshIfStale(RETURN_REFRESH_MS)
    document.addEventListener("visibilitychange", onReturn)
    window.addEventListener("focus", onReturn)
    return () => {
      clearInterval(poll)
      document.removeEventListener("visibilitychange", onReturn)
      window.removeEventListener("focus", onReturn)
    }
  }, [])

  // Tick the "Updated … ago" label.
  useEffect(() => {
    const tick = setInterval(() => setClock(Date.now()), 5000)
    return () => clearInterval(tick)
  }, [])

  // The selected code's name comes back with the data (admins can open any code).
  const code = codeId ? (data?.code?.id === codeId ? data.code : codes.find((c) => c.id === codeId)) : null
  const collection =
    collectionId === "default"
      ? { name: "Default collection" }
      : collections.find((c) => c.id === collectionId)
  const account = accounts.find((a) => a.id === accountId)

  const codeOptions = codes.filter((c) =>
    collectionId === null ? true : collectionId === "default" ? c.collectionId == null : c.collectionId === collectionId
  )

  const scopeLabel = code
    ? admin && code.owner
      ? `${code.title} · ${code.owner.name}`
      : code.title
    : admin
      ? account
        ? account.name
        : "All accounts"
      : collection
        ? collection.name
        : "All codes"

  function selectCode(id) {
    setCodeId(id)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // offsetMinutes is set from the browser after the first load, so the server
  // and client render the same link.
  const exportHref = `${apiBase}/export?${apiQuery}&tz=${-offsetMinutes || 0}`
  const total = data?.summary.scans ?? 0

  return (
    <div className={`page-wrapper ${styles.root}`}>
      <header className={styles.header}>
        <div className={`container ${styles.headerInner}`}>
          <div className={styles.headerLeft}>
            <Link href="/dashboard">
              <span className={`gradient-text ${styles.logo}`}>QR Go</span>
            </Link>
            {admin && <span className={`badge badge-purple ${styles.adminBadge}`}>Admin</span>}
          </div>
          <Link href={admin ? "/admin" : "/dashboard"} className="btn btn-ghost btn-sm">
            ← Back to {admin ? "Accounts" : "Dashboard"}
          </Link>
        </div>
      </header>

      <main className={`container ${styles.main}`}>
        <div className={styles.titleRow}>
          <div style={{ minWidth: 0 }}>
            <h1 className={styles.pageTitle}>{admin ? "Platform analytics" : "Analytics"}</h1>
            <p className={styles.pageSubtitle}>
              {RANGES[range].label} · {scopeLabel}
            </p>
          </div>

          {data && (
            <div className={styles.updated}>
              {updateFailed ? (
                <span role="status" className={styles.updateFailed}>
                  Couldn&apos;t update — retrying
                </span>
              ) : (
                <span title={`Last updated ${formatDateTime(new Date(data.loadedAt).toISOString())} · refreshes every ${POLL_MS / 1000} s`}>
                  {syncing ? "Updating…" : updatedLabel(data.loadedAt, clock)}
                </span>
              )}
              <button
                type="button"
                className={styles.refreshButton}
                onClick={refresh}
                disabled={syncing || refreshing}
                aria-label="Refresh analytics"
              >
                <span aria-hidden="true" className={syncing ? styles.spinning : undefined}>
                  ↻
                </span>
                Refresh
              </button>
            </div>
          )}
        </div>

        <div className={styles.filters}>
          <div className={styles.segmented} role="group" aria-label="Date range">
            {Object.entries(RANGES).map(([key, r]) => (
              <button key={key} type="button" aria-pressed={range === key} onClick={() => setRange(key)} title={r.label}>
                {key === "all" ? "All" : key}
              </button>
            ))}
          </div>

          {admin ? (
            <select
              className={`input-field ${styles.select}`}
              aria-label="Account"
              value={accountId ?? ""}
              onChange={(e) => {
                setAccountId(e.target.value ? Number(e.target.value) : null)
                setCodeId(null)
              }}
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.email})
                </option>
              ))}
            </select>
          ) : (
            <>
              {collections.length > 0 && (
                <select
                  className={`input-field ${styles.select}`}
                  aria-label="Collection"
                  value={collectionId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value
                    setCollectionId(v === "" ? null : v === "default" ? "default" : Number(v))
                    setCodeId(null)
                  }}
                >
                  <option value="">All collections</option>
                  <option value="default">Default collection</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                className={`input-field ${styles.select}`}
                aria-label="QR code"
                value={codeId ?? ""}
                onChange={(e) => setCodeId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">All codes</option>
                {codeOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </>
          )}

          {admin && codeId && (
            <button type="button" className="badge badge-cyan" onClick={() => setCodeId(null)} title="Show all codes">
              {code ? code.title : "One code"} ✕
            </button>
          )}

          <a href={exportHref} className={`btn btn-ghost btn-sm ${styles.exportButton}`} download>
            ⬇ Export CSV
          </a>
        </div>

        {error && (
          <div className="error-message" role="alert" style={{ marginBottom: 20 }}>
            {error}
            {codeId && (
              <button type="button" className={styles.linkButton} onClick={() => setCodeId(null)}>
                Show all codes
              </button>
            )}
          </div>
        )}

        {!data && refreshing && (
          <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
            <div className="spinner spinner-lg" />
          </div>
        )}

        {data && (
          <div className={refreshing ? styles.loading : undefined} aria-busy={refreshing}>
            <KpiRow data={data} rangeLabel={RANGES[data.range].label} />

            <ScansOverTime series={data.series} bucket={data.bucket} />

            <div className={styles.grid2}>
              <Locations countries={data.countries} cities={data.cities} total={total} />
              <Devices devices={data.devices} os={data.os} browsers={data.browsers} total={total} />
            </div>

            <div className={styles.grid2}>
              <ScanHeatmap heatmap={data.heatmap} offsetMinutes={offsetMinutes} />
              <section className={`glass-card-static ${styles.card}`} aria-labelledby="languages-title">
                <div className={styles.cardHeader}>
                  <div>
                    <h2 id="languages-title" className={styles.cardTitle}>
                      Languages
                    </h2>
                    <p className={styles.cardSub}>The scanner&apos;s phone or browser language</p>
                  </div>
                </div>
                <RankedBars
                  items={data.languages.map((l) => ({ key: l.label ?? "unknown", label: languageName(l.label), scans: l.scans }))}
                  total={total}
                  initial={6}
                />
              </section>
            </div>

            {data.destinations ? (
              <DestinationHistory destinations={data.destinations} now={data.loadedAt} />
            ) : (
              <TopCodesTable
                codes={data.topCodes ?? []}
                showOwner={admin}
                hasPrevious={data.summary.prevScans !== null}
                onSelect={selectCode}
              />
            )}

            <div className={admin && data.topAccounts ? styles.grid2 : styles.full}>
              <RecentScans recent={data.recent} showCode={!data.destinations} now={data.loadedAt} />
              {admin && data.topAccounts && (
                <section className={`glass-card-static ${styles.card}`} aria-labelledby="accounts-title">
                  <div className={styles.cardHeader}>
                    <h2 id="accounts-title" className={styles.cardTitle}>
                      Top accounts
                    </h2>
                  </div>
                  <RankedBars
                    items={data.topAccounts.map((a) => ({ key: a.id, label: a.email ? `${a.name} · ${a.email}` : a.name, scans: a.scans }))}
                    total={total}
                    initial={10}
                    emptyText="No scans in this period"
                  />
                </section>
              )}
            </div>

            <Notes summary={data.summary} retentionMonths={data.retentionMonths} />
          </div>
        )}
      </main>
    </div>
  )
}

function Notes({ summary, retentionMonths }) {
  return (
    <div className={styles.notes}>
      <p>
        {summary.trackingSince
          ? `Detailed analytics since ${formatDate(summary.trackingSince)}.`
          : "Detailed analytics start with the next scan."}
        {summary.untrackedScans > 0 &&
          ` ${formatExact(summary.untrackedScans)} earlier ${summary.untrackedScans === 1 ? "scan has" : "scans have"} no details and only ${summary.untrackedScans === 1 ? "counts" : "count"} toward totals.`}
      </p>
      {summary.botsFiltered > 0 && (
        <p>
          {formatExact(summary.botsFiltered)} link-preview and bot{" "}
          {summary.botsFiltered === 1 ? "visit was" : "visits were"} left out of this period.
        </p>
      )}
      <p>
        {retentionMonths > 0
          ? `Scan details are kept for ${retentionMonths} months; each code's total is kept for good.`
          : "Scan details are kept indefinitely."}{" "}
        Unique scanners are estimated from each scanner&apos;s connection and device; IP addresses are not stored.
      </p>
    </div>
  )
}
