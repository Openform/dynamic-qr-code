// Display helpers for scheduled destination changes. Times are shown in the
// viewer's own time zone; the API stores and sends them in UTC.

const changeTime = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
})

/** ISO time → "Tue, Dec 1, 2026, 09:00 AM" in the viewer's time zone. */
export function formatChangeTime(iso) {
  return changeTime.format(new Date(iso))
}

/** A URL without its https:// prefix, for display. */
export function displayUrl(url) {
  return String(url ?? "").replace(/^https?:\/\//i, "")
}

/** ms → the "YYYY-MM-DDTHH:MM" local time a datetime-local input holds. */
export function toLocalInputValue(ms) {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The viewer's time zone, e.g. "Africa/Johannesburg". */
export function viewerTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
