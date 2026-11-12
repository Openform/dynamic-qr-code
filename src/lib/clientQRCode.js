/**
 * The shape the API sends a QR code in: a `SELECT q.*` row (snake_case, from
 * getQRCodeById) turned into camelCase, with the public redirect URL, the
 * code's content type and content fields, its scheduled destination changes,
 * and its schedule summary (`liveSchedule`, `scheduleCount`).
 * `accessPassword` is the password people must enter after scanning (null for
 * none).
 *
 * Not for the code list: getQRCodesByUserId already returns this shape (the
 * list route adds the content with withClientContent() and the schedule
 * summary).
 *
 * Only for the code's signed-in owner: `content` includes a Wi-Fi code's
 * password, which the dashboard needs to draw the code.
 */

import { scheduleSummary } from './schedules';
import { getContentType, isStaticType } from './contentTypes';
import { clientContent } from './codeContent';

export const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Headers for every response that carries a code's content: only the
 * signed-in browser may keep it, and only while it's on screen, never in a
 * shared or on-disk cache.
 */
export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' };

/** The public link a code's image points to. */
export function redirectUrlFor(shortId) {
  return `${BASE_URL}/r/${shortId}`;
}

/**
 * Add `contentType`, `content` and `redirectUrl` to a code from the list
 * (camelCase, with `contentData`), and drop the encrypted `contentData`.
 * Static codes have no QR Go link, so their `redirectUrl` is null.
 */
export function withClientContent({ contentData, ...code }) {
  const contentType = getContentType(code.contentType).id;
  return {
    ...code,
    contentType,
    content: clientContent({ contentType, destinationUrl: code.destinationUrl, contentData, shortId: code.shortId }),
    redirectUrl: isStaticType(contentType) ? null : redirectUrlFor(code.shortId),
  };
}

/** Safely parse a stored style_config value (string or already-parsed object). */
function parseStyleConfig(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * `scheduledChanges` from getScheduledDestinationChanges; `schedules` from
 * getSchedulesForCode (pass them, or the card loses its schedule line).
 */
export function toClientQRCode(qrcode, { scheduledChanges = [], schedules = [] } = {}) {
  const contentType = getContentType(qrcode.content_type).id;
  return {
    id: qrcode.id,
    shortId: qrcode.short_id,
    userId: qrcode.user_id,
    collectionId: qrcode.collection_id,
    title: qrcode.title,
    contentType,
    content: clientContent({
      contentType,
      destinationUrl: qrcode.destination_url,
      contentData: qrcode.content_data,
      shortId: qrcode.short_id,
    }),
    destinationUrl: qrcode.destination_url,
    scheduledChanges,
    ...scheduleSummary(schedules),
    fgColor: qrcode.foreground_color,
    bgColor: qrcode.background_color,
    logoUrl: qrcode.logo_url,
    dotStyle: qrcode.dot_style,
    cornerSquareStyle: qrcode.corner_square_style,
    cornerDotStyle: qrcode.corner_dot_style,
    styleConfig: parseStyleConfig(qrcode.style_config),
    accessPassword: qrcode.access_password ?? null,
    scanCount: qrcode.scan_count,
    createdAt: qrcode.created_at,
    updatedAt: qrcode.updated_at,
    redirectUrl: isStaticType(contentType) ? null : redirectUrlFor(qrcode.short_id),
  };
}
