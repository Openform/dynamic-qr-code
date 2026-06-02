/**
 * GET /api/qrcodes/[id]/image
 *
 * Generate and return a QR code PNG image for the given QR code.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
import QRCode from 'qrcode';

const { getQRCodeById } = require('@/lib/db');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

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

    const qrcode = getQRCodeById(Number(id), session.userId);
    if (!qrcode) {
      return Response.json(
        { error: 'QR code not found' },
        { status: 404 }
      );
    }

    // The QR code encodes the redirect URL (not the raw destination)
    const redirectUrl = `${BASE_URL}/r/${qrcode.short_id}`;

    const pngBuffer = await QRCode.toBuffer(redirectUrl, {
      type: 'png',
      width: 400,
      margin: 2,
      color: {
        dark: qrcode.foreground_color || '#000000',
        light: qrcode.background_color || '#ffffff',
      },
    });

    return new Response(pngBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="qrcode-${qrcode.short_id}.png"`,
      },
    });
  } catch (error) {
    console.error('GET /api/qrcodes/[id]/image error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
