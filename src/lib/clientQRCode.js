/**
 * The shape the API sends a QR code in: a `SELECT q.*` row (snake_case, from
 * getQRCodeById) turned into camelCase, with the public redirect URL and the
 * code's scheduled destination changes.
 *
 * Not for the code list: getQRCodesByUserId already returns this shape.
 */

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

export function toClientQRCode(qrcode, scheduledChanges = []) {
  return {
    id: qrcode.id,
    shortId: qrcode.short_id,
    userId: qrcode.user_id,
    collectionId: qrcode.collection_id,
    title: qrcode.title,
    destinationUrl: qrcode.destination_url,
    scheduledChanges,
    fgColor: qrcode.foreground_color,
    bgColor: qrcode.background_color,
    logoUrl: qrcode.logo_url,
    dotStyle: qrcode.dot_style,
    cornerSquareStyle: qrcode.corner_square_style,
    cornerDotStyle: qrcode.corner_dot_style,
    styleConfig: parseStyleConfig(qrcode.style_config),
    scanCount: qrcode.scan_count,
    createdAt: qrcode.created_at,
    updatedAt: qrcode.updated_at,
    redirectUrl: redirectUrlFor(qrcode.short_id),
  };
}
