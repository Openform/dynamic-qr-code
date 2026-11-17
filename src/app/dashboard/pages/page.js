"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { pagePreviewPath } from "@/lib/pageReference"
import { pageStatus } from "@/lib/pageEditing"
import { formatChangeTime } from "../components/scheduledChanges"
import PagesHeader from "./PagesHeader"
import NewPageDialog from "./NewPageDialog"
import styles from "./pages.module.css"

/** The pages and package details from the API, or why they couldn't be loaded. */
async function fetchPages() {
  const res = await fetch("/api/pages")
  if (res.status === 401) return { signedOut: true }
  const body = await res.json().catch(() => ({}))
  return res.ok ? { data: body } : { error: body.error || "Your pages couldn’t be loaded." }
}

/**
 * /dashboard/pages — the account's campaign pages: status, end date and how
 * many codes send scans to each, with a "New page" dialog (templates) and
 * quick actions. Editing happens at /dashboard/pages/[id].
 *
 * Accounts on a package without pages (lib/packages.js) see a notice; any
 * pages they still have keep showing and can be switched off or deleted.
 */
export default function CampaignPagesList() {
  const router = useRouter()
  const [data, setData] = useState(null)
  const [error, setError] = useState("")
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const apply = useCallback(
    (result) => {
      if (result.signedOut) router.push("/login")
      else if (result.error) setError(result.error)
      else {
        setError("")
        setData(result.data)
      }
    },
    [router]
  )

  useEffect(() => {
    let active = true
    fetchPages().then((result) => {
      if (active) apply(result)
    })
    return () => {
      active = false
    }
  }, [apply])

  const load = async () => apply(await fetchPages())

  async function setPublished(page, published) {
    setBusyId(page.id)
    try {
      const res = await fetch(`/api/pages/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published })
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "That didn’t work.")
      await load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function remove(page) {
    const warning =
      page.usedBy > 0
        ? `\n\n${page.usedBy === 1 ? "1 code sends" : `${page.usedBy} codes send`} scans to this page. They’ll show “not found” until you change where they go.`
        : ""
    if (!confirm(`Delete “${page.name}”? This can’t be undone.${warning}`)) return
    setBusyId(page.id)
    try {
      const res = await fetch(`/api/pages/${page.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "The page couldn’t be deleted.")
      await load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const pages = data?.pages ?? []
  const atLimit = data ? pages.length >= data.limit : false

  return (
    <div className={styles.wrapper}>
      <PagesHeader current="pages" />
      <main className={`container ${styles.main}`}>
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>Campaign pages</h1>
            <p className={styles.subtitle}>Simple mobile pages your codes can send scans to.</p>
          </div>
          {data?.canEdit && (
            <div>
              <span className={styles.count}>
                {pages.length} of {data.limit} pages
              </span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setCreating(true)}
                disabled={atLimit}
                title={atLimit ? "You’ve reached your package’s number of pages." : undefined}
              >
                + New page
              </button>
            </div>
          )}
        </div>

        {data && !data.canEdit && (
          <p className={styles.notice} role="status">
            Campaign pages are available on the Business package and up.
            {pages.length > 0 && " Your pages keep showing, and you can still switch them off or delete them."}
          </p>
        )}
        {data?.canEdit && atLimit && (
          <p className={styles.notice} role="status">
            You’ve reached your package’s {data.limit} pages. Delete one, or contact us to upgrade.
          </p>
        )}
        {error && <p className={styles.errorBox}>{error}</p>}

        {data && pages.length === 0 && (
          <div className={`glass-card-static ${styles.empty}`}>
            <h2>No pages yet</h2>
            <p>
              {data.canEdit
                ? "Start one from a template, then point a code at it."
                : "Upgrade to Business to make your first page."}
            </p>
          </div>
        )}

        <ul className={styles.list}>
          {pages.map((page) => {
            const status = pageStatus(page)
            return (
              <li key={page.id} className={`glass-card-static ${styles.row}`}>
                <div className={styles.rowMain}>
                  <Link href={`/dashboard/pages/${page.id}`} className={styles.rowName}>
                    {page.name}
                  </Link>
                  <div className={styles.rowMeta}>
                    <span className={`${styles.status} ${styles[`status-${status.id}`]}`}>{status.label}</span>
                    <span>{page.endsAt ? `Ends ${formatChangeTime(page.endsAt)}` : "No end date"}</span>
                    <span>
                      {page.usedBy === 0 ? "No codes yet" : page.usedBy === 1 ? "Used by 1 code" : `Used by ${page.usedBy} codes`}
                    </span>
                  </div>
                </div>
                <div className={styles.rowActions}>
                  <Link href={`/dashboard/pages/${page.id}`} className="btn btn-ghost btn-sm">
                    {data.canEdit ? "Edit" : "View"}
                  </Link>
                  <a href={pagePreviewPath(page.id)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                    Preview
                  </a>
                  {!page.takenDown && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setPublished(page, !page.published)}
                      disabled={busyId === page.id}
                    >
                      {page.published ? "Switch off" : "Switch on"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => remove(page)}
                    disabled={busyId === page.id}
                  >
                    Delete
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </main>

      {creating && (
        <NewPageDialog
          onClose={() => setCreating(false)}
          onCreated={(page) => router.push(`/dashboard/pages/${page.id}`)}
        />
      )}
    </div>
  )
}
