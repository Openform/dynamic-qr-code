/**
 * Authentication helpers for the QR code generator.
 *
 * - Password hashing via bcryptjs
 * - JWT creation / verification via jose (HS256)
 * - Session cookie management (Next.js 16 async cookies())
 */

import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'qr-auth-token';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Hash a plaintext password with bcrypt (salt rounds = 12).
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Validate a registration invite code against the SIGNUP_INVITE_CODE env var
 * using a constant-time comparison.
 *
 * Registration is invite-only. Returns false when the code is missing, the
 * wrong value/length, or when SIGNUP_INVITE_CODE is unset — i.e. it fails
 * closed, so a misconfigured deployment blocks all sign-ups rather than
 * letting everyone in.
 */
export function verifyInviteCode(provided) {
  const expected = process.env.SIGNUP_INVITE_CODE;
  if (!expected || typeof provided !== 'string' || provided.length === 0) {
    return false;
  }

  const expectedBytes = new TextEncoder().encode(expected);
  const providedBytes = new TextEncoder().encode(provided);

  // timingSafeEqual requires equal-length inputs; a differing length is simply
  // a mismatch (the length of a shared invite code is not itself a secret).
  if (expectedBytes.length !== providedBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, providedBytes);
}

/**
 * Create a signed JWT for the given userId (HS256, 7-day expiry).
 */
export async function createToken(userId) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

/**
 * Verify and decode a JWT. Returns the payload or null on failure.
 */
export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload;
  } catch {
    return null;
  }
}

/**
 * Read the current session from the auth cookie.
 * Returns { userId } if authenticated, or null.
 */
export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload?.userId) return null;

  return { userId: payload.userId };
}

/**
 * Create a JWT and store it in an httpOnly cookie (7-day maxAge).
 */
export async function setAuthCookie(userId) {
  const token = await createToken(userId);
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
  });
}

/**
 * Delete the auth cookie to log the user out.
 */
export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
