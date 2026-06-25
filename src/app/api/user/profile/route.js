/**
 * PUT /api/user/profile
 *
 * Update the current user's display name and avatar.
 * Body: { name, avatar }
 *
 * `avatar` may be:
 *   - null / "" to clear it (falls back to initials in the UI),
 *   - a preset path like "/avatars/aurora.svg",
 *   - a DiceBear preset URL (e.g. https://api.dicebear.com/10.x/lorelei/svg?seed=Felix), or
 *   - an uploaded image as a base64 data URL (size-capped).
 * Anything else (e.g. an arbitrary external URL) is rejected.
 */

import { getSession } from '@/lib/auth';
const { updateUserProfile } = require('@/lib/db');

// Preset avatars live in /public/avatars as static SVGs.
const PRESET_AVATAR_RE = /^\/avatars\/[a-z0-9-]+\.svg$/;
// Preset avatars served by the DiceBear HTTP API (host-locked for safety).
const DICEBEAR_AVATAR_RE = /^https:\/\/api\.dicebear\.com\/\d+\.x\/[a-z0-9-]+\/svg\?seed=[A-Za-z0-9._~%-]+$/;
// Uploaded images are stored inline as base64 data URLs.
const DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
// ~375 KB — comfortably fits a 256px avatar; guards the DB against huge blobs.
const MAX_AVATAR_LENGTH = 500_000;

function normalizeAvatar(avatar) {
  if (avatar === null || avatar === undefined || avatar === '') {
    return { ok: true, value: null };
  }
  if (typeof avatar !== 'string') {
    return { ok: false, error: 'Invalid profile picture' };
  }
  if (PRESET_AVATAR_RE.test(avatar) || DICEBEAR_AVATAR_RE.test(avatar)) {
    return { ok: true, value: avatar };
  }
  if (DATA_URL_RE.test(avatar)) {
    if (avatar.length > MAX_AVATAR_LENGTH) {
      return { ok: false, error: 'That image is too large — please choose a smaller one.' };
    }
    return { ok: true, value: avatar };
  }
  return { ok: false, error: 'Invalid profile picture' };
}

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
