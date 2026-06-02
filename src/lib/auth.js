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

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);
const COOKIE_NAME = 'qr-auth-token';

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
 * Create a signed JWT for the given userId (HS256, 7-day expiry).
 */
export async function createToken(userId) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

/**
 * Verify and decode a JWT. Returns the payload or null on failure.
 */
export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
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
