/**
 * GET  /r/[shortId] — the public link in every code.
 * POST /r/[shortId] — the password page's form, for codes with a password.
 *
 * Public — no authentication required.
 *
 * GET looks up the QR code by shortId and redirects (302) to its destination,
 * worked out at the moment of the scan (lib/schedules.js). The scan is
 * recorded for analytics, with where it was sent, after the redirect has been
 * sent (see lib/scanRecorder.js), so recording never slows down or breaks a
 * scan.
 *
 * Email, phone and text message codes redirect straight to their mailto:,
 * tel: or sms: link in the phone browsers known to open those in the right
 * app (Safari, Chrome, Samsung Internet, Firefox, Edge; see lib/userAgent.js).
 * Anywhere else, and after the password page, they go to their action page
 * (/r/[shortId]/open), which has a button: in-app browsers don't reliably
 * follow a redirect to those links, but they always follow a tap. Static codes (Wi-Fi)
 * hold their content in the image and never use this link, so it answers
 * "not found" for them and never reveals anything about them.
 *
 * A code with a password sends people to its password page
 * (/r/[shortId]/unlock) instead, unless their browser entered the current
 * password in the last 30 days (a cookie, see lib/unlock.js). Each showing of
 * the page is noted for analytics (not for bots or HEAD requests); a scan is
 * only counted once someone gets through.
 *
 * POST takes the page's form (`password`, and `prompt`: the showing it came
 * from). Wrong passwords are rate-limited. With `Accept: application/json`
 * (the page's script) it answers in JSON: `{ url }` to go to, `{ redirect }`
 * when the code can't be opened, or `{ error: 'wrong' | 'limited' }`.
 * Without it (a browser posting the form before the script has loaded) it
 * redirects back to the page with `?error=`, or, on success, answers with a
 * page that moves on to the destination (for email, phone and text message
 * codes, their action page). That page can't be a redirect: the
 * site's `form-action 'self'` policy stops a form from redirecting to another
 * site.
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
import { getClientIp, rateLimit, isRateLimited } from '@/lib/rateLimit';
import { recordScanFromRequest, pruneIfDue } from '@/lib/scanRecorder';
import { resolveDestination } from '@/lib/schedules';
import { appLinkFor, getContentType, supportsSchedules } from '@/lib/contentTypes';
import { isSitePath, redirectToSitePath } from '@/lib/siteRedirect';
import { isBotUserAgent, opensAppLinks } from '@/lib/userAgent';
import {
  UNLOCK_COOKIE,
  UNLOCK_DEVICE_LIMIT,
  UNLOCK_IP_LIMIT,
  createUnlockToken,
  isUnlocked,
  passwordMatches,
  unlockCookieOptions,
  unlockLimitKeys,
  unlockPagePath,
} from '@/lib/unlock';
import {
  getQRCodeByShortId,
  getLiveCandidateSchedules,
  recordPasswordPrompt,
  markPasswordPromptUnlocked,
} from '@/lib/db';

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

function noStore(response) {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * A redirect: to a page on this site when `href` is a path ("/r/…"), sent as
 * just the path, or to another site (a code's destination). Same-site
 * redirects are never built from `request.url`: in a route handler it's the
 * server's own address (http://0.0.0.0:3000 behind Hostinger's proxy), not
 * the one the phone used (see lib/siteRedirect.js).
 */
function redirect(href) {
  return noStore(isSitePath(href) ? redirectToSitePath(href) : NextResponse.redirect(href, 302));
}

function unavailablePath(reason) {
  return `/code-unavailable?reason=${reason}`;
}

function unavailable(reason) {
  return redirect(unavailablePath(reason));
}

/**
 * Where a scan of this code goes now: `url` as stored (it matches the code's
 * destination history), the schedule sending it there (null for the main
 * destination), and `href`, where to send the browser: an absolute URL, or
 * for an action page the path on this site ("/r/…/open"). Only
 * website codes have schedules.
 *
 * Email, phone and text message codes go straight to their mailto:, tel: or
 * sms: link (rebuilt from its checked fields) when `appLinks` is set: a scan
 * in a phone browser known to open those (opensAppLinks in lib/userAgent.js).
 * Otherwise, and after the password page, they go to their action page with
 * its button, which reads and checks the destination itself.
 *
 * Anything else gets https:// in front unless it starts with http(s)://, so
 * a redirect can only ever go to a web link (a bad row fails to parse
 * instead).
 */
async function destinationFor(qrcode, { appLinks = false } = {}) {
  const type = getContentType(qrcode.content_type);
  const schedules = supportsSchedules(type.id) ? await loadSchedules(qrcode.id) : [];
  const { url, scheduleId } = resolveDestination({ mainUrl: qrcode.destination_url, schedules });
  if (type.kind === 'action') {
    const appLink = appLinks ? appLinkFor(type.id, url) : null;
    return { url, scheduleId, href: appLink ?? `/r/${encodeURIComponent(qrcode.short_id)}/open` };
  }
  const absolute = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return { url, scheduleId, href: new URL(absolute).href };
}

/** Static codes (Wi-Fi) hold their content in the image and never use their link. */
function isStaticCode(qrcode) {
  return getContentType(qrcode.content_type).kind === 'static';
}

/**
 * Record the scan once the response has gone. `promptId` is the showing of
 * the password page it came through, if any. Never called for HEAD requests:
 * they come from link checkers, not people scanning.
 */
