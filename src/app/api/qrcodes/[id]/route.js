/**
 * GET    /api/qrcodes/[id]  — Get a single QR code
 * PUT    /api/qrcodes/[id]  — Update a QR code
 * DELETE /api/qrcodes/[id]  — Delete a QR code
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
import { toClientQRCode } from '@/lib/utils';
const { getQRCodeById, updateQRCode, deleteQRCode } = require('@/lib/db');

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
          { error: 'Invalid destination URL. Must be http or https.' },
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
