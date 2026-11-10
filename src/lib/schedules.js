/**
 * Where a scan goes: the code's main destination, unless one of its schedules
 * is live. The redirect calls this on every scan, and the dashboard's week
 * preview (lib/schedulePreview.js) asks it about every minute, so the two
 * can't disagree. Nothing runs on a timer: a schedule takes effect on the
 * first scan after it starts.
 *
 * A schedule is a plain object with `id`, `kind`, `destinationUrl`, `enabled`
 * and `position`, plus the fields for its kind:
 *
 *   kind 'range'  — live from `startsAt` (included) until `endsAt` (not
 *     included). Both are UTC: a Date, ms, an ISO string, or
 *     "YYYY-MM-DD HH:MM:SS" as the database returns it.
 *
 *   kind 'weekly' — live on the `days` it lists, from `startTime` (included)
 *     to `endTime` (not included), on the local clock in `timeZone` (an IANA
 *     name such as "Africa/Johannesburg"). `days` has a bit per day: 1 =
 *     Monday, 2 = Tuesday … 64 = Sunday. Times are "HH:MM" (or "HH:MM:SS").
 *     An end at or before the start runs past midnight into the next day, so
 *     Friday 22:00–02:00 covers the early hours of Saturday, and the same
 *     start and end means 24 hours.
 *
 * Weekly windows are checked against the local clock, so clock changes need
 * no special handling: a window that starts at 02:30 on the night clocks jump
 * from 02:00 to 03:00 goes live at 03:00, and an hour that happens twice when
 * clocks go back is covered both times.
 *
 * When several schedules are live, a date range beats a weekly schedule (it's
 * the exception to the routine), then the lowest `position` wins, then the
 * lowest id. A schedule with missing or invalid fields is never live, so a
 * bad row can't break a redirect.
 */

import { sqlToIso } from './analyticsFilters';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;
const WEEK_MINUTES = 7 * DAY_MINUTES;
const KIND_ORDER = { range: 0, weekly: 1 };
const SQL_DATETIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const TIME = /^(\d{2}):(\d{2})(?::\d{2})?$/;

/** A UTC time in any of the accepted forms → ms, or NaN. */
export function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  return Date.parse(SQL_DATETIME.test(value) ? sqlToIso(value) : value);
}

/** "HH:MM" or "HH:MM:SS" → minutes after midnight, or NaN. */
function toMinutes(time) {
  const match = TIME.exec(String(time ?? ''));
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : NaN;
}

// One formatter per time zone, reused across scans.
const clockFormats = new Map();
// The last reading per time zone: the schedules of one code are usually all
// in one zone, so a scan (or a minute of the week preview) reads it once.
const lastClock = new Map();

/**
 * The day (0 = Monday) and minutes after midnight on the local clock in
 * `timeZone` at `ms`. Throws a RangeError for an unknown time zone.
 */
function localClock(ms, timeZone) {
  const last = lastClock.get(timeZone);
  if (last?.ms === ms) return last.clock;
  let format = clockFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    clockFormats.set(timeZone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(ms).map((p) => [p.type, p.value]));
  const clock = {
    day: DAY_NAMES.indexOf(parts.weekday),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
  lastClock.set(timeZone, { ms, clock });
  return clock;
}

// Formatters for zoneOffset, one per time zone.
const offsetFormats = new Map();

/** How many minutes `timeZone` is ahead of UTC at `ms` (e.g. 120 for UTC+2). */
function zoneOffset(ms, timeZone) {
  let format = offsetFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    offsetFormats.set(timeZone, format);
  }
  const at = Math.floor(ms / MINUTE) * MINUTE;
  const p = Object.fromEntries(format.formatToParts(at).map((x) => [x.type, Number(x.value)]));
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - at) / MINUTE;
}

function hasDay(days, day) {
  return (days & (1 << day)) !== 0;
}

/**
 * The minutes of a week (0 = Monday 00:00 on the local clock) a weekly
 * schedule covers, as 1s in a Uint8Array, or null if its fields are bad. The
 * same rule as isWeeklyLive, laid out for a whole week at once.
 */
function weekMinutes(schedule) {
  const start = toMinutes(schedule.startTime);
  const end = toMinutes(schedule.endTime);
  const days = Number(schedule.days);
  if (Number.isNaN(start) || Number.isNaN(end) || !Number.isInteger(days)) return null;
  const length = end > start ? end - start : end + DAY_MINUTES - start;
  const week = new Uint8Array(WEEK_MINUTES);
  for (let day = 0; day < 7; day++) {
    if (!hasDay(days, day)) continue;
    const from = day * DAY_MINUTES + start;
    for (let m = from; m < from + length; m++) week[m % WEEK_MINUTES] = 1;
  }
  return week;
}

function isRangeLive(schedule, nowMs) {
  // NaN (a missing or invalid time) fails both comparisons.
  return toMs(schedule.startsAt) <= nowMs && nowMs < toMs(schedule.endsAt);
}

