/**
 * Profile pictures (lib/avatars.js): the preset avatars are QR Go's own files,
 * DiceBear preset URLs stored before that show and save as those files, and
 * no avatar makes the browser contact another site.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Avatar from '../../app/dashboard/components/Avatar';
import { MAX_AVATAR_LENGTH, PRESET_AVATARS, avatarImageSrc, localAvatar, normalizeAvatar } from '../avatars';

const ROOT = join(__dirname, '..', '..', '..');
const SEEDS = ['Felix', 'Aneka', 'Jude', 'Miya', 'Milo', 'Luna', 'Sophie', 'mqq401q4', 'rlnap45o'];
const dicebear = (seed) => `https://api.dicebear.com/10.x/lorelei/svg?seed=${seed}`;
const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

describe('preset avatars', () => {
  it('are the seeds Settings has always offered, each with its own file', () => {
    expect(PRESET_AVATARS.map((p) => p.seed)).toEqual(SEEDS);
    expect(new Set(PRESET_AVATARS.map((p) => p.src)).size).toBe(SEEDS.length);
    expect(PRESET_AVATARS.find((p) => p.seed === 'Felix').src).toBe('/avatars/lorelei-felix.svg');
  });

  it('are SVGs in public/avatars that load nothing from anywhere else', () => {
    for (const { src } of PRESET_AVATARS) {
      const file = join(ROOT, 'public', src);
      expect(existsSync(file), src).toBe(true);
      const svg = readFileSync(file, 'utf8');
      expect(svg.startsWith('<svg '), src).toBe(true);
      expect(svg).toContain('Lisa Wischofsky');
      // Only references to its own elements (href="#…"), no images or scripts.
      expect(svg.match(/href="(?!#)/g), src).toBeNull();
      expect(svg).not.toMatch(/<image|<script|<foreignObject|url\(\s*['"]?https?:/i);
    }
  });

  it('come with their licence', () => {
    expect(readFileSync(join(ROOT, 'public/avatars/LICENSE-Lorelei.txt'), 'utf8')).toContain('CC0 1.0 Universal');
  });
});

describe('localAvatar', () => {
  it('maps each DiceBear preset URL Settings used to save to its local file', () => {
    for (const { seed, src } of PRESET_AVATARS) {
      expect(localAvatar(dicebear(seed))).toBe(src);
    }
  });

  it('leaves everything else as it is', () => {
    for (const avatar of [
      null,
      undefined,
      '',
      '/avatars/lorelei-felix.svg',
      '/avatars/aurora.svg',
      DATA_URL,
      // Only exact preset URLs: not another seed, case, version, style, scheme or query.
      dicebear('Someone'),
      dicebear('felix'),
      dicebear('Felix&flip=true'),
      'https://api.dicebear.com/9.x/lorelei/svg?seed=Felix',
      'https://api.dicebear.com/10.x/lorelei-neutral/svg?seed=Felix',
      'https://api.dicebear.com/10.x/lorelei/png?seed=Felix',
      'http://api.dicebear.com/10.x/lorelei/svg?seed=Felix',
      ` ${dicebear('Felix')}`,
    ]) {
      expect(localAvatar(avatar)).toBe(avatar);
    }
  });
});

describe('avatarImageSrc', () => {
  it('shows presets, including ones stored as DiceBear URLs, from QR Go', () => {
    expect(avatarImageSrc('/avatars/lorelei-luna.svg')).toBe('/avatars/lorelei-luna.svg');
    expect(avatarImageSrc('/avatars/aurora.svg')).toBe('/avatars/aurora.svg');
    expect(avatarImageSrc(dicebear('Luna'))).toBe('/avatars/lorelei-luna.svg');
  });

  it('shows uploaded pictures', () => {
    expect(avatarImageSrc(DATA_URL)).toBe(DATA_URL);
  });

  it('shows nothing that would load from another site', () => {
    for (const avatar of [
      dicebear('Someone'),
      'https://api.dicebear.com/9.x/lorelei/svg?seed=Felix',
      'https://example.com/me.png',
      '//example.com/avatars/me.svg',
      '/avatars/../api/me',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'javascript:alert(1)',
    ]) {
      expect(avatarImageSrc(avatar), avatar).toBeNull();
    }
  });

  it('is null without an avatar', () => {
    expect(avatarImageSrc(null)).toBeNull();
    expect(avatarImageSrc(undefined)).toBeNull();
    expect(avatarImageSrc('')).toBeNull();
  });
});

describe('the Avatar component', () => {
  const render = (src) => renderToStaticMarkup(createElement(Avatar, { src, name: 'Thandi', size: 40 }));

  it('shows a preset stored as a DiceBear URL from QR Go', () => {
    const html = render(dicebear('Felix'));
    expect(html).toContain('src="/avatars/lorelei-felix.svg"');
    expect(html).not.toContain('dicebear');
  });

  it("shows the initial for a picture it won't load", () => {
    const html = render(dicebear('Someone'));
    expect(html).not.toContain('<img');
    expect(html).toContain('>T</div>');
  });

  it('shows a preset path and an upload as they are', () => {
    expect(render('/avatars/lorelei-milo.svg')).toContain('src="/avatars/lorelei-milo.svg"');
    expect(render(DATA_URL)).toContain(`src="${DATA_URL}"`);
  });
});

describe('normalizeAvatar (PUT /api/user/profile)', () => {
  it('accepts the preset paths', () => {
    for (const { src } of PRESET_AVATARS) {
      expect(normalizeAvatar(src)).toEqual({ ok: true, value: src });
    }
    expect(normalizeAvatar('/avatars/aurora.svg')).toEqual({ ok: true, value: '/avatars/aurora.svg' });
  });

  it('stores a DiceBear preset URL, sent by a page left open, as the local path', () => {
    expect(normalizeAvatar(dicebear('Sophie'))).toEqual({ ok: true, value: '/avatars/lorelei-sophie.svg' });
    expect(normalizeAvatar(dicebear('rlnap45o'))).toEqual({ ok: true, value: '/avatars/lorelei-rlnap45o.svg' });
  });

  it('rejects any other external picture', () => {
    for (const avatar of [
      dicebear('Someone'),
      'https://api.dicebear.com/9.x/lorelei/svg?seed=Felix',
      'https://example.com/me.png',
      '//example.com/avatars/me.svg',
      '/avatars/../api/me.svg',
      '/avatars/Felix.svg',
      42,
      {},
    ]) {
      expect(normalizeAvatar(avatar)).toEqual({ ok: false, error: 'Invalid profile picture' });
    }
  });

  it('clears the picture for null or ""', () => {
    expect(normalizeAvatar(null)).toEqual({ ok: true, value: null });
    expect(normalizeAvatar(undefined)).toEqual({ ok: true, value: null });
    expect(normalizeAvatar('')).toEqual({ ok: true, value: null });
  });

  it('accepts an upload up to the size cap', () => {
    expect(normalizeAvatar(DATA_URL)).toEqual({ ok: true, value: DATA_URL });
    const big = `data:image/png;base64,${'A'.repeat(MAX_AVATAR_LENGTH)}`;
    expect(normalizeAvatar(big)).toEqual({ ok: false, error: 'That image is too large — please choose a smaller one.' });
  });
});

describe('third-party avatar services', () => {
  // Only lib/avatars.js may name DiceBear's API, to recognise URLs stored
  // before the presets were served from QR Go. Nothing else may load from it.
  it('are not referenced anywhere else in the app', () => {
    const allowed = new Set(['src/lib/avatars.js']);
    const offenders = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== '__tests__') walk(path);
        } else if (/\.(m?js|jsx|css|json)$/.test(name)) {
          const rel = relative(ROOT, path);
          if (!allowed.has(rel) && readFileSync(path, 'utf8').includes('dicebear.com')) offenders.push(rel);
        }
      }
    };
    walk(join(ROOT, 'src'));
    for (const file of ['next.config.mjs']) {
      if (readFileSync(join(ROOT, file), 'utf8').includes('dicebear.com')) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
