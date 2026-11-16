/**
 * Who can see a campaign page, against a real database (lib/publicPage.js):
 * only through a code that links to it (its main destination or a live
 * schedule), only past that code's password, never when the owner is
 * disabled, and never once the page is switched off or taken down.
 *
 * Needs MariaDB or MySQL, so it is skipped unless ANALYTICS_DB_TEST=1. CI's
 * database job runs it. It uses its own database, named after MYSQL_DATABASE
 * with "_ci" changed to "_public_pages_ci"; that database is dropped and
 * created again. Locally:
 *   ANALYTICS_DB_TEST=1 MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=ci \
 *     MYSQL_DATABASE=qrgo_ci npx vitest run publicPage.db
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

const enabled = process.env.ANALYTICS_DB_TEST === '1';

describe.skipIf(!enabled)('who can see a campaign page (database)', () => {
  let db;
  let loadPublicPage;
  let pageReference;
  let createUnlockToken;
  let owner;
  let page;

  const toSql = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const HOUR = 60 * 60 * 1000;

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
    const created = await db.createQRCodeWithinLimit({ shortId, userId, title: shortId, destinationUrl, ...extra }, () => null);
    return created.qrcode;
  }

  beforeAll(async () => {
    const name = (process.env.MYSQL_DATABASE ?? '').replace(/_ci$/, '_public_pages_ci');
    if (!/^\w+_public_pages_ci$/.test(name)) throw new Error('MYSQL_DATABASE must end in "_ci": this test drops a database named after it');
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
    process.env.JWT_SECRET ??= 'test-secret-for-public-pages';

    db = await import('../db');
    ({ loadPublicPage } = await import('../publicPage'));
    ({ pageReference } = await import('../campaignPages'));
    ({ createUnlockToken } = await import('../unlock'));
    await db.ensureSchema();

    owner = await db.createUser('owner@example.com', 'x', 'Owner', 'business');
    page = await newPage(owner.id, 'Black Friday');
    await newCode(owner.id, 'linked', pageReference(page.id));
    await newCode(owner.id, 'website', 'https://example.com');
  });

  afterAll(async () => {
    await db?.pool.end();
  });

  it('shows the page through a code whose destination is the page', async () => {
    const result = await loadPublicPage({ shortId: 'linked', pageId: String(page.id) });
    expect(result.page).toMatchObject({ id: page.id, name: 'Black Friday', published: true });
    expect(result.qrcode.short_id).toBe('linked');
  });

  it('won’t show it through the owner’s other codes', async () => {
    expect(await loadPublicPage({ shortId: 'website', pageId: String(page.id) })).toEqual({ reason: 'not-found' });
  });

  it('won’t show another account’s page, even through a code that names it', async () => {
    const stranger = await db.createUser('stranger@example.com', 'x', 'Stranger', 'business');
    await newCode(stranger.id, 'stranger', pageReference(page.id));
    expect(await loadPublicPage({ shortId: 'stranger', pageId: String(page.id) })).toEqual({ reason: 'not-found' });
  });

  it('asks for the code’s password first, and shows the page once it’s entered', async () => {
    const locked = await newCode(owner.id, 'locked', pageReference(page.id), { accessPassword: 'tea4two' });
    expect(await loadPublicPage({ shortId: 'locked', pageId: String(page.id) })).toEqual({ locked: true });
    // Even for a page that doesn't exist: nothing is said about the page until then.
    expect(await loadPublicPage({ shortId: 'locked', pageId: '999999' })).toEqual({ locked: true });

    const unlockToken = await createUnlockToken(locked);
    const result = await loadPublicPage({ shortId: 'locked', pageId: String(page.id), unlockToken });
    expect(result.page?.id).toBe(page.id);
    // Another code's cookie doesn't open this one.
    const other = await newCode(owner.id, 'locked2', pageReference(page.id), { accessPassword: 'other' });
    expect(await loadPublicPage({ shortId: 'locked2', pageId: String(page.id), unlockToken })).toEqual({ locked: true });
    expect(other.short_id).toBe('locked2');
  });

  it('shows the page while a schedule that sends scans to it could be live', async () => {
    const code = await newCode(owner.id, 'scheduled', 'https://example.com');
    const schedule = await db.createSchedule(
      code.id,
      owner.id,
      { label: 'Black Friday', kind: 'range', destinationUrl: pageReference(page.id), timeZone: 'Africa/Johannesburg', startsAt: toSql(Date.now() - HOUR), endsAt: toSql(Date.now() + HOUR) },
      20
    );
    expect(schedule.ok).toBe(true);
    expect((await loadPublicPage({ shortId: 'scheduled', pageId: String(page.id) })).page?.id).toBe(page.id);

    // Switched off, it no longer links the page.
    await db.updateSchedule(code.id, owner.id, schedule.id, { enabled: false });
    expect(await loadPublicPage({ shortId: 'scheduled', pageId: String(page.id) })).toEqual({ reason: 'not-found' });
  });

  it('stops once a schedule has ended', async () => {
    const code = await newCode(owner.id, 'ended-schedule', 'https://example.com');
    await db.createSchedule(
      code.id,
      owner.id,
      { label: 'Last week', kind: 'range', destinationUrl: pageReference(page.id), timeZone: 'UTC', startsAt: toSql(Date.now() - 48 * HOUR), endsAt: toSql(Date.now() - HOUR) },
      20
    );
    expect(await loadPublicPage({ shortId: 'ended-schedule', pageId: String(page.id) })).toEqual({ reason: 'not-found' });
  });

  it('hides the page when it’s switched off or taken down', async () => {
    const other = await newPage(owner.id, 'Switch me');
    await newCode(owner.id, 'switch', pageReference(other.id));
    expect((await loadPublicPage({ shortId: 'switch', pageId: String(other.id) })).page).toBeTruthy();

    await db.setPagePublished(other.id, owner.id, false);
    expect(await loadPublicPage({ shortId: 'switch', pageId: String(other.id) })).toEqual({ reason: 'not-found' });

    await db.setPagePublished(other.id, owner.id, true);
    await db.pool.query('UPDATE campaign_pages SET taken_down_at = UTC_TIMESTAMP() WHERE id = :id', { id: other.id });
    expect(await loadPublicPage({ shortId: 'switch', pageId: String(other.id) })).toEqual({ reason: 'not-found' });
  });

  it('says the code is inactive when its owner is disabled', async () => {
    const paused = await db.createUser('paused@example.com', 'x', 'Paused', 'business');
    const pausedPage = await newPage(paused.id, 'Paused page');
    await newCode(paused.id, 'paused', pageReference(pausedPage.id));
    await db.setUserDisabled(paused.id, true);
    expect(await loadPublicPage({ shortId: 'paused', pageId: String(pausedPage.id) })).toEqual({ reason: 'inactive' });
  });

  it('only shows pages through website codes, and refuses malformed addresses', async () => {
    await newCode(owner.id, 'phone', 'tel:0215550100', { contentType: 'phone' });
    expect(await loadPublicPage({ shortId: 'phone', pageId: String(page.id) })).toEqual({ reason: 'not-found' });
    for (const [shortId, pageId] of [['linked', '0'], ['linked', '1.5'], ['linked', 'abc'], ['no such', '1'], ['../x', '1'], ['linked', undefined]]) {
      expect(await loadPublicPage({ shortId, pageId })).toEqual({ reason: 'not-found' });
    }
  });
});
