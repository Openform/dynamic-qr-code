/**
 * Profile pictures: the preset avatars people can pick in Settings, what the
 * profile API accepts, and what an avatar <img> is allowed to load.
 *
 * Shared by the API and the UI (components/Avatar.js, the Settings page), so
 * this file must stay free of server-only imports.
 *
 * The presets are DiceBear "Lorelei" avatars, saved as static SVGs in
 * public/avatars (see the README there; `node scripts/generate-avatars.mjs`
 * makes them). QR Go doesn't call a third-party service for them, for privacy
 * and security.
 */

// The DiceBear seeds of the presets, in the order Settings shows them. Each
// seed always draws the same face. Before the presets were served from QR Go,
// picking one saved its DiceBear API URL (see LEGACY_DICEBEAR_PREFIX).
const PRESET_SEEDS = ['Felix', 'Aneka', 'Jude', 'Miya', 'Milo', 'Luna', 'Sophie', 'mqq401q4', 'rlnap45o'];

/** `[{ seed, src }]`, where `src` is the preset's path under public/. */
export const PRESET_AVATARS = PRESET_SEEDS.map((seed) => ({
  seed,
  src: `/avatars/lorelei-${seed.toLowerCase()}.svg`,
}));

// What Settings saved for a preset until the presets were served from QR Go.
// Accounts that picked one then still have this URL, plus the seed, stored.
const LEGACY_DICEBEAR_PREFIX = 'https://api.dicebear.com/10.x/lorelei/svg?seed=';

const LEGACY_TO_LOCAL = new Map(PRESET_AVATARS.map(({ seed, src }) => [`${LEGACY_DICEBEAR_PREFIX}${seed}`, src]));

/**
 * The preset's local path for a stored DiceBear preset URL, or the avatar
 * unchanged if it isn't exactly one of those. Same picture, served by QR Go.
 */
export function localAvatar(avatar) {
  return (typeof avatar === 'string' && LEGACY_TO_LOCAL.get(avatar)) || avatar;
}

// Preset avatars live in /public/avatars as static SVGs: today's Lorelei
// presets, and the gradient ones (aurora.svg and so on) offered before them,
// which some accounts still use.
const PRESET_PATH_RE = /^\/avatars\/[a-z0-9-]+\.svg$/;
// Uploaded images are stored inline as base64 data URLs.
const DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
// ~375 KB — comfortably fits a 256px avatar; guards the DB against huge blobs.
export const MAX_AVATAR_LENGTH = 500_000;

/**
 * What an avatar <img> should load for a stored avatar, or null to show the
 * person's initial instead. Only pictures QR Go serves itself (a preset path,
 * including a stored DiceBear preset URL mapped to its local file) and
 * uploaded data URLs are shown, so no avatar ever makes the browser contact
 * another site.
 */
export function avatarImageSrc(avatar) {
  const value = localAvatar(avatar);
  if (typeof value !== 'string') return null;
  if (PRESET_PATH_RE.test(value) || DATA_URL_RE.test(value)) return value;
  return null;
}

/**
 * Check a profile picture sent to PUT /api/user/profile. `{ ok: true, value }`
 * with what to store, or `{ ok: false, error }`. `avatar` may be:
 *   - null / "" to clear it (the UI falls back to the initial),
 *   - a preset path like "/avatars/lorelei-felix.svg",
 *   - a DiceBear preset URL, as Settings sent before the presets were served
 *     from QR Go (a page left open since then still does), stored as the
 *     preset's local path, or
 *   - an uploaded image as a base64 data URL (size-capped).
 * Anything else, such as any other external URL, is rejected.
 */
export function normalizeAvatar(avatar) {
  if (avatar === null || avatar === undefined || avatar === '') {
    return { ok: true, value: null };
  }
  if (typeof avatar !== 'string') {
    return { ok: false, error: 'Invalid profile picture' };
  }
  const value = localAvatar(avatar);
  if (PRESET_PATH_RE.test(value)) {
    return { ok: true, value };
  }
  if (DATA_URL_RE.test(value)) {
    if (value.length > MAX_AVATAR_LENGTH) {
      return { ok: false, error: 'That image is too large — please choose a smaller one.' };
    }
    return { ok: true, value };
  }
  return { ok: false, error: 'Invalid profile picture' };
}
