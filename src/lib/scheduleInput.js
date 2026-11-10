/**
 * Checking schedules sent to the API: a new one, or an edit to one. Shared
 * by the routes and their tests. A schedule is a date range (kind 'range')
 * or a weekly window (kind 'weekly'); see lib/schedules.js.
 */

import { toSqlDateTime } from './analyticsFilters';
import { parseIsoWithOffset, parseDestinationUrl, isTooFarAhead } from './destinationChanges';

/** How many schedules that haven't ended a code can have. */
export const MAX_SCHEDULES_PER_CODE = 20;

export const MAX_LABEL_LENGTH = 100; // matches qrcode_schedules.label
const MAX_TIME_ZONE_LENGTH = 64; // matches qrcode_schedules.time_zone

/** Every day of the week, as the `days` bits (1 = Monday … 64 = Sunday). */
export const ALL_DAYS = 127;

// "HH:MM", 00:00 to 23:59. ":00" seconds are allowed, as some time inputs send them.
const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/;

/** "07:00" or "07:00:00" → "07:00", or null. */
function parseTimeOfDay(value) {
  const match = TIME_OF_DAY.exec(typeof value === 'string' ? value.trim() : '');
  return match ? `${match[1]}:${match[2]}` : null;
}

/** True for a time zone name the server knows, e.g. "Africa/Johannesburg". */
export function isValidTimeZone(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_TIME_ZONE_LENGTH) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check a body for a new schedule (no `existing`) or an edit to `existing`
 * (a schedule as db.js returns it). A new schedule needs every field; an edit
 * can send any of them, and the rest keep their values.
 *
 * Fields for both kinds: `kind` ('range', the default, or 'weekly'; new
 * schedules only), `label`, `destinationUrl`, `timeZone`, and `enabled`
 * (edits only). A date range adds `startsAt` and `endsAt` (ISO times with an
 * offset). A weekly schedule adds `days` (bits: 1 = Monday … 64 = Sunday),
 * and `startTime` and `endTime` ("HH:MM" on the local clock in `timeZone`;
 * an end at or before the start runs past midnight).
 *
 * Returns `{ fields }` with only what to store (date-range times as UTC
 * "YYYY-MM-DD HH:MM:SS", weekly times as "HH:MM"), or `{ error }` with a
 * message to show.
 */
export function parseScheduleInput(body, { existing = null, nowMs = Date.now() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Send the schedule as JSON.' };
  }
  const isNew = !existing;
  const given = (key) => body[key] !== undefined;
  const fields = {};

  if (isNew) {
    const kind = body.kind ?? 'range';
    if (kind !== 'range' && kind !== 'weekly') return { error: 'Unknown kind of schedule.' };
    fields.kind = kind;
  } else if (given('kind') && body.kind !== existing.kind) {
    return { error: 'A schedule’s kind can’t be changed.' };
  }
  const weekly = (isNew ? fields.kind : existing.kind) === 'weekly';

  // Each kind has its own timing fields; the other kind's are refused rather
  // than ignored, so a mistake doesn't save something unexpected.
  if (weekly && (given('startsAt') || given('endsAt'))) {
    return { error: 'A weekly schedule has no dates. Choose days and times instead.' };
  }
  if (!weekly && (given('days') || given('startTime') || given('endTime'))) {
    return { error: 'A date-range schedule has no days or times. Choose dates instead.' };
  }

  if (isNew || given('label')) {
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!label) return { error: 'Give the schedule a name.' };
    if (label.length > MAX_LABEL_LENGTH) {
      return { error: `The name can be at most ${MAX_LABEL_LENGTH} characters.` };
    }
    fields.label = label;
  }

  if (isNew || given('destinationUrl')) {
    const checked = parseDestinationUrl(body.destinationUrl);
    if (checked.error) return { error: checked.error };
    fields.destinationUrl = checked.url;
  }

  if (isNew || given('timeZone')) {
    if (!isValidTimeZone(body.timeZone)) return { error: 'Unknown time zone.' };
    fields.timeZone = body.timeZone;
  }

  if (weekly) {
    if (isNew || given('days')) {
      const days = body.days;
      if (!Number.isInteger(days) || days < 0 || days > ALL_DAYS) {
        return { error: 'Send the days as a number from 1 to 127 (1 = Monday … 64 = Sunday).' };
      }
      if (days === 0) return { error: 'Choose at least one day.' };
      fields.days = days;
    }
    if (isNew || given('startTime')) {
      const startTime = parseTimeOfDay(body.startTime);
      if (!startTime) return { error: 'Choose when the schedule starts each day.' };
      fields.startTime = startTime;
    }
    if (isNew || given('endTime')) {
      const endTime = parseTimeOfDay(body.endTime);
      if (!endTime) return { error: 'Choose when the schedule ends each day.' };
      fields.endTime = endTime;
    }
  }

  // The dates are checked together, using the stored one for any left out.
  if (!weekly && (isNew || given('startsAt') || given('endsAt'))) {
    const startsMs = isNew || given('startsAt') ? parseIsoWithOffset(body.startsAt) : Date.parse(existing.startsAt);
    const endsMs = isNew || given('endsAt') ? parseIsoWithOffset(body.endsAt) : Date.parse(existing.endsAt);
    if (Number.isNaN(startsMs)) return { error: 'Choose when the schedule starts.' };
    if (Number.isNaN(endsMs)) return { error: 'Choose when the schedule ends.' };
    if (endsMs <= startsMs) return { error: 'The end must be after the start.' };
    if (endsMs <= nowMs) return { error: 'The end must be in the future.' };
    if (isTooFarAhead(endsMs, nowMs)) return { error: 'Choose an end within the next 5 years.' };
    if (isNew || given('startsAt')) fields.startsAt = toSqlDateTime(startsMs);
    if (isNew || given('endsAt')) fields.endsAt = toSqlDateTime(endsMs);
  }

  if (!isNew && given('enabled')) {
    if (typeof body.enabled !== 'boolean') return { error: 'Switch the schedule on or off with true or false.' };
    fields.enabled = body.enabled;
  }

  if (!isNew && Object.keys(fields).length === 0) return { error: 'Nothing to change.' };
  return { fields };
}

/**
 * True when an edit only switches a schedule off, which every package may do
 * (so an account that can no longer edit schedules can still stop one).
 */
export function onlySwitchesOff(fields) {
  const keys = Object.keys(fields);
  return keys.length === 1 && keys[0] === 'enabled' && fields.enabled === false;
}
