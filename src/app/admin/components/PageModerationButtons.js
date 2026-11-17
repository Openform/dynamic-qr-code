"use client"

import { useState } from "react"

/**
 * Take down, Restore and Close reports for a campaign page, on the reports
 * list and the admin view of a page. Calls PATCH /api/admin/pages/[id] and
 * hands the page's reports, as they are now, to `onDone`.
 */
export default function PageModerationButtons({ pageId, title, takenDown, hasOpenReports, onDone, onError }) {
  const [busy, setBusy] = useState(false)

  async function act(action) {
    const name = title ? `“${title}”` : "this page"
    if (action === "take-down") {
      const ok = confirm(
        `Take down ${name}?\n\nAnyone sent to it will see “QR code not found”, and its owner will see that QR Go took it down. Its open reports are closed. You can restore it later.`
      )
      if (!ok) return
    }
    if (action === "restore" && !confirm(`Restore ${name}?\n\nVisitors will see it again, as long as its owner has it switched on.`)) return

    setBusy(true)
    try {
      const res = await fetch(`/api/admin/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "That didn’t work. Please try again.")
      onDone?.(data.reports ?? [])
    } catch (err) {
      onError?.(err instanceof TypeError ? "Couldn’t reach QR Go. Check your connection and try again." : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {hasOpenReports && !takenDown && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => act("close-reports")} disabled={busy}>
          Close reports
        </button>
      )}
      {takenDown ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => act("restore")} disabled={busy}>
          Restore page
        </button>
      ) : (
        <button type="button" className="btn btn-danger btn-sm" onClick={() => act("take-down")} disabled={busy}>
          Take down
        </button>
      )}
    </>
  )
}
