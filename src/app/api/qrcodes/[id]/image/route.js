/**
 * GET /api/qrcodes/[id]/image
 *
 * Generate and return a QR code PNG image for the given QR code.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { getSession } from '@/lib/auth';
import QRCode from 'qrcode';
import { encodedDataFor } from '@/lib/contentTypes';
import { clientContent } from '@/lib/codeContent';
import { redirectUrlFor } from '@/lib/clientQRCode';

const { getQRCodeById } = require('@/lib/db');

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

    // The QR code encodes the redirect URL (not the raw destination), or a
    // static code's own content (Wi-Fi details), decrypted just for this.
    const data = encodedDataFor(qrcode.content_type, {
      redirectUrl: redirectUrlFor(qrcode.short_id),
      content: clientContent({
        contentType: qrcode.content_type,
        destinationUrl: qrcode.destination_url,
        contentData: qrcode.content_data,
        shortId: qrcode.short_id,
      }),
    });
    if (!data) {
      return Response.json(
        { error: 'This code’s saved details can’t be read, so it can’t be drawn. Create the code again.' },
        { status: 409 }
      );
    }

    const pngBuffer = await QRCode.toBuffer(data, {
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
        // A Wi-Fi code's image holds its password: never keep it in a cache.
        'Cache-Control': 'private, no-store',
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
