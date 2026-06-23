/**
 * GET  /api/qrcodes       — List all QR codes for the authenticated user
 * POST /api/qrcodes       — Create a new QR code
 */

import { getSession } from '@/lib/auth';
import { nanoid } from 'nanoid';
import {
  sanitizeStyleConfig,
  legacyFieldsFromStyle,
  normalizeDestinationUrl,
  isValidDestinationUrl,
} from '@/lib/qrStyle';

const { getQRCodesByUserId, createQRCode } = require('@/lib/db');

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
 * Transform a DB record (snake_case) to a client-friendly shape (camelCase)
 * and attach the public redirect URL.
 */
function toClientQRCode(qrcode) {
  return {
    id: qrcode.id,
    shortId: qrcode.short_id,
    userId: qrcode.user_id,
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

    const qrcodes = await getQRCodesByUserId(session.userId);
    const clientQRCodes = qrcodes.map(toClientQRCode);

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
    } = body;

    // Validation
    if (!title || !destinationUrl) {
      return Response.json(
        { error: 'Title and destination URL are required' },
        { status: 400 }
      );
    }

    // Autofill https:// when the scheme is omitted, then require https — plain
    // http URLs are rejected.
    const normalizedUrl = normalizeDestinationUrl(destinationUrl);
    if (!isValidDestinationUrl(normalizedUrl)) {
      return Response.json(
        { error: 'Invalid destination URL. Must be a valid https URL.' },
        { status: 400 }
      );
    }

    const shortId = nanoid(10);

    // Prefer the full style config; sanitize untrusted input and derive the
    // legacy flat columns from it. Fall back to the legacy body fields for
    // older clients that don't send a styleConfig.
    const sanitizedStyle = sanitizeStyleConfig(styleConfig);
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

    const qrcode = await createQRCode({
      shortId,
      userId: session.userId,
      title,
      destinationUrl: normalizedUrl,
      ...legacy,
      styleConfig: sanitizedStyle,
    });

    return Response.json({ qrcode: toClientQRCode(qrcode) }, { status: 201 });
  } catch (error) {
    console.error('POST /api/qrcodes error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
