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
 * Email, phone and text message codes go to their action page instead
 * (/r/[shortId]/open), which has a button that opens the mail, phone or
 * messages app: browsers don't reliably follow a redirect straight to a
 * mailto:, tel: or sms: link, but they do follow a tap. Static codes (Wi-Fi)
 * hold their content in the image and never use this link, so it answers
 * "not found" for them and never reveals anything about them.
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
import { getContentType, supportsSchedules } from '@/lib/contentTypes';
const { getQRCodeByShortId, getLiveCandidateSchedules } = require('@/lib/db');

/**
 * The code's schedules that could be live. If they can't be loaded, the scan
 * still goes to the main destination rather than failing.
 */
async function loadSchedules(qrcodeId) {
  try {
    return await getLiveCandidateSchedules(qrcodeId);
  } catch (error) {
    console.error('Schedule lookup error:', error);
    return [];
  }
}

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

    const type = getContentType(qrcode.content_type);
    if (type.kind === 'static') {
      return unavailable(request, 'not-found');
    }

    if (qrcode.owner_disabled_at) {
      return unavailable(request, 'inactive');
    }

    // The main destination, or a schedule's while one is live. Only website
    // codes can have schedules.
    const schedules = supportsSchedules(type.id) ? await loadSchedules(qrcode.id) : [];
    const { url, scheduleId } = resolveDestination({ mainUrl: qrcode.destination_url, schedules });

    let response;
    if (type.kind === 'action') {
      // The action page reads and checks the destination itself.
      response = redirect(new URL(`/r/${encodeURIComponent(qrcode.short_id)}/open`, request.url));
    } else {
      // Ensure the destination is an absolute URL. Anything that doesn't
      // start with http(s):// gets https:// in front, so a redirect can only
      // ever go to a web link (a bad row fails to parse and shows the error
      // page instead).
      let destination = url;
      if (!/^https?:\/\//i.test(destination)) {
        destination = `https://${destination}`;
      }
      response = redirect(new URL(destination));
    }

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
