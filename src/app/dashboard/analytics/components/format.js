/**
 * Display helpers for the analytics dashboard (client-side).
 */

const regionNames = new Intl.DisplayNames(["en"], { type: "region" })
const languageNames = new Intl.DisplayNames(["en"], { type: "language" })
const number = new Intl.NumberFormat("en-US")
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })

/** 1,284 / 12.9K / 1.2M — compact from 10,000 up. */
export function formatCount(n) {
  const value = Number(n) || 0
  return value >= 10_000 ? compact.format(value) : number.format(value)
}

/** Always the full number, for tooltips and tables. */
export function formatExact(n) {
  return number.format(Number(n) || 0)
}

export function percentOf(part, total) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

/**
 * Flag emoji for an ISO country code ("ZA" → 🇿🇦), or "" when unknown.
 * CountryFlag shows a globe icon in that case.
 */
export function flag(code) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return ""
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

export function countryName(code) {
  if (!code) return "Unknown"
  try {
    return regionNames.of(code) || code
  } catch {
    return code
  }
}

export function languageName(code) {
  if (!code) return "Unknown"
  try {
    const name = languageNames.of(code)
    return name && name !== code ? name : code.toUpperCase()
  } catch {
    return code
  }
}

const DEVICE_LABELS = { mobile: "Mobile", tablet: "Tablet", desktop: "Desktop" }
export function deviceLabel(type) {
  return DEVICE_LABELS[type] || "Unknown"
}

/** A city with its region, e.g. "Cape Town, Western Cape". */
export function placeLabel({ city, region, countryCode }) {
  if (city && region && region !== city) return `${city}, ${region}`
  return city || region || countryName(countryCode)
}

// Bucket keys are local calendar dates ("YYYY-MM-DD"); format them as UTC so
// the viewer's timezone doesn't shift them by a day.
const shortDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const longDay = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
const monthYear = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" })

export function formatBucket(key, bucket, { long = false } = {}) {
  const date = new Date(`${key}T00:00:00Z`)
  if (bucket === "month") return monthYear.format(date)
  if (bucket === "week") return long ? `Week of ${shortDay.format(date)}, ${date.getUTCFullYear()}` : shortDay.format(date)
  return long ? longDay.format(date) : shortDay.format(date)
}

const dateOnly = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })
const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })

export function formatDate(iso) {
  return iso ? dateOnly.format(new Date(iso)) : "—"
}

export function formatDateTime(iso) {
  return iso ? dateTime.format(new Date(iso)) : "—"
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a date. */
export function timeAgo(iso, now) {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`
  return formatDate(iso)
}

/** "UTC+02:00" for the viewer's current timezone. */
export function utcOffsetLabel(offsetMinutes) {
  const sign = offsetMinutes < 0 ? "−" : "+"
  const abs = Math.abs(offsetMinutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, "0")
  const mm = String(abs % 60).padStart(2, "0")
  return `UTC${sign}${hh}:${mm}`
}

/** Round a max value up to a clean axis top, with evenly spaced ticks. */
export function niceTicks(max, count = 4) {
  if (max <= 0) return [0, 1]
  const rough = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)
  const niceStep = Math.max(1, step)
  const top = Math.ceil(max / niceStep) * niceStep
  const ticks = []
  for (let t = 0; t <= top + 1e-9; t += niceStep) ticks.push(Math.round(t))
  return ticks
}
