/**
 * The shape the API sends a QR code in: a `SELECT q.*` row (snake_case, from
 * getQRCodeById) turned into camelCase, with the public redirect URL, the
 * code's scheduled destination changes, and its schedule summary
 * (`liveSchedule`, `scheduleCount`). `accessPassword` is the password people
 * must enter after scanning (null for none); only the owner gets this shape.
 *
 * Not for the code list: getQRCodesByUserId already returns this shape (the
 * list route adds the schedule summary).
 */

import { scheduleSummary } from './schedules';

export const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/** The public link a code's image points to. */
export function redirectUrlFor(shortId) {
  return `${BASE_URL}/r/${shortId}`;
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
  return {
    id: qrcode.id,
    shortId: qrcode.short_id,
    userId: qrcode.user_id,
    collectionId: qrcode.collection_id,
    title: qrcode.title,
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
    redirectUrl: redirectUrlFor(qrcode.short_id),
  };
}