function recordScanLater(request, qrcode, { url, scheduleId }, promptId = null) {
  // Read the headers now; the request is finished by the time after() runs.
  const scan = {
    ip: getClientIp(request),
    userAgent: request.headers.get('user-agent'),
    acceptLanguage: request.headers.get('accept-language'),
    destinationUrl: url,
    scheduleId,
  };
  after(async () => {
    if (promptId) {
      try {
        await markPasswordPromptUnlocked(promptId, qrcode.id);
      } catch (error) {
        console.error('Password prompt recording error:', error);
      }
    }
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

/**
 * Send someone to the code's password page. The showing is noted first (for
 * people, not bots or HEAD requests), so a right answer can be matched to it;
 * if that fails, the page still works and just isn't counted.
 */
async function askForPassword(request, qrcode) {
  let promptId = null;
  if (request.method !== 'HEAD' && !isBotUserAgent(request.headers.get('user-agent'))) {
    try {
      promptId = await recordPasswordPrompt({ qrcodeId: qrcode.id, userId: qrcode.user_id });
    } catch (error) {
      console.error('Password prompt recording error:', error);
    }
  }
  return redirect(unlockPagePath(qrcode.short_id, { promptId }));
}

export async function GET(request, { params }) {
  try {
    const { shortId } = await params;

    const qrcode = await getQRCodeByShortId(shortId);
    if (!qrcode || isStaticCode(qrcode)) {
      return unavailable('not-found');
    }

    if (qrcode.owner_disabled_at) {
      return unavailable('inactive');
    }

    if (qrcode.access_password && !(await isUnlocked(request.cookies.get(UNLOCK_COOKIE)?.value, qrcode))) {
      return askForPassword(request, qrcode);
    }

    // The main destination, or a schedule's while one is live. Email, phone
    // and text message codes go straight to the app in phone browsers that
    // open those links, and to the action page with its button elsewhere.
    const destination = await destinationFor(qrcode, {
      appLinks: opensAppLinks(request.headers.get('user-agent')),
    });
    const response = redirect(destination.href);
    if (request.method !== 'HEAD') recordScanLater(request, qrcode, destination);
    return response;
  } catch (error) {
    console.error('Redirect error:', error);
    return unavailable('error');
  }
}

// ── POST — the password page's form ────────────

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** For a form posted without the page's script: a page that moves on to `href`. */
function continuePage(href) {
  const url = escapeHtml(href);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${url}">
<title>Opening… — QR Go</title>
</head>
<body style="margin:0;padding:64px 16px;background:#0a0a1a;color:#e2e8f0;font-family:system-ui,sans-serif;text-align:center">
<p>Opening the page…</p>
<p><a href="${url}" style="color:#00d4ff">Continue</a></p>
</body>
</html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** A positive whole number from the form, or null. */
function promptIdFrom(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function POST(request, { params }) {
  const json = (request.headers.get('accept') ?? '').includes('application/json');

  // A refusal: JSON for the page's script, or a redirect back for a plain form.
  const refuse = ({ status, body, location, headers }) =>
    noStore(
      json
        ? NextResponse.json(body, { status, headers })
        : redirectToSitePath(location, 303)
    );

  try {
    const { shortId } = await params;
    const form = await request.formData().catch(() => null);
    const given = form?.get('password');
    const promptId = promptIdFrom(form?.get('prompt'));

    let qrcode = await getQRCodeByShortId(shortId);
    if (qrcode && isStaticCode(qrcode)) qrcode = null;
    if (!qrcode || qrcode.owner_disabled_at) {
      const location = unavailablePath(qrcode ? 'inactive' : 'not-found');
      return refuse({ status: qrcode ? 403 : 404, body: { error: 'unavailable', redirect: location }, location });
    }

    // Count only wrong answers, and check the limit before comparing, so
    // even the right password has to wait once it's reached.
    if (qrcode.access_password) {
      const ip = getClientIp(request);
      const { deviceKey, ipKey } = unlockLimitKeys(ip, request.headers.get('user-agent'), qrcode.id);
      const deviceState = isRateLimited(deviceKey, UNLOCK_DEVICE_LIMIT);
      const ipState = isRateLimited(ipKey, UNLOCK_IP_LIMIT);
      if (!deviceState.ok || !ipState.ok) {
        const retryAfterSeconds = Math.max(deviceState.retryAfterSeconds, ipState.retryAfterSeconds);
        return refuse({
          status: 429,
          body: { error: 'limited', retryAfterSeconds },
          headers: { 'Retry-After': String(retryAfterSeconds) },
          location: unlockPagePath(qrcode.short_id, { promptId, error: 'limited' }),
        });
      }

      if (!passwordMatches(given, qrcode.access_password)) {
        rateLimit(deviceKey, UNLOCK_DEVICE_LIMIT);
        rateLimit(ipKey, UNLOCK_IP_LIMIT);
        return refuse({
          status: 401,
          body: { error: 'wrong' },
          location: unlockPagePath(qrcode.short_id, { promptId, error: 'wrong' }),
        });
      }
    }

    // The right password, or the code no longer has one (it was removed while
    // the page was open): send them on, and remember it for next time.
    const destination = await destinationFor(qrcode);
    const response = noStore(json ? NextResponse.json({ url: destination.href }) : continuePage(destination.href));
    if (qrcode.access_password) {
      response.cookies.set(UNLOCK_COOKIE, await createUnlockToken(qrcode), unlockCookieOptions(qrcode.short_id));
    }
    recordScanLater(request, qrcode, destination, promptId);
    return response;
  } catch (error) {
    console.error('Password check error:', error);
    const location = unavailablePath('error');
    return refuse({ status: 500, body: { error: 'unavailable', redirect: location }, location });
  }
}
