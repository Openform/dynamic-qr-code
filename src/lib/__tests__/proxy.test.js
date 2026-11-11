import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy, config } from '../../proxy';
import { createToken } from '../token';
import { createStagingToken, STAGING_COOKIE } from '../stagingAccess';

const BASE = 'https://staging.qrgo.co.za';
const saved = {};

beforeEach(() => {
  saved.JWT_SECRET = process.env.JWT_SECRET;
  saved.STAGING_PASSWORD = process.env.STAGING_PASSWORD;
  process.env.JWT_SECRET = 'test-secret-for-the-proxy';
  delete process.env.STAGING_PASSWORD;
});
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function request(path, cookies = {}) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  return new NextRequest(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
}

const passedThrough = (response) => response.headers.get('x-middleware-next') === '1';
const redirectedTo = (response) => {
  const location = response.headers.get('location');
  if (!location) return null;
  const url = new URL(location);
  return url.pathname + url.search;
};

describe('proxy on production (no STAGING_PASSWORD)', () => {
  it('sends signed-out visitors of signed-in pages to /login', async () => {
    for (const path of ['/dashboard', '/dashboard/analytics', '/admin', '/admin/invites']) {
      expect(redirectedTo(await proxy(request(path)))).toBe('/login');
    }
  });

  it('answers signed-in API routes with 401 when signed out', async () => {
    for (const path of ['/api/qrcodes', '/api/qrcodes/12/schedules', '/api/analytics', '/api/admin/accounts']) {
      const response = await proxy(request(path));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Authentication required' });
    }
  });

  it('lets a valid sign-in token through, and refuses a bad one', async () => {
    const token = await createToken(1);
    expect(passedThrough(await proxy(request('/dashboard', { 'qr-auth-token': token })))).toBe(true);
    expect(passedThrough(await proxy(request('/api/qrcodes', { 'qr-auth-token': token })))).toBe(true);
    expect(redirectedTo(await proxy(request('/dashboard', { 'qr-auth-token': 'nonsense' })))).toBe('/login');
  });

  it('leaves public pages and scans alone, without a noindex header', async () => {
    for (const path of ['/', '/login', '/register', '/r/abc123', '/api/auth/login', '/privacy', '/dashboardish', '/staging-access']) {
      const response = await proxy(request(path));
      expect(passedThrough(response)).toBe(true);
      expect(response.headers.get('x-robots-tag')).toBeNull();
    }
  });

  it('never runs for Next’s own files', () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test('/_next/static/chunks/main.js')).toBe(false);
    expect(pattern.test('/dashboard')).toBe(true);
    expect(pattern.test('/r/abc123')).toBe(true);
    expect(pattern.test('/')).toBe(true);
  });
});

describe('proxy on staging (STAGING_PASSWORD set)', () => {
  beforeEach(() => {
    process.env.STAGING_PASSWORD = 'let-me-test';
  });

  it('sends visitors without the password to the sign-in page, remembering where they were going', async () => {
    expect(redirectedTo(await proxy(request('/')))).toBe('/staging-access');
    expect(redirectedTo(await proxy(request('/r/abc123?x=1')))).toBe('/staging-access?next=%2Fr%2Fabc123%3Fx%3D1');
    expect(redirectedTo(await proxy(request('/dashboard')))).toBe('/staging-access?next=%2Fdashboard');
  });

  it('answers API routes with 401', async () => {
    for (const path of ['/api/auth/login', '/api/qrcodes']) {
      const response = await proxy(request(path));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Staging access required' });
    }
  });

  it('keeps the sign-in page, its form and robots.txt open', async () => {
    for (const path of ['/staging-access', '/api/staging-access', '/robots.txt', '/icon.png']) {
      expect(passedThrough(await proxy(request(path)))).toBe(true);
    }
  });

  it('tells search engines not to index anything', async () => {
    expect((await proxy(request('/'))).headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect((await proxy(request('/staging-access'))).headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('lets a browser with the password in, and still needs a sign-in for the dashboard', async () => {
    const pass = { [STAGING_COOKIE]: await createStagingToken('let-me-test') };
    expect(passedThrough(await proxy(request('/', pass)))).toBe(true);
    expect(passedThrough(await proxy(request('/r/abc123', pass)))).toBe(true);
    expect(redirectedTo(await proxy(request('/dashboard', pass)))).toBe('/login');

    const signedIn = { ...pass, 'qr-auth-token': await createToken(1) };
    expect(passedThrough(await proxy(request('/dashboard', signedIn)))).toBe(true);
  });

  it('signs everyone out when the password changes', async () => {
    const pass = { [STAGING_COOKIE]: await createStagingToken('let-me-test') };
    process.env.STAGING_PASSWORD = 'a-new-password';
    expect(redirectedTo(await proxy(request('/', pass)))).toBe('/staging-access');
  });
});
