/**
 * Scans per destination against a real database: the Destinations card's
 * rows add up to the code's total, each row matches the dashboard narrowed to
 * it, and the CSV export says where every scan went.
 *
 * Needs MariaDB or MySQL, so it is skipped unless ANALYTICS_DB_TEST=1. CI's
 * database job runs it. MYSQL_DATABASE must end in "_ci": it is dropped and
 * created again. Locally:
 *   ANALYTICS_DB_TEST=1 MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=ci \
 *     MYSQL_DATABASE=qrgo_analytics_ci npx vitest run destinationAnalytics
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

const enabled = process.env.ANALYTICS_DB_TEST === '1';
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const A = 'https://example.com/menu';
const B = 'https://example.com/winter-menu';
const C = 'https://example.com/spring-menu'; // a change that hasn't started
const W = 'https://example.com/breakfast';
const W_BEFORE = 'https://example.com/old-breakfast';
const S = 'https://example.com/sale';
const D = 'https://example.com/gone';
const DELETED_SCHEDULE = 9999;

// Whole seconds, so times survive the DATETIME round trip.
const NOW = Math.floor(Date.now() / 1000) * 1000;
const sql = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const ago = (ms) => sql(NOW - ms);
const visitor = (n) => (n === null ? null : `visitor${String(n).padStart(9, '0')}`);

const PERIOD_1 = NOW - 60 * DAY;
const PERIOD_2 = NOW - 20 * DAY;
const PERIOD_3 = NOW - 5 * DAY;

describe.skipIf(!enabled)('scans per destination (database)', () => {
  let db;
  let api;
  let ids;

  beforeAll(async () => {
    const name = process.env.MYSQL_DATABASE ?? '';
    if (!/^\w+_ci$/.test(name)) throw new Error('MYSQL_DATABASE must end in "_ci": this test drops it');
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
    api = await import('../analyticsApi');
    await db.ensureSchema();
    ids = await seed(db.pool);
  });

  afterAll(async () => {
    await db?.pool.end();
  });

  async function get(query, { userId = ids.user, admin = false } = {}) {
    const res = await api.analyticsResponse(new Request(`http://localhost/api/analytics?${query}`), {
      userId: admin ? null : userId,
      admin,
    });
    return { status: res.status, body: await res.json() };
  }

  async function csv(query) {
    const res = await api.analyticsCsvResponse(new Request(`http://localhost/api/analytics/export?${query}`), {
      userId: ids.user,
    });
    expect(res.status).toBe(200);
    const lines = (await res.text()).replace(/^﻿/, '').trim().split('\r\n');
    const header = lines[0].split(',');
    return lines.slice(1).map((line) => Object.fromEntries(parseCsvLine(line).map((v, i) => [header[i], v])));
  }

  const allRows = (destinations) => [...destinations.main, ...destinations.schedules];
  const sum = (rows) => rows.reduce((n, r) => n + r.scans, 0);

  it('puts every scan in one row, matching the code’s total, for every range and time zone', async () => {
    for (const range of ['7d', '30d', '90d', '12m', 'all']) {
      for (const tz of [0, -120, 300]) {
        const { body } = await get(`range=${range}&tz=${tz}&codeId=${ids.code}`);
        const { destinations, summary } = body;
        expect(sum(allRows(destinations)), `${range} ${tz}`).toBe(summary.scans);
        expect(destinations.total).toEqual({ scans: summary.scans, uniques: summary.uniques });
      }
    }
  });

  it('counts each period, URL and schedule over all time', async () => {
    const { body } = await get(`range=all&tz=0&codeId=${ids.code}`);
    const { main, schedules, total } = body.destinations;
    const pick = (r) => ({ key: r.key, url: r.url, scans: r.scans, uniques: r.uniques, otherUrl: r.otherUrl });

    expect(main.map(pick)).toEqual([
      { key: `period-${ids.history[2]}`, url: A, scans: 4, uniques: 3, otherUrl: false },
      // Scans from before URLs were recorded, and after, count together.
      { key: `period-${ids.history[1]}`, url: B, scans: 4, uniques: 2, otherUrl: false },
      { key: `period-${ids.history[1]}`, url: A, scans: 1, uniques: 1, otherUrl: true },
      { key: `period-${ids.history[0]}`, url: A, scans: 3, uniques: 2, otherUrl: false },
    ]);
    expect(main[0]).toMatchObject({ current: true, endedAt: null, startedAt: new Date(PERIOD_3).toISOString() });
    expect(main[1]).toMatchObject({ current: false, endedAt: new Date(PERIOD_3).toISOString() });

    expect(schedules.map(pick)).toEqual([
      { key: `schedule-${ids.breakfast}`, url: W, scans: 5, uniques: 3, otherUrl: false },
      { key: `schedule-${ids.breakfast}`, url: W_BEFORE, scans: 2, uniques: 2, otherUrl: true },
      { key: `schedule-${ids.sale}`, url: S, scans: 3, uniques: 2, otherUrl: false },
      // Switched on with no scans yet; the switched-off one stays hidden.
      { key: `schedule-${ids.fresh}`, url: 'https://example.com/fresh', scans: 0, uniques: 0, otherUrl: false },
      { key: `schedule-${DELETED_SCHEDULE}`, url: D, scans: 1, uniques: 1, otherUrl: false },
    ]);
    expect(schedules.at(-1).schedule).toBeNull();
    expect(schedules[0].schedule).toMatchObject({ label: 'Breakfast', kind: 'weekly' });

    expect(total).toEqual({ scans: 23, uniques: 13 });
    expect(body.destinations.periods.map((p) => p.url)).toEqual([A, B, A]); // not the pending change
  });

  it('shows the range’s periods and schedules only', async () => {
    const { body } = await get(`range=7d&tz=0&codeId=${ids.code}`);
    const { main, schedules } = body.destinations;
    expect(main.map((r) => [r.url, r.scans])).toEqual([
      [A, 4],
      [B, 0], // live for part of the week, no scans in it
    ]);
    expect(schedules.map((r) => r.key)).not.toContain(`schedule-${ids.sale}`);
  });

  it('narrows every panel to one destination and matches its row', async () => {
    for (const range of ['7d', '30d', 'all']) {
      const { body: all } = await get(`range=${range}&tz=0&codeId=${ids.code}`);
      const rows = allRows(all.destinations);
      const keys = [...new Set(rows.map((r) => r.key)), 'main'];
      for (const key of keys) {
        const { status, body } = await get(`range=${range}&tz=0&codeId=${ids.code}&destination=${key}`);
        expect(status).toBe(200);
        const matching = key === 'main' ? all.destinations.main : rows.filter((r) => r.key === key);
        expect(body.summary.scans, `${range} ${key}`).toBe(sum(matching));
        if (matching.length === 1) expect(body.summary.uniques).toBe(matching[0].uniques);
        expect(body.destination).toBe(key);
        expect(body.series.reduce((n, p) => n + p.scans, 0)).toBe(body.summary.scans);
        // The card itself still shows every destination.
        expect(body.destinations.total).toEqual(all.destinations.total);
        expect(sum(allRows(body.destinations))).toBe(all.summary.scans);
      }
    }
  });

  it('refuses destinations that aren’t the code’s', async () => {
    expect((await get(`range=all&codeId=${ids.code}&destination=period-${ids.pending}`)).status).toBe(404);
    expect((await get(`range=all&codeId=${ids.code}&destination=period-${ids.otherHistory}`)).status).toBe(404);
    expect((await get(`range=all&destination=main`)).status).toBe(400);
    expect((await get(`range=all&codeId=${ids.code}&destination=everywhere`)).status).toBe(400);
    // Another code's schedule: allowed, but none of its scans are this code's.
    const { body } = await get(`range=all&codeId=${ids.code}&destination=schedule-${ids.otherSchedule}`);
    expect(body.summary.scans).toBe(0);
  });

  it('calls a code’s only period its main destination', async () => {
    const { body } = await get(`range=all&tz=0&codeId=${ids.otherCode}`);
    expect(body.destinations.main.map((r) => [r.key, r.scans])).toEqual([['main', 3]]);
    expect(body.destinations.schedules.map((r) => [r.key, r.scans])).toEqual([[`schedule-${ids.otherSchedule}`, 1]]);
    // A link to the period by its id still works.
    const byId = await get(`range=all&tz=0&codeId=${ids.otherCode}&destination=period-${ids.otherHistory}`);
    expect(byId.body.summary.scans).toBe(3);
  });

  it('works for admins too', async () => {
    const { status, body } = await get(`range=all&codeId=${ids.code}&destination=schedule-${ids.breakfast}`, {
      admin: true,
    });
    expect(status).toBe(200);
    expect(body.summary.scans).toBe(7);
  });

  it('exports where each scan went', async () => {
    const rows = await csv(`range=all&tz=0&codeId=${ids.code}`);
    expect(rows).toHaveLength(23);
    const count = (url, schedule = '') =>
      rows.filter((r) => r.Destination === url && r.Schedule === schedule).length;
    // Scans recorded without a URL get the main destination live at the time.
    expect(count(A)).toBe(3 + 1 + 4);
    expect(count(B)).toBe(4);
    expect(count(W, 'Breakfast')).toBe(5);
    expect(count(W_BEFORE, 'Breakfast')).toBe(2);
    expect(count(S, 'Sale')).toBe(3);
    expect(count(D, 'Deleted schedule')).toBe(1);

    const breakfast = await csv(`range=all&tz=0&codeId=${ids.code}&destination=schedule-${ids.breakfast}`);
    expect(breakfast).toHaveLength(7);
    const period = await csv(`range=all&tz=0&codeId=${ids.code}&destination=period-${ids.history[1]}`);
    expect(period.map((r) => r.Destination).sort()).toEqual([A, B, B, B, B]);
  });
});

/** Minimal CSV line parser for the export's own output. */
function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

