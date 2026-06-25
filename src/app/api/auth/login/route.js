/**
 * POST /api/auth/login
 *
 * Authenticate an existing user.
 * Body: { email, password }
 */

import { verifyPassword, setAuthCookie } from '@/lib/auth';
import { rateLimit, isRateLimited, getClientIp } from '@/lib/rateLimit';
const { getUserByEmail } = require('@/lib/db');

// Brute-force throttle: count FAILED attempts only, per account and per IP, so a
// legitimate user is never locked out by their own successful logins.
const EMAIL_LIMIT = { limit: 5, windowMs: 15 * 60_000 };
const IP_LIMIT = { limit: 20, windowMs: 15 * 60_000 };

function tooManyAttempts(retryAfterSeconds) {
  return Response.json(
    { error: 'Too many login attempts. Please wait a few minutes and try again.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // ── Validation ──────────────────────────────
    if (!email || !password) {
      return Response.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // ── Rate-limit gate ─────────────────────────
    // Block before touching the DB / bcrypt if this IP or account has already
    // burned through its recent failed attempts. (Lookups are case-insensitive,
    // so the email key is normalized to match.)
    const ip = getClientIp(request);
    const ipKey = `login:ip:${ip}`;
    const emailKey = `login:email:${String(email).trim().toLowerCase()}`;
    const ipState = isRateLimited(ipKey, IP_LIMIT);
    const emailState = isRateLimited(emailKey, EMAIL_LIMIT);
    if (!ipState.ok || !emailState.ok) {
      return tooManyAttempts(Math.max(ipState.retryAfterSeconds, emailState.retryAfterSeconds));
    }

    const recordFailure = () => {
      rateLimit(ipKey, IP_LIMIT);
      rateLimit(emailKey, EMAIL_LIMIT);
    };

    // ── Look up user ────────────────────────────
    const user = await getUserByEmail(email);
    if (!user) {
      recordFailure();
      return Response.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // ── Verify password ─────────────────────────
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      recordFailure();
      return Response.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // ── Set auth cookie ─────────────────────────
    await setAuthCookie(user.id);

    return Response.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar ?? null,
    });
  } catch (error) {
    console.error('Login error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
