/**
 * POST /api/auth/login
 *
 * Authenticate an existing user.
 * Body: { email, password }
 */

import { verifyPassword, setAuthCookie } from '@/lib/auth';
const { getUserByEmail } = require('@/lib/db');

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

    // ── Look up user ────────────────────────────
    const user = getUserByEmail(email);
    if (!user) {
      return Response.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // ── Verify password ─────────────────────────
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
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
    });
  } catch (error) {
    console.error('Login error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
