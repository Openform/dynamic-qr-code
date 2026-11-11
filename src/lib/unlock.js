/**
 * Server side of password-protected codes: checking the password someone
 * types on the password page, and the cookie that lets their browser skip the
 * page for the next UNLOCK_DAYS.
 *
 * The cookie holds a signed token (jose, HS256) naming the code and a keyed
 * fingerprint of its password, so it stops working as soon as the owner
 * changes or removes the password. The signing key is derived from
 * JWT_SECRET, so an unlock token can never pass for a sign-in token or the
 * other way round. Each code's cookie is limited to that code's /r/ path.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { getJwtSecret } from './token';

export const UNLOCK_COOKIE = 'qr-unlock';
export const UNLOCK_DAYS = 30;
const UNLOCK_SECONDS = UNLOCK_DAYS * 24 * 60 * 60;

// Wrong passwords are throttled like failed logins: only failures count. Per
// device (connection + browser) on one code, so one person's typos don't lock
// out everyone else on the same Wi-Fi; and per connection across every code,
// so changing the browser name doesn't buy more guesses.
export const UNLOCK_DEVICE_LIMIT = { limit: 10, windowMs: 15 * 60_000 };
export const UNLOCK_IP_LIMIT = { limit: 50, windowMs: 15 * 60_000 };

function unlockKey() {
  return createHmac('sha256', getJwtSecret()).update('qr-go code unlock v1').digest();
}

/** Who is guessing, for the rate limiter (kept in memory only, never stored). */
export function unlockLimitKeys(ip, userAgent, codeId) {
  const device = createHash('sha256').update(`${ip}\n${userAgent ?? ''}`).digest('hex').slice(0, 16);
  return {
    deviceKey: `unlock:device:${device}:${codeId}`,
    ipKey: `unlock:ip:${ip}`,
  };
}

/** The path a code's cookie is limited to: its public link. */
export function unlockCookiePath(shortId) {
  return `/r/${encodeURIComponent(shortId)}`;
}

/** Options for cookies.set() when someone gets a code's password right. */
export function unlockCookieOptions(shortId) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // sent when a scan opens the link
    path: unlockCookiePath(shortId),
    maxAge: UNLOCK_SECONDS,
  };
}

/** The password page for a code, e.g. "/r/abc/unlock?p=12&error=wrong". */
export function unlockPagePath(shortId, { promptId = null, error = null } = {}) {
  const query = new URLSearchParams();
  if (promptId) query.set('p', String(promptId));
  if (error) query.set('error', error);
  const qs = query.toString();
  return `${unlockCookiePath(shortId)}/unlock${qs ? `?${qs}` : ''}`;
}

/**
 * Does what was typed match the code's password? Spaces at either end are
 * ignored (they're dropped when the password is saved too). Compared in
 * constant time.
 */
export function passwordMatches(given, stored) {
  if (typeof given !== 'string' || typeof stored !== 'string' || stored === '') return false;
  const a = createHash('sha256').update(given.trim()).digest();
  const b = createHash('sha256').update(stored).digest();
  return timingSafeEqual(a, b);
}

/** Changes whenever the code's password does; can't be reversed without the key. */
function fingerprint(code) {
  return createHmac('sha256', unlockKey())
    .update(`${code.id}\n${code.access_password}`)
    .digest('base64url')
    .slice(0, 22);
}

/** A token for the cookie, for `code` (a qrcodes row with a password). */
export async function createUnlockToken(code, { nowMs = Date.now() } = {}) {
  const now = Math.floor(nowMs / 1000);
  return new SignJWT({ code: code.id, pw: fingerprint(code) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + UNLOCK_SECONDS)
    .sign(unlockKey());
}

/**
 * Has this browser already entered the code's current password? `token` is
 * the cookie's value (or undefined). False for a missing, expired or tampered
 * token, or one from before the password changed.
 */
export async function isUnlocked(token, code, { nowMs = Date.now() } = {}) {
  if (!token || !code?.access_password) return false;
  try {
    const { payload } = await jwtVerify(token, unlockKey(), {
      algorithms: ['HS256'],
      currentDate: new Date(nowMs),
    });
    return payload.code === code.id && payload.pw === fingerprint(code);
  } catch {
    return false;
  }
}
