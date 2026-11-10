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

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

/**
 * A length of time in words, to the minute: "3 minutes", "1 hour and 30
 * minutes", "2 days, 4 hours and 5 minutes". Zero parts are left out.
 */
export function describeLength(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts = [
    days && plural(days, "day"),
    hours && plural(hours, "hour"),
    minutes && plural(minutes, "minute")
  ].filter(Boolean)
  if (parts.length === 0) return "0 minutes"
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
}

/** The viewer's time zone, e.g. "Africa/Johannesburg". */
export function viewerTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
