/**
 * Password-protected codes against a real database: scanning goes to the
 * password page, a wrong password is refused and rate-limited, the right one
 * sends the scanner on and is remembered, changing the password asks again,
 * and analytics count the password page and only the scans that got through.
 *
 * Calls the /r/[shortId] route handler directly, with after() collected so
 * the scan recording can be run and checked.
 *
 * Needs MariaDB or MySQL, so it is skipped unless ANALYTICS_DB_TEST=1. CI's
 * database job runs it. It uses its own database, named after MYSQL_DATABASE
 * with "_ci" changed to "_passwords_ci" (so it can run next to the other
 * database tests); that database is dropped and created again. Locally:
 *   ANALYTICS_DB_TEST=1 MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=ci \
 *     MYSQL_DATABASE=qrgo_ci npx vitest run passwordProtection
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql from 'mysql2/promise';

const enabled = process.env.ANALYTICS_DB_TEST === '1';

// Work handed to after() runs when the test says so, as it would once the
// response has gone.
const later = vi.hoisted(() => []);
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal()),
  after: (work) => {
    later.push(work);
  },
}));

async function runLater() {
  while (later.length) await later.shift()();
}

const BASE = 'http://localhost:3000';
const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const MENU = 'https://example.com/staff-menu';

describe.skipIf(!enabled)('password-protected codes (database)', () => {
  let db;
  let route;
  let analytics;
  let api;
  let NextRequest;
  let owner;
  let starter;
  let code;

  // A scan: GET the code's link, as a phone would, with cookies if given.
  const scan = (shortId, { ua = PHONE, cookie, method = 'GET' } = {}) =>
    route.GET(
      new NextRequest(`${BASE}/r/${shortId}`, {
        method,
        headers: { 'user-agent': ua, ...(cookie ? { cookie } : {}) },
      }),
      { params: Promise.resolve({ shortId }) }
    );

  // The password page's form, as its script sends it (or a plain form post).
  const submit = (shortId, password, { prompt, ua = PHONE, json = true } = {}) => {
    const body = new URLSearchParams({ password });
    if (prompt) body.set('prompt', String(prompt));
    return route.POST(
      new NextRequest(`${BASE}/r/${shortId}`, {
        method: 'POST',
        headers: {
          'user-agent': ua,
          'content-type': 'application/x-www-form-urlencoded',
          ...(json ? { accept: 'application/json' } : {}),
        },
        body,
      }),
      { params: Promise.resolve({ shortId }) }
    );
  };

  const cookieFrom = (response) => {
    const set = response.headers.get('set-cookie');
    return set ? set.split(';')[0] : null;
  };

  const count = async (sql, params = {}) => {
    const [rows] = await db.pool.query(sql, params);
    return Number(rows[0].n);
  };

  beforeAll(async () => {
    const name = (process.env.MYSQL_DATABASE ?? '').replace(/_ci$/, '_passwords_ci');
    if (!/^\w+_passwords_ci$/.test(name)) throw new Error('MYSQL_DATABASE must end in "_ci": this test drops a database named after it');
    const admin = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
    });
    await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.end();

    process.env.MYSQL_DATABASE = name;
    process.env.JWT_SECRET ??= 'test-secret-for-password-codes';
    process.env.ANALYTICS_SECRET ??= 'test-analytics-secret';

    ({ NextRequest } = await import('next/server'));
    db = await import('../db');
    route = await import('../../app/r/[shortId]/route');
    analytics = await import('../scanAnalytics');
    api = await import('../qrcodeApi');
    await db.ensureSchema();

    owner = await db.createUser('owner@example.com', 'x', 'Owner', 'business');
    starter = await db.createUser('starter@example.com', 'x', 'Starter', 'starter');
    const created = await db.createQRCodeWithinLimit(
      { shortId: 'locked1', userId: owner.id, title: 'Staff menu', destinationUrl: MENU, accessPassword: 'tea4two' },
      () => null
    );
    code = created.qrcode;
  });

  afterAll(async () => {
    await db?.pool.end();
  });

  it('sends a scan to the password page and notes the showing, without counting a scan', async () => {
    const response = await scan('locked1');
    expect(response.status).toBe(302);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const location = new URL(response.headers.get('location'));
    expect(location.pathname).toBe('/r/locked1/unlock');
    const promptId = Number(location.searchParams.get('p'));
    expect(promptId).toBeGreaterThan(0);

    await runLater();
    expect(await count('SELECT COUNT(*) AS n FROM qrcode_password_prompts WHERE id = :promptId AND unlocked_at IS NULL', { promptId })).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM scan_events')).toBe(0);
  });

  it('doesn’t note showings for bots or HEAD requests', async () => {
    const before = await count('SELECT COUNT(*) AS n FROM qrcode_password_prompts');
    const bot = await scan('locked1', { ua: 'WhatsApp/2.23.20.0' });
    expect(new URL(bot.headers.get('location')).search).toBe('');
    const head = await scan('locked1', { method: 'HEAD' });
    expect(head.status).toBe(302);
    expect(await count('SELECT COUNT(*) AS n FROM qrcode_password_prompts')).toBe(before);
  });

  it('refuses a wrong password', async () => {
    const response = await submit('locked1', 'nope', { ua: 'wrong-test' });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'wrong' });
    expect(response.headers.get('set-cookie')).toBeNull();

    const plain = await submit('locked1', 'nope', { ua: 'wrong-test', json: false, prompt: 5 });
    expect(plain.status).toBe(303);
    expect(new URL(plain.headers.get('location')).pathname + new URL(plain.headers.get('location')).search).toBe(
      '/r/locked1/unlock?p=5&error=wrong'
    );
  });

  it('sends the right password on, counts one scan and remembers the browser', async () => {
    const shown = await scan('locked1');
    const promptId = Number(new URL(shown.headers.get('location')).searchParams.get('p'));
    await runLater();

    const response = await submit('locked1', ' tea4two ', { prompt: promptId });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: MENU });
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toMatch(/^qr-unlock=/);
    expect(setCookie).toMatch(/Path=\/r\/locked1/);
    expect(setCookie).toMatch(/HttpOnly/i);

    await runLater();
    expect(await count('SELECT COUNT(*) AS n FROM scan_events WHERE destination_url = :url', { url: MENU })).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM qrcode_password_prompts WHERE id = :promptId AND unlocked_at IS NOT NULL', { promptId })).toBe(1);

    // The next scan from that browser goes straight through.
    const again = await scan('locked1', { cookie: cookieFrom(response) });
    expect(again.headers.get('location')).toBe(MENU);
    await runLater();
    expect(await count('SELECT COUNT(*) AS n FROM scan_events')).toBe(2);
    expect(await count('SELECT scan_count AS n FROM qrcodes WHERE id = :id', { id: code.id })).toBe(2);
  });

  it('only counts the first right answer for a showing, and only on its own code', async () => {
    const shown = await scan('locked1');
    const promptId = Number(new URL(shown.headers.get('location')).searchParams.get('p'));
    expect(await db.markPasswordPromptUnlocked(promptId, code.id + 1)).toBe(false);
    expect(await db.markPasswordPromptUnlocked(promptId, code.id)).toBe(true);
    expect(await db.markPasswordPromptUnlocked(promptId, code.id)).toBe(false);
  });

  it('answers a plain form post with a page that moves on', async () => {
    const response = await submit('locked1', 'tea4two', { json: false, ua: 'plain-form' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/html/);
    const html = await response.text();
    expect(html).toContain(`<meta http-equiv="refresh" content="0;url=${MENU}">`);
    expect(response.headers.get('set-cookie')).toMatch(/^qr-unlock=/);
    await runLater();
  });

  it('asks again once the password changes', async () => {
    const unlocked = await submit('locked1', 'tea4two', { ua: 'changes' });
    const cookie = cookieFrom(unlocked);
    await runLater();

    await db.updateQRCode(code.id, owner.id, { accessPassword: 'coffee4u' });
    const response = await scan('locked1', { cookie });
    expect(new URL(response.headers.get('location')).pathname).toBe('/r/locked1/unlock');
    expect((await submit('locked1', 'tea4two', { ua: 'changes' })).status).toBe(401);
    expect((await submit('locked1', 'coffee4u', { ua: 'changes' })).status).toBe(200);
    await runLater();
  });

  it('stops a device after 10 wrong tries, even with the right password, but not others', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await submit('locked1', `guess${i}`, { ua: 'guesser' })).status).toBe(401);
    }
    const limited = await submit('locked1', 'coffee4u', { ua: 'guesser' });
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toBe('limited');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);

    expect((await submit('locked1', 'coffee4u', { ua: 'someone-else' })).status).toBe(200);
    await runLater();
  });

  it('counts the password page in analytics, with who stopped there', async () => {
    const data = await analytics.getScanAnalytics({ scope: { codeId: code.id }, range: '7d', offsetMinutes: 0 });
    const shown = await count('SELECT COUNT(*) AS n FROM qrcode_password_prompts');
    const unlocked = await count('SELECT COUNT(*) AS n FROM qrcode_password_prompts WHERE unlocked_at IS NOT NULL');
    expect(data.code.hasPassword).toBe(true);
    expect(data.passwordPrompts).toEqual({ shown, unlocked, stopped: shown - unlocked });
    expect(data.passwordPrompts.stopped).toBeGreaterThan(0);
    // Every scan in the numbers got through the password.
    expect(data.summary.scans).toBe(await count('SELECT COUNT(*) AS n FROM scan_events WHERE is_bot = 0'));

    // Another account sees none of it, and a destination filter leaves it out.
    const other = await analytics.getScanAnalytics({ scope: { userId: starter.id }, range: '7d', offsetMinutes: 0 });
    expect(other.passwordPrompts).toEqual({ shown: 0, unlocked: 0, stopped: 0 });
    const narrowed = await analytics.getScanAnalytics({
      scope: { codeId: code.id, destination: { kind: 'main', key: 'main' } },
      range: '7d',
      offsetMinutes: 0,
    });
    expect(narrowed.passwordPrompts).toBeNull();
  });

  it('lets a package without passwords keep or remove one, but not set or change it', async () => {
    const refused = await api.accessPasswordFromBody({ accessPassword: 'mine1234' }, starter.id);
    expect(refused.response.status).toBe(403);
    expect((await refused.response.json()).code).toBe('PACKAGE_FEATURE');

    expect(await api.accessPasswordFromBody({ accessPassword: ' mine1234 ' }, starter.id, 'mine1234')).toEqual({ value: 'mine1234' });
    expect(await api.accessPasswordFromBody({ accessPassword: null }, starter.id, 'mine1234')).toEqual({ value: null });
    expect(await api.accessPasswordFromBody({ accessPassword: '' }, starter.id, 'mine1234')).toEqual({ value: null });
    expect(await api.accessPasswordFromBody({ title: 'no password field' }, starter.id, 'mine1234')).toEqual({ value: undefined });
    expect(await api.accessPasswordFromBody({ accessPassword: 'new-one' }, owner.id, 'mine1234')).toEqual({ value: 'new-one' });
    expect((await api.accessPasswordFromBody({ accessPassword: 'ab' }, owner.id)).response.status).toBe(400);
  });

  it('keeps the password when an edit leaves it out, and opens the code once it’s removed', async () => {
    await db.updateQRCode(code.id, owner.id, { title: 'Renamed' });
    expect((await db.getQRCodeById(code.id, owner.id)).access_password).toBe('coffee4u');

    await db.updateQRCode(code.id, owner.id, { accessPassword: null });
    expect((await db.getQRCodeById(code.id, owner.id)).access_password).toBeNull();
    expect((await scan('locked1')).headers.get('location')).toBe(MENU);

    // The page's form still works if it was open when the password went.
    const response = await submit('locked1', 'anything', { ua: 'late' });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    await runLater();
  });

  it('sends people away from a paused code', async () => {
    await db.updateQRCode(code.id, owner.id, { accessPassword: 'tea4two' });
    await db.setUserDisabled(owner.id, true);
    const response = await submit('locked1', 'tea4two', { ua: 'paused' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'unavailable', redirect: '/code-unavailable?reason=inactive' });
    await db.setUserDisabled(owner.id, false);
  });

  it('prunes old password page rows and nothing newer', async () => {
    await db.pool.query(
      `INSERT INTO qrcode_password_prompts (qrcode_id, user_id, shown_at) VALUES
       (:id, :userId, '2020-01-01 00:00:00'), (:id, :userId, '2020-06-01 00:00:00')`,
      { id: code.id, userId: owner.id }
    );
    const before = await count('SELECT COUNT(*) AS n FROM qrcode_password_prompts');
    expect(await db.prunePasswordPrompts('2021-01-01 00:00:00', 1)).toBe(2);
    expect(await count('SELECT COUNT(*) AS n FROM qrcode_password_prompts')).toBe(before - 2);
  });
});
