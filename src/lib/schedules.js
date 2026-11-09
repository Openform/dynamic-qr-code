/**
 * Where a scan goes: the code's main destination, unless one of its schedules
 * is live. The redirect calls this on every scan (and the dashboard's preview
 * will use it too, so the two can't disagree). Nothing runs on a timer: a
 * schedule takes effect on the first scan after it starts.
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
const KIND_ORDER = { range: 0, weekly: 1 };
const SQL_DATETIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const TIME = /^(\d{2}):(\d{2})(?::\d{2})?$/;

/** A UTC time in any of the accepted forms → ms, or NaN. */
function toMs(value) {
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

/**
 * The day (0 = Monday) and minutes after midnight on the local clock in
 * `timeZone` at `ms`. Throws a RangeError for an unknown time zone.
 */
function localClock(ms, timeZone) {
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
  return {
    day: DAY_NAMES.indexOf(parts.weekday),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function hasDay(days, day) {
  return (days & (1 << day)) !== 0;
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
 * For each switched-on date range that hasn't ended, the ids of the others
 * whose times overlap it (a Map of id → ids). While two overlapping ranges
 * are both live, the one higher in the list wins.
 */
export function findOverlaps(schedules, now = Date.now()) {
  const nowMs = toMs(now);
  const ranges = schedules.filter(
    (s) => s.kind === 'range' && s.enabled && toMs(s.endsAt) > nowMs && toMs(s.startsAt) < toMs(s.endsAt)
  );
  const overlaps = new Map();
  for (const a of ranges) {
    for (const b of ranges) {
      if (a !== b && toMs(a.startsAt) < toMs(b.endsAt) && toMs(b.startsAt) < toMs(a.endsAt)) {
        if (!overlaps.has(a.id)) overlaps.set(a.id, []);
        overlaps.get(a.id).push(b.id);
      }
    }
  }
  return overlaps;
}

/**
 * A code's schedules as the schedules panel shows them: each with its
 * `status` and `overlapsWith` (ids), plus `liveScheduleId`, the schedule
 * sending scans now (null when scans go to the main destination).
 */
export function describeSchedules(schedules, now = Date.now()) {
  const overlaps = findOverlaps(schedules, now);
  return {
    schedules: schedules.map((s) => ({
      ...s,
      status: scheduleStatus(s, now),
      overlapsWith: overlaps.get(s.id) ?? [],
    })),
    liveScheduleId: resolveDestination({ mainUrl: null, schedules, now }).scheduleId,
  };
}

/**
 * What a code's card shows: `liveSchedule`, the schedule sending its scans
 * now ({ id, label, destinationUrl, endsAt }, or null), and `scheduleCount`,
 * how many schedules it has that haven't ended.
 */
export function scheduleSummary(schedules = [], now = Date.now()) {
  const { scheduleId } = resolveDestination({ mainUrl: null, schedules, now });
  const live = scheduleId == null ? null : schedules.find((s) => s.id === scheduleId);
  return {
    liveSchedule: live
      ? { id: live.id, label: live.label, destinationUrl: live.destinationUrl, endsAt: live.endsAt ?? null }
      : null,
    scheduleCount: schedules.filter((s) => scheduleStatus(s, now) !== 'ended').length,
  };
}
