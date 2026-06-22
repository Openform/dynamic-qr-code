/**
 * GET    /api/qrcodes/[id]  — Get a single QR code
 * PUT    /api/qrcodes/[id]  — Update a QR code
 * DELETE /api/qrcodes/[id]  — Delete a QR code
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
import { sanitizeStyleConfig, legacyFieldsFromStyle } from '@/lib/qrStyle';
const { getQRCodeById, updateQRCode, deleteQRCode } = require('@/lib/db');

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
 * Transform a DB record (snake_case) to a client-friendly shape (camelCase).
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

// ── GET — single QR code ───────────────────────
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return Response.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const qrcode = await getQRCodeById(Number(id), session.userId);
    if (!qrcode) {
      return Response.json(
        { error: 'QR code not found' },
        { status: 404 }
      );
    }

    return Response.json({ qrcode: toClientQRCode(qrcode) });
  } catch (error) {
    console.error('GET /api/qrcodes/[id] error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── PUT — update QR code ───────────────────────
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
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

    const finalFgColor = foregroundColor || fgColor;
    const finalBgColor = backgroundColor || bgColor;

    // Validate destination URL if provided
    if (destinationUrl) {
      try {
        new URL(destinationUrl);
      } catch {
        return Response.json(
          { error: 'Invalid destination URL' },
          { status: 400 }
        );
      }
    }

    // When a styleConfig is supplied, it is the source of truth: sanitize it and
    // derive the legacy flat columns from it. Otherwise pass through the legacy
    // body fields (undefined values leave the stored row untouched).
    const sanitizedStyle = sanitizeStyleConfig(styleConfig);
    const legacy = sanitizedStyle
      ? legacyFieldsFromStyle(sanitizedStyle)
      : {
          foregroundColor: finalFgColor,
          backgroundColor: finalBgColor,
          logoUrl,
          dotStyle,
          cornerSquareStyle,
          cornerDotStyle,
        };

    const updated = await updateQRCode(Number(id), session.userId, {
      title,
      destinationUrl,
      ...legacy,
      styleConfig: sanitizedStyle,
    });

    if (!updated) {
      return Response.json(
        { error: 'QR code not found' },
        { status: 404 }
      );
    }

    return Response.json({ qrcode: toClientQRCode(updated) });
  } catch (error) {
    console.error('PUT /api/qrcodes/[id] error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── DELETE — delete QR code ────────────────────
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return Response.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const deleted = await deleteQRCode(Number(id), session.userId);
    if (!deleted) {
      return Response.json(
        { error: 'QR code not found' },
        { status: 404 }
      );
    }

    return Response.json({ message: 'QR code deleted successfully' });
  } catch (error) {
    console.error('DELETE /api/qrcodes/[id] error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
