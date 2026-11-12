/**
 * Code types against a real database: what's stored for each kind of code,
 * and that schedules and scheduled changes stay website-only.
 *
 * Needs MariaDB or MySQL, so it is skipped unless ANALYTICS_DB_TEST=1. CI's
 * database job runs it. It uses its own database, named after MYSQL_DATABASE
 * (which must end in "_ci") with "_types" before the "_ci", and drops and
 * creates it again. Locally:
 *   ANALYTICS_DB_TEST=1 MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=ci \
 *     MYSQL_DATABASE=qrgo_ci npx vitest run contentTypes.db
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { parseContent } from '../contentTypes';
import { sealContent, openContent, clientContent } from '../codeContent';

const enabled = process.env.ANALYTICS_DB_TEST === '1';
const SECRET = 'content-types-db-test-secret';
const unlimited = () => null;

describe.skipIf(!enabled)('code types (database)', () => {
  let db;
  let userId;

  beforeAll(async () => {
    const base = process.env.MYSQL_DATABASE ?? '';
    if (!/^\w+_ci$/.test(base)) throw new Error('MYSQL_DATABASE must end in "_ci": this test drops a database');
    // A database of its own, so it can run alongside the other database tests.
    const name = base.replace(/_ci$/, '_types_ci');
    process.env.MYSQL_DATABASE = name;
    process.env.CONTENT_SECRET = SECRET;
    const admin = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
    });
    await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.end();

    db = await import('../db');
    await db.ensureSchema();
    const user = await db.createUser('types@example.com', 'x', 'Types', 'starter');
    userId = user.id;
  });

  afterAll(async () => {
    await db?.pool.end();
  });

  async function create(shortId, type, input, getLimit = unlimited) {
    const checked = parseContent(type, input);
    expect(checked.ok).toBe(true);
    const isStatic = type === 'wifi';
    return db.createQRCodeWithinLimit(
      {
        shortId,
        userId,
        title: `${type} code`,
        destinationUrl: checked.destination,
        contentType: type,
        contentData: isStatic ? sealContent(checked.content, shortId) : null,
      },
      getLimit
    );
  }

  async function historyRows(qrcodeId) {
    const [rows] = await db.pool.execute('SELECT destination_url FROM qrcode_destinations WHERE qrcode_id = :qrcodeId', {
      qrcodeId,
    });
    return rows.map((r) => r.destination_url);
  }

  it('stores a dynamic type in its destination, with history', async () => {
    const { ok, qrcode } = await create('email00001', 'email', { to: 'hello@acme.co.za', subject: 'Hi' });
    expect(ok).toBe(true);
    expect(qrcode.content_type).toBe('email');
    expect(qrcode.content_data).toBe(null);
    expect(qrcode.destination_url).toBe('mailto:hello@acme.co.za?subject=Hi');
    expect(await historyRows(qrcode.id)).toEqual(['mailto:hello@acme.co.za?subject=Hi']);
  });

  it('stores Wi-Fi details only encrypted, with no destination or history', async () => {
    const wifi = { ssid: 'Cafe Guest', security: 'WPA', password: 'coffee;1234' };
    const { qrcode } = await create('wifi000001', 'wifi', wifi);
    expect(qrcode.destination_url).toBe('');
    expect(await historyRows(qrcode.id)).toEqual([]);

    // Nothing readable anywhere in the row.
    const [rows] = await db.pool.execute('SELECT * FROM qrcodes WHERE id = :id', { id: qrcode.id });
    const raw = JSON.stringify(rows[0]);
    expect(raw).not.toContain('coffee');
    expect(raw).not.toContain('Cafe Guest');
    expect(openContent(rows[0].content_data, 'wifi000001', SECRET)).toMatchObject(wifi);

    // The owner's list gets it back, decrypted.
    const list = await db.getQRCodesByUserId(userId);
    const row = list.find((q) => q.id === qrcode.id);
    expect(row.contentType).toBe('wifi');
    expect(clientContent(row)).toMatchObject(wifi);
  });

  it('keeps a Wi-Fi code’s details when only its title changes', async () => {
    const { qrcode } = await create('wifi000002', 'wifi', { ssid: 'Office', security: 'nopass' });
    const updated = await db.updateQRCode(qrcode.id, userId, { title: 'Renamed' });
    expect(updated.title).toBe('Renamed');
    expect(updated.destination_url).toBe('');
    expect(updated.content_data).toBe(qrcode.content_data);
    expect(await historyRows(qrcode.id)).toEqual([]);
  });

  it('records history when a dynamic type’s details change', async () => {
    const { qrcode } = await create('phone00001', 'phone', { number: '+27821234567' });
    await db.updateQRCode(qrcode.id, userId, { destinationUrl: 'tel:+27829999999' });
    expect(await historyRows(qrcode.id)).toEqual(['tel:+27821234567', 'tel:+27829999999']);
  });

  it('keeps schedules and scheduled changes for website codes', async () => {
    const { qrcode: email } = await create('email00002', 'email', { to: 'a@b.co' });
    const { qrcode: wifi } = await create('wifi000003', 'wifi', { ssid: 'Net', security: 'nopass' });
    const { qrcode: site } = await create('site000001', 'url', { url: 'https://example.com' });

    const later = new Date(Date.now() + 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
    const change = { destinationUrl: 'https://example.com/b', startsAt: later };
    expect(await db.scheduleDestinationChange(email.id, userId, change, 20)).toEqual({ ok: false, reason: 'unsupported' });
    expect(await db.scheduleDestinationChange(wifi.id, userId, change, 20)).toEqual({ ok: false, reason: 'unsupported' });
    expect(await db.scheduleDestinationChange(site.id, userId, change, 20)).toEqual({ ok: true });

    const schedule = {
      label: 'Sale',
      kind: 'range',
      destinationUrl: 'https://example.com/sale',
      timeZone: 'UTC',
      startsAt: later,
      endsAt: later.replace(/^(\d{4})/, (y) => String(Number(y) + 1)),
    };
    expect(await db.createSchedule(wifi.id, userId, schedule, 20)).toEqual({ ok: false, reason: 'unsupported' });
    expect(await db.createSchedule(email.id, userId, schedule, 20)).toEqual({ ok: false, reason: 'unsupported' });
    expect((await db.createSchedule(site.id, userId, schedule, 20)).ok).toBe(true);
  });

  it('counts static codes toward the package limit', async () => {
    const [counts] = await db.pool.execute('SELECT COUNT(*) AS n FROM qrcodes WHERE user_id = :userId', { userId });
    const limit = Number(counts[0].n);
    const result = await create('wifi000004', 'wifi', { ssid: 'Over', security: 'nopass' }, () => limit);
    expect(result).toEqual({ ok: false, reason: 'limit', limit });
  });

  it('treats codes from before types existed as website codes', async () => {
    await db.pool.execute(
      `INSERT INTO qrcodes (short_id, user_id, title, destination_url) VALUES ('legacy0001', :userId, 'Old', 'https://example.com/old')`,
      { userId }
    );
    const code = await db.getQRCodeByShortId('legacy0001');
    expect(code.content_type).toBe('url');
    expect(code.content_data).toBe(null);
  });
});
