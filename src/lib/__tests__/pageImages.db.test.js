/**
 * Photos on campaign pages, against a real database: uploading (owners on
 * packages with pages, checked by their bytes), loading them in the editor,
 * showing them to visitors only through a code that links to the page and
 * only once the saved page uses them, and clearing out ones it doesn't.
 *
 * Calls the route handlers directly, with getSession() answering for
 * whichever account the test is acting as.
 *
 * Needs MariaDB or MySQL, so it is skipped unless ANALYTICS_DB_TEST=1. CI's
 * database job runs it. It uses its own database, named after MYSQL_DATABASE
 * with "_ci" changed to "_page_images_ci"; that database is dropped and
 * created again. Locally:
 *   ANALYTICS_DB_TEST=1 MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=ci \
 *     MYSQL_DATABASE=qrgo_ci npx vitest run pageImages.db
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
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/** A different valid PNG each time (its size in the header changes). */
let pngCount = 0;
function anotherPng() {
  pngCount += 1;
  const bytes = Buffer.from(PNG_1X1);
  bytes.writeUInt32BE(pngCount + 1, 16);
  return bytes;
}

describe.skipIf(!enabled)('photos on campaign pages (database)', () => {
  let db;
  let upload;
  let ownerImage;
  let publicImage;
  let pageApi;
  let createUnlockToken;
  let NextRequest;
  let owner;
  let page;

  const as = (user) => {
    session.userId = user?.id ?? null;
  };

  const uploadFile = (pageId, bytes, type = 'image/png') => {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), 'photo.png');
    return upload.POST(new NextRequest(`${BASE}/api/pages/${pageId}/images`, { method: 'POST', body: form }), {
      params: Promise.resolve({ id: String(pageId) }),
    });
  };

  const imageParam = (image) => `${image.id}-${image.src.split('-').pop()}`;

  const getOwnerImage = (pageId, param) =>
    ownerImage.GET(new NextRequest(`${BASE}/api/pages/${pageId}/images/${param}`), {
      params: Promise.resolve({ id: String(pageId), image: param }),
    });

  const getPublicImage = (shortId, pageId, param, cookie) =>
    publicImage.GET(
      new NextRequest(`${BASE}/r/${shortId}/p/${pageId}/i/${param}`, { headers: cookie ? { cookie } : {} }),
      { params: Promise.resolve({ shortId, pageId: String(pageId), image: param }) }
    );

  const save = (pageId, content) =>
    pageApi.PUT(
      new NextRequest(`${BASE}/api/pages/${pageId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'With photos', content }),
      }),
      { params: Promise.resolve({ id: String(pageId) }) }
    );

  const contentWith = ({ cover = null, image = null } = {}) => ({
    theme: 'fresh',
    brand: '#1F6F4A',
    font: null,
    blocks: [
      { id: 'header', type: 'header', title: 'With photos', cover, logo: null },
      { id: 'photo', type: 'image', image, alt: 'The counter' },
    ],
  });

  beforeAll(async () => {
    const name = (process.env.MYSQL_DATABASE ?? '').replace(/_ci$/, '_page_images_ci');
    if (!/^\w+_page_images_ci$/.test(name)) throw new Error('MYSQL_DATABASE must end in "_ci": this test drops a database named after it');
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
    process.env.JWT_SECRET ??= 'test-secret-for-page-images';

    ({ NextRequest } = await import('next/server'));
    db = await import('../db');
    upload = await import('../../app/api/pages/[id]/images/route');
    ownerImage = await import('../../app/api/pages/[id]/images/[image]/route');
    publicImage = await import('../../app/r/[shortId]/p/[pageId]/i/[image]/route');
    pageApi = await import('../../app/api/pages/[id]/route');
    ({ createUnlockToken } = await import('../unlock'));
    await db.ensureSchema();

    owner = await db.createUser('owner@example.com', 'x', 'Owner', 'business');
    page = (
      await db.createPageWithinLimit(
        { userId: owner.id, name: 'With photos', content: contentWith(), endsAt: null, afterEnd: 'ended', keptButton: null },
        () => 100
      )
    ).page;
    await db.createQRCodeWithinLimit({ shortId: 'photos', userId: owner.id, title: 'Photos', destinationUrl: `qrgo-page:${page.id}` }, () => null);
  });

  afterAll(async () => {
    await db?.pool.end();
  });

  it('uploads a photo and gives the owner its address', async () => {
    as(owner);
    const response = await uploadFile(page.id, PNG_1X1);
    expect(response.status).toBe(201);
    const { image } = await response.json();
    expect(image).toMatchObject({ width: 1, height: 1 });
    expect(image.src).toMatch(new RegExp(`^/api/pages/${page.id}/images/${image.id}-[0-9a-f]{16}$`));

    const served = await getOwnerImage(page.id, imageParam(image));
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(Buffer.from(await served.arrayBuffer()).equals(PNG_1X1)).toBe(true);
  });

  it('refuses anything that isn’t a JPEG, PNG or WebP, whatever it says it is', async () => {
    as(owner);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const response = await uploadFile(page.id, svg, 'image/png');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Choose a JPEG, PNG or WebP photo.' });
  });

  it('only lets the page’s owner, on a package with pages, upload or see its photos', async () => {
    as(owner);
    const { image } = await (await uploadFile(page.id, anotherPng())).json();

    const stranger = await db.createUser('stranger@example.com', 'x', 'Stranger', 'business');
    as(stranger);
    expect((await uploadFile(page.id, PNG_1X1)).status).toBe(404);
    expect((await getOwnerImage(page.id, imageParam(image))).status).toBe(404);

    const starter = await db.createUser('starter@example.com', 'x', 'Starter', 'business');
    const starterPage = (
      await db.createPageWithinLimit({ userId: starter.id, name: 'Old', content: contentWith(), endsAt: null, afterEnd: 'ended', keptButton: null }, () => 100)
    ).page;
    await db.updateUserPackage(starter.id, 'starter');
    as(starter);
    expect((await uploadFile(starterPage.id, PNG_1X1)).status).toBe(403);

    as(null);
    expect((await uploadFile(page.id, PNG_1X1)).status).toBe(401);
  });

  it('shows visitors only the photos the saved page uses, through a code that links to it', async () => {
    as(owner);
    const { image: used } = await (await uploadFile(page.id, anotherPng())).json();
    const { image: unsaved } = await (await uploadFile(page.id, anotherPng())).json();
    expect((await save(page.id, contentWith({ cover: used.id }))).status).toBe(200);

    expect((await getPublicImage('photos', page.id, imageParam(used))).status).toBe(200);
    // Uploaded in the editor but not on the saved page: not public.
    expect((await getPublicImage('photos', page.id, imageParam(unsaved))).status).toBe(404);
    // The wrong hash, or a code that doesn't link to the page: not found.
    expect((await getPublicImage('photos', page.id, `${used.id}-0000000000000000`)).status).toBe(404);
    await db.createQRCodeWithinLimit({ shortId: 'unrelated', userId: owner.id, title: 'Other', destinationUrl: 'https://example.com' }, () => null);
    expect((await getPublicImage('unrelated', page.id, imageParam(used))).status).toBe(404);
  });

  it('protects a password-protected code’s photos with its password', async () => {
    as(owner);
    const { image } = await (await uploadFile(page.id, anotherPng())).json();
    await save(page.id, contentWith({ cover: image.id }));
    const locked = (
      await db.createQRCodeWithinLimit(
        { shortId: 'photos-locked', userId: owner.id, title: 'Locked', destinationUrl: `qrgo-page:${page.id}`, accessPassword: 'tea4two' },
        () => null
      )
    ).qrcode;
    expect((await getPublicImage('photos-locked', page.id, imageParam(image))).status).toBe(404);
    const cookie = `qr-unlock=${await createUnlockToken(locked)}`;
    expect((await getPublicImage('photos-locked', page.id, imageParam(image), cookie)).status).toBe(200);
  });

  it('clears out photos the saved page no longer uses', async () => {
    as(owner);
    const { image: keep } = await (await uploadFile(page.id, anotherPng())).json();
    const { image: drop } = await (await uploadFile(page.id, anotherPng())).json();
    const response = await save(page.id, contentWith({ image: keep.id }));
    const body = await response.json();
    expect(body.images.map((i) => i.id)).toEqual([keep.id]);
    expect((await getOwnerImage(page.id, imageParam(drop))).status).toBe(404);
  });

  it('keeps a page to a set number of stored photos, clearing unused ones first', async () => {
    as(owner);
    const full = (
      await db.createPageWithinLimit({ userId: owner.id, name: 'Full', content: contentWith(), endsAt: null, afterEnd: 'ended', keptButton: null }, () => 100)
    ).page;
    for (let i = 0; i < 12; i += 1) expect((await uploadFile(full.id, anotherPng())).status).toBe(201);
    // None of the 12 is used by the saved page, so they make room for the 13th.
    expect((await uploadFile(full.id, anotherPng())).status).toBe(201);
    expect((await db.getPageImages(full.id)).length).toBe(1);
  });
});
