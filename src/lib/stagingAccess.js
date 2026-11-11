/**
 * The staging site's sign-in gate.
 *
 * When STAGING_PASSWORD is set (only on the staging app, never on
 * production), every page and API route asks for that password first (see
 * src/proxy.js). The right password gives the browser a cookie that lets it
 * in for STAGING_ACCESS_DAYS. The cookie holds a signed token whose key comes
 * from JWT_SECRET and the password, so changing the password signs everyone
 * out.
 *
 * Used by the proxy, so this file must stay free of database imports.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { getJwtSecret } from './token.js';

export const STAGING_COOKIE = 'qr-staging-access';
export const STAGING_ACCESS_DAYS = 30;
const STAGING_ACCESS_SECONDS = STAGING_ACCESS_DAYS * 24 * 60 * 60;

/** The sign-in page, and the form's endpoint. */
export const STAGING_ACCESS_PAGE = '/staging-access';
export const STAGING_ACCESS_API = '/api/staging-access';

// Wrong passwords per connection, like failed logins.
export const STAGING_LIMIT = { limit: 10, windowMs: 15 * 60_000 };

// Reachable without the password: the sign-in page and its form, robots.txt
// (it tells search engines to stay away) and the icons the page shows.
const OPEN_PATHS = new Set([
  STAGING_ACCESS_PAGE,
  STAGING_ACCESS_API,
  '/robots.txt',
  '/favicon.ico',
  '/icon.png',
  '/apple-icon.png',
]);

/** The staging password, or null when this isn't the staging site. */
export function stagingPassword(env = process.env) {
  const value = (env.STAGING_PASSWORD ?? '').trim();
  return value === '' ? null : value;
}

/** Can this path be opened on staging without the password? */
export function isOpenOnStaging(pathname) {
  return OPEN_PATHS.has(pathname);
}

/**
 * Where to go after signing in: a path on this site, or "/". Anything that
 * could lead to another site ("//evil.example", "https://…", backslashes) or
 * back to the sign-in page becomes "/".
 */
export function safeNextPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return '/';
  const { pathname } = new URL(value, 'http://staging.invalid');
  if (pathname === STAGING_ACCESS_PAGE || pathname === STAGING_ACCESS_API) return '/';
  return value;
}

/** The sign-in page, remembering where the visitor was going. */
export function stagingAccessPath(next = '/', error = null) {
  const query = new URLSearchParams();
  const target = safeNextPath(next);
  if (target !== '/') query.set('next', target);
  if (error) query.set('error', error);
  const qs = query.toString();
  return `${STAGING_ACCESS_PAGE}${qs ? `?${qs}` : ''}`;
}

/** Compared in constant time; spaces at either end don't count. */
export function stagingPasswordMatches(given, password) {
  if (typeof given !== 'string' || typeof password !== 'string' || password === '') return false;
  const a = createHash('sha256').update(given.trim()).digest();
  const b = createHash('sha256').update(password).digest();
  return timingSafeEqual(a, b);
}

/** Changes with the password, so a new password signs everyone out. */
function signingKey(password) {
  return createHash('sha256')
    .update(getJwtSecret())
    .update('\nqr-go staging access v1\n')
    .update(password)
    .digest();
}

/** Options for the cookie set when someone signs in. */
export function stagingCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // sent when a scanned code opens the site
    path: '/',
    maxAge: STAGING_ACCESS_SECONDS,
  };
}

export async function createStagingToken(password, { nowMs = Date.now() } = {}) {
  const now = Math.floor(nowMs / 1000);
  return new SignJWT({ staging: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + STAGING_ACCESS_SECONDS)
    .sign(signingKey(password));
}

/** Is `token` (the cookie's value) a current pass for this password? */
export async function hasStagingAccess(token, password, { nowMs = Date.now() } = {}) {
  if (!token || !password) return false;
  try {
    const { payload } = await jwtVerify(token, signingKey(password), {
      algorithms: ['HS256'],
      currentDate: new Date(nowMs),
    });
    return payload.staging === true;
  } catch {
    return false;
  }
}
