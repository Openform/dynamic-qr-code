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

/**
 * Check a request body `{ destinationUrl, startsAt }` for a scheduled change.
 * `startsAt` is an ISO time with an offset, e.g. from `Date#toISOString()`.
 *
 * Returns `{ destinationUrl, startsAt }` ready to store (the URL with https://
 * added if it was left out, the time as UTC "YYYY-MM-DD HH:MM:SS"), or
 * `{ error }` with a message to show.
 */
export function parseScheduledChange(body, nowMs = Date.now()) {
  const rawUrl = typeof body?.destinationUrl === 'string' ? body.destinationUrl.trim() : '';
  if (!rawUrl) return { error: 'Enter the new destination URL.' };
  const destinationUrl = normalizeDestinationUrl(rawUrl);
  if (!isValidDestinationUrl(destinationUrl)) {
    return { error: 'Invalid destination URL. Must be a valid https URL.' };
  }
  if (destinationUrl.length > MAX_URL_LENGTH) {
    return { error: `The destination URL can be at most ${MAX_URL_LENGTH} characters.` };
  }

  const rawTime = typeof body?.startsAt === 'string' ? body.startsAt.trim() : '';
  const startsMs = ISO_WITH_OFFSET.test(rawTime) ? Date.parse(rawTime) : NaN;
  if (Number.isNaN(startsMs)) return { error: 'Choose when the change should happen.' };
  if (startsMs <= nowMs) return { error: 'Choose a time in the future.' };
  if (startsMs - nowMs > MAX_SCHEDULE_AHEAD_DAYS * DAY_MS) {
    return { error: 'Choose a time within the next 5 years.' };
  }

  return { destinationUrl, startsAt: toSqlDateTime(startsMs) };
}
