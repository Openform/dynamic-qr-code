/**
 * PUT /api/user/profile
 *
 * Update the current user's display name and avatar.
 * Body: { name, avatar }
 *
 * `avatar` may be null / "" (no picture), a preset path like
 * "/avatars/lorelei-felix.svg", or an uploaded image as a base64 data URL.
 * A DiceBear preset URL (what Settings sent before the presets were served
 * from QR Go) is stored as the preset's local path. Anything else is rejected;
 * see normalizeAvatar in lib/avatars.js.
 */

import { getSession } from '@/lib/auth';
import { normalizeAvatar } from '@/lib/avatars';
const { updateUserProfile } = require('@/lib/db');

export async function PUT(request) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { name, avatar } = body;

    // ── Validate name ───────────────────────────
    if (typeof name !== 'string' || name.trim().length === 0) {
      return Response.json({ error: 'Name is required' }, { status: 400 });
    }
    const trimmedName = name.trim();
    if (trimmedName.length > 255) {
      return Response.json({ error: 'Name is too long (max 255 characters)' }, { status: 400 });
    }

    // ── Validate avatar ─────────────────────────
    const normalized = normalizeAvatar(avatar);
    if (!normalized.ok) {
      return Response.json({ error: normalized.error }, { status: 400 });
    }

    const user = await updateUserProfile(session.userId, {
      name: trimmedName,
      avatar: normalized.value,
    });
    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    return Response.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar ?? null,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
