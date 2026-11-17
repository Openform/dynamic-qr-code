/**
 * Opening hours on a campaign page (an `hours` block, checked by
 * lib/campaignPages.js): the rows to show, with days that keep the same
 * hours run together ("Mon – Fri"), and whether the place is open when the
 * page is opened ("Open now · closes 17:00").
 *
 * A block has `timeZone` and `days`, Monday first, each with up to two
 * `periods` of "HH:MM" `open` and `close` on that zone's clock. A close at or
 * before the open runs past midnight (Fri 18:00 – 02:00), and the same open
 * and close means open all day. A day with no periods is closed.
 *
 * The public page works this out on the server for each visit, so the status
 * is right when the code is scanned.
 */

import { localClock } from './schedules';

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const SHORT_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DAY = 24 * 60;
const WEEK = 7 * DAY;

function minutesOf(time) {
  const [hours, minutes] = String(time).split(':').map(Number);
  return hours * 60 + minutes;
}

function clockText(minutes) {
  const m = ((minutes % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function periodsOf(block, day) {
  const periods = block?.days?.[day]?.periods;
  return Array.isArray(periods) ? periods : [];
}

/** One period as text: "08:00 – 17:00", or "Open 24 hours". */
function periodText(period) {
  return period.open === period.close ? 'Open 24 hours' : `${period.open} – ${period.close}`;
}

/** A day's hours as text: "08:00 – 17:00", "12:00 – 15:00, 18:00 – 22:00" or "Closed". */
export function dayHoursText(block, day) {
  const periods = periodsOf(block, day);
  return periods.length === 0 ? 'Closed' : periods.map(periodText).join(', ');
}

/**
 * The rows to show: `[{ days, hours, today }]`, where `days` is "Mon",
 * "Mon – Fri" or "Every day", and runs of days with the same hours share a
 * row. `today` marks the row with the current day in the block's time zone
 * (none when `nowMs` is null or the zone can't be read).
 */
export function hoursRows(block, nowMs = Date.now()) {
  const today = currentDay(block, nowMs);
  const texts = DAY_NAMES.map((_, day) => dayHoursText(block, day));
  if (texts.every((text) => text === texts[0])) {
    return [{ days: 'Every day', hours: texts[0], today: today !== null }];
  }
  const rows = [];
  for (let day = 0; day < 7; day += 1) {
    const last = rows.at(-1);
    if (last && last.hours === texts[day]) {
      last.to = day;
    } else {
      rows.push({ from: day, to: day, hours: texts[day] });
    }
  }
  return rows.map(({ from, to, hours }) => ({
    days: from === to ? SHORT_DAY_NAMES[from] : `${SHORT_DAY_NAMES[from]} – ${SHORT_DAY_NAMES[to]}`,
    hours,
    today: today !== null && today >= from && today <= to,
  }));
}

function currentDay(block, nowMs) {
  if (nowMs === null) return null;
  try {
    return localClock(nowMs, block.timeZone).day;
  } catch {
    return null;
  }
}

/**
 * Every period as minutes from Monday 00:00 of this week, repeated for the
 * week before and the two after, so periods that run past Sunday midnight
 * and searches a week ahead need no special cases.
 */
function timeline(block) {
  const intervals = [];
  for (let day = 0; day < 7; day += 1) {
    for (const period of periodsOf(block, day)) {
      const open = minutesOf(period.open);
      const close = minutesOf(period.close);
      const length = close > open ? close - open : DAY - open + close;
      for (let week = -1; week <= 2; week += 1) {
        const start = week * WEEK + day * DAY + open;
        intervals.push({ start, end: start + length });
      }
    }
  }
  return intervals;
}

/**
 * Whether the place is open at `nowMs`, as `{ open, text }`:
 *
 *   { open: true,  text: 'Open now · closes 17:00' }
 *   { open: true,  text: 'Open 24 hours' }
 *   { open: false, text: 'Closed · opens 09:00' }            later today
 *   { open: false, text: 'Closed · opens tomorrow 09:00' }
 *   { open: false, text: 'Closed · opens Mon 09:00' }
 *
 * Null when the block has no hours at all or its time zone can't be read.
 */
export function hoursStatus(block, nowMs = Date.now()) {
  const intervals = timeline(block);
  if (intervals.length === 0) return null;
  let clock;
  try {
    clock = localClock(nowMs, block.timeZone);
  } catch {
    return null;
  }
  const now = clock.day * DAY + clock.minutes;
  const covering = (t) => intervals.filter((i) => i.start <= t && t < i.end);

  if (covering(now).length > 0) {
    // Where it closes, following on through periods that start before the last one ends.
    let end = now;
    for (let next = covering(end); next.length > 0; next = covering(end)) {
      end = Math.max(...next.map((i) => i.end));
      if (end - now >= WEEK) return { open: true, text: 'Open 24 hours' };
    }
    return { open: true, text: `Open now · closes ${whenText(end, now, clock.day, true)}` };
  }

  const next = Math.min(...intervals.filter((i) => i.start > now).map((i) => i.start));
  return { open: false, text: `Closed · opens ${whenText(next, now, clock.day, false)}` };
}

/**
 * A time `at` minutes into the week (possibly past the end of it) as text,
 * from a reader whose day is `today`: "17:00" today, "tomorrow 09:00", or
 * "Mon 09:00". A close in the small hours of tomorrow (before 06:00) reads
 * as just the time, as people say a bar closes at 02:00.
 */
function whenText(at, now, today, closing) {
  const days = Math.floor(at / DAY) - Math.floor(now / DAY);
  const time = clockText(at);
  if (days <= 0) return time;
  if (days === 1) return closing && at % DAY < 6 * 60 ? time : `tomorrow ${time}`;
  return `${SHORT_DAY_NAMES[(today + days) % 7]} ${time}`;
}
