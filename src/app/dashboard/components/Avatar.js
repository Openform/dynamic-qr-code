'use client';

import { avatarImageSrc } from '@/lib/avatars';

/**
 * Circular avatar. Renders the user's image (preset path or uploaded data URL)
 * when present, otherwise a gradient circle with the first initial.
 *
 * `src` is the avatar as stored. A DiceBear preset URL saved before the
 * presets were served from QR Go shows the same preset from /avatars, and
 * anything else that isn't QR Go's own (see avatarImageSrc) shows the initial,
 * so an avatar never makes the browser contact another site.
 */
export default function Avatar({ src, name, size = 40 }) {
  const initial = (name || '').trim().charAt(0).toUpperCase() || '?';
  const imageSrc = avatarImageSrc(src);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--gradient-primary)',
        color: 'var(--text-inverse)',
        fontWeight: 700,
        fontSize: Math.round(size * 0.42),
        lineHeight: 1,
        border: '1px solid var(--glass-border)',
        userSelect: 'none',
      }}
    >
      {imageSrc ? (
        // Plain <img>: avatars are user-supplied data URLs / static SVGs, which
        // next/image does not optimize anyway.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt=""
          width={size}
          height={size}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        initial
      )}
    </div>
  );
}
