/**
 * How long detailed scan rows (scan_events) are kept.
 *
 * Set with ANALYTICS_RETENTION_MONTHS: default 24, `0` keeps everything.
 * Older rows are deleted to keep the database small on shared hosting; each
 * code's total in qrcodes.scan_count is never reduced.
 *
 * Shared by the server and the dashboard (to show the policy), so this file
 * must stay free of server-only imports.
 */

export const DEFAULT_RETENTION_MONTHS = 24;

/** Parse the retention setting: a whole number of months, 0 = forever. */
export function retentionMonths(value = process.env.ANALYTICS_RETENTION_MONTHS) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return DEFAULT_RETENTION_MONTHS;
  }
  const text = String(value).trim();
  return /^\d{1,4}$/.test(text) ? Number(text) : DEFAULT_RETENTION_MONTHS;
}

/** UTC ms before which scan rows are deleted, or null to keep everything. */
export function retentionCutoff(nowMs, months) {
  if (!months) return null;
  const date = new Date(nowMs);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.getTime();
}
