/**
 * POST /api/auth/register
 *
 * Create a new user account.
 * Body: { email, password, name }
 */

import { hashPassword, setAuthCookie } from '@/lib/auth';
const { getUserByEmail, createUser } = require('@/lib/db');

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    // ── Validation ──────────────────────────────
    if (!email || !password || !name) {
      return Response.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    if (typeof email !== 'string' || !email.includes('@')) {
      return Response.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return Response.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // ── Check for existing user ─────────────────
    const existing = await getUserByEmail(email);
    if (existing) {
      return Response.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // ── Create user ─────────────────────────────
    const passwordHash = await hashPassword(password);
    const user = await createUser(email, passwordHash, name);

    // ── Set auth cookie ─────────────────────────
    await setAuthCookie(user.id);

    return Response.json(
      { id: user.id, email: user.email, name: user.name },
      { status: 201 }
    );
  } catch (error) {
    console.error('Register error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
