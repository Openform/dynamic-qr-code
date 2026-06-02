/**
 * GET /r/[shortId]
 *
 * Public redirect route — no authentication required.
 * Looks up the QR code by shortId, increments the scan count,
 * and redirects (302) to the destination URL.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { NextResponse } from 'next/server';
const { getQRCodeByShortId, incrementScanCount } = require('@/lib/db');

export async function GET(request, { params }) {
  try {
    const { shortId } = await params;

    const qrcode = getQRCodeByShortId(shortId);
    if (!qrcode) {
      // QR code not found — redirect to home page
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Increment scan counter
    incrementScanCount(shortId);

    // Ensure the destination is an absolute URL
    let destination = qrcode.destination_url;
    if (!destination.startsWith('http://') && !destination.startsWith('https://')) {
      destination = `https://${destination}`;
    }

    return NextResponse.redirect(new URL(destination), 302);
  } catch (error) {
    console.error('Redirect error:', error);
    return NextResponse.redirect(new URL('/', request.url));
  }
}
