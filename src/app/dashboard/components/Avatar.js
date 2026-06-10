'use client';

/**
 * Circular avatar. Renders the user's image (preset path or uploaded data URL)
 * when present, otherwise a gradient circle with the first initial.
 */
export default function Avatar({ src, name, size = 40 }) {
  const initial = (name || '').trim().charAt(0).toUpperCase() || '?';

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
      {src ? (
        // Plain <img>: avatars are user-supplied data URLs / static SVGs, which
        // next/image does not optimize anyway.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
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
