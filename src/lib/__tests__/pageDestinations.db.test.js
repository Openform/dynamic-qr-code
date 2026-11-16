/**
 * Codes pointing at campaign pages, against a real database: only an
 * account's own pages are accepted; a scan of a code (or a live schedule)
 * whose destination is a page goes to the page under that code, counted as a
 * scan of that destination, also after the password page; and the dashboard
 * and analytics name the page.
 *
 * Calls the /r/[shortId] route handler directly, with after() collected so
 * the scan recording can be run and checked.
 *
 * Needs MariaDB or MySQL, so it is skipped unless ANALYTICS_DB_TEST=1. CI's
 * database job runs it. It uses its own database, named after MYSQL_DATABASE
 * with "_ci" changed to "_page_destinations_ci"; that database is dropped and
 * created again. Locally:
 *   ANALYTICS_DB_TEST=1 MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=ci \
 *     MYSQL_DATABASE=qrgo_ci npx vitest run pageDestinations.db
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql from 'mysql2/promise';

const enabled = process.env.ANALYTICS_DB_TEST === '1';

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

describe.skipIf(!enabled)('codes pointing at campaign pages (database)', () => {
  let db;
  let route;
  let api;
  let analyticsApi;
  let NextRequest;
  let owner;
  let stranger;
  let page;
  let strangersPage;

  const toSql = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const HOUR = 60 * 60 * 1000;

  const scan = (shortId) =>
    route.GET(new NextRequest(`${BASE}/r/${shortId}`, { headers: { 'user-agent': PHONE } }), {
      params: Promise.resolve({ shortId }),
    });

  async function newPage(userId, name) {
    const created = await db.createPageWithinLimit(
      {
        userId,
        name,
        content: { v: 1, theme: 'fresh', brand: '#1F6F4A', font: null, blocks: [{ id: 'header', type: 'header', title: name }] },
        endsAt: null,
        afterEnd: 'ended',
        keptButton: null,
      },
      () => 100
    );
    return created.page;
  }

  async function newCode(userId, shortId, destinationUrl, extra = {}) {
    return (await db.createQRCodeWithinLimit({ shortId, userId, title: shortId, destinationUrl, ...extra }, () => null)).qrcode;
  }

  beforeAll(async () => {
    const name = (process.env.MYSQL_DATABASE ?? '').replace(/_ci$/, '_page_destinations_ci');
    if (!/^\w+_page_destinations_ci$/.test(name)) throw new Error('MYSQL_DATABASE must end in "_ci": this test drops a database named after it');
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
    process.env.JWT_SECRET ??= 'test-secret-for-page-destinations';
    process.env.ANALYTICS_SECRET ??= 'test-analytics-secret';

    ({ NextRequest } = await import('next/server'));
    db = await import('../db');
    route = await import('../../app/r/[shortId]/route');
    api = await import('../qrcodeApi');
    analyticsApi = await import('../analyticsApi');
    await db.ensureSchema();

    owner = await db.createUser('owner@example.com', 'x', 'Owner', 'business');
    stranger = await db.createUser('stranger@example.com', 'x', 'Stranger', 'business');
    page = await newPage(owner.id, 'Black Friday');
    strangersPage = await newPage(stranger.id, 'Not yours');
  });

  afterAll(async () => {
    await db?.pool.end();
  });

  it('accepts only the account’s own pages as a destination', async () => {
    expect(await api.pageDestinationProblem(`qrgo-page:${page.id}`, owner.id)).toBeNull();
    expect(await api.pageDestinationProblem('https://example.com', owner.id)).toBeNull();

    for (const destination of [`qrgo-page:${strangersPage.id}`, 'qrgo-page:999999']) {
      const refused = await api.pageDestinationProblem(destination, owner.id);
      expect(refused.status).toBe(400);
      expect(await refused.json()).toEqual({ error: 'Choose one of your campaign pages.', field: 'url' });
    }
  });

  it('sends a scan to the page under the code, and counts it for that destination', async () => {
    const code = await newCode(owner.id, 'to-page', `qrgo-page:${page.id}`);
    const response = await scan('to-page');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`/r/to-page/p/${page.id}`);
    expect(response.headers.get('cache-control')).toBe('no-store');

    await runLater();
    const [rows] = await db.pool.query('SELECT destination_url, schedule_id FROM scan_events WHERE qrcode_id = :id', { id: code.id });
    expect(rows).toEqual([{ destination_url: `qrgo-page:${page.id}`, schedule_id: null }]);
  });

  it('sends scans to the page while a schedule pointing at it is live', async () => {
    const code = await newCode(owner.id, 'weekend', 'https://example.com/menu');
    const schedule = await db.createSchedule(
      code.id,
      owner.id,
      { label: 'Black Friday', kind: 'range', destinationUrl: `qrgo-page:${page.id}`, timeZone: 'UTC', startsAt: toSql(Date.now() - HOUR), endsAt: toSql(Date.now() + HOUR) },
      20
    );
    expect((await scan('weekend')).headers.get('location')).toBe(`/r/weekend/p/${page.id}`);
    await runLater();
    const [rows] = await db.pool.query('SELECT destination_url, schedule_id FROM scan_events WHERE qrcode_id = :id', { id: code.id });
    expect(rows).toEqual([{ destination_url: `qrgo-page:${page.id}`, schedule_id: schedule.id }]);

    // Switched off, scans go back to the main destination.
    await db.updateSchedule(code.id, owner.id, schedule.id, { enabled: false });
    expect((await scan('weekend')).headers.get('location')).toBe('https://example.com/menu');
    await runLater();
  });

  it('goes on to the page after the password page', async () => {
    await newCode(owner.id, 'locked-page', `qrgo-page:${page.id}`, { accessPassword: 'tea4two' });
    expect(new URL((await scan('locked-page')).headers.get('location'), BASE).pathname).toBe('/r/locked-page/unlock');

    const response = await route.POST(
      new NextRequest(`${BASE}/r/locked-page`, {
        method: 'POST',
        headers: { 'user-agent': PHONE, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ password: 'tea4two' }),
      }),
      { params: Promise.resolve({ shortId: 'locked-page' }) }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: `/r/locked-page/p/${page.id}` });
    await runLater();
  });

  it('names the pages a code sends scans to, for the dashboard', async () => {
    const code = await newCode(owner.id, 'named', `qrgo-page:${page.id}`);
    const [withNames] = await api.withPageNames(
      [{ id: code.id, destinationUrl: `qrgo-page:${page.id}`, scheduledChanges: [{ destinationUrl: `qrgo-page:${strangersPage.id}` }] }],
      owner.id
    );
    // Only the account's own pages are named.
    expect(withNames.pageNames).toEqual({ [page.id]: 'Black Friday' });
    expect((await api.loadClientQRCode(code.id, owner.id)).pageNames).toEqual({ [page.id]: 'Black Friday' });
    // Admins see any account's names.
    expect(await db.getPageNames([page.id, strangersPage.id])).toEqual({ [page.id]: 'Black Friday', [strangersPage.id]: 'Not yours' });
  });

  it('names the page in analytics and in the CSV export', async () => {
    const code = await newCode(owner.id, 'counted', `qrgo-page:${page.id}`);
    await scan('counted');
    await runLater();

    const query = `codeId=${code.id}&range=7d&tz=0`;
    const response = await analyticsApi.analyticsResponse(new Request(`${BASE}/api/analytics?${query}`), { userId: owner.id });
    const data = await response.json();
    expect(data.destinations.pageNames).toEqual({ [page.id]: 'Black Friday' });
    expect(data.destinations.main.map((row) => row.url)).toContain(`qrgo-page:${page.id}`);

    const csv = await (
      await analyticsApi.analyticsCsvResponse(new Request(`${BASE}/api/analytics/export?${query}`), { userId: owner.id })
    ).text();
    expect(csv).toContain('Campaign page: Black Friday');
    expect(csv).not.toContain('qrgo-page:');
  });
});
