"use client"

import { useEffect, useRef, useState } from "react"
import { isValidDestinationUrl } from "@/lib/qrStyle"
import {
  formatChangeTime,
  displayUrl,
  describeLength,
  toLocalInputValue,
  viewerTimeZone
} from "./scheduledChanges"
import styles from "./SchedulesModal.module.css"

const HOUR_MS = 60 * 60 * 1000

// How often the open panel re-reads its schedules, so they move from
// upcoming to live to ended on their own.
const REFRESH_MS = 30_000

/** The URL field shows a fixed "https://" prefix, so it holds the rest. */
function stripScheme(value) {
  return String(value ?? "").trim().replace(/^https?:\/\//i, "")
}

/**
 * A form for a new schedule: from the next full hour, for an hour. (A day
 * used to be the default, and changing only the end's time then left its
 * date on the next day without anyone noticing.)
 */
function newForm() {
  const start = Math.ceil(Date.now() / HOUR_MS) * HOUR_MS
  return {
    id: null,
    label: "",
    url: "",
    from: toLocalInputValue(start),
    until: toLocalInputValue(start + HOUR_MS)
  }
}

/** A datetime-local value (the viewer's local time) → ms, or NaN. */
function localMs(value) {
  return value ? new Date(value).getTime() : NaN
}

function editForm(schedule) {
  return {
    id: schedule.id,
    label: schedule.label,
    url: stripScheme(schedule.destinationUrl),
    from: toLocalInputValue(Date.parse(schedule.startsAt)),
    until: toLocalInputValue(Date.parse(schedule.endsAt)),
    original: schedule
  }
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
    // datetime-local values have no time zone: the browser reads them as local time.
    const startsMs = new Date(form.from).getTime()
    const endsMs = new Date(form.until).getTime()

    let problem = ""
    if (!label) problem = "Give the schedule a name."
    else if (!stripScheme(form.url) || !isValidDestinationUrl(url)) problem = "Enter a valid URL."
    else if (Number.isNaN(startsMs) || Number.isNaN(endsMs)) problem = "Choose when the schedule starts and ends."
    else if (endsMs <= startsMs) problem = "The end must be after the start."
    else if (endsMs <= Date.now()) problem = "The end must be in the future."
    if (problem) {
      setFormError(problem)
      return
    }

    const startsAt = new Date(startsMs).toISOString()
    const endsAt = new Date(endsMs).toISOString()
    const timeZone = viewerTimeZone()
    let body = { label, destinationUrl: url, timeZone, startsAt, endsAt }
    if (form.id) {
      // Send only what changed, so an ended schedule can be renamed without
      // its dates being checked again.
      const before = form.original
      body = {}
      if (label !== before.label) body.label = label
      if (url !== before.destinationUrl) body.destinationUrl = url
      if (startsMs !== Date.parse(before.startsAt)) body.startsAt = startsAt
      if (endsMs !== Date.parse(before.endsAt)) body.endsAt = endsAt
      if (body.startsAt || body.endsAt) body.timeZone = timeZone
      if (Object.keys(body).length === 0) {
        setForm(null)
        return
      }
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

  const schedules = panel?.schedules ?? []
  const current = schedules.filter((s) => s.status !== "ended")
  const ended = schedules.filter((s) => s.status === "ended")
  const labelOf = new Map(schedules.map((s) => [s.id, s.label]))
  const canEdit = Boolean(panel?.canEdit)
  const atLimit = panel ? current.length >= panel.limit : false
  const mainUrl = panel?.qrcode?.destinationUrl ?? qrcode.destinationUrl

  const rowProps = {
    liveScheduleId: panel?.liveScheduleId,
    labelOf,
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
          destination ({displayUrl(mainUrl)}). When two are live at once, the
          one higher in the list wins. Times are in your time zone
          ({viewerTimeZone()}).
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
  if (schedule.status === "upcoming") return <span className="badge badge-cyan">Upcoming</span>
  return <span className="badge">{schedule.status === "off" ? "Off" : "Ended"}</span>
}

function ScheduleRow({
  schedule,
  liveScheduleId,
  labelOf,
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
          <span className={styles.label}>{schedule.label}</span>
          <StatusBadge schedule={schedule} sending={sending} />
        </div>
        <div className={`truncate ${styles.url}`} title={schedule.destinationUrl}>
          {displayUrl(schedule.destinationUrl)}
        </div>
        <div className={styles.when}>
          {formatChangeTime(schedule.startsAt)} – {formatChangeTime(schedule.endsAt)}
        </div>
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

function ScheduleForm({ form, setForm, error, busy, onSubmit, onCancel }) {
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

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
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.formTitle}>{form.id ? "Edit schedule" : "New schedule"}</div>

      <div className="input-group">
        <label htmlFor="schedule-label" className="input-label">
          Name
        </label>
        <input
          id="schedule-label"
          type="text"
          className="input-field"
          placeholder="Black Friday"
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
            placeholder="example.com/black-friday"
            value={form.url}
            onChange={set("url")}
            onBlur={() => setForm((f) => ({ ...f, url: stripScheme(f.url) }))}
            required
          />
        </div>
      </div>

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
