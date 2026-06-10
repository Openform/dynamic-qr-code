/**
 * POST /api/auth/register
 *
 * Create a new user account. Registration is invite-only — the caller must
 * supply the shared invite code (SIGNUP_INVITE_CODE).
 * Body: { email, password, name, inviteCode }
 */

import { hashPassword, setAuthCookie, verifyInviteCode } from '@/lib/auth';
const { getUserByEmail, createUser } = require('@/lib/db');

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password, name, inviteCode } = body;

    // ── Invite-only gate ────────────────────────
    // The site is restricted to our team for now: creating an account requires
    // the shared invite code. Checked before any DB lookup or password hashing
    // so the endpoint can't be used to probe for existing emails or burn CPU.
    if (!verifyInviteCode(inviteCode)) {
      if (!process.env.SIGNUP_INVITE_CODE) {
        console.error(
          'SIGNUP_INVITE_CODE is not set — registration is disabled for everyone.'
        );
      }
      return Response.json(
        { error: 'A valid invite code is required to create an account.' },
        { status: 403 }
      );
    }

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
      { id: user.id, email: user.email, name: user.name, avatar: user.avatar ?? null },
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
