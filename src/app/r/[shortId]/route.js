/**
 * GET /r/[shortId]
 *
 * Public redirect route — no authentication required.
 * Looks up the QR code by shortId and redirects (302) to its destination,
 * worked out at the moment of the scan (lib/schedules.js). The scan is
 * recorded for analytics, with where it was sent, after the redirect has been
 * sent (see lib/scanRecorder.js), so recording never slows down or breaks a
 * scan.
 *
 * Codes that can't redirect send the visitor to /code-unavailable instead:
 * paused (the owner's account is disabled), not found, or a lookup error.
 * Paused scans aren't counted.
 *
 * Every answer is sent with `Cache-Control: no-store`: where a code goes can
 * change at any moment (a schedule starts, an account is enabled again), so no
 * browser or proxy may keep an old answer.
 *
 * NOTE: In Next.js 16, `params` is a Promise and must be awaited.
 */

import { NextResponse, after } from 'next/server';
import { getClientIp } from '@/lib/rateLimit';
import { recordScanFromRequest, pruneIfDue } from '@/lib/scanRecorder';
import { resolveDestination } from '@/lib/schedules';
const { getQRCodeByShortId } = require('@/lib/db');

function redirect(url) {
  const response = NextResponse.redirect(url, 302);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function unavailable(request, reason) {
  return redirect(new URL(`/code-unavailable?reason=${reason}`, request.url));
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

    // The main destination, or a schedule's while one is live. Schedules
    // aren't stored yet, so for now this is always the main destination.
    const { url, scheduleId } = resolveDestination({ mainUrl: qrcode.destination_url });

    // Ensure the destination is an absolute URL
    let destination = url;
    if (!destination.startsWith('http://') && !destination.startsWith('https://')) {
      destination = `https://${destination}`;
    }
    const response = redirect(new URL(destination));

    // HEAD requests come from link checkers, not people scanning.
    if (request.method !== 'HEAD') {
      // Read the headers now; the request is finished by the time after() runs.
      const scan = {
        ip: getClientIp(request),
        userAgent: request.headers.get('user-agent'),
        acceptLanguage: request.headers.get('accept-language'),
        // As stored (before https:// is added), so it matches the code's
        // destination history.
        destinationUrl: url,
        scheduleId,
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
