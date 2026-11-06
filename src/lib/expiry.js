/**
 * Optional expiration dates for QR codes.
 *
 * A code with an expiry stops redirecting once that moment has passed: anyone
 * who scans it sees the "expired" page instead (see /r/[shortId]). The owner
 * can change or clear the date at any time, which brings an expired code back.
 *
 * Storage: `qrcodes.expires_at`, a DATETIME in UTC (NULL = never expires).
 * Over the API the moment is an ISO 8601 string with a time zone, e.g.
 * "2026-12-01T21:59:59.000Z", so the server never has to guess a time zone.
 *
 * The dashboard asks for a calendar date, and the code keeps working through
 * the end of that day in the owner's own time zone. The helpers at the bottom
 * convert between that date and the UTC moment that is stored.
 *
 * Everything here is pure (no database, no `window`), so it runs on the server
 * and in the browser.
 */

// Full ISO 8601 date-time with an explicit zone ("Z" or "+02:00"). A value
// without a zone would be read in the server's time zone, so it's refused.
const ISO_WITH_ZONE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

// MySQL DATETIME holds years 1000 to 9999.
const MAX_YEAR = 9999;

export const EXPIRY_ERRORS = {
  invalid: 'Expiration date must be a valid date and time.',
  past: 'Expiration date must be in the future.',
};

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Format a moment (ms since the epoch) as "YYYY-MM-DD HH:MM:SS" in UTC, for MySQL. */
export function toMysqlUtc(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Check an `expiresAt` value sent by a client.
 *
 * Returns `{ ok: true, value }` where `value` is:
 *   - `undefined` when the field wasn't sent (leave the stored value alone),
 *   - `null` when it was cleared (`null` or an empty string),
 *   - a "YYYY-MM-DD HH:MM:SS" UTC string, ready for the database.
 * Or `{ ok: false, error }` with a message that's safe to show the user.
 *
 * The moment must be in the future, so a typo can't switch a code off by
 * accident. Seconds are kept, fractions of a second are dropped.
 */
export function parseExpiresAt(input, now = Date.now()) {
  if (input === undefined) return { ok: true, value: undefined };
  if (input === null || input === '') return { ok: true, value: null };
  if (typeof input !== 'string') return { ok: false, error: EXPIRY_ERRORS.invalid };

  const match = ISO_WITH_ZONE.exec(input.trim());
  if (!match) return { ok: false, error: EXPIRY_ERRORS.invalid };

  const [, y, mo, d, h, mi, s = '0', zone] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);

  // Date.parse would roll an impossible date (Feb 31) over to the next month,
  // so check the parts first.
  if (
    month < 1 || month > 12 ||
    day < 1 || day > daysInMonth(year, month) ||
    hour > 23 || minute > 59 || second > 59
  ) {
    return { ok: false, error: EXPIRY_ERRORS.invalid };
  }
  if (zone !== 'Z') {
    const [zh, zm] = zone.slice(1).split(':').map(Number);
    if (zh > 23 || zm > 59) return { ok: false, error: EXPIRY_ERRORS.invalid };
  }

  const parsed = Date.parse(input.trim());
  if (Number.isNaN(parsed)) return { ok: false, error: EXPIRY_ERRORS.invalid };

  const ms = Math.floor(parsed / 1000) * 1000;
  if (new Date(ms).getUTCFullYear() > MAX_YEAR) {
    return { ok: false, error: EXPIRY_ERRORS.invalid };
  }
  if (ms <= now) return { ok: false, error: EXPIRY_ERRORS.past };

  return { ok: true, value: toMysqlUtc(ms) };
}

/**
 * Turn a stored `expires_at` ("YYYY-MM-DD HH:MM:SS", UTC) into the ISO string
 * the API returns. Returns null when there's no expiry or the value is unusable.
 */
export function expiresAtToIso(stored) {
  if (stored == null || stored === '') return null;
  if (stored instanceof Date) {
    return Number.isNaN(stored.getTime()) ? null : stored.toISOString();
  }
  const ms = Date.parse(`${String(stored).replace(' ', 'T')}Z`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** True when an ISO `expiresAt` has passed. No expiry never expires. */
export function isExpired(expiresAt, now = Date.now()) {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  return !Number.isNaN(ms) && ms <= now;
}

// ──────────────────────────────────────────────
// Calendar dates (<input type="date">) <-> stored moments
// ──────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(2, '0');
}

/** "YYYY-MM-DD" for a moment, in the viewer's own time zone. */
export function toLocalDateInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today's date as "YYYY-MM-DD" in the viewer's time zone. */
export function todayLocalDateInput(now = Date.now()) {
  return toLocalDateInput(new Date(now));
}

/**
 * The last second of a calendar date ("YYYY-MM-DD") in the viewer's time zone,
 * as an ISO string, or null if the date isn't valid. This is what gets sent to
 * the API, so a code set to expire on the 30th still works all day on the 30th.
 */
export function endOfLocalDayIso(dateInput) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput || '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, 23, 59, 59, 0);
  // new Date() rolls an impossible date (Feb 31) forward; treat that as invalid.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date.toISOString();
}

/** An ISO `expiresAt` as a short date in the viewer's time zone, e.g. "Nov 30, 2026". */
export function formatExpiryDate(expiresAt) {
  if (!expiresAt) return '';
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The calendar date ("YYYY-MM-DD", viewer's time zone) of an ISO `expiresAt`, or "" if none. */
export function isoToLocalDateInput(expiresAt) {
  if (!expiresAt) return '';
  const date = new Date(expiresAt);
  return Number.isNaN(date.getTime()) ? '' : toLocalDateInput(date);
}
