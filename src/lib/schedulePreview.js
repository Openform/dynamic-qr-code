/**
 * The week preview in the schedules panel: for each of the next few days on
 * the local clock in a time zone, where scans go at each minute.
 *
 * It asks resolveDestination, the function the redirect uses, about every
 * minute, so the preview and real scans can't disagree. Schedules start and
 * stop on whole minutes, so one question per minute catches every change.
 * Pending changes to the main destination (Release 1) are followed too.
 *
 * Safe to use in the browser: no server-only imports.
 */

import { resolveDestination, toMs } from './schedules';

const MINUTE = 60_000;
const QUARTER = 15 * MINUTE;
const HOUR = 60 * MINUTE;
const DAY_MINUTES = 24 * 60;

// One formatter per time zone.
const dayFormats = new Map();

/** The local date ("YYYY-MM-DD") and minutes after midnight in `timeZone` at `ms`. */
function localDay(ms, timeZone) {
  let format = dayFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    dayFormats.set(timeZone, format);
  }
  const p = Object.fromEntries(format.formatToParts(ms).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/**
 * The next `days` days (today first) on the local clock in `timeZone`.
 *
 * - `mainUrl`: the main destination now.
 * - `mainChanges`: pending changes to it, `[{ destinationUrl, startsAt }]`.
 * - `schedules`: the code's schedules, as lib/schedules.js takes them.
 *
 * Returns `{ days, nowMinute }`. Each day is `{ date, minutes, segments }`:
 * `minutes` is how long the day really is (1380 or 1500 when the clocks
 * change), and `segments` cover it in order as `{ start, end, scheduleId,
 * url }`, with start and end in minutes after local midnight (end not
 * included) and scheduleId null for the main destination. Local times the
 * clock skips are left out; when the clock goes back, the repeated hour shows
 * its second run. `nowMinute` is where now falls on the first day.
 */
export function weekPreview({ mainUrl, mainChanges = [], schedules = [], now = Date.now(), timeZone, days = 7 }) {
  const nowMs = toMs(now);
  const today = localDay(nowMs, timeZone);

  const changes = mainChanges
    .map((c) => ({ url: c.destinationUrl, at: toMs(c.startsAt) }))
    .filter((c) => !Number.isNaN(c.at))
    .sort((a, b) => a.at - b.at);
  const mainAt = (t) => {
    let url = mainUrl;
    for (const change of changes) if (change.at <= t) url = change.url;
    return url;
  };

  // Times as ms up front, so each minute's question doesn't parse them again.
  const prepared = schedules
    .filter((s) => s.enabled)
    .map((s) => (s.kind === 'range' ? { ...s, startsAt: toMs(s.startsAt), endsAt: toMs(s.endsAt) } : s));

  // Each day's minutes, filled in time order. A local midnight is at most
  // a day and a bit either side of the same time in UTC.
  const rows = new Map();
  const first = Math.floor(nowMs / QUARTER) * QUARTER - 26 * HOUR;
  const last = first + (days * 24 + 52) * HOUR;
  let block = null;
  for (let t = first; t < last; t += MINUTE) {
    // Zones are a whole number of quarter hours from UTC and change their
    // clocks on a quarter hour, so the local clock is read once per quarter
    // hour (it's the slow part) and counted on from there.
    if (t % QUARTER === 0) block = localDay(t, timeZone);
    const local = { date: block.date, minutes: block.minutes + (t % QUARTER) / MINUTE };
    if (local.date < today.date) continue;
    let row = rows.get(local.date);
    if (!row) {
      if (rows.size === days) break;
      row = { date: local.date, minutes: 0, slots: new Array(DAY_MINUTES) };
      rows.set(local.date, row);
    }
    row.minutes += 1;
    const { url, scheduleId } = resolveDestination({ mainUrl: mainAt(t), schedules: prepared, now: t });
    row.slots[local.minutes] = { url, scheduleId };
  }

  return {
    days: [...rows.values()].map(({ date, minutes, slots }) => ({ date, minutes, segments: toSegments(slots) })),
    nowMinute: today.minutes,
  };
}

/** A day's minutes → runs of the same destination. Empty minutes split runs. */
function toSegments(slots) {
  const segments = [];
  let current = null;
  for (let minute = 0; minute < DAY_MINUTES; minute++) {
    const slot = slots[minute];
    if (current && slot && slot.scheduleId === current.scheduleId && slot.url === current.url) {
      current.end = minute + 1;
      continue;
    }
    current = slot ? { start: minute, end: minute + 1, scheduleId: slot.scheduleId, url: slot.url } : null;
    if (current) segments.push(current);
  }
  return segments;
}
