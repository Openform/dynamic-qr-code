/**
 * GET /r/[shortId]
 *
 * Public redirect route — no authentication required.
 * Looks up the QR code by shortId and redirects (302) to the destination URL.
 * The scan is recorded for analytics after the redirect has been sent (see
 * lib/scanRecorder.js), so recording never slows down or breaks a scan.
 *
 * Codes that can't redirect send the visitor to /code-unavailable instead:
 * paused (the owner's account is disabled), not found, or a lookup error.
 * Paused scans aren't counted.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { NextResponse, after } from 'next/server';
import { getClientIp } from '@/lib/rateLimit';
import { recordScanFromRequest, pruneIfDue } from '@/lib/scanRecorder';
const { getQRCodeByShortId } = require('@/lib/db');

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

    // Ensure the destination is an absolute URL
    let destination = qrcode.destination_url;
    if (!destination.startsWith('http://') && !destination.startsWith('https://')) {
      destination = `https://${destination}`;
    }
    const response = NextResponse.redirect(new URL(destination), 302);

    // HEAD requests come from link checkers, not people scanning.
    if (request.method !== 'HEAD') {
      // Read the headers now; the request is finished by the time after() runs.
      const scan = {
        ip: getClientIp(request),
        userAgent: request.headers.get('user-agent'),
        acceptLanguage: request.headers.get('accept-language'),
      };
      after(async () => {
        try {
          await recordScanFromRequest(qrcode, scan);
        } catch (error) {
          console.error('Scan recording error:', error);
        }
        try {
          await pruneIfDue();
        } catch (error) {
          console.error('Scan retention error:', error);
        }
      });
    }

    return response;
  } catch (error) {
    console.error('Redirect error:', error);
    return unavailable(request, 'error');
  }
}
