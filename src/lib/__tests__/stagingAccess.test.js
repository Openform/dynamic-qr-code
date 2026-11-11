import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  createStagingToken,
  hasStagingAccess,
  safeNextPath,
  stagingAccessPath,
  stagingPassword,
  stagingPasswordMatches,
} from '../stagingAccess';

const NOW = Date.parse('2026-11-11T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

let savedSecret;
beforeAll(() => {
  savedSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret-for-staging';
});
afterAll(() => {
  if (savedSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedSecret;
});

describe('stagingPassword', () => {
  it('is only set on the staging site', () => {
    expect(stagingPassword({})).toBeNull();
    expect(stagingPassword({ STAGING_PASSWORD: '' })).toBeNull();
    expect(stagingPassword({ STAGING_PASSWORD: '   ' })).toBeNull();
    expect(stagingPassword({ STAGING_PASSWORD: ' let-me-test ' })).toBe('let-me-test');
  });
});

describe('stagingPasswordMatches', () => {
  it('matches exactly, ignoring spaces at either end', () => {
    expect(stagingPasswordMatches('let-me-test', 'let-me-test')).toBe(true);
    expect(stagingPasswordMatches(' let-me-test ', 'let-me-test')).toBe(true);
    expect(stagingPasswordMatches('Let-me-test', 'let-me-test')).toBe(false);
    expect(stagingPasswordMatches('', 'let-me-test')).toBe(false);
    expect(stagingPasswordMatches(null, 'let-me-test')).toBe(false);
    expect(stagingPasswordMatches('anything', null)).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('keeps paths on this site, with their query', () => {
    expect(safeNextPath('/r/abc123')).toBe('/r/abc123');
    expect(safeNextPath('/dashboard/analytics?code=12')).toBe('/dashboard/analytics?code=12');
  });

  it('never leads to another site', () => {
    for (const value of ['//evil.example', 'https://evil.example', '/\\evil.example', 'evil.example', '/\nx', '', null, undefined, 42]) {
      expect(safeNextPath(value)).toBe('/');
    }
  });

  it('never leads back to the sign-in page', () => {
    expect(safeNextPath('/staging-access')).toBe('/');
    expect(safeNextPath('/staging-access?next=/x')).toBe('/');
    expect(safeNextPath('/api/staging-access')).toBe('/');
  });
});

describe('stagingAccessPath', () => {
  it('builds the sign-in link', () => {
    expect(stagingAccessPath()).toBe('/staging-access');
    expect(stagingAccessPath('/')).toBe('/staging-access');
    expect(stagingAccessPath('/r/abc?x=1')).toBe('/staging-access?next=%2Fr%2Fabc%3Fx%3D1');
    expect(stagingAccessPath('/r/abc', 'wrong')).toBe('/staging-access?next=%2Fr%2Fabc&error=wrong');
    expect(stagingAccessPath('//evil.example')).toBe('/staging-access');
  });
});

describe('staging tokens', () => {
  it('let a browser in for 30 days', async () => {
    const token = await createStagingToken('let-me-test', { nowMs: NOW });
    expect(await hasStagingAccess(token, 'let-me-test', { nowMs: NOW })).toBe(true);
    expect(await hasStagingAccess(token, 'let-me-test', { nowMs: NOW + 29 * DAY })).toBe(true);
    expect(await hasStagingAccess(token, 'let-me-test', { nowMs: NOW + 31 * DAY })).toBe(false);
  });

  it('stop working when the password changes', async () => {
    const token = await createStagingToken('let-me-test', { nowMs: NOW });
    expect(await hasStagingAccess(token, 'another-password', { nowMs: NOW })).toBe(false);
  });

  it('refuse missing and tampered tokens', async () => {
    const token = await createStagingToken('let-me-test', { nowMs: NOW });
    expect(await hasStagingAccess(undefined, 'let-me-test', { nowMs: NOW })).toBe(false);
    expect(await hasStagingAccess(`${token.slice(0, -2)}xx`, 'let-me-test', { nowMs: NOW })).toBe(false);
    expect(await hasStagingAccess(token, null, { nowMs: NOW })).toBe(false);
  });

  it('can’t be used as a sign-in token', async () => {
    const { verifyToken } = await import('../token');
    expect(await verifyToken(await createStagingToken('let-me-test'))).toBeNull();
  });
});

describe('POST /api/staging-access', () => {
  let POST;
  const saved = {};

  beforeAll(async () => {
    ({ POST } = await import('../../app/api/staging-access/route'));
  });
  beforeEach(() => {
    saved.STAGING_PASSWORD = process.env.STAGING_PASSWORD;
    process.env.STAGING_PASSWORD = 'let-me-test';
  });
  afterEach(() => {
    if (saved.STAGING_PASSWORD === undefined) delete process.env.STAGING_PASSWORD;
    else process.env.STAGING_PASSWORD = saved.STAGING_PASSWORD;
  });

  let ip = 0;
  async function post(password, { next = '/r/abc123', json = true, from = `198.51.100.${(ip += 1)}` } = {}) {
    const { NextRequest } = await import('next/server');
    return POST(
      new NextRequest('https://staging.qrgo.co.za/api/staging-access', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-forwarded-for': from,
          ...(json ? { accept: 'application/json' } : {}),
        },
        body: new URLSearchParams({ password, next }),
      })
    );
  }

  it('doesn’t exist on production', async () => {
    delete process.env.STAGING_PASSWORD;
    expect((await post('let-me-test')).status).toBe(404);
  });

  it('lets the right password in, with a cookie, and goes on to where they were going', async () => {
    const response = await post(' let-me-test ');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ next: '/r/abc123' });
    const cookie = response.headers.get('set-cookie');
    expect(cookie).toMatch(/^qr-staging-access=/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('never sends anyone to another site', async () => {
    const response = await post('let-me-test', { next: '//evil.example' });
    expect(await response.json()).toEqual({ next: '/' });
  });

  it('refuses a wrong password, and stops a connection after 10', async () => {
    const from = '203.0.113.77';
    for (let i = 0; i < 10; i += 1) {
      const response = await post(`guess${i}`, { from });
      expect(response.status).toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    const limited = await post('let-me-test', { from });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'limited' });
    expect((await post('let-me-test')).status).toBe(200); // another connection
  });

  it('answers a form posted without the script with a redirect back, or a page that moves on', async () => {
    const wrong = await post('nope', { json: false });
    expect(wrong.status).toBe(303);
    const back = new URL(wrong.headers.get('location'));
    expect(back.pathname + back.search).toBe('/staging-access?next=%2Fr%2Fabc123&error=wrong');

    const right = await post('let-me-test', { json: false });
    expect(right.status).toBe(200);
    expect(await right.text()).toContain('<meta http-equiv="refresh" content="0;url=/r/abc123">');
    expect(right.headers.get('set-cookie')).toMatch(/^qr-staging-access=/);
  });
});
