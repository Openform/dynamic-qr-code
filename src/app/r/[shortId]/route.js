/**
 * GET /r/[shortId]
 *
 * Public redirect route — no authentication required.
 * Looks up the QR code by shortId, increments the scan count,
 * and redirects (302) to the destination URL.
 *
 * Codes that can't redirect send the visitor to /code-unavailable instead:
 * paused (the owner's account is disabled), not found, or a lookup error.
 * Paused scans aren't counted.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { NextResponse } from 'next/server';
const { getQRCodeByShortId, incrementScanCount } = require('@/lib/db');

function unavailable(request, reason) {
  return NextResponse.redirect(new URL(`/code-unavailable?reason=${reason}`, request.url), 302);
}

export async function GET(request, { params }) {
  try {
    const { shortId } = await params;

    const qrcode = await getQRCodeByShortId(shortId);
    if (!qrcode) {
      return unavailable(request, 'not-found');
    }

    if (qrcode.owner_disabled_at) {
      return unavailable(request, 'inactive');
    }

    // Increment scan counter
    await incrementScanCount(shortId);

    // Ensure the destination is an absolute URL
    let destination = qrcode.destination_url;
    if (!destination.startsWith('http://') && !destination.startsWith('https://')) {
      destination = `https://${destination}`;
    }

    return NextResponse.redirect(new URL(destination), 302);
  } catch (error) {
    console.error('Redirect error:', error);
    return unavailable(request, 'error');
  }
}
