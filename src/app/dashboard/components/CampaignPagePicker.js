"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

/**
 * The account's campaign pages for choosing a destination: `{ pages,
 * canEdit }`, with `pages` null until they've loaded (and if they can't be).
 */
export function useCampaignPages() {
  const [state, setState] = useState({ pages: null, canEdit: false })
  useEffect(() => {
    let active = true
    fetch("/api/pages")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) setState({ pages: data.pages ?? [], canEdit: Boolean(data.canEdit) })
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  return state
}

/** `{ [pageId]: name }` for naming page destinations (displayUrl in scheduledChanges.js). */
export function pageNamesOf(pages) {
  return Object.fromEntries((pages ?? []).map((page) => [page.id, page.name]))
}

/**
 * Where a website code or a schedule sends scans: a website (the `children`,
 * the existing URL field) or one of the account's campaign pages. Accounts
 * with no pages and a package without them only see the URL field.
 *
 * `target` is "website" or "page"; `pageId` the chosen page's id as a string.
 */
export default function DestinationTarget({ id, pages, canEdit, target, onTarget, pageId, onPageId, error, hintStyle, children }) {
  const offerPages = pages !== null && (pages.length > 0 || canEdit || target === "page")
  if (!offerPages) return children

  return (
    <>
      <div className="qr-segmented" role="group" aria-label="Send scans to" style={{ marginBottom: 12 }}>
        {[
          ["website", "Website"],
          ["page", "Campaign page"]
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`qr-seg${target === value ? " qr-seg-active" : ""}`}
            aria-pressed={target === value}
            onClick={() => onTarget(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {target === "website" ? (
        children
      ) : pages.length === 0 ? (
        <p style={hintStyle}>
          You don’t have any campaign pages yet. <Link href="/dashboard/pages" style={{ color: "var(--cyan)" }}>Make one in Pages</Link>, then
          come back to point this here.
        </p>
      ) : (
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor={id} className="input-label">
            Campaign page
          </label>
          <select
            id={id}
            className={`input-field${error ? " input-error" : ""}`}
            value={pageId}
            onChange={(e) => onPageId(e.target.value)}
            aria-invalid={error ? true : undefined}
          >
            <option value="">Choose a page…</option>
            {pages.map((page) => (
              <option key={page.id} value={String(page.id)}>
                {page.name}
                {page.takenDown ? " (taken down)" : page.published ? "" : " (switched off)"}
              </option>
            ))}
          </select>
          <p style={error ? { ...hintStyle, color: "var(--danger, #e5484d)" } : hintStyle}>
            {error || "Scans open this page. Change what it says in Pages, at any time."}
          </p>
        </div>
      )}
    </>
  )
}
