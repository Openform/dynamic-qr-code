/**
 * Calendar and contact files on campaign pages, against a real database:
 * visitors get them only through a code that links to the page, only for a
 * button they can see, and behind the code's password; the owner gets them
 * from the saved page.
 *
 * Calls the route handlers directly, with getSession() answering for
 * whichever account the test is acting as.
 *
 * Needs MariaDB or MySQL, so it is skipped unless ANALYTICS_DB_TEST=1. CI's
 * database job runs it. It uses its own database, named after MYSQL_DATABASE
 * with "_ci" changed to "_page_files_ci"; that database is dropped and
 * created again. Locally:
 *   ANALYTICS_DB_TEST=1 MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=ci \
 *     MYSQL_DATABASE=qrgo_ci npx vitest run pageFiles.db
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql from 'mysql2/promise';

const enabled = process.env.ANALYTICS_DB_TEST === '1';

const session = vi.hoisted(() => ({ userId: null }));
vi.mock('../auth', async (importOriginal) => ({
  ...(await importOriginal()),
  getSession: async () => (session.userId ? { userId: session.userId } : null),
}));

const BASE = 'http://localhost:3000';

describe.skipIf(!enabled)('calendar and contact files (database)', () => {
  let db;
  let publicFile;
  let ownerFile;
  let createUnlockToken;
  let NextRequest;
  let owner;
  let page;

  const as = (user) => {
    session.userId = user?.id ?? null;
  };

  const getPublic = (shortId, pageId, file, cookie) =>
    publicFile.GET(new NextRequest(`${BASE}/r/${shortId}/p/${pageId}/f/${file}`, { headers: cookie ? { cookie } : {} }), {
      params: Promise.resolve({ shortId, pageId: String(pageId), file }),
    });

  const getOwner = (pageId, file) =>
    ownerFile.GET(new NextRequest(`${BASE}/api/pages/${pageId}/files/${file}`), { params: Promise.resolve({ id: String(pageId), file }) });

  const content = ({ hidden = false } = {}) => ({
    v: 1,
    theme: 'fresh',
    brand: '#1F6F4A',
    font: null,
    blocks: [
      { id: 'header', type: 'header', hidden: false, title: 'Summer market', tagline: '', cover: null, logo: null },
      {
        id: 'buttons',
        type: 'buttons',
        hidden,
        items: [
          {
            id: 'b-cal',
            kind: 'calendar',
            label: 'Add to calendar',
            fields: { title: 'Summer market', startsAt: '2026-12-06T08:00:00.000Z', endsAt: '', location: 'The Old Mill', details: '' },
          },
          {
            id: 'b-card',
            kind: 'contact',
            label: 'Save our contact',
            fields: { name: 'Bean There', organisation: '', phone: '0215550100', email: '', website: '', address: '' },
          },
        ],
      },
    ],
  });

  beforeAll(async () => {
    const name = (process.env.MYSQL_DATABASE ?? '').replace(/_ci$/, '_page_files_ci');
    if (!/^\w+_page_files_ci$/.test(name)) throw new Error('MYSQL_DATABASE must end in "_ci": this test drops a database named after it');
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
    process.env.JWT_SECRET ??= 'test-secret-for-page-files';

    ({ NextRequest } = await import('next/server'));
    db = await import('../db');
    publicFile = await import('../../app/r/[shortId]/p/[pageId]/f/[file]/route');
    ownerFile = await import('../../app/api/pages/[id]/files/[file]/route');
    ({ createUnlockToken } = await import('../unlock'));
    await db.ensureSchema();

    owner = await db.createUser('owner@example.com', 'x', 'Owner', 'business');
    page = (
      await db.createPageWithinLimit(
        { userId: owner.id, name: 'Market', content: content(), endsAt: null, afterEnd: 'ended', keptButton: null },
        () => 100
      )
    ).page;
    await db.createQRCodeWithinLimit({ shortId: 'market', userId: owner.id, title: 'Market', destinationUrl: `qrgo-page:${page.id}` }, () => null);
  });

  afterAll(async () => {
    await db?.pool.end();
  });

  it('gives visitors the event and the contact card through a code that links to the page', async () => {
    const event = await getPublic('market', page.id, 'b-cal.ics');
    expect(event.status).toBe(200);
    expect(event.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(event.headers.get('content-disposition')).toBe('attachment; filename="summer-market.ics"');
    const text = await event.text();
    expect(text).toContain('DTSTART:20261206T080000Z');
    expect(text).toContain(`UID:page-${page.id}-b-cal@qrgo`);

    const card = await getPublic('market', page.id, 'b-card.vcf');
    expect(card.status).toBe(200);
    expect(await card.text()).toContain('FN:Bean There');
  });

  it('gives nothing for the wrong type, a missing button, or a code that doesn’t link to the page', async () => {
    expect((await getPublic('market', page.id, 'b-cal.vcf')).status).toBe(404);
    expect((await getPublic('market', page.id, 'b-nope.ics')).status).toBe(404);
    expect((await getPublic('market', page.id, 'b-cal.txt')).status).toBe(404);
    await db.createQRCodeWithinLimit({ shortId: 'elsewhere', userId: owner.id, title: 'Other', destinationUrl: 'https://example.com' }, () => null);
    expect((await getPublic('elsewhere', page.id, 'b-cal.ics')).status).toBe(404);
  });

  it('keeps a password-protected code’s files behind its password', async () => {
    const locked = (
      await db.createQRCodeWithinLimit(
        { shortId: 'market-locked', userId: owner.id, title: 'Locked', destinationUrl: `qrgo-page:${page.id}`, accessPassword: 'tea4two' },
        () => null
      )
    ).qrcode;
    expect((await getPublic('market-locked', page.id, 'b-cal.ics')).status).toBe(404);
    const cookie = `qr-unlock=${await createUnlockToken(locked)}`;
    expect((await getPublic('market-locked', page.id, 'b-cal.ics', cookie)).status).toBe(200);
  });

  it('gives visitors nothing for a hidden button, while the owner still gets it', async () => {
    await db.updatePage(page.id, owner.id, { name: 'Market', content: content({ hidden: true }), endsAt: null, afterEnd: 'ended', keptButton: null });
    expect((await getPublic('market', page.id, 'b-cal.ics')).status).toBe(404);

    as(owner);
    const own = await getOwner(page.id, 'b-cal.ics');
    expect(own.status).toBe(200);
    expect(await own.text()).toContain('SUMMARY:Summer market');
    expect((await getOwner(page.id, 'b-card.ics')).status).toBe(404);
  });

  it('only gives the owner’s copy to the signed-in owner', async () => {
    const stranger = await db.createUser('stranger@example.com', 'x', 'Stranger', 'business');
    as(stranger);
    expect((await getOwner(page.id, 'b-cal.ics')).status).toBe(404);
    as(null);
    expect((await getOwner(page.id, 'b-cal.ics')).status).toBe(401);
  });
});