/** The sample code, its history, schedules and scans. Returns the ids. */
async function seed(pool) {
  const insert = async (table, row) => {
    const columns = Object.keys(row);
    const [result] = await pool.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((c) => `:${c}`).join(', ')})`,
      row
    );
    return result.insertId;
  };

  const user = await insert('users', {
    email: 'owner@example.com',
    password_hash: 'x',
    name: 'Owner',
    package: 'business',
  });
  const code = await insert('qrcodes', {
    short_id: 'dest1',
    user_id: user,
    title: 'Menu',
    destination_url: A,
    created_at: sql(PERIOD_1),
  });
  const otherCode = await insert('qrcodes', {
    short_id: 'dest2',
    user_id: user,
    title: 'Other',
    destination_url: 'https://example.com/other',
    created_at: sql(PERIOD_1),
  });

  const history = [];
  for (const [url, startedAt] of [
    [A, PERIOD_1],
    [B, PERIOD_2],
    [A, PERIOD_3],
  ]) {
    history.push(await insert('qrcode_destinations', { qrcode_id: code, destination_url: url, started_at: sql(startedAt) }));
  }
  const pending = await insert('qrcode_destinations', {
    qrcode_id: code,
    destination_url: C,
    started_at: sql(NOW + 2 * DAY),
  });
  const otherHistory = await insert('qrcode_destinations', {
    qrcode_id: otherCode,
    destination_url: 'https://example.com/other',
    started_at: sql(PERIOD_1),
  });

  const weekly = { kind: 'weekly', time_zone: 'Africa/Johannesburg', days: 127, start_time: '07:00', end_time: '11:00' };
  const breakfast = await insert('qrcode_schedules', {
    qrcode_id: code,
    label: 'Breakfast',
    destination_url: W,
    position: 0,
    ...weekly,
  });
  const sale = await insert('qrcode_schedules', {
    qrcode_id: code,
    label: 'Sale',
    kind: 'range',
    destination_url: S,
    time_zone: 'Africa/Johannesburg',
    starts_at: ago(9 * DAY),
    ends_at: ago(7 * DAY),
    position: 1,
  });
  await insert('qrcode_schedules', {
    qrcode_id: code,
    label: 'Switched off',
    destination_url: 'https://example.com/off',
    position: 2,
    enabled: 0,
    ...weekly,
  });
  const fresh = await insert('qrcode_schedules', {
    qrcode_id: code,
    label: 'Fresh',
    destination_url: 'https://example.com/fresh',
    position: 3,
    ...weekly,
  });
  const otherSchedule = await insert('qrcode_schedules', {
    qrcode_id: otherCode,
    label: 'Other',
    destination_url: 'https://example.com/other-schedule',
    position: 0,
    ...weekly,
  });

  // [when, visitor, recorded URL (null = before URLs were recorded), schedule, bot]
  const scans = [
    // Period 1 (A), all from before URLs were recorded.
    [ago(50 * DAY), 1, null, null],
    [ago(45 * DAY), 2, null, null],
    [ago(25 * DAY), 1, null, null],
    [ago(40 * DAY), 90, null, null, true],
    // Period 2 (B): one old scan, then recorded ones, one by the same visitor.
    [ago(18 * DAY), 3, null, null],
    [ago(15 * DAY), 3, B, null],
    [ago(10 * DAY), 4, B, null],
    [ago(10 * DAY), 4, B, null],
    // Recorded going to A in the second the change to B started.
    [sql(PERIOD_2), 5, A, null],
    [ago(8 * DAY), 1, S, 'sale'],
    [ago(8 * DAY), 6, S, 'sale'],
    [ago(8 * DAY), 6, S, 'sale'],
    [ago(12 * DAY), 7, W_BEFORE, 'breakfast'],
    [ago(12 * DAY), 8, W_BEFORE, 'breakfast'],
    // Period 3 (A again), from the second it started.
    [sql(PERIOD_3), 9, A, null],
    [ago(2 * DAY), 1, A, null],
    [ago(1 * DAY), 10, A, null],
    [ago(2 * DAY), null, A, null], // no visitor id: a scan, not a scanner
    [ago(3 * DAY), 1, W, 'breakfast'],
    [ago(3 * DAY), 11, W, 'breakfast'],
    [ago(2 * DAY), 11, W, 'breakfast'],
    [ago(1 * DAY), 12, W, 'breakfast'],
    [ago(1 * HOUR), 12, W, 'breakfast'],
    [ago(1 * DAY), 91, W, 'breakfast', true],
    [ago(1 * DAY), 13, D, 'deleted'],
  ];
  const scheduleIds = { sale, breakfast, deleted: DELETED_SCHEDULE };
  for (const [when, who, url, schedule, bot = false] of scans) {
    await insert('scan_events', {
      qrcode_id: code,
      user_id: user,
      scanned_at: when,
      visitor_hash: visitor(who),
      is_bot: bot ? 1 : 0,
      destination_url: url,
      schedule_id: schedule ? scheduleIds[schedule] : null,
    });
  }
  // The other code's scans, which must never show up.
  for (const [days, schedule] of [
    [1, null],
    [6, null],
    [30, null],
    [2, otherSchedule],
  ]) {
    await insert('scan_events', {
      qrcode_id: otherCode,
      user_id: user,
      scanned_at: ago(days * DAY),
      visitor_hash: visitor(1),
      is_bot: 0,
      destination_url: schedule ? 'https://example.com/other-schedule' : 'https://example.com/other',
      schedule_id: schedule,
    });
  }
  await pool.query('UPDATE qrcodes SET scan_count = 30 WHERE id IN (:code, :otherCode)', { code, otherCode });

  return { user, code, otherCode, history, pending, otherHistory, breakfast, sale, fresh, otherSchedule };
}
