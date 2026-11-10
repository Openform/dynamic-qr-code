"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { isValidDestinationUrl } from "@/lib/qrStyle"
import {
  formatChangeTime,
  displayUrl,
  describeLength,
  describeDays,
  describeDailyTimes,
  describeWeekly,
  toLocalInputValue,
  viewerTimeZone
} from "./scheduledChanges"
import WeekPreview, { SCHEDULE_COLORS, OTHER_COLOR } from "./WeekPreview"
import styles from "./SchedulesModal.module.css"

const HOUR_MS = 60 * 60 * 1000

// Days as bits: 1 = Monday … 64 = Sunday.
const WEEKDAYS = 31
const WEEKEND = 96
const EVERY_DAY = 127
const DAY_BUTTONS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

// The id an unsaved new schedule has in the week preview.
const DRAFT_ID = -1

// How often the open panel re-reads its schedules, so they move from
// upcoming to live to ended on their own.
const REFRESH_MS = 30_000

/** The URL field shows a fixed "https://" prefix, so it holds the rest. */
function stripScheme(value) {
  return String(value ?? "").trim().replace(/^https?:\/\//i, "")
}

/**
 * A form for a new schedule. It holds the fields of both kinds, so switching
 * between them keeps what was typed. Dates default to the next full hour,
 * for an hour. (A day used to be the default, and changing only the end's
 * time then left its date on the next day without anyone noticing.) Weekly
 * times default to Monday to Friday, 09:00–17:00, in the viewer's time zone.
 */
function newForm() {
  const start = Math.ceil(Date.now() / HOUR_MS) * HOUR_MS
  return {
    id: null,
    kind: "range",
    label: "",
    url: "",
    from: toLocalInputValue(start),
    until: toLocalInputValue(start + HOUR_MS),
    days: WEEKDAYS,
    startTime: "09:00",
    endTime: "17:00",
    timeZone: viewerTimeZone()
  }
}

/** A datetime-local value (the viewer's local time) → ms, or NaN. */
function localMs(value) {
  return value ? new Date(value).getTime() : NaN
}

function editForm(schedule) {
  const common = {
    id: schedule.id,
    kind: schedule.kind,
    label: schedule.label,
    url: stripScheme(schedule.destinationUrl),
    original: schedule
  }
  if (schedule.kind === "weekly") {
    return {
      ...common,
      days: schedule.days,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      timeZone: schedule.timeZone
    }
  }
  return {
    ...common,
    from: toLocalInputValue(Date.parse(schedule.startsAt)),
    until: toLocalInputValue(Date.parse(schedule.endsAt))
  }
}

/** True for a time zone this browser knows. */
function knownTimeZone(zone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone })
    return Boolean(zone)
  } catch {
    return false
  }
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** What's wrong with a form's timing, or "". */
function timingProblem(form) {
  if (form.kind === "weekly") {
    if (!form.days) return "Choose at least one day."
    if (!TIME.test(form.startTime) || !TIME.test(form.endTime)) return "Choose a start and end time."
    if (!knownTimeZone(form.timeZone)) return "Choose a time zone."
    return ""
  }
  // datetime-local values have no time zone: the browser reads them as local time.
  const startsMs = localMs(form.from)
  const endsMs = localMs(form.until)
  if (Number.isNaN(startsMs) || Number.isNaN(endsMs)) return "Choose when the schedule starts and ends."
  if (endsMs <= startsMs) return "The end must be after the start."
  if (endsMs <= Date.now()) return "The end must be in the future."
  return ""
}

/** The timing fields to send for a form: all of them, or (editing) only what changed. */
function timingBody(form) {
  const before = form.original
  if (form.kind === "weekly") {
    const body = {}
    for (const key of ["days", "startTime", "endTime", "timeZone"]) {
      if (!before || form[key] !== before[key]) body[key] = form[key]
    }
    return body
  }
  const startsMs = localMs(form.from)
  const endsMs = localMs(form.until)
  const body = {}
  // Only what changed, so an ended schedule can be renamed without its
  // dates being checked again.
  if (!before || startsMs !== Date.parse(before.startsAt)) body.startsAt = new Date(startsMs).toISOString()
  if (!before || endsMs !== Date.parse(before.endsAt)) body.endsAt = new Date(endsMs).toISOString()
  if (body.startsAt || body.endsAt) body.timeZone = viewerTimeZone()
  return body
}

