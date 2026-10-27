"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import Avatar from "../../dashboard/components/Avatar"
import CreateAccountModal from "./CreateAccountModal"
import { PACKAGES, getPackage, describeLimit } from "@/lib/packages"

/** "2026-10-27 14:03:52" (DB string) → "27 Oct 2026". */
function formatDate(value) {
  if (!value) return "—"
  const date = new Date(String(value).replace(" ", "T"))
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric"
  })
}

function Notice({ notice, onDismiss }) {
  if (!notice) return null
  const isError = notice.type === "error"
  return (
    <div
      role="status"
      style={{
        ...styles.notice,
        background: isError ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
        border: `1px solid ${isError ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`,
        color: isError ? "var(--error)" : "var(--success)"
      }}
    >
      <span>{isError ? "⚠" : "✓"}</span>
      <span style={{ flex: 1 }}>{notice.text}</span>
      {notice.action}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={styles.noticeClose}
      >
        ✕
      </button>
    </div>
  )
}

function CopyButton({ text, label }) {
  const [state, setState] = useState("idle") // idle | copied | failed
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState("copied")
    } catch {
      setState("failed")
    }
  }
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Copy failed" : label}
    </button>
  )
}

/** "8 / 20" with a progress bar, or "8 · Unlimited". Flags at/over limit. */
function Usage({ account }) {
  const { limit } = getPackage(account.package)
  const used = account.codeCount

  if (limit === null) {
    return (
      <div>
        <div style={styles.usageText}>
          <strong>{used}</strong>
          <span style={styles.muted}> · Unlimited</span>
        </div>
      </div>
    )
  }

  const over = used > limit
  const atLimit = used === limit
  const pct = Math.min(100, Math.round((used / limit) * 100))
  const color = over ? "var(--error)" : atLimit ? "var(--warning)" : "var(--cyan)"

  return (
    <div>
      <div style={styles.usageText}>
        <strong style={{ color: over || atLimit ? color : undefined }}>{used}</strong>
        <span style={styles.muted}> / {limit}</span>
      </div>
      <div style={styles.bar} aria-hidden="true">
        <div style={{ ...styles.barFill, width: `${pct}%`, background: color }} />
      </div>
      {(over || atLimit) && (
        <div style={{ ...styles.usageFlag, color }}>
          {over ? `${used - limit} over limit` : "At limit"}
        </div>
      )}
    </div>
  )
}

