/**
 * Query-string filters and date maths for the analytics dashboard.
 *
 * Scans are stored in UTC, but days on the dashboard are the viewer's days,
 * so every period starts at the viewer's local midnight. The browser sends
 * its timezone as `tz` (the value of `new Date().getTimezoneOffset()`, e.g.
 * -120 for South Africa); we turn that into `offsetMinutes` (+120), the
 * minutes to add to UTC to get local time.
 *
 * Shared by the API (server) and the dashboard (client), so this file must
 * stay free of server-only imports.
 */

export const RANGES = {
  '7d': { label: 'Last 7 days', days: 7 },
  '30d': { label: 'Last 30 days', days: 30 },
  '90d': { label: 'Last 90 days', days: 90 },
  '12m': { label: 'Last 12 months', days: 365 },
  all: { label: 'All time', days: null },
};
export const DEFAULT_RANGE = '30d';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_OFFSET_MINUTES = 14 * 60; // UTC+14 is the furthest timezone

/** Parse a positive integer ID; null when absent, NaN when invalid. */
function parseId(value) {
  if (value === null || value === undefined || value === '') return null;
  return /^\d{1,10}$/.test(value) && Number(value) > 0 ? Number(value) : NaN;
}

/** Browser `getTimezoneOffset()` value → minutes to add to UTC. Bad input → 0 (UTC). */
export function parseOffsetMinutes(tz) {
  if (tz === null || tz === undefined || !/^-?\d{1,4}$/.test(String(tz))) return 0;
  const offset = -Number(tz);
  if (Math.abs(offset) > MAX_OFFSET_MINUTES) return 0;
  return offset + 0; // turns -0 into 0
}

/** UTC ms of the viewer's local midnight at the start of the day containing `ms`. */
export function localMidnight(ms, offsetMinutes) {
  const offsetMs = offsetMinutes * 60_000;
  return Math.floor((ms + offsetMs) / DAY_MS) * DAY_MS - offsetMs;
}

/** Chart bucket size for a span of days. */
export function bucketForDays(days) {
  if (days <= 90) return 'day';
  if (days <= 730) return 'week';
  return 'month';
}

/**
 * Current and previous periods for a range, as UTC ms. `to` is the end of the
 * viewer's today; the previous period is the same length, just before `from`.
 * For 'all', `firstScanMs` (the earliest scan in scope, or null) sets the
 * start and there's no previous period.
 */
export function computePeriods(range, nowMs, offsetMinutes, firstScanMs = null) {
  const to = localMidnight(nowMs, offsetMinutes) + DAY_MS;
  const { days } = RANGES[range];

  if (days === null) {
    const from = localMidnight(firstScanMs ?? nowMs, offsetMinutes);
    const spanDays = Math.round((to - from) / DAY_MS);
    return { from, to, prevFrom: null, prevTo: null, bucket: bucketForDays(spanDays) };
  }

  const from = to - days * DAY_MS;
  return { from, to, prevFrom: from - days * DAY_MS, prevTo: from, bucket: bucketForDays(days) };
}

/**
 * Validate the dashboard's query string. Returns `{ error }` or
 * `{ range, offsetMinutes, codeId, collectionId, accountId }` where
 * collectionId is a number, 'default' (codes in no collection) or null.
 */
export function parseAnalyticsFilters(searchParams) {
  const range = searchParams.get('range') || DEFAULT_RANGE;
  if (!Object.hasOwn(RANGES, range)) return { error: 'Invalid range' };

  const codeId = parseId(searchParams.get('codeId'));
  if (Number.isNaN(codeId)) return { error: 'Invalid code' };

  const rawCollection = searchParams.get('collectionId');
  const collectionId = rawCollection === 'default' ? 'default' : parseId(rawCollection);
  if (Number.isNaN(collectionId)) return { error: 'Invalid collection' };

  const accountId = parseId(searchParams.get('accountId'));
  if (Number.isNaN(accountId)) return { error: 'Invalid account' };

  return {
    range,
    offsetMinutes: parseOffsetMinutes(searchParams.get('tz')),
    codeId,
    collectionId,
    accountId,
  };
}

/**
 * Starting filters for the analytics pages from their own URL
 * (?range=30d&code=12&collection=default&account=3), as a plain object from
 * Next's `searchParams`. Anything invalid is dropped.
 */
export function initialFiltersFromPageParams(params = {}) {
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  const id = (v) => {
    const n = parseId(one(v) ?? null);
    return Number.isNaN(n) ? null : n;
  };
  const range = one(params.range);
  const collection = one(params.collection);
  return {
    range: range && Object.hasOwn(RANGES, range) ? range : DEFAULT_RANGE,
    codeId: id(params.code),
    collectionId: collection === 'default' ? 'default' : id(collection),
    accountId: id(params.account),
  };
}

/** UTC ms → "YYYY-MM-DD HH:MM:SS", the format scan_events.scanned_at is stored in. */
export function toSqlDateTime(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/** "YYYY-MM-DD HH:MM:SS" (UTC, from MySQL) → ISO string, or null. */
export function sqlToIso(value) {
  if (!value) return null;
  return `${String(value).replace(' ', 'T')}Z`;
}

/** The bucket key ("YYYY-MM-DD") for a local day, matching the SQL in scanAnalytics.js. */
function bucketKey(localDayMs, bucket) {
  const date = new Date(localDayMs);
  if (bucket === 'week') {
    const mondayBased = (date.getUTCDay() + 6) % 7;
    return new Date(localDayMs - mondayBased * DAY_MS).toISOString().slice(0, 10);
  }
  if (bucket === 'month') return `${date.toISOString().slice(0, 7)}-01`;
  return date.toISOString().slice(0, 10);
}

/**
 * Every bucket key between `from` and `to` (UTC ms) in the viewer's timezone,
 * oldest first, so days with no scans still show on the chart.
 */
export function bucketKeys({ from, to, bucket, offsetMinutes }) {
  const keys = [];
  const offsetMs = offsetMinutes * 60_000;
  for (let ms = from; ms < to; ms += DAY_MS) {
    const key = bucketKey(ms + offsetMs, bucket);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  return keys;
}

/** Percentage change, rounded; null when there's nothing to compare against. */
export function percentChange(current, previous) {
  if (previous === null || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
