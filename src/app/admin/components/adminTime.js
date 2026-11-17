"use client"

import { useSyncExternalStore } from "react"

// Times on the admin lists (invite requests, page reports).

// The current time, refreshed every minute. null while rendering on the
// server, so times are only written in the admin's own time zone.
let minuteNow = 0
function subscribeToClock(onChange) {
  const timer = setInterval(onChange, 60_000)
  return () => clearInterval(timer)
}
function getNow() {
  const now = Date.now()
  if (now - minuteNow >= 60_000) minuteNow = now
  return minuteNow
}
const getServerNow = () => null

export function useNow() {
  return useSyncExternalStore(subscribeToClock, getNow, getServerNow)
}

/** 90 seconds → "just now", 3 hours → "3 h ago", 2 days → "2 days ago". */
export function timeAgo(iso, now) {
  const ms = now - Date.parse(iso)
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 2) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.floor(hours / 24)} days ago`
}

/** "29 Oct 2026, 09:15" in the admin's time zone. */
export function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })
}
