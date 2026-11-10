"use client"

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { weekPreview } from "@/lib/schedulePreview"
import { displayUrl } from "./scheduledChanges"
import styles from "./WeekPreview.module.css"

/**
 * Colours for schedules, in a fixed order, checked for colour-blind
 * separation on the panel's dark surface. Past the eighth, schedules share
 * OTHER_COLOR (the legend, tooltip and list still name each one).
 */
export const SCHEDULE_COLORS = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767"
]
export const OTHER_COLOR = "#8b93a7"

const PREVIEW_REFRESH_MS = 60_000

/** Minutes after midnight → "07:30"; the end of the day is "24:00". */
function clockText(minute) {
  if (minute >= 1440) return "24:00"
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
}

const dayName = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC"
})
const shortDayName = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" })

/**
 * "2026-11-10" → "Tue, Nov 10", or "Tue 10" when `short` (the date itself,
 * whatever the viewer's zone).
 */
function dayLabel(date, index, short = false) {
  if (index === 0) return "Today"
  const [y, m, d] = date.split("-").map(Number)
  const ms = Date.UTC(y, m - 1, d)
  return short ? `${shortDayName.format(ms)} ${d}` : dayName.format(ms)
}

function clockChangeNote(minutes) {
  if (minutes < 1440) return "Clocks go forward"
  if (minutes > 1440) return "Clocks go back"
  return null
}

/**
 * The next 7 days, coloured by where scans go, worked out with the same
 * function the redirect uses (lib/schedulePreview.js). Gaps are the main
 * destination.
 *
 * `schedules` are the code's schedules (an unsaved one included while it's
 * being edited); `colorOf` and `labelOf` map schedule ids to a colour and a
 * name; `mainChanges` are pending changes to the main destination.
 */