function isWeeklyLive(schedule, nowMs) {
  const start = toMinutes(schedule.startTime);
  const end = toMinutes(schedule.endTime);
  const days = Number(schedule.days);
  if (Number.isNaN(start) || Number.isNaN(end) || !Number.isInteger(days)) return false;
  // Without a zone, Intl would fall back to the server's own zone.
  if (typeof schedule.timeZone !== 'string' || !schedule.timeZone) return false;

  let clock;
  try {
    clock = localClock(nowMs, schedule.timeZone);
  } catch {
    return false; // unknown time zone
  }

  if (start < end) {
    return hasDay(days, clock.day) && clock.minutes >= start && clock.minutes < end;
  }
  // Runs past midnight: the late part belongs to the day itself, the early
  // hours to the day before.
  const dayBefore = (clock.day + 6) % 7;
  return (
    (hasDay(days, clock.day) && clock.minutes >= start) ||
    (hasDay(days, dayBefore) && clock.minutes < end)
  );
}

/** Whether `schedule` is live at `now` (a Date or ms; default: the current time). */
export function isScheduleLive(schedule, now = Date.now()) {
  if (!schedule?.enabled || !schedule.destinationUrl) return false;
  const nowMs = toMs(now);
  if (schedule.kind === 'range') return isRangeLive(schedule, nowMs);
  if (schedule.kind === 'weekly') return isWeeklyLive(schedule, nowMs);
  return false;
}

const toIso = (ms) => new Date(ms).toISOString();

/**
 * When `schedule` next starts or stops being live after `now`, as an ISO
 * time: while it's live, when it stops; otherwise when it next starts. Null
 * when that never happens: it's switched off, it's a date range that has
 * ended, or it's a weekly schedule that's live all week.
 */
export function nextChange(schedule, now = Date.now()) {
  if (!schedule?.enabled || !schedule.destinationUrl) return null;
  const nowMs = toMs(now);

  if (schedule.kind === 'range') {
    const starts = toMs(schedule.startsAt);
    const ends = toMs(schedule.endsAt);
    if (!(starts < ends)) return null; // missing or invalid times
    if (nowMs < starts) return toIso(starts);
    return nowMs < ends ? toIso(ends) : null;
  }
  if (schedule.kind !== 'weekly') return null;

  const week = weekMinutes(schedule);
  if (!week || typeof schedule.timeZone !== 'string' || !schedule.timeZone) return null;
  try {
    const live = isWeeklyLive(schedule, nowMs);
    const at = weeklyNextChange(schedule, week, live, nowMs);
    return at == null ? null : toIso(at);
  } catch {
    return null; // unknown time zone
  }
}

/**
 * When a weekly schedule's state (`live` at `fromMs`) next changes, in ms.
 * Counts forward on the local clock to the next minute of the week whose
 * state differs. That count is exact unless the clocks change first, so if
 * the zone's offset changes before then, the count starts again from the
 * minute it changes: clocks going back repeat local times, and going forward
 * skips them (a time that doesn't exist that night is passed when the clock
 * jumps).
 */
function weeklyNextChange(schedule, week, live, fromMs, depth = 0) {
  const { timeZone } = schedule;
  const clock = localClock(fromMs, timeZone);
  const from = clock.day * DAY_MINUTES + clock.minutes;
  const state = live ? 1 : 0;
  let ahead = 1;
  while (ahead < WEEK_MINUTES && week[(from + ahead) % WEEK_MINUTES] === state) ahead++;
  if (ahead === WEEK_MINUTES) return null; // the same all week

  const fromMinute = Math.floor(fromMs / MINUTE) * MINUTE;
  const estimate = fromMinute + ahead * MINUTE;
  const offset = zoneOffset(fromMinute, timeZone);
  if (zoneOffset(estimate, timeZone) === offset) return estimate;

  // The clocks change first: find the minute they do.
  let before = fromMinute;
  let after = estimate;
  while (after - before > MINUTE) {
    const middle = before + Math.floor((after - before) / MINUTE / 2) * MINUTE;
    if (zoneOffset(middle, timeZone) === offset) before = middle;
    else after = middle;
  }
  if (isWeeklyLive(schedule, after) !== live) return after;
  // Real zones change at most once in a week; give up rather than loop.
  return depth < 3 ? weeklyNextChange(schedule, week, live, after, depth + 1) : null;
}

/** Negative when `a` wins over `b` (both live). */
function compareSchedules(a, b) {
  return (
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    (Number(a.position) || 0) - (Number(b.position) || 0) ||
    Number(a.id) - Number(b.id)
  );
}

/**
 * Where a scan at `now` goes. Returns `{ url, scheduleId }`: the live
 * schedule's URL and id, or `mainUrl` and null when no schedule is live.
 */
