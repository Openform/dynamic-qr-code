/**
 * Changing a code's main destination later: the rules for a scheduled
 * change, shared by the API and its tests. A scheduled change is stored as a
 * destination history row that starts in the future (see db.js).
 */

import { normalizeDestinationUrl, isValidDestinationUrl } from './qrStyle';
import { toSqlDateTime } from './analyticsFilters';

/** How many changes can wait on one code at once. */
export const MAX_SCHEDULED_CHANGES = 20;

/** How far ahead a change can be scheduled. */
export const MAX_SCHEDULE_AHEAD_DAYS = 5 * 366;

const MAX_URL_LENGTH = 2048; // matches qrcode_destinations.destination_url
const DAY_MS = 24 * 60 * 60 * 1000;

// An ISO 8601 time with its offset spelled out ("Z" or "+02:00"), so the
// server never has to guess which time zone the browser meant.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i;

/** An ISO time with its offset (e.g. from `Date#toISOString()`) → ms, or NaN. */
export function parseIsoWithOffset(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return ISO_WITH_OFFSET.test(text) ? Date.parse(text) : NaN;
}

/** True when `ms` is more than 5 years after `nowMs`. */
export function isTooFarAhead(ms, nowMs) {
  return ms - nowMs > MAX_SCHEDULE_AHEAD_DAYS * DAY_MS;
}

/**
 * Check a destination URL from a request: https:// is added if it was left
 * out, and only https URLs that fit the column are accepted. Returns
 * `{ url }` or `{ error }`.
 */
export function parseDestinationUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { error: 'Enter the new destination URL.' };
  const url = normalizeDestinationUrl(raw);
  if (!isValidDestinationUrl(url)) {
    return { error: 'Invalid destination URL. Must be a valid https URL.' };
  }
  if (url.length > MAX_URL_LENGTH) {
    return { error: `The destination URL can be at most ${MAX_URL_LENGTH} characters.` };
  }
  return { url };
}

/**
 * Check a request body `{ destinationUrl, startsAt }` for a scheduled change.
 * `startsAt` is an ISO time with an offset, e.g. from `Date#toISOString()`.
 *
 * Returns `{ destinationUrl, startsAt }` ready to store (the URL with https://
 * added if it was left out, the time as UTC "YYYY-MM-DD HH:MM:SS"), or
 * `{ error }` with a message to show.
 */
export function parseScheduledChange(body, nowMs = Date.now()) {
  const checked = parseDestinationUrl(body?.destinationUrl);
  if (checked.error) return { error: checked.error };
  const destinationUrl = checked.url;

  const startsMs = parseIsoWithOffset(body?.startsAt);
  if (Number.isNaN(startsMs)) return { error: 'Choose when the change should happen.' };
  if (startsMs <= nowMs) return { error: 'Choose a time in the future.' };
  if (isTooFarAhead(startsMs, nowMs)) {
    return { error: 'Choose a time within the next 5 years.' };
  }

  return { destinationUrl, startsAt: toSqlDateTime(startsMs) };
}
