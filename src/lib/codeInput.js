/**
 * Validation of the user-supplied fields of a new QR code (title and
 * destination URL), shared by single creation (POST /api/qrcodes), bulk
 * creation (POST /api/qrcodes/bulk) and the bulk review screen, so every path
 * enforces exactly the same rules.
 *
 * Pure and framework-agnostic, so it is safe to import from client components.
 */

import { normalizeDestinationUrl, isValidDestinationUrl } from './qrStyle';

// Mirror the column sizes in lib/db.js (qrcodes.title VARCHAR(255),
// qrcodes.destination_url VARCHAR(2048)). A longer value would make the INSERT
// fail, which in a bulk request would sink the whole batch with a 500.
export const MAX_TITLE_LENGTH = 255;
export const MAX_URL_LENGTH = 2048;

/**
 * Validate and normalize one code's title and destination URL.
 *
 * Returns `{ ok: true, title, destinationUrl }` with the title trimmed and the
 * URL normalized (https:// added when the scheme is omitted), or
 * `{ ok: false, errors }` where `errors` maps a field name ('title' |
 * 'destinationUrl') to a user-facing message.
 *
 * Anything that isn't a string is treated as missing, so a hand-crafted
 * request can't smuggle an object or number into the database.
 */
export function validateCodeInput(input) {
  const errors = {};

  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const urlText = typeof input?.destinationUrl === 'string' ? input.destinationUrl.trim() : '';

  if (!title) {
    errors.title = 'Title is required.';
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  }

  let destinationUrl = '';
  if (!urlText) {
    errors.destinationUrl = 'Destination URL is required.';
  } else {
    destinationUrl = normalizeDestinationUrl(urlText);
    if (destinationUrl.length > MAX_URL_LENGTH) {
      errors.destinationUrl = `Destination URL must be ${MAX_URL_LENGTH} characters or fewer.`;
    } else if (!isValidDestinationUrl(destinationUrl)) {
      errors.destinationUrl = 'Must be a valid https URL.';
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, title, destinationUrl };
}

/** Shown when a style's foreground/background contrast is too low to scan. */
export const CONTRAST_ERROR_MESSAGE =
  'Foreground and background contrast is too low to scan reliably. Use a darker foreground or a lighter background.';
