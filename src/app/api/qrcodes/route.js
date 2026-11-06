/**
 * GET  /api/qrcodes       — List all QR codes for the authenticated user
 * POST /api/qrcodes       — Create a new QR code
 */

import { getSession } from '@/lib/auth';
import { nanoid } from 'nanoid';
import {
  sanitizeStyleConfig,
  legacyFieldsFromStyle,
  evaluateContrast,
} from '@/lib/qrStyle';
import { validateCodeInput, CONTRAST_ERROR_MESSAGE } from '@/lib/codeInput';
import { getPackage } from '@/lib/packages';

const { getQRCodesByUserId, createQRCodeWithinLimit, getCollectionById } = require('@/lib/db');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

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
 * Transform a raw `SELECT *` DB record (snake_case) to a client-friendly shape
 * (camelCase) and attach the public redirect URL. Used for the POST response,
 * whose record comes from `getQRCodeById` (snake_case columns).
 *
 * NOTE: do NOT use this for the GET list — `getQRCodesByUserId` already returns
 * camelCase aliased fields, so re-mapping them here reads undefined for every
 * field (the cause of URLs/styling vanishing on refresh). See GET below.
 */
function toClientQRCode(qrcode) {
  return {
    id: qrcode.id,
    shortId: qrcode.short_id,
    userId: qrcode.user_id,
    collectionId: qrcode.collection_id,
    title: qrcode.title,
    destinationUrl: qrcode.destination_url,
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
    redirectUrl: `${BASE_URL}/r/${qrcode.short_id}`,
  };
}

// ── GET — list QR codes ────────────────────────
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // getQRCodesByUserId already returns the client shape (camelCase fields with
    // styleConfig parsed); only the public redirect URL needs attaching.
    const qrcodes = await getQRCodesByUserId(session.userId);
    const clientQRCodes = qrcodes.map((qr) => ({
      ...qr,
      redirectUrl: `${BASE_URL}/r/${qr.shortId}`,
    }));

    return Response.json({ qrcodes: clientQRCodes });
  } catch (error) {
    console.error('GET /api/qrcodes error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── POST — create QR code ──────────────────────
export async function POST(request) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      title,
      destinationUrl,
      foregroundColor,
      backgroundColor,
      fgColor,
      bgColor,
      logoUrl,
      dotStyle,
      cornerSquareStyle,
      cornerDotStyle,
      styleConfig,
      collectionId,
    } = body;

    // Validation — the same rules bulk creation applies to every row: both
    // fields present, within the column sizes, and an https URL (https:// is
    // added when the scheme is omitted).
    const input = validateCodeInput({ title, destinationUrl });
    if (!input.ok) {
      return Response.json(
        { error: Object.values(input.errors)[0], errors: input.errors },
        { status: 400 }
      );
    }

    // Resolve the target collection. A missing/empty/null value means the
    // Default Collection; any other value must be one of the user's own
    // collections, so a crafted request can't drop a code into someone else's.
    let resolvedCollectionId = null;
    if (collectionId != null && collectionId !== '') {
      const collection = await getCollectionById(Number(collectionId), session.userId);
      if (!collection) {
        return Response.json({ error: 'Collection not found' }, { status: 400 });
      }
      resolvedCollectionId = collection.id;
    }

    const shortId = nanoid(10);

    // Prefer the full style config; sanitize untrusted input and derive the
    // legacy flat columns from it. Fall back to the legacy body fields for
    // older clients that don't send a styleConfig.
    const sanitizedStyle = sanitizeStyleConfig(styleConfig);

    // Reject codes whose foreground/background contrast is too low to scan, so a
    // crafted request can't bypass the client-side contrast check. Only a
    // confident failure blocks — borderline/transparent cases are allowed.
    if (sanitizedStyle && !evaluateContrast(sanitizedStyle).scannable) {
      return Response.json({ error: CONTRAST_ERROR_MESSAGE }, { status: 400 });
    }

    const legacy = sanitizedStyle
      ? legacyFieldsFromStyle(sanitizedStyle)
      : {
          foregroundColor: foregroundColor || fgColor || '#000000',
          backgroundColor: backgroundColor || bgColor || '#ffffff',
          logoUrl: logoUrl || null,
          dotStyle,
          cornerSquareStyle,
          cornerDotStyle,
        };

    // The package limit is checked inside the insert transaction so it can't
    // be raced past by sending several requests at once.
    const created = await createQRCodeWithinLimit(
      {
        shortId,
        userId: session.userId,
        collectionId: resolvedCollectionId,
        title: input.title,
        destinationUrl: input.destinationUrl,
        ...legacy,
        styleConfig: sanitizedStyle,
      },
      (packageId) => getPackage(packageId).limit
    );

    if (!created.ok) {
      if (created.reason === 'no_user') {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
      }
      return Response.json(
        {
          error: `You've reached your package limit of ${created.limit} QR codes. Delete a code or contact us to upgrade your package.`,
          code: 'PACKAGE_LIMIT_REACHED',
        },
        { status: 403 }
      );
    }

    return Response.json({ qrcode: toClientQRCode(created.qrcode) }, { status: 201 });
  } catch (error) {
    console.error('POST /api/qrcodes error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
