/**
 * GET  /api/qrcodes       — List all QR codes for the authenticated user
 * POST /api/qrcodes       — Create a new QR code
 */

import { getSession } from '@/lib/auth';
import { nanoid } from 'nanoid';

const { getQRCodesByUserId, createQRCode } = require('@/lib/db');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

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

    // Attach redirectUrl to each QR code without instantiating new objects via map
    for (let i = 0; i < qrcodes.length; i++) {
      qrcodes[i].redirectUrl = `${BASE_URL}/r/${qrcodes[i].shortId}`;
    }

    return Response.json({ qrcodes });
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
    } = body;

    // Validation
    if (!title || !destinationUrl) {
      return Response.json(
        { error: 'Title and destination URL are required' },
        { status: 400 }
      );
    }

    // Validate destination URL including protocol
    try {
      const parsedUrl = new URL(destinationUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }
    } catch {
      return Response.json(
        { error: 'Invalid destination URL. Must be http or https.' },
        { status: 400 }
      );
    }

    const shortId = nanoid(10);

    const qrcode = await createQRCode({
      shortId,
      userId: session.userId,
      title,
      destinationUrl,
      foregroundColor: foregroundColor || fgColor || '#000000',
      backgroundColor: backgroundColor || bgColor || '#ffffff',
      logoUrl,
      dotStyle,
      cornerSquareStyle,
      cornerDotStyle,
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
