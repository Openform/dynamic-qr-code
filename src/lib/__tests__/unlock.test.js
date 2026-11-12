import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SignJWT } from 'jose';
import {
  createUnlockToken,
  isUnlocked,
  passwordMatches,
  unlockCookieOptions,
  unlockLimitKeys,
  unlockPagePath,
} from '../unlock';
import { createToken, getJwtSecret } from '../token';

const NOW = Date.parse('2026-11-10T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const code = { id: 7, short_id: 'Ab3dE6fG7h', access_password: 'tea4two' };

let savedSecret;
beforeAll(() => {
  savedSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret-for-unlock-tokens';
});
afterAll(() => {
  if (savedSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedSecret;
});

describe('passwordMatches', () => {
  it('matches the same password, ignoring spaces at either end', () => {
    expect(passwordMatches('tea4two', 'tea4two')).toBe(true);
    expect(passwordMatches('  tea4two ', 'tea4two')).toBe(true);
  });

  it('is case-sensitive and exact', () => {
    expect(passwordMatches('Tea4two', 'tea4two')).toBe(false);
    expect(passwordMatches('tea4tw', 'tea4two')).toBe(false);
    expect(passwordMatches('tea4twoo', 'tea4two')).toBe(false);
  });

  it('never matches when something is missing', () => {
    expect(passwordMatches('', 'tea4two')).toBe(false);
    expect(passwordMatches(null, 'tea4two')).toBe(false);
    expect(passwordMatches(undefined, 'tea4two')).toBe(false);
    expect(passwordMatches('', '')).toBe(false);
    expect(passwordMatches('tea4two', null)).toBe(false);
  });
});

describe('unlock tokens', () => {
  it('lets the browser skip the page for 30 days', async () => {
    const token = await createUnlockToken(code, { nowMs: NOW });
    expect(await isUnlocked(token, code, { nowMs: NOW })).toBe(true);
    expect(await isUnlocked(token, code, { nowMs: NOW + 29 * DAY })).toBe(true);
    expect(await isUnlocked(token, code, { nowMs: NOW + 31 * DAY })).toBe(false);
  });

  it('stops working when the password changes or is removed', async () => {
    const token = await createUnlockToken(code, { nowMs: NOW });
    expect(await isUnlocked(token, { ...code, access_password: 'new-pass' }, { nowMs: NOW })).toBe(false);
    expect(await isUnlocked(token, { ...code, access_password: null }, { nowMs: NOW })).toBe(false);
  });

  it('only opens the code it was made for', async () => {
    const token = await createUnlockToken(code, { nowMs: NOW });
    // Same password on another code.
    expect(await isUnlocked(token, { ...code, id: 8, short_id: 'other' }, { nowMs: NOW })).toBe(false);
  });

  it('refuses missing, tampered and differently signed tokens', async () => {
    const token = await createUnlockToken(code, { nowMs: NOW });
    expect(await isUnlocked(undefined, code, { nowMs: NOW })).toBe(false);
    expect(await isUnlocked('', code, { nowMs: NOW })).toBe(false);
    expect(await isUnlocked(`${token.slice(0, -2)}xx`, code, { nowMs: NOW })).toBe(false);

    // A token with the right claims, signed with the sign-in key, isn't one.
    const forged = await new SignJWT({ code: code.id, pw: 'whatever' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1d')
      .sign(getJwtSecret());
    expect(await isUnlocked(forged, code)).toBe(false);
  });

  it('can’t be used as a sign-in token, or a sign-in token as one', async () => {
    const { verifyToken } = await import('../token');
    const unlock = await createUnlockToken(code);
    expect(await verifyToken(unlock)).toBeNull();
    expect(await isUnlocked(await createToken(1), code)).toBe(false);
  });
});

describe('cookie and page paths', () => {
  it('limits the cookie to the code’s link and keeps it for 30 days', () => {
    expect(unlockCookieOptions('Ab3dE6fG7h')).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/r/Ab3dE6fG7h',
      maxAge: 30 * 24 * 60 * 60,
    });
  });

  it('builds the password page link', () => {
    expect(unlockPagePath('Ab3dE6fG7h')).toBe('/r/Ab3dE6fG7h/unlock');
    expect(unlockPagePath('Ab3dE6fG7h', { promptId: 12 })).toBe('/r/Ab3dE6fG7h/unlock?p=12');
    expect(unlockPagePath('Ab3dE6fG7h', { promptId: 12, error: 'wrong' })).toBe('/r/Ab3dE6fG7h/unlock?p=12&error=wrong');
  });
});

describe('unlockLimitKeys', () => {
  it('counts each device on each code separately, and each connection across codes', () => {
    const phone = unlockLimitKeys('203.0.113.5', 'iPhone Safari', 7);
    expect(unlockLimitKeys('203.0.113.5', 'iPhone Safari', 7)).toEqual(phone);
    expect(unlockLimitKeys('203.0.113.5', 'Android Chrome', 7).deviceKey).not.toBe(phone.deviceKey);
    expect(unlockLimitKeys('203.0.113.5', 'iPhone Safari', 8).deviceKey).not.toBe(phone.deviceKey);
    expect(unlockLimitKeys('203.0.113.5', 'Android Chrome', 8).ipKey).toBe(phone.ipKey);
  });

  it('doesn’t keep the browser name in the key', () => {
    expect(unlockLimitKeys('203.0.113.5', 'iPhone Safari', 7).deviceKey).not.toContain('iPhone');
  });
});
