/**
 * Campaign pages against a real database: the API creates, lists, saves,
 * switches off and deletes pages; packages and their page limits are
 * enforced (even with several requests at once); one account can never
 * reach another's pages; a page can only show its own images; and deleting
 * a page or an account takes its images and reports with it while leaving
 * everyone else's alone.
 *
 * Calls the /api/pages route handlers directly, with getSession() answering
 * for whichever account the test is acting as.
 *
 * Needs MariaDB or MySQL, so it is skipped unless ANALYTICS_DB_TEST=1. CI's
 * database job runs it. It uses its own database, named after MYSQL_DATABASE
 * with "_ci" changed to "_pages_ci" (so it can run next to the other
 * database tests); that database is dropped and created again. Locally:
 *   ANALYTICS_DB_TEST=1 MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=ci \
 *     MYSQL_DATABASE=qrgo_ci npx vitest run campaignPages.db
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql from 'mysql2/promise';

const enabled = process.env.ANALYTICS_DB_TEST === '1';

// The account the next request comes from (null = signed out).
const session = vi.hoisted(() => ({ userId: null }));
vi.mock('../auth', async (importOriginal) => ({
  ...(await importOriginal()),
  getSession: async () => (session.userId ? { userId: session.userId } : null),
}));

const BASE = 'http://localhost:3000';

describe.skipIf(!enabled)('campaign pages (database)', () => {
  let db;
  let list;
  let one;
  let NextRequest;
  let business;
  let starter;
  let other;

  const as = (user) => {
    session.userId = user?.id ?? null;
  };

  const send = (handler, path, { method = 'GET', body, params = {} } = {}) =>
    handler(
      new NextRequest(`${BASE}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      }),
      { params: Promise.resolve(params) }
    );

  const createPage = (body) => send(list.POST, '/api/pages', { method: 'POST', body });
  const getPage = (id) => send(one.GET, `/api/pages/${id}`, { params: { id: String(id) } });
  const savePage = (id, body) => send(one.PUT, `/api/pages/${id}`, { method: 'PUT', body, params: { id: String(id) } });
  const patchPage = (id, body) => send(one.PATCH, `/api/pages/${id}`, { method: 'PATCH', body, params: { id: String(id) } });
  const deletePage = (id) => send(one.DELETE, `/api/pages/${id}`, { method: 'DELETE', params: { id: String(id) } });

  const count = async (sql, params = {}) => {
    const [rows] = await db.pool.query(sql, params);
    return Number(rows[0].n);
  };

  const addImage = async (pageId) => {
    const [result] = await db.pool.query(
      `INSERT INTO campaign_page_images (page_id, mime_type, width, height, hash, data)
       VALUES (:pageId, 'image/webp', 10, 10, '0123456789abcdef', :data)`,
      { pageId, data: Buffer.from([0, 1, 2, 255]) }
    );
    return result.insertId;
  };

  const addReport = (pageId) =>
    db.pool.query(
      `INSERT INTO campaign_page_reports (page_id, reason, created_at) VALUES (:pageId, 'spam', UTC_TIMESTAMP())`,
      { pageId }
    );

  /** A full page as the editor would save it. */
  const fullPage = (name, blocks = []) => ({
    name,
    endsAt: '2026-11-30T16:00:00+02:00',
    afterEnd: 'ended',
    keptButton: 'b-call',
    content: {
      theme: 'night',
      brand: '#F4B860',
      font: null,
      blocks: [
        { id: 'header', type: 'header', title: name, tagline: '', cover: null, logo: null },
        { id: 'contact', type: 'buttons', items: [{ id: 'b-call', kind: 'call', label: 'Call us', fields: { number: '021 555 0100' } }] },
        ...blocks,
      ],
    },
  });

  beforeAll(async () => {
    const name = (process.env.MYSQL_DATABASE ?? '').replace(/_ci$/, '_pages_ci');
    if (!/^\w+_pages_ci$/.test(name)) throw new Error('MYSQL_DATABASE must end in "_ci": this test drops a database named after it');
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
    process.env.JWT_SECRET ??= 'test-secret-for-campaign-pages';

    ({ NextRequest } = await import('next/server'));
    db = await import('../db');
    list = await import('../../app/api/pages/route');
    one = await import('../../app/api/pages/[id]/route');
    await db.ensureSchema();

    business = await db.createUser('business@example.com', 'x', 'Business', 'business');
    starter = await db.createUser('starter@example.com', 'x', 'Starter', 'starter');
    other = await db.createUser('other@example.com', 'x', 'Other', 'extended');
  });

  afterAll(async () => {
    await db?.pool.end();
  });

  it('needs a signed-in account', async () => {
    as(null);
    expect((await send(list.GET, '/api/pages')).status).toBe(401);
    expect((await createPage({ name: 'x' })).status).toBe(401);
    expect((await getPage(1)).status).toBe(401);
  });

  it('creates a page that starts with just its header, and lists it', async () => {
    as(business);
    const response = await createPage({ name: '  Spring menu ' });
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const { page } = await response.json();
    expect(page).toMatchObject({ name: 'Spring menu', published: true, takenDown: false, endsAt: null, afterEnd: 'ended', keptButton: null });
    expect(page.content.blocks).toEqual([
      { id: 'header', type: 'header', hidden: false, cover: null, logo: null, title: 'Spring menu', tagline: '' },
    ]);

    const listed = await (await send(list.GET, '/api/pages')).json();
    expect(listed).toMatchObject({ canEdit: true, limit: 20 });
    expect(listed.pages.map((p) => p.name)).toEqual(['Spring menu']);
    // The list leaves out each page's content.
    expect(listed.pages[0]).not.toHaveProperty('content');
  });

  it('refuses pages on Starter, but still lists what the account has', async () => {
    as(starter);
    const response = await createPage({ name: 'Nope' });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'PACKAGE_FEATURE' });
    expect(await (await send(list.GET, '/api/pages')).json()).toEqual({ pages: [], canEdit: false, limit: 0 });
  });

  it('refuses bad requests with where the problem is', async () => {
    as(business);
    expect((await createPage('not json')).status).toBe(400);
    expect(await (await createPage({ name: '' })).json()).toMatchObject({ path: 'name' });
    const bad = fullPage('Bad');
    bad.content.blocks[1].items[0].fields.number = 'call me';
    const response = await createPage(bad);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ path: 'blocks.1.items.0.fields.number' });
  });

  it('saves a whole page and reads it back as saved', async () => {
    as(business);
    const { page } = await (await createPage({ name: 'Black Friday' })).json();
    const response = await savePage(page.id, fullPage('Black Friday', [{ id: 'about', type: 'text', text: 'Order **ahead**.' }]));
    expect(response.status).toBe(200);
    const saved = (await response.json()).page;
    expect(saved).toMatchObject({ endsAt: '2026-11-30T14:00:00Z', afterEnd: 'ended', keptButton: 'b-call' });
    expect(saved.content.theme).toBe('night');
    expect(saved.content.blocks.map((b) => b.id)).toEqual(['header', 'contact', 'about']);

    const again = (await (await getPage(page.id)).json()).page;
    expect(again.content).toEqual(saved.content);
  });

  it('only lets a page show its own images', async () => {
    as(business);
    const { page: mine } = await (await createPage({ name: 'With photo' })).json();
    const { page: another } = await (await createPage({ name: 'Another' })).json();
    const myImage = await addImage(mine.id);
    const theirImage = await addImage(another.id);

    const withImage = (image) => fullPage('With photo', [{ id: 'photo', type: 'image', image, alt: 'A cake' }]);
    expect(await (await savePage(mine.id, withImage(theirImage))).json()).toMatchObject({ path: 'blocks.2.image' });
    expect((await savePage(mine.id, withImage(myImage))).status).toBe(200);
    // A new page has no images yet, so it can't show any.
    expect((await createPage(withImage(myImage))).status).toBe(400);
  });

  it('never lets one account reach another’s pages', async () => {
    as(business);
    const { page } = await (await createPage({ name: 'Private' })).json();
    as(other);
    expect((await getPage(page.id)).status).toBe(404);
    expect((await savePage(page.id, fullPage('Mine now'))).status).toBe(404);
    expect((await patchPage(page.id, { published: false })).status).toBe(404);
    expect((await deletePage(page.id)).status).toBe(404);
    expect((await getPage('abc')).status).toBe(404);
    as(business);
    expect((await (await getPage(page.id)).json()).page).toMatchObject({ name: 'Private', published: true });
  });

  it('keeps to the package’s page limit, even with several requests at once', async () => {
    const user = await db.createUser('limit@example.com', 'x', 'Limit', 'business');
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        db.createPageWithinLimit(
          { userId: user.id, name: `Page ${i}`, content: { v: 1 }, endsAt: null, afterEnd: 'ended', keptButton: null },
          () => 2
        )
      )
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok).map((r) => r.reason)).toEqual(['limit', 'limit']);
    expect(await count('SELECT COUNT(*) AS n FROM campaign_pages WHERE user_id = :id', { id: user.id })).toBe(2);
  });

  it('after a downgrade, pages can be switched off and deleted but not edited', async () => {
    const user = await db.createUser('downgrade@example.com', 'x', 'Downgrade', 'business');
    as(user);
    const { page } = await (await createPage({ name: 'Old campaign' })).json();
    const image = await addImage(page.id);
    await addReport(page.id);
    await db.updateUserPackage(user.id, 'starter');

    expect((await savePage(page.id, fullPage('Edited'))).status).toBe(403);
    const switched = await patchPage(page.id, { published: false });
    expect(switched.status).toBe(200);
    expect((await switched.json()).page.published).toBe(false);
    expect((await patchPage(page.id, { published: 'no' })).status).toBe(400);

    expect((await deletePage(page.id)).status).toBe(200);
    expect(await count('SELECT COUNT(*) AS n FROM campaign_pages WHERE id = :id', { id: page.id })).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM campaign_page_images WHERE id = :image', { image })).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM campaign_page_reports WHERE page_id = :id', { id: page.id })).toBe(0);
  });

  it('deleting an account deletes its pages, images and reports, and nobody else’s', async () => {
    const leaving = await db.createUser('leaving@example.com', 'x', 'Leaving', 'business');
    const staying = await db.createUser('staying@example.com', 'x', 'Staying', 'business');
    as(leaving);
    const { page: gone } = await (await createPage({ name: 'Goes' })).json();
    await addImage(gone.id);
    await addReport(gone.id);
    as(staying);
    const { page: kept } = await (await createPage({ name: 'Stays' })).json();
    const keptImage = await addImage(kept.id);

    await db.setUserDisabled(leaving.id, true);
    expect(await db.deleteAccount(leaving.id)).toMatchObject({ ok: true });

    expect(await count('SELECT COUNT(*) AS n FROM campaign_pages WHERE user_id = :id', { id: leaving.id })).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM campaign_page_images WHERE page_id = :id', { id: gone.id })).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM campaign_page_reports WHERE page_id = :id', { id: gone.id })).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM campaign_pages WHERE id = :id', { id: kept.id })).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM campaign_page_images WHERE id = :id', { id: keptImage })).toBe(1);
  });
});