export function resolveDestination({ mainUrl, schedules = [], now = Date.now() }) {
  let winner = null;
  for (const schedule of schedules) {
    if (!isScheduleLive(schedule, now)) continue;
    if (!winner || compareSchedules(schedule, winner) < 0) winner = schedule;
  }
  return winner
    ? { url: winner.destinationUrl, scheduleId: winner.id ?? null }
    : { url: mainUrl, scheduleId: null };
}

/**
 * Where a schedule stands at `now`: 'ended' (a date range whose end has
 * passed, kept until it's deleted), 'off' (switched off), 'live' or
 * 'upcoming'. A live schedule may still lose to another live one.
 */
export function scheduleStatus(schedule, now = Date.now()) {
  const nowMs = toMs(now);
  if (schedule.kind === 'range' && toMs(schedule.endsAt) <= nowMs) return 'ended';
  if (!schedule.enabled) return 'off';
  return isScheduleLive(schedule, nowMs) ? 'live' : 'upcoming';
}

/**
 * A weekly schedule's minutes of the week moved onto UTC, using its time
 * zone's offset at `nowMs`, so schedules in different zones can be compared.
 * Null if its fields are bad.
 */
function utcWeekMinutes(schedule, nowMs) {
  const week = weekMinutes(schedule);
  if (!week) return null;
  let offset;
  try {
    offset = zoneOffset(nowMs, schedule.timeZone);
  } catch {
    return null; // unknown time zone
  }
  const shift = ((-offset % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;
  const utc = new Uint8Array(WEEK_MINUTES);
  for (let m = 0; m < WEEK_MINUTES; m++) {
    if (week[m]) utc[(m + shift) % WEEK_MINUTES] = 1;
  }
  return utc;
}

function sharesAMinute(a, b) {
  for (let m = 0; m < WEEK_MINUTES; m++) if (a[m] && b[m]) return true;
  return false;
}

/**
 * For each switched-on schedule, the ids of the others of the same kind
 * that can be live at the same time (a Map of id → ids, in list order):
 * date ranges that haven't ended and whose times overlap, and weekly
 * schedules that share a minute of the week. While two are live, the one
 * higher in the list wins. A date range and a weekly schedule aren't
 * compared: the date range always wins.
 *
 * Weekly schedules in different time zones are compared at today's offsets,
 * so an overlap that only appears after a clock change isn't reported.
 */
export function findOverlaps(schedules, now = Date.now()) {
  const nowMs = toMs(now);
  const overlaps = new Map();
  const add = (a, b) => {
    if (!overlaps.has(a.id)) overlaps.set(a.id, []);
    overlaps.get(a.id).push(b.id);
  };

  const ranges = schedules.filter(
    (s) => s.kind === 'range' && s.enabled && toMs(s.endsAt) > nowMs && toMs(s.startsAt) < toMs(s.endsAt)
  );
  for (const a of ranges) {
    for (const b of ranges) {
      if (a !== b && toMs(a.startsAt) < toMs(b.endsAt) && toMs(b.startsAt) < toMs(a.endsAt)) add(a, b);
    }
  }

  const weekly = schedules
    .filter((s) => s.kind === 'weekly' && s.enabled)
    .map((s) => ({ schedule: s, minutes: utcWeekMinutes(s, nowMs) }))
    .filter((w) => w.minutes);
  for (const a of weekly) {
    for (const b of weekly) {
      if (a !== b && sharesAMinute(a.minutes, b.minutes)) add(a.schedule, b.schedule);
    }
  }
  return overlaps;
}

/**
 * A code's schedules as the schedules panel shows them: each with its
 * `status`, `overlapsWith` (ids) and `nextChangeAt` (see nextChange), plus
 * `liveScheduleId`, the schedule sending scans now (null when scans go to
 * the main destination).
 */
export function describeSchedules(schedules, now = Date.now()) {
  const overlaps = findOverlaps(schedules, now);
  return {
    schedules: schedules.map((s) => ({
      ...s,
      status: scheduleStatus(s, now),
      overlapsWith: overlaps.get(s.id) ?? [],
      nextChangeAt: nextChange(s, now),
    })),
    liveScheduleId: resolveDestination({ mainUrl: null, schedules, now }).scheduleId,
  };
}

/**
 * What a code's card shows: `liveSchedule`, the schedule sending its scans
 * now ({ id, label, destinationUrl, until }, or null; `until` is when it
 * stops being live, as an ISO time, or null if it's live all week), and
 * `scheduleCount`, how many schedules it has that haven't ended.
 */
export function scheduleSummary(schedules = [], now = Date.now()) {
  const { scheduleId } = resolveDestination({ mainUrl: null, schedules, now });
  const live = scheduleId == null ? null : schedules.find((s) => s.id === scheduleId);
  return {
    liveSchedule: live
      ? { id: live.id, label: live.label, destinationUrl: live.destinationUrl, until: nextChange(live, now) }
      : null,
    scheduleCount: schedules.filter((s) => scheduleStatus(s, now) !== 'ended').length,
  };
}
