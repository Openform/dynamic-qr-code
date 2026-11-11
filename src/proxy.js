/**
 * Proxy – runs before every page and API route.
 *
 * 1. Signed-in areas: /dashboard, /admin, /api/qrcodes, /api/analytics and
 *    /api/admin need a valid sign-in token. Public routes (/, /login,
 *    /register, /r/:shortId, /api/auth/*) are allowed through without one.
 *
 *    This only checks that the visitor has a valid token. Whether their
 *    account is still active is checked by getSession() (lib/auth.js), and
 *    whether they're an admin by the admin page and admin API routes
 *    (lib/admin.js).
 *
 * 2. The staging site: when STAGING_PASSWORD is set, every page and API
 *    route first needs the staging password (lib/stagingAccess.js), and every
 *    answer tells search engines not to index it. Production doesn't set it,
 *    so there this step does nothing.
 *
 * Next's own files (/_next/…: scripts, styles, fonts) never come here.
 */

import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getJwtSecret } from './lib/token.js';
import {
  STAGING_COOKIE,
  hasStagingAccess,
  isOpenOnStaging,
  stagingAccessPath,
  stagingPassword,
} from './lib/stagingAccess.js';

const COOKIE_NAME = 'qr-auth-token';

// Each covers the path itself and everything below it.
const SIGNED_IN_PATHS = ['/dashboard', '/admin', '/api/qrcodes', '/api/analytics', '/api/admin'];

function needsSignIn(pathname) {
  return SIGNED_IN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isApi(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export async function proxy(request) {
  const password = stagingPassword();
  const response = (password && (await stagingGate(request, password))) || (await checkSignIn(request));
  if (password) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

/**
 * On staging: the sign-in page (or a 401 for API routes) unless this browser
 * has the staging password. Returns null to let the request through.
 */
async function stagingGate(request, password) {
  const { pathname, search } = request.nextUrl;
  if (isOpenOnStaging(pathname)) return null;
  if (await hasStagingAccess(request.cookies.get(STAGING_COOKIE)?.value, password)) return null;

  if (isApi(pathname)) {
    return Response.json({ error: 'Staging access required' }, { status: 401 });
  }
  return NextResponse.redirect(new URL(stagingAccessPath(pathname + search), request.url));
}

/** Signed-in areas need a valid sign-in token; everything else goes through. */
async function checkSignIn(request) {
  if (!needsSignIn(request.nextUrl.pathname)) return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return denyAccess(request);
  }

  try {
    await jwtVerify(token, getJwtSecret());
    return NextResponse.next();
  } catch {
    return denyAccess(request);
  }
}

/**
 * Redirect browser requests to /login; return 401 JSON for API requests.
 */
function denyAccess(request) {
  if (isApi(request.nextUrl.pathname)) {
    return Response.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except Next's own files. Signed-in areas are picked out in
  // needsSignIn(), since the staging gate has to see every other request too.
  matcher: ['/((?!_next/).*)'],
};
