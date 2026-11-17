"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import PageModerationButtons from "../../components/PageModerationButtons"
import styles from "./AdminPageBar.module.css"

/**
 * The bar above a page on /admin/pages/[id]: whose page it is, its status,
 * where its buttons and links go, and Take down / Restore / Close reports.
 */
export default function AdminPageBar({ page, openReports, links }) {
  const router = useRouter()
  const [error, setError] = useState("")

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <Link href="/admin/reports" className={styles.back}>
          ← Page reports
        </Link>
        <span className={styles.adminOnly}>Only admins see this bar</span>
      </div>

      <div className={styles.row}>
        <div className={styles.about}>
          <h1 className={styles.title}>{page.title || page.name}</h1>
          <p className={styles.meta}>
            {page.title && page.title !== page.name && <>Named “{page.name}” by its owner · </>}
            Owner: {page.ownerName} · <a href={`mailto:${page.ownerEmail}`}>{page.ownerEmail}</a>
            {page.ownerDisabled && <> · account disabled</>}
          </p>
          <p className={page.takenDown ? styles.statusDown : styles.status}>
            {page.status}
            {openReports > 0 && ` · ${openReports} open report${openReports === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className={styles.actions}>
          <PageModerationButtons
            pageId={page.id}
            title={page.title || page.name}
            takenDown={page.takenDown}
            hasOpenReports={openReports > 0}
            onDone={() => {
              setError("")
              router.refresh()
            }}
            onError={setError}
          />
        </div>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <details className={styles.links} open={links.length > 0 && links.length <= 8}>
        <summary>
          Where its buttons and links go ({links.length})
        </summary>
        {links.length === 0 ? (
          <p className={styles.none}>No buttons or links.</p>
        ) : (
          <ul>
            {links.map((link, index) => (
              <li key={index}>
                <span className={styles.where}>{link.where}</span> <strong>{link.label}</strong> → <code>{link.href}</code>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  )
}
