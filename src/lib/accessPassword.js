/**
 * Rules for a code's password: the one people must enter after scanning,
 * before they're sent on to the destination.
 *
 * Shared by the API (to validate) and the dashboard (to check as the owner
 * types), so this file must stay free of server-only imports.
 */

export const ACCESS_PASSWORD_MIN = 4;
// Matches the qrcodes.access_password column (VARCHAR(64), counted in characters).
export const ACCESS_PASSWORD_MAX = 64;

/** How long a browser that entered the right password can skip the page. */
export const UNLOCK_DAYS = 30;

// Tabs, newlines and other control characters can't be typed into the
// password page's single-line field.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Length in characters as the database counts them (an emoji is one). */
function characterCount(text) {
  return Array.from(text).length;
}

/**
 * Check a password sent by the dashboard. Spaces at either end are dropped.
 * `null` or an empty value means "no password".
 *
 * Returns `{ value }` (a string, or null for none) or `{ error }`.
 */
export function parseAccessPassword(input) {
  if (input === null || input === undefined) return { value: null };
  if (typeof input !== 'string') return { error: 'The password must be text.' };

  const value = input.trim();
  if (value === '') return { value: null };
  if (CONTROL_CHARS.test(value)) {
    return { error: 'The password can’t contain tabs or line breaks.' };
  }
  const length = characterCount(value);
  if (length < ACCESS_PASSWORD_MIN) {
    return { error: `The password needs at least ${ACCESS_PASSWORD_MIN} characters.` };
  }
  if (length > ACCESS_PASSWORD_MAX) {
    return { error: `The password can be at most ${ACCESS_PASSWORD_MAX} characters.` };
  }
  return { value };
}