/**
 * The form as a schedule for the week preview, so it shows the effect of a
 * change before it's saved. The label isn't needed: the preview gets names
 * separately.
 */
function formAsSchedule(form, nextPosition) {
  const before = form.original
  const common = {
    id: form.id ?? DRAFT_ID,
    kind: form.kind,
    destinationUrl: `https://${stripScheme(form.url)}`,
    enabled: before ? before.enabled : true,
    position: before ? before.position : nextPosition
  }
  return form.kind === "weekly"
    ? { ...common, days: form.days, startTime: form.startTime, endTime: form.endTime, timeZone: form.timeZone }
    : { ...common, startsAt: localMs(form.from), endsAt: localMs(form.until) }
}

/**
 * A code's schedules: date ranges that send its scans somewhere else while
 * they're live. Loads its own data; every change returns the updated panel
 * and the code, which `onCodeUpdate` passes back so the card stays current.
 */
export default function SchedulesModal({ qrcode, onClose, onCodeUpdate }) {
  const [panel, setPanel] = useState(null)
  const [loadError, setLoadError] = useState("")
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState("")
  const [busy, setBusy] = useState(false)
  // Counts the changes sent from this panel, so a refresh that was already
  // on its way when one was made doesn't put older data back on screen.
  const changesSent = useRef(0)

  // Load on open, then refresh while open. Each refresh also passes the
  // code up, so its card changes when a schedule starts or ends.
  useEffect(() => {
    let cancelled = false
    async function load(first) {
      const seen = changesSent.current
      try {
        const res = await fetch(`/api/qrcodes/${qrcode.id}/schedules`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Could not load the schedules.")
        if (cancelled || changesSent.current !== seen) return
        setPanel(data)
        if (!first) onCodeUpdate?.(data.qrcode)
      } catch (error) {
        // A failed refresh keeps what's on screen; only the first load says so.
        if (!cancelled && first) setLoadError(error.message || "Could not load the schedules.")
      }
    }
    load(true)
    const timer = setInterval(() => load(false), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [qrcode.id, onCodeUpdate])

  // Escape closes this panel only: it can open on top of the edit screen,
  // which would otherwise close as well.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [onClose])

  /** Send a change; on success the response is the whole panel again. */
  async function send(method, path, body) {
    setBusy(true)
    changesSent.current += 1
    try {
      const res = await fetch(`/api/qrcodes/${qrcode.id}/schedules${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { error: data.error || "Something went wrong. Please try again." }
      setPanel(data)
      onCodeUpdate?.(data.qrcode)
      return { ok: true }
    } catch {
      return { error: "Could not reach the server. Check your connection and try again." }
    } finally {
      setBusy(false)
    }
  }

  async function act(method, path, body) {
    const result = await send(method, path, body)
    if (result.error) alert(result.error)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const label = form.label.trim()
    const url = `https://${stripScheme(form.url)}`

    let problem = ""
    if (!label) problem = "Give the schedule a name."
    else if (!stripScheme(form.url) || !isValidDestinationUrl(url)) problem = "Enter a valid URL."
    else problem = timingProblem(form)
    if (problem) {
      setFormError(problem)
      return
    }

    let body
    if (form.id) {
      const before = form.original
      body = timingBody(form)
      if (label !== before.label) body.label = label
      if (url !== before.destinationUrl) body.destinationUrl = url
      if (Object.keys(body).length === 0) {
        setForm(null)
        return
      }
    } else {
      body = { kind: form.kind, label, destinationUrl: url, ...timingBody(form) }
    }

    const result = await send(form.id ? "PATCH" : "POST", form.id ? `/${form.id}` : "", body)
    if (result.error) {
      setFormError(result.error)
    } else {
      setForm(null)
      setFormError("")
    }
  }

  function openForm(next) {
    setForm(next)
    setFormError("")
  }

  /** Swap a schedule with its neighbour among the ones that haven't ended. */
  function move(schedule, step) {
    const order = panel.schedules.map((s) => s.id)
    const current = panel.schedules.filter((s) => s.status !== "ended")
    const neighbour = current[current.findIndex((s) => s.id === schedule.id) + step]
    if (!neighbour) return
    const a = order.indexOf(schedule.id)
    const b = order.indexOf(neighbour.id)
    ;[order[a], order[b]] = [order[b], order[a]]
    act("PUT", "", { order })
  }

  function remove(schedule) {
    if (!confirm(`Delete the schedule “${schedule.label}”? This can’t be undone.`)) return
    if (form?.id === schedule.id) setForm(null)
    act("DELETE", `/${schedule.id}`)
  }

  const schedules = useMemo(() => panel?.schedules ?? [], [panel])
  const current = schedules.filter((s) => s.status !== "ended")
  const ended = schedules.filter((s) => s.status === "ended")
  const canEdit = Boolean(panel?.canEdit)
  const atLimit = panel ? current.length >= panel.limit : false
  const mainUrl = panel?.qrcode?.destinationUrl ?? qrcode.destinationUrl
  const mainChanges = panel?.qrcode?.scheduledChanges ?? qrcode.scheduledChanges
  const viewerZone = viewerTimeZone()

  const labelOf = new Map(schedules.map((s) => [s.id, s.label]))
  if (form) labelOf.set(form.id ?? DRAFT_ID, form.label.trim() || "New schedule")

  // Each schedule keeps its colour while it exists: colours go by when it was
  // made (its id), not by its place in the list. An unsaved one comes last.
  const colorOf = useMemo(() => {
    const ids = schedules.filter((s) => s.status !== "ended").map((s) => s.id)
    ids.sort((a, b) => a - b)
    ids.push(DRAFT_ID)
    return new Map([
      ...schedules.map((s) => [s.id, OTHER_COLOR]),
      ...ids.map((id, i) => [id, SCHEDULE_COLORS[i] ?? OTHER_COLOR])
    ])
  }, [schedules])

  // What the preview works from: the saved schedules, with the form's
  // version in place of the one being edited, or added if it's new.
  const previewSchedules = useMemo(() => {
    if (!form) return schedules
    const nextPosition = schedules.reduce((max, s) => Math.max(max, s.position + 1), 0)
    const draft = formAsSchedule(form, nextPosition)
    return form.id ? schedules.map((s) => (s.id === form.id ? draft : s)) : [...schedules, draft]
    // Only the fields that change where scans go; typing a name doesn't redraw it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, form?.id, form?.kind, form?.url, form?.from, form?.until, form?.days, form?.startTime, form?.endTime, form?.timeZone])

  let previewNote = null
  if (form) {
    previewNote =
      form.original && !form.original.enabled
        ? "Includes your unsaved changes. This schedule is off, so it isn’t shown."
        : "Includes your unsaved changes."
  }

  const rowProps = {
    liveScheduleId: panel?.liveScheduleId,
    labelOf,
    colorOf,
    viewerZone,
    canEdit,
    busy,
    onToggle: (s) => act("PATCH", `/${s.id}`, { enabled: !s.enabled }),
    onEdit: (s) => openForm(editForm(s)),
    onDelete: remove
  }

  return (
    <div className="modal-overlay">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedules-title"
        style={{ maxWidth: "680px", maxHeight: "92vh", overflowY: "auto" }}
      >
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <h2 id="schedules-title" className="modal-title">
              Schedules
            </h2>
            <p className="truncate" style={{ fontSize: "0.85rem", color: "var(--text-tertiary)" }}>
              {qrcode.title}
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close schedules">
            ✕
          </button>
        </div>

        <p className={styles.intro}>
          While a schedule is live, scans go to its URL instead of the main
          destination ({displayUrl(mainUrl)}). When two are live at once, a
          date range wins over a weekly schedule; otherwise the one higher in
          the list wins. Dates are in your time zone ({viewerZone}); weekly
          schedules use the time zone you choose.
        </p>

        {loadError && <p className={styles.error}>{loadError}</p>}
        {!panel && !loadError && <p className={styles.hint}>Loading…</p>}

        {panel && !canEdit && (
          <p className={styles.notice}>
            Schedules are available on the Business package and up. Contact us
            to upgrade your package.
            {schedules.length > 0 &&
              " You can still switch off or delete the schedules this code already has."}
          </p>
        )}

        {panel && (
          <>
            {current.length === 0 ? (
              <p className={styles.empty}>
                No schedules yet. Scans go to the main destination.
              </p>
            ) : (
              <ul className={styles.list}>
                {current.map((s, i) => (
                  <ScheduleRow
                    key={s.id}
                    schedule={s}
                    {...rowProps}
                    canMoveUp={i > 0}
                    canMoveDown={i < current.length - 1}
                    onMove={move}
                  />
                ))}
              </ul>
            )}

            {form ? (
              <ScheduleForm
                form={form}
                setForm={setForm}
                error={formError}
                busy={busy}
                viewerZone={viewerZone}
                onSubmit={handleSubmit}
                onCancel={() => setForm(null)}
              />
            ) : (
              canEdit && (
                <div className={styles.addRow}>
                  {atLimit ? (
                    <p className={styles.hint}>
                      This code has the most schedules it can have ({panel.limit}).
                      Delete one to add another.
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => openForm(newForm())}
                      disabled={busy}
                    >
                      + Add schedule
                    </button>
                  )}
                </div>
              )
            )}

            {(current.length > 0 || form) && (
              <WeekPreview
                schedules={previewSchedules}
                mainUrl={mainUrl}
                mainChanges={mainChanges}
                viewerZone={viewerZone}
                colorOf={colorOf}
                labelOf={labelOf}
                note={previewNote}
              />
            )}

            {ended.length > 0 && (
              <details className={styles.ended}>
                <summary>Ended ({ended.length})</summary>
                <ul className={styles.list}>
                  {ended.map((s) => (
                    <ScheduleRow key={s.id} schedule={s} {...rowProps} />
                  ))}
                </ul>
              </details>
            )}
          </>
        )}

        <div className={styles.footer}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ schedule, sending }) {
  if (schedule.status === "live") {
    return sending ? (
      <span className="badge badge-success">Live · sending scans now</span>
    ) : (
      <span className="badge badge-purple">Live · another schedule wins</span>
    )
  }
  if (schedule.status === "upcoming") {
    return <span className="badge badge-cyan">{schedule.kind === "weekly" ? "Not live now" : "Upcoming"}</span>
  }
  return <span className="badge">{schedule.status === "off" ? "Off" : "Ended"}</span>
}

/** When a schedule's times are, for its row. */
function ScheduleTimes({ schedule, viewerZone }) {
  if (schedule.kind !== "weekly") {
    return (
      <div className={styles.when}>
        {formatChangeTime(schedule.startsAt)} – {formatChangeTime(schedule.endsAt)}
      </div>
    )
  }
  const next = schedule.enabled && schedule.nextChangeAt
  return (
    <>
      <div className={styles.when}>
        {describeWeekly(schedule)}
        {schedule.timeZone !== viewerZone && ` · ${schedule.timeZone} time`}
      </div>
      {next && (
        <div className={styles.when}>
          {schedule.status === "live" ? "Live until " : "Next live "}
          {formatChangeTime(schedule.nextChangeAt)}
        </div>
      )}
    </>
  )
}

function ScheduleRow({
  schedule,
  liveScheduleId,
  labelOf,
  colorOf,
  viewerZone,
  canEdit,
  busy,
  canMoveUp = false,
  canMoveDown = false,
  onMove,
  onToggle,
  onEdit,
  onDelete
}) {
  const sending = schedule.id === liveScheduleId
  const isEnded = schedule.status === "ended"
  const overlaps = schedule.overlapsWith.map((id) => `“${labelOf.get(id)}”`)

  return (
    <li className={`${styles.row}${sending ? ` ${styles.winning}` : ""}`}>
      <div className={styles.rowMain}>
        <div className={styles.rowHead}>
          {!isEnded && (
            <span className={styles.swatch} style={{ background: colorOf.get(schedule.id) }} aria-hidden="true" />
          )}
          <span className={styles.label}>{schedule.label}</span>
          <StatusBadge schedule={schedule} sending={sending} />
        </div>
        <div className={`truncate ${styles.url}`} title={schedule.destinationUrl}>
          {displayUrl(schedule.destinationUrl)}
        </div>
        <ScheduleTimes schedule={schedule} viewerZone={viewerZone} />
        {overlaps.length > 0 && (
          <div className={styles.overlap}>
            Overlaps with {overlaps.join(", ")}. While both are live, the one
            higher in the list wins.
          </div>
        )}
      </div>

      <div className={styles.controls}>
        {!isEnded && (
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={schedule.enabled}
              // Switching off works on every package; switching on needs one with schedules.
              disabled={busy || (!canEdit && !schedule.enabled)}
              onChange={() => onToggle(schedule)}
            />
            On
          </label>
        )}
        {canEdit && !isEnded && (
          <>
            <button
              type="button"
              className={`btn btn-ghost btn-sm ${styles.moveButton}`}
              onClick={() => onMove(schedule, -1)}
              disabled={busy || !canMoveUp}
              aria-label={`Move “${schedule.label}” up`}
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className={`btn btn-ghost btn-sm ${styles.moveButton}`}
              onClick={() => onMove(schedule, 1)}
              disabled={busy || !canMoveDown}
              aria-label={`Move “${schedule.label}” down`}
              title="Move down"
            >
              ↓
            </button>
          </>
        )}
        {canEdit && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onEdit(schedule)}
            disabled={busy}
          >
            Edit
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onDelete(schedule)}
          disabled={busy}
          aria-label={`Delete “${schedule.label}”`}
        >
          Delete
        </button>
      </div>
    </li>
  )
}

function ScheduleForm({ form, setForm, error, busy, viewerZone, onSubmit, onCancel }) {
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const weekly = form.kind === "weekly"

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.formTitle}>{form.id ? "Edit schedule" : "New schedule"}</div>

      {!form.id && (
        <div className={styles.kindSwitch} role="group" aria-label="Kind of schedule">
          {[
            ["range", "On dates"],
            ["weekly", "Every week"]
          ].map(([kind, text]) => (
            <button
              key={kind}
              type="button"
              className={`${styles.kindButton}${form.kind === kind ? ` ${styles.kindOn}` : ""}`}
              aria-pressed={form.kind === kind}
              onClick={() => setForm((f) => ({ ...f, kind }))}
            >
              {text}
            </button>
          ))}
        </div>
      )}

      <div className="input-group">
        <label htmlFor="schedule-label" className="input-label">
          Name
        </label>
        <input
          id="schedule-label"
          type="text"
          className="input-field"
          placeholder={weekly ? "Breakfast menu" : "Black Friday"}
          maxLength={100}
          value={form.label}
          onChange={set("label")}
          required
        />
      </div>

      <div className="input-group">
        <label htmlFor="schedule-url" className="input-label">
          Send scans to
        </label>
        <div className="input-wrapper">
          <span className="prefix">https://</span>
          <input
            id="schedule-url"
            type="text"
            className="input-field"
            placeholder={weekly ? "example.com/breakfast" : "example.com/black-friday"}
            value={form.url}
            onChange={set("url")}
            onBlur={() => setForm((f) => ({ ...f, url: stripScheme(f.url) }))}
            required
          />
        </div>
      </div>

      {weekly ? (
        <WeeklyFields form={form} setForm={setForm} set={set} viewerZone={viewerZone} />
      ) : (
        <RangeFields form={form} setForm={setForm} set={set} />
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.formActions}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {form.id ? "Save schedule" : "Add schedule"}
        </button>
      </div>
    </form>
  )
}

function RangeFields({ form, setForm, set }) {
  // Moving the start moves the end with it, keeping the schedule's length,
  // as calendars do, so the end can't be left behind on another day.
  function setFrom(e) {
    const value = e.target.value
    setForm((f) => {
      const oldStart = localMs(f.from)
      const oldEnd = localMs(f.until)
      const newStart = localMs(value)
      const keepLength = [oldStart, oldEnd, newStart].every((n) => !Number.isNaN(n)) && oldEnd > oldStart
      return {
        ...f,
        from: value,
        until: keepLength ? toLocalInputValue(newStart + (oldEnd - oldStart)) : f.until
      }
    })
  }

  // The length and both dates in words, so an end on the wrong day stands out.
  const startMs = localMs(form.from)
  const endMs = localMs(form.until)
  let summary = null
  if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
    summary =
      endMs > startMs ? (
        <p className={styles.hint} id="schedule-length">
          Runs for <strong>{describeLength(endMs - startMs)}</strong>: from{" "}
          {formatChangeTime(startMs)} to {formatChangeTime(endMs)}.
        </p>
      ) : (
        <p className={styles.error} id="schedule-length">
          The end is before the start.
        </p>
      )
  }

  return (
    <>
      <div className={styles.formRow}>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="schedule-from" className="input-label">
            Starts
          </label>
          <input
            id="schedule-from"
            type="datetime-local"
            className="input-field"
            value={form.from}
            onChange={setFrom}
            required
          />
        </div>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="schedule-until" className="input-label">
            Ends
          </label>
          <input
            id="schedule-until"
            type="datetime-local"
            className="input-field"
            value={form.until}
            onChange={set("until")}
            aria-describedby="schedule-length"
            required
          />
        </div>
      </div>
      {summary}
    </>
  )
}

function WeeklyFields({ form, setForm, set, viewerZone }) {
  const toggleDay = (day) => setForm((f) => ({ ...f, days: f.days ^ (1 << day) }))
  const setDays = (days) => setForm((f) => ({ ...f, days }))
  const validTimes = TIME.test(form.startTime) && TIME.test(form.endTime)

  let summary
  if (!form.days) {
    summary = <p className={styles.error} id="schedule-length">Choose at least one day.</p>
  } else if (validTimes) {
    const always = form.days === EVERY_DAY && form.startTime === form.endTime
    summary = (
      <p className={styles.hint} id="schedule-length">
        {always ? (
          <>
            Live <strong>all the time</strong>, so every scan goes to this URL.
          </>
        ) : (
          <>
            Live{" "}
            <strong>
              {describeDays(form.days)}, {describeDailyTimes(form.startTime, form.endTime)}
            </strong>
            , {form.timeZone} time.
          </>
        )}
        {form.startTime === form.endTime && !always && " The same start and end means 24 hours."}
      </p>
    )
  }

  return (
    <>
      <fieldset className={styles.daysField}>
        <legend className="input-label">Days</legend>
        <div className={styles.dayButtons}>
          {DAY_BUTTONS.map((text, day) => {
            const on = Boolean(form.days & (1 << day))
            return (
              <button
                key={day}
                type="button"
                className={`${styles.dayButton}${on ? ` ${styles.dayOn}` : ""}`}
                aria-pressed={on}
                aria-label={DAY_NAMES[day]}
                onClick={() => toggleDay(day)}
              >
                {text}
              </button>
            )
          })}
        </div>
        <div className={styles.dayPresets}>
          {[
            [WEEKDAYS, "Weekdays"],
            [WEEKEND, "Weekends"],
            [EVERY_DAY, "Every day"]
          ].map(([days, text]) => (
            <button key={days} type="button" className={styles.presetButton} onClick={() => setDays(days)}>
              {text}
            </button>
          ))}
        </div>
      </fieldset>

      <div className={styles.formRow}>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="schedule-start-time" className="input-label">
            From
          </label>
          <input
            id="schedule-start-time"
            type="time"
            className="input-field"
            value={form.startTime}
            onChange={set("startTime")}
            required
          />
        </div>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="schedule-end-time" className="input-label">
            To
          </label>
          <input
            id="schedule-end-time"
            type="time"
            className="input-field"
            value={form.endTime}
            onChange={set("endTime")}
            aria-describedby="schedule-length"
            required
          />
        </div>
      </div>
      <p className={styles.hint}>An end before the start runs past midnight into the next day.</p>

      <div className="input-group" style={{ marginTop: 12, marginBottom: 0 }}>
        <label htmlFor="schedule-time-zone" className="input-label">
          Time zone
        </label>
        <TimeZoneSelect value={form.timeZone} viewerZone={viewerZone} onChange={set("timeZone")} />
      </div>

      {summary}
    </>
  )
}

/** Every time zone this browser knows, with the viewer's at the top. */
function TimeZoneSelect({ value, viewerZone, onChange }) {
  const zones = useMemo(() => {
    let all = []
    try {
      all = Intl.supportedValuesOf("timeZone")
    } catch {
      // An older browser: offer the viewer's zone and UTC.
    }
    const others = [...new Set([...all, "UTC"])].filter((z) => z !== viewerZone)
    // A stored zone the list doesn't have (an older name) stays choosable.
    if (value && value !== viewerZone && !others.includes(value)) others.unshift(value)
    return others
  }, [value, viewerZone])

  return (
    <select id="schedule-time-zone" className="input-field" value={value} onChange={onChange}>
      <optgroup label="Your time zone">
        <option value={viewerZone}>{zoneLabel(viewerZone)}</option>
      </optgroup>
      <optgroup label="All time zones">
        {zones.map((z) => (
          <option key={z} value={z}>
            {zoneLabel(z)}
          </option>
        ))}
      </optgroup>
    </select>
  )
}

const offsetFormats = new Map()

/** "America/New_York" → "America/New York (GMT-5)". */
function zoneLabel(zone) {
  let offset = ""
  try {
    let format = offsetFormats.get(zone)
    if (!format) {
      format = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      offsetFormats.set(zone, format)
    }
    offset = format.formatToParts(Date.now()).find((p) => p.type === "timeZoneName")?.value ?? ""
  } catch {
    // Unknown zone or no offset names: just the name.
  }
  const name = zone.replaceAll("_", " ")
  return offset ? `${name} (${offset})` : name
}