export default function AdminDashboard({ currentAdminId }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [search, setSearch] = useState("")
  const [savingId, setSavingId] = useState(null)
  const [notice, setNotice] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/accounts")
        if (res.status === 401) {
          window.location.href = "/login"
          return
        }
        if (res.status === 403) {
          window.location.href = "/dashboard"
          return
        }
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Could not load accounts.")
        setAccounts(data.accounts ?? [])
      } catch (err) {
        setLoadError(err.message || "Could not load accounts.")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ---- Change package (upgrade / downgrade) ----
  async function handlePackageChange(account, packageId) {
    if (packageId === account.package) return
    const next = getPackage(packageId)

    if (next.limit !== null && account.codeCount > next.limit) {
      const ok = confirm(
        `${account.name} has ${account.codeCount} codes, which is more than the ${next.name} package allows (${next.limit}).\n\n` +
          `Their existing codes will keep working, but they won't be able to create new ones until they're under the limit.\n\nContinue?`
      )
      if (!ok) return
    }

    const previous = account.package
    setSavingId(account.id)
    setNotice(null)
    // Optimistic update — reverted below if the request fails.
    setAccounts((prev) =>
      prev.map((a) => (a.id === account.id ? { ...a, package: packageId } : a))
    )

    try {
      const res = await fetch(`/api/admin/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: packageId })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Could not change the package.")

      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? data.account : a))
      )
      setNotice({
        type: "success",
        text: `${account.name} is now on the ${next.name} package (${describeLimit(packageId).toLowerCase()}).`
      })
    } catch (err) {
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, package: previous } : a))
      )
      setNotice({ type: "error", text: err.message })
    } finally {
      setSavingId(null)
    }
  }

  // ---- Create account ----
  // Throws on failure so the modal can show the server's message inline.
  const handleCreate = useCallback(async (fields) => {
    const res = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || "Could not create the account.")

    const account = data.account
    setAccounts((prev) => [account, ...prev])
    setCreateOpen(false)

    const loginDetails =
      `Your QR Go account is ready.\n\n` +
      `Sign in: ${window.location.origin}/login\n` +
      `Email: ${account.email}\n` +
      `Temporary password: ${fields.password}\n\n` +
      `You can change your password in Profile Settings after signing in.`

    setNotice({
      type: "success",
      text: `Created ${account.name} (${account.email}) on the ${getPackage(account.package).name} package.`,
      action: <CopyButton text={loginDetails} label="Copy login details" />
    })
  }, [])

  // ---- Derived data ----
  const query = search.trim().toLowerCase()
  const visible = accounts.filter(
    (a) =>
      !query ||
      a.name?.toLowerCase().includes(query) ||
      a.email?.toLowerCase().includes(query)
  )

  const totalCodes = accounts.reduce((sum, a) => sum + a.codeCount, 0)
  const totalScans = accounts.reduce((sum, a) => sum + a.scanCount, 0)
  const packageBreakdown = PACKAGES.map((p) => ({
    ...p,
    count: accounts.filter((a) => getPackage(a.package).id === p.id).length
  })).filter((p) => p.count > 0)

  if (loading) {
    return (
      <div style={styles.loadingPage}>
        <div className="spinner spinner-lg" />
        <p style={{ color: "var(--text-secondary)", marginTop: "16px" }}>
          Loading accounts…
        </p>
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      {/* ---- Header ---- */}
      <header style={styles.header}>
        <div className="container" style={styles.headerInner}>
          <div style={styles.headerLeft}>
            <Link href="/dashboard">
              <span className="gradient-text" style={styles.logo}>
                QR Go
              </span>
            </Link>
            <span className="badge badge-purple" style={styles.adminBadge}>
              Admin
            </span>
          </div>
          <Link href="/dashboard" className="btn btn-ghost btn-sm">
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="container" style={styles.main}>
        <h1 style={styles.pageTitle}>Accounts</h1>
        <p style={styles.pageSubtitle}>
          Every QR Go account, its package and how many codes it&apos;s using.
          Change a package to upgrade or downgrade a client.
        </p>

        {loadError ? (
          <div className="error-message" role="alert">
            <span>⚠</span> {loadError}
          </div>
        ) : (
          <>
            {/* ---- Summary ---- */}
            <div style={styles.statsRow} className="animate-fadeIn">
              <div className="glass-card-static" style={styles.statCard}>
                <p style={styles.statLabel}>Accounts</p>
                <p className="gradient-text" style={styles.statValue}>
                  {accounts.length}
                </p>
                {packageBreakdown.length > 0 && (
                  <p style={styles.statSub}>
                    {packageBreakdown.map((p) => `${p.count} ${p.name}`).join(" · ")}
                  </p>
                )}
              </div>
              <div className="glass-card-static" style={styles.statCard}>
                <p style={styles.statLabel}>QR Codes</p>
                <p className="gradient-text" style={styles.statValue}>
                  {totalCodes}
                </p>
              </div>
              <div className="glass-card-static" style={styles.statCard}>
                <p style={styles.statLabel}>Total Scans</p>
                <p className="gradient-text" style={styles.statValue}>
                  {totalScans}
                </p>
              </div>
            </div>

            <Notice notice={notice} onDismiss={() => setNotice(null)} />

            {/* ---- Toolbar ---- */}
            <div style={styles.toolbar}>
              <div style={styles.searchWrap}>
                <span style={styles.searchIcon}>🔍</span>
                <input
                  id="search-accounts"
                  type="text"
                  className="input-field"
                  placeholder="Search by name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: "40px" }}
                />
              </div>
              <button
                id="create-account-btn"
                className="btn btn-primary"
                onClick={() => setCreateOpen(true)}
              >
                + Create Account
              </button>
            </div>

            {/* ---- Accounts table ---- */}
            <div className="glass-card-static animate-fadeIn" style={styles.tableCard}>
              <div style={styles.tableScroll}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Account</th>
                      <th style={{ ...styles.th, width: "260px" }}>Package</th>
                      <th style={{ ...styles.th, width: "150px" }}>Codes used</th>
                      <th style={{ ...styles.th, width: "90px", textAlign: "right" }}>Scans</th>
                      <th style={{ ...styles.th, width: "120px" }}>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={styles.emptyCell}>
                          {query ? "No accounts match your search." : "No accounts yet."}
                        </td>
                      </tr>
                    ) : (
                      visible.map((account) => (
                        <tr key={account.id} style={styles.tr}>
                          <td style={styles.td}>
                            <div style={styles.accountCell}>
                              <Avatar src={account.avatar} name={account.name} size={36} />
                              <div style={{ minWidth: 0 }}>
                                <div style={styles.accountName}>
                                  <span className="truncate">{account.name}</span>
                                  {account.id === currentAdminId && (
                                    <span className="badge badge-cyan">You</span>
                                  )}
                                  {account.isAdmin && account.id !== currentAdminId && (
                                    <span className="badge badge-purple">Admin</span>
                                  )}
                                </div>
                                <div className="truncate" style={styles.accountEmail}>
                                  {account.email}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={styles.td}>
                            <div style={styles.packageCell}>
                              <select
                                aria-label={`Package for ${account.name}`}
                                className="input-field"
                                value={getPackage(account.package).id}
                                disabled={savingId === account.id}
                                onChange={(e) => handlePackageChange(account, e.target.value)}
                                style={styles.packageSelect}
                              >
                                {PACKAGES.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} — {p.limit === null ? "Unlimited" : p.limit}
                                  </option>
                                ))}
                              </select>
                              {savingId === account.id && <span className="spinner" />}
                            </div>
                          </td>
                          <td style={styles.td}>
                            <Usage account={account} />
                          </td>
                          <td style={{ ...styles.td, textAlign: "right" }}>
                            {account.scanCount}
                          </td>
                          <td style={{ ...styles.td, ...styles.muted, whiteSpace: "nowrap" }}>
                            {formatDate(account.createdAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Rendered only while open, so the form starts empty every time. */}
      {createOpen && (
        <CreateAccountModal
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  )
}

const styles = {
  loadingPage: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh"
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 50,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    background: "rgba(10, 10, 26, 0.85)",
    borderBottom: "1px solid rgba(255,255,255,0.06)"
  },
  headerInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "64px",
    gap: "12px"
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px"
  },
  logo: {
    fontSize: "1.4rem",
    fontWeight: 700,
    letterSpacing: "-0.02em"
  },
  adminBadge: {
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontSize: "0.7rem"
  },
  main: {
    paddingTop: "32px",
    paddingBottom: "64px"
  },
  pageTitle: {
    fontSize: "1.8rem",
    fontWeight: 700,
    letterSpacing: "-0.02em"
  },
  pageSubtitle: {
    color: "var(--text-secondary)",
    marginTop: "6px",
    marginBottom: "28px",
    maxWidth: "640px"
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "20px",
    marginBottom: "28px"
  },
  statCard: {
    padding: "22px 26px"
  },
  statLabel: {
    fontSize: "0.85rem",
    color: "var(--text-secondary)",
    marginBottom: "6px",
    fontWeight: 500
  },
  statValue: {
    fontSize: "2.2rem",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    lineHeight: 1.1
  },
  statSub: {
    fontSize: "0.8rem",
    color: "var(--text-tertiary)",
    marginTop: "6px"
  },
  notice: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    borderRadius: "var(--radius-md)",
    fontSize: "0.9rem",
    marginBottom: "20px",
    flexWrap: "wrap"
  },
  noticeClose: {
    color: "inherit",
    opacity: 0.7,
    fontSize: "0.9rem",
    padding: "2px 6px"
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    marginBottom: "20px",
    flexWrap: "wrap"
  },
  searchWrap: {
    position: "relative",
    flex: "1 1 260px",
    maxWidth: "400px"
  },
  searchIcon: {
    position: "absolute",
    left: "14px",
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: "0.9rem",
    pointerEvents: "none"
  },
  tableCard: {
    padding: 0,
    overflow: "hidden"
  },
  tableScroll: {
    overflowX: "auto"
  },
  table: {
    width: "100%",
    minWidth: "820px",
    borderCollapse: "collapse",
    fontSize: "0.92rem"
  },
  th: {
    textAlign: "left",
    padding: "14px 20px",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-tertiary)",
    borderBottom: "1px solid var(--glass-border)"
  },
  tr: {
    borderBottom: "1px solid rgba(255,255,255,0.05)"
  },
  td: {
    padding: "14px 20px",
    verticalAlign: "middle"
  },
  emptyCell: {
    padding: "48px 20px",
    textAlign: "center",
    color: "var(--text-secondary)"
  },
  accountCell: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minWidth: 0
  },
  accountName: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontWeight: 600,
    minWidth: 0
  },
  accountEmail: {
    fontSize: "0.82rem",
    color: "var(--text-secondary)",
    marginTop: "2px"
  },
  packageCell: {
    display: "flex",
    alignItems: "center",
    gap: "10px"
  },
  packageSelect: {
    padding: "8px 12px",
    fontSize: "0.88rem",
    minWidth: "200px"
  },
  usageText: {
    fontSize: "0.92rem"
  },
  muted: {
    color: "var(--text-secondary)"
  },
  bar: {
    marginTop: "6px",
    height: "4px",
    width: "100%",
    maxWidth: "110px",
    borderRadius: "9999px",
    background: "rgba(255,255,255,0.08)",
    overflow: "hidden"
  },
  barFill: {
    height: "100%",
    borderRadius: "9999px",
    transition: "width var(--transition-base)"
  },
  usageFlag: {
    fontSize: "0.75rem",
    fontWeight: 600,
    marginTop: "4px"
  }
}
