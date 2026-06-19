/**
 * GET    /api/qrcodes/[id]  — Get a single QR code
 * PUT    /api/qrcodes/[id]  — Update a QR code
 * DELETE /api/qrcodes/[id]  — Delete a QR code
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
const { getQRCodeById, updateQRCode, deleteQRCode } = require('@/lib/db');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

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
    } = body;

    const finalFgColor = foregroundColor || fgColor;
    const finalBgColor = backgroundColor || bgColor;

    // Validate destination URL if provided
    if (destinationUrl) {
      try {
        const parsedUrl = new URL(destinationUrl);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          throw new Error('Invalid protocol');
        }
      } catch {
        return Response.json(
          { error: 'Invalid destination URL' },
          { status: 400 }
        );
      }
    }

    const updated = await updateQRCode(Number(id), session.userId, {
      title,
      destinationUrl,
      foregroundColor: finalFgColor,
      backgroundColor: finalBgColor,
      logoUrl,
      dotStyle,
      cornerSquareStyle,
      cornerDotStyle,
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
