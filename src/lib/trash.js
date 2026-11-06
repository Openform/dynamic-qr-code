/**
 * Shared, client-safe helpers for Trash (deleted codes that can still be
 * restored).
 *
 * Used by the trash API routes (to validate which codes a request names) and by
 * the dashboard (to say how long ago a code was deleted and how long it has
 * left). Pure functions only: no React, no database.
 */

/** How long a deleted code stays in Trash before it is deleted permanently. */
export const TRASH_RETENTION_DAYS = 30;

/**
 * Most codes one trash / restore / permanently-delete request may name. Sized
 * for Enterprise accounts, which have no code limit, while keeping each request
 * (and the restore transaction that locks the account) small.
 */
export const MAX_TRASH_IDS = 500;

/**
 * Validate the `ids` of a request body: a non-empty list of positive whole
 * numbers, at most `max` long. Returns `{ ids }` (duplicates removed) or
 * `{ error }` with a user-facing message.
 */
export function validateIdList(raw, max = MAX_TRASH_IDS) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'ids must be a non-empty list.' };
  }
  if (raw.length > max) {
    return { error: `You can select at most ${max} codes at a time.` };
  }
  if (!raw.every((id) => Number.isInteger(id) && id > 0)) {
    return { error: 'ids must be positive whole numbers.' };
  }
  return { ids: [...new Set(raw)] };
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago" for an age in minutes. */
export function describeAge(minutes) {
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  if (m < 1) return 'just now';
  if (m < 60) return `${plural(m, 'minute', 'minutes')} ago`;
  const hours = Math.floor(m / 60);
  if (hours < 24) return `${plural(hours, 'hour', 'hours')} ago`;
  return `${plural(Math.floor(hours / 24), 'day', 'days')} ago`;
}

/** "today", "in 1 day", "in 27 days" for the whole days left before permanent deletion. */
export function describeDaysLeft(days) {
  const d = Math.max(0, Math.floor(Number(days) || 0));
  if (d < 1) return 'today';
  return `in ${plural(d, 'day', 'days')}`;
}