export default function WeekPreview({ schedules, mainUrl, mainChanges, viewerZone, colorOf, labelOf, note }) {
  const [now, setNow] = useState(() => Date.now())
  const [zoneChoice, setZoneChoice] = useState(viewerZone)
  const [tip, setTip] = useState(null)
  const gridRef = useRef(null)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), PREVIEW_REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  // A tooltip opened by a tap stays until the next tap somewhere else.
  useEffect(() => {
    if (!tip) return
    function onPointerDown(e) {
      if (!gridRef.current?.contains(e.target)) setTip(null)
    }
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [tip])

  // The preview takes a few dozen milliseconds, so typing stays ahead of it.
  const deferredSchedules = useDeferredValue(schedules)

  // The zones the preview can show: the viewer's, and any weekly schedule's.
  const zones = useMemo(() => {
    const set = new Set([viewerZone])
    for (const s of deferredSchedules) if (s.kind === "weekly" && s.timeZone) set.add(s.timeZone)
    return [...set]
  }, [deferredSchedules, viewerZone])
  const zone = zones.includes(zoneChoice) ? zoneChoice : viewerZone

  const nowMinute = Math.floor(now / 60_000)
  const preview = useMemo(() => {
    try {
      return weekPreview({
        mainUrl,
        mainChanges,
        schedules: deferredSchedules,
        now: nowMinute * 60_000,
        timeZone: zone
      })
    } catch {
      return null // a time zone this browser doesn't know
    }
  }, [mainUrl, mainChanges, deferredSchedules, nowMinute, zone])

  if (!preview) return null

  const nameOf = (segment) =>
    segment.scheduleId === null ? "Main destination" : labelOf.get(segment.scheduleId) || "Schedule"
  const describeSegment = (s) => `${clockText(s.start)}–${clockText(s.end)} ${nameOf(s)}`

  // Legend: the schedules that appear this week, in the order they're listed.
  const shown = new Set()
  for (const day of preview.days) for (const s of day.segments) if (s.scheduleId !== null) shown.add(s.scheduleId)
  const legend = deferredSchedules.filter((s) => shown.has(s.id))

  return (
    <section className={styles.preview} aria-labelledby="week-preview-title">
      <div className={styles.head}>
        <div>
          <h3 id="week-preview-title" className={styles.title}>
            Next 7 days
          </h3>
          {note && <p className={styles.note}>{note}</p>}
        </div>
        {zones.length > 1 ? (
          <label className={styles.zonePicker}>
            Times in
            <select value={zone} onChange={(e) => setZoneChoice(e.target.value)} className="input-field">
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z === viewerZone ? `${z} (yours)` : z}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className={styles.note}>Times in {zone}</span>
        )}
      </div>

      <div
        ref={gridRef}
        className={styles.grid}
        onPointerLeave={(e) => e.pointerType === "mouse" && setTip(null)}
      >
        <div className={styles.axis} aria-hidden="true">
          {[0, 6, 12, 18, 24].map((h) => (
            <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>

        {preview.days.map((day, index) => {
          const change = clockChangeNote(day.minutes)
          return (
            <div key={day.date} className={styles.row}>
              <div className={styles.dayLabel}>
                <span className={styles.longDay}>{dayLabel(day.date, index)}</span>
                <span className={styles.shortDay}>{dayLabel(day.date, index, true)}</span>
                {change && <span className={styles.clockNote}>{change}</span>}
              </div>
              <div
                className={styles.track}
                role="img"
                aria-label={`${dayLabel(day.date, index)}: ${day.segments.map(describeSegment).join("; ")}`}
              >
                {[6, 12, 18].map((h) => (
                  <span key={h} className={styles.gridLine} style={{ left: `${(h / 24) * 100}%` }} />
                ))}
                {day.segments.map((s) => (
                  <span
                    key={s.start}
                    className={styles.segmentHit}
                    style={{ left: `${(s.start / 1440) * 100}%`, width: `${((s.end - s.start) / 1440) * 100}%` }}
                    onPointerEnter={() => setTip({ date: day.date, segment: s })}
                    onPointerDown={() => setTip({ date: day.date, segment: s })}
                  >
                    {s.scheduleId !== null && (
                      <span className={styles.segment} style={{ background: colorOf.get(s.scheduleId) }} />
                    )}
                  </span>
                ))}
                {index === 0 && (
                  <>
                    <span className={styles.past} style={{ width: `${(preview.nowMinute / 1440) * 100}%` }} />
                    <span className={styles.nowLine} style={{ left: `${(preview.nowMinute / 1440) * 100}%` }} />
                  </>
                )}
                {tip?.date === day.date && (
                  <span
                    className={styles.tooltip}
                    role="status"
                    style={{
                      left: `${Math.min(80, Math.max(20, ((tip.segment.start + tip.segment.end) / 2880) * 100))}%`
                    }}
                  >
                    <strong>
                      {clockText(tip.segment.start)}–{clockText(tip.segment.end)}
                    </strong>{" "}
                    {nameOf(tip.segment)}
                    <span className={styles.tooltipUrl}>{displayUrl(tip.segment.url)}</span>
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <ul className={styles.legend}>
        {legend.map((s) => (
          <li key={s.id}>
            <span className={styles.key} style={{ background: colorOf.get(s.id) }} />
            {labelOf.get(s.id)}
          </li>
        ))}
        <li>
          <span className={`${styles.key} ${styles.mainKey}`} />
          Main destination
        </li>
      </ul>

      <details className={styles.asList}>
        <summary>Show as a list</summary>
        <ul>
          {preview.days.map((day, index) => (
            <li key={day.date}>
              <strong>{dayLabel(day.date, index)}</strong>
              {clockChangeNote(day.minutes) && ` (${clockChangeNote(day.minutes).toLowerCase()})`}:{" "}
              {day.segments
                .map((s) => `${clockText(s.start)}–${clockText(s.end)} ${nameOf(s)} (${displayUrl(s.url)})`)
                .join("; ")}
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
