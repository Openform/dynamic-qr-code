/**
 * POST /api/staging-access — the staging sign-in form (see lib/stagingAccess.js).
 *
 * Only exists on the staging site (STAGING_PASSWORD set); 404 elsewhere.
 * Form fields: `password`, and `next`, the page to go on to. Wrong passwords
 * are rate-limited per connection.
 *
 * With `Accept: application/json` (the page's script) it answers in JSON:
 * `{ next }` on success, or `{ error: 'wrong' | 'limited' }`. Without it (the
 * form posted before the script loaded) it redirects back to the page with
 * `?error=`, or on success answers with a page that moves on. That can't be a
 * redirect: `next` may be a code's link, which redirects to another site, and
 * the site's `form-action 'self'` policy stops a form from ending up there.
 */

import { NextResponse } from 'next/server';
import { redirectToSitePath } from '@/lib/siteRedirect';
import { getClientIp, isRateLimited, rateLimit } from '@/lib/rateLimit';
import {
  STAGING_COOKIE,
  STAGING_LIMIT,
  createStagingToken,
  safeNextPath,
  stagingAccessPath,
  stagingCookieOptions,
  stagingPassword,
  stagingPasswordMatches,
} from '@/lib/stagingAccess';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** For a form posted without the page's script: a page that moves on to `path`. */
function continuePage(path) {
  const url = escapeHtml(path);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${url}">
<title>Opening… — QR Go staging</title>
</head>
<body style="margin:0;padding:64px 16px;background:#0a0a1a;color:#e2e8f0;font-family:system-ui,sans-serif;text-align:center">
<p>Opening the page…</p>
<p><a href="${url}" style="color:#00d4ff">Continue</a></p>
</body>
</html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function noStore(response) {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request) {
  const password = stagingPassword();
  if (!password) return Response.json({ error: 'Not found' }, { status: 404 });

  const json = (request.headers.get('accept') ?? '').includes('application/json');
  const form = await request.formData().catch(() => null);
  const given = form?.get('password');
  const next = safeNextPath(form?.get('next'));

  const refuse = (status, error, headers) =>
    noStore(
      json
        ? NextResponse.json({ error }, { status, headers })
        : // Relative: request.url is the server's own address (lib/siteRedirect.js).
          redirectToSitePath(stagingAccessPath(next, error), 303)
    );

  // Count only wrong answers, and check the limit first, so even the right
  // password has to wait once it's reached.
  const key = `staging-access:ip:${getClientIp(request)}`;
  const state = isRateLimited(key, STAGING_LIMIT);
  if (!state.ok) {
    return refuse(429, 'limited', { 'Retry-After': String(state.retryAfterSeconds) });
  }
  if (!stagingPasswordMatches(given, password)) {
    rateLimit(key, STAGING_LIMIT);
    return refuse(401, 'wrong');
  }

  const response = noStore(json ? NextResponse.json({ next }) : continuePage(next));
  response.cookies.set(STAGING_COOKIE, await createStagingToken(password), stagingCookieOptions());
  return response;
}
