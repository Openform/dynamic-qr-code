/**
 * JWT helpers (jose, HS256).
 *
 * Kept separate from lib/auth.js so the proxy can verify tokens without
 * pulling in cookies() or the database.
 */

import { SignJWT, jwtVerify } from 'jose';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
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
