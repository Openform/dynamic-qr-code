/**
 * Reporting campaign pages and taking them down, against a real database:
 * visitors report a page they can see, through the code that links to it;
 * reports are limited and checked; only the first open report is emailed;
 * admins take a page down (visitors then get "not found"), restore it, or
 * close its reports; nobody else can.
 *
 * Calls the route handlers directly, with getSession() answering for
 * whichever account the test is acting as, and after() collecting the work
 * a response leaves for later.
 *
 * Needs MariaDB or MySQL, so it is skipped unless ANALYTICS_DB_TEST=1. CI's
 * database job runs it. It uses its own database, named after MYSQL_DATABASE
 * with "_ci" changed to "_page_reports_ci"; that database is dropped and
 * created again. Locally:
 *   ANALYTICS_DB_TEST=1 MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=ci \
 *     MYSQL_DATABASE=qrgo_ci npx vitest run pageReports.db
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql from 'mysql2/promise';

const enabled = process.env.ANALYTICS_DB_TEST === '1';

const session = vi.hoisted(() => ({ userId: null }));
vi.mock('../auth', async (importOriginal) => ({
  ...(await importOriginal()),
  getSession: async () => (session.userId ? { userId: session.userId } : null),
}));

const later = vi.hoisted(() => []);
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal()),
  after: (work) => {
    later.push(work);
  },
}));

const BASE = 'http://localhost:3000';

describe.skipIf(!enabled)('page reports and take-downs (database)', () => {
  let db;
  let reportSend;
  let adminPage;
  let adminImage;
  let loadPublicPage;
  let createUnlockToken;
  let NextRequest;
  let owner;
  let admin;
  let page;
  let quiet;

  const as = (user) => {
    session.userId = user?.id ?? null;
  };

  const content = (title) => ({
    v: 1,
    theme: 'fresh',
    brand: '#1F6F4A',
    font: null,
    blocks: [{ id: 'header', type: 'header', hidden: false, title, tagline: '', cover: null, logo: null }],
  });

  async function newPage(title, shortId) {
    const created = (
      await db.createPageWithinLimit({ userId: owner.id, name: title, content: content(title), endsAt: null, afterEnd: 'ended', keptButton: null }, () => 100)
    ).page;
    await db.createQRCodeWithinLimit({ shortId, userId: owner.id, title, destinationUrl: `qrgo-page:${created.id}` }, () => null);
    return created;
  }

  // Post the report form, as a browser does without JavaScript.
  const report = (shortId, pageId, fields, { ip = '203.0.113.1', headers = {} } = {}) =>
    reportSend.POST(
      new NextRequest(`${BASE}/r/${shortId}/p/${pageId}/report/send`, {
        method: 'POST',
        body: new URLSearchParams(fields),
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': ip, ...headers },
      }),
      { params: Promise.resolve({ shortId, pageId: String(pageId) }) }
    );

  const act = (pageId, action) =>
    adminPage.PATCH(
      new NextRequest(`${BASE}/api/admin/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ action }), headers: { 'content-type': 'application/json' } }),
      { params: Promise.resolve({ id: String(pageId) }) }
    );

  const visible = async (shortId, pageId) => Boolean((await loadPublicPage({ shortId, pageId: String(pageId) })).page);
  const reportsOf = (pageId) => db.getPageReports({ pageId });

  beforeAll(async () => {
    const name = (process.env.MYSQL_DATABASE ?? '').replace(/_ci$/, '_page_reports_ci');
    if (!/^\w+_page_reports_ci$/.test(name)) throw new Error('MYSQL_DATABASE must end in "_ci": this test drops a database named after it');
    const conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
    });
    await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await conn.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.end();

    process.env.MYSQL_DATABASE = name;
    process.env.JWT_SECRET ??= 'test-secret-for-page-reports';
    process.env.ADMIN_EMAILS = 'admin@example.com';
    delete process.env.RESEND_API_KEY;
    quiet = vi.spyOn(console, 'warn').mockImplementation(() => {});

    ({ NextRequest } = await import('next/server'));
    db = await import('../db');
    reportSend = await import('../../app/r/[shortId]/p/[pageId]/report/send/route');
    adminPage = await import('../../app/api/admin/pages/[id]/route');
    adminImage = await import('../../app/api/admin/pages/[id]/images/[image]/route');
    ({ loadPublicPage } = await import('../publicPage'));
    ({ createUnlockToken } = await import('../unlock'));
    await db.ensureSchema();

    owner = await db.createUser('owner@example.com', 'x', 'Owner', 'business');
    admin = await db.createUser('admin@example.com', 'x', 'Admin', 'enterprise');
    page = await newPage('Black Friday weekend', 'cakes');
  });

  afterAll(async () => {
    quiet?.mockRestore();
    await db?.pool.end();
  });

  it('saves a report through a code that links to the page, and only emails the first open one', async () => {
    const res = await report('cakes', page.id, { reason: 'scam', message: 'It asks for my bank PIN.\nTwice.' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/r/cakes/p/${page.id}/report?sent=1`);
    expect(later).toHaveLength(1);
    await later.shift()(); // No Resend key here: it notes that and doesn't throw.

    const [saved] = await reportsOf(page.id);
    expect(saved).toMatchObject({ pageId: page.id, reason: 'scam', message: 'It asks for my bank PIN.\nTwice.', handledAt: null });
    expect(saved.page).toMatchObject({ name: 'Black Friday weekend', title: 'Black Friday weekend', ownerEmail: 'owner@example.com', takenDownAt: null });

    expect((await report('cakes', page.id, { reason: 'other' })).headers.get('location')).toMatch(/\?sent=1$/);
    expect(later).toHaveLength(0);
    expect(await reportsOf(page.id)).toHaveLength(2);
    expect(await db.countPagesWithOpenReports()).toBe(1);
  });

  it('sends back what was wrong, and saves nothing for it', async () => {
    const before = (await reportsOf(page.id)).length;
    const where = async (fields, options) => (await report('cakes', page.id, fields, options)).headers.get('location');
    expect(await where({ reason: 'nonsense' })).toMatch(/\?error=reason$/);
    expect(await where({ reason: 'scam', message: 'x'.repeat(1001) })).toMatch(/\?error=message$/);
    // A bot that fills in the hidden field is told it worked.
    expect(await where({ reason: 'scam', website: 'https://spam.example' })).toMatch(/\?sent=1$/);
    expect(await reportsOf(page.id)).toHaveLength(before);
  });

  it('only takes reports for a page you can see, from this site', async () => {
    expect((await report('cakes', page.id, { reason: 'scam' }, { headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect((await report('cakes', 'abc', { reason: 'scam' })).status).toBe(404);

    await db.createQRCodeWithinLimit({ shortId: 'elsewhere', userId: owner.id, title: 'Other', destinationUrl: 'https://example.com' }, () => null);
    expect((await report('elsewhere', page.id, { reason: 'scam' })).headers.get('location')).toBe('/code-unavailable?reason=not-found');

    const locked = (
      await db.createQRCodeWithinLimit(
        { shortId: 'cakes-locked', userId: owner.id, title: 'Locked', destinationUrl: `qrgo-page:${page.id}`, accessPassword: 'tea4two' },
        () => null
      )
    ).qrcode;
    expect((await report('cakes-locked', page.id, { reason: 'scam' })).headers.get('location')).toBe('/r/cakes-locked');
    const unlocked = await reportSend.POST(
      new NextRequest(`${BASE}/r/cakes-locked/p/${page.id}/report/send`, {
        method: 'POST',
        body: new URLSearchParams({ reason: 'harmful' }),
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.9', cookie: `qr-unlock=${await createUnlockToken(locked)}` },
      }),
      { params: Promise.resolve({ shortId: 'cakes-locked', pageId: String(page.id) }) }
    );
    expect(unlocked.headers.get('location')).toMatch(/\?sent=1$/);
  });

  it('lets each connection send 5 reports an hour', async () => {
    const other = await newPage('Spring sale', 'spring');
    for (let i = 0; i < 5; i += 1) {
      expect((await report('spring', other.id, { reason: 'other' }, { ip: '198.51.100.7' })).headers.get('location')).toMatch(/\?sent=1$/);
    }
    expect((await report('spring', other.id, { reason: 'other' }, { ip: '198.51.100.7' })).headers.get('location')).toMatch(/\?error=busy$/);
    expect(await reportsOf(other.id)).toHaveLength(5);
    // Someone else still can.
    expect((await report('spring', other.id, { reason: 'other' }, { ip: '198.51.100.8' })).headers.get('location')).toMatch(/\?sent=1$/);
    later.length = 0;
  });

  it('only lets admins act on pages', async () => {
    as(null);
    expect((await act(page.id, 'take-down')).status).toBe(403);
    as(owner);
    expect((await act(page.id, 'take-down')).status).toBe(403);
    expect(await visible('cakes', page.id)).toBe(true);

    as(admin);
    expect((await act(page.id, 'delete')).status).toBe(400);
    expect((await act(999999, 'take-down')).status).toBe(404);
  });

  it('closes reports and leaves the page up', async () => {
    as(admin);
    const res = await act(page.id, 'close-reports');
    expect(res.status).toBe(200);
    const { reports } = await res.json();
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every((r) => r.handledAt && r.handledByName === 'Admin')).toBe(true);
    expect(await visible('cakes', page.id)).toBe(true);
  });

  it('takes a page down, so visitors get “not found”, and restores it', async () => {
    await report('cakes', page.id, { reason: 'impersonation' }, { ip: '203.0.113.20' });
    expect(later).toHaveLength(1); // The first open report again, since the others were closed.
    later.length = 0;

    as(admin);
    const { reports } = await (await act(page.id, 'take-down')).json();
    expect(reports.every((r) => r.handledAt)).toBe(true);
    expect(reports[0].page).toMatchObject({ takenDownByName: 'Admin' });
    expect(reports[0].page.takenDownAt).toMatch(/Z$/);

    expect(await visible('cakes', page.id)).toBe(false);
    expect((await report('cakes', page.id, { reason: 'scam' }, { ip: '203.0.113.21' })).headers.get('location')).toBe('/code-unavailable?reason=not-found');
    // Its owner still has it, marked as taken down.
    expect((await db.getPageById(page.id, owner.id)).takenDownAt).toBeTruthy();
    expect(await db.countPagesWithOpenReports()).toBe(1); // Spring sale's

    await act(page.id, 'restore');
    expect(await visible('cakes', page.id)).toBe(true);
    expect((await db.getPageForAdmin(page.id)).takenDownAt).toBe(null);
  });

  it('shows a page’s images to admins only', async () => {
    const { image } = await db.addPageImage(
      { pageId: page.id, mimeType: 'image/png', width: 1, height: 1, hash: '0123456789abcdef', data: Buffer.from([0x89, 0x50]) },
      24
    );
    const get = () =>
      adminImage.GET(new NextRequest(`${BASE}/api/admin/pages/${page.id}/images/${image.id}-${image.hash}`), {
        params: Promise.resolve({ id: String(page.id), image: `${image.id}-${image.hash}` }),
      });
    as(owner);
    expect((await get()).status).toBe(403);
    as(admin);
    expect((await get()).status).toBe(200);
  });

  it('deletes a page’s reports with it', async () => {
    const other = await newPage('Gone soon', 'gone');
    await report('gone', other.id, { reason: 'other' }, { ip: '203.0.113.30' });
    later.length = 0;
    expect(await reportsOf(other.id)).toHaveLength(1);
    expect(await db.deletePage(other.id, owner.id)).toBe(true);
    expect(await reportsOf(other.id)).toHaveLength(0);
  });
});
