/**
 * PUT /api/user/password
 *
 * Change the current user's password. Requires the existing password.
 * Body: { currentPassword, newPassword }
 */

import { getSession, verifyPassword, hashPassword } from '@/lib/auth';
const { getUserById, updateUserPassword } = require('@/lib/db');

export async function PUT(request) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    // ── Validation ──────────────────────────────
    if (!currentPassword || !newPassword) {
      return Response.json(
        { error: 'Current and new password are required' },
        { status: 400 }
      );
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return Response.json(
        { error: 'New password must be at least 6 characters' },
        { status: 400 }
      );
    }
    if (newPassword === currentPassword) {
      return Response.json(
        { error: 'New password must be different from the current one' },
        { status: 400 }
      );
    }

    // ── Verify current password ─────────────────
    const user = await getUserById(session.userId);
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 401 });
    }

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      return Response.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    // ── Update ──────────────────────────────────
    const newHash = await hashPassword(newPassword);
    await updateUserPassword(session.userId, newHash);

    return Response.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Update password error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
