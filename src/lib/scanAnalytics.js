/**
 * Read queries for the analytics dashboard and CSV export.
 *
 * Every query is limited to a "scope":
 *   { userId }                one account (null = every account, admin only)
 *   { codeId }                one code
 *   { collectionId }          a collection id, or 'default' for codes in none
 * Callers must check that the code/collection belongs to the user first.
 *
 * Bots are left out everywhere except the "filtered" count. Times are stored
 * in UTC and grouped in the viewer's timezone via `offsetMinutes`. Numbers
 * inlined into SQL (offset, limits, ids) are validated integers; everything
 * else goes through placeholders.
 */

import { computePeriods, bucketKeys, toSqlDateTime, sqlToIso } from './analyticsFilters';
import { pool, ensureSchema } from './db';

const LIST_LIMIT = 20;
const PLACE_LIMIT = 50;
const TOP_LIMIT = 10;
const RECENT_LIMIT = 20;
const EXPORT_BATCH = 5000;

// Columns that can be broken down by, so a column name is never user input.
const BREAKDOWN_COLUMNS = new Set(['country_code', 'device_type', 'os', 'browser', 'language']);

function int(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`Expected an integer, got ${value}`);
  return n;
}

const toNumber = (value) => Number(value) || 0;

/** Fill in missing scope keys so `=== null` checks are reliable. */
function normalizeScope({ userId = null, codeId = null, collectionId = null } = {}) {
  return { userId, codeId, collectionId };
}

async function rows(sql, params) {
  const [result] = await pool.query(sql, params);
  return result;
}

/** WHERE clauses + params for a scope (without the time range). */
function scopeWhere({ userId = null, codeId = null, collectionId = null }) {
  const clauses = [];
  const params = {};
  if (userId !== null) {
    clauses.push('e.user_id = :userId');
    params.userId = userId;
  }
  if (codeId !== null) {
    clauses.push('e.qrcode_id = :codeId');
    params.codeId = codeId;
  }
  if (collectionId === 'default') {
    clauses.push('e.qrcode_id IN (SELECT id FROM qrcodes WHERE user_id = :userId AND collection_id IS NULL)');
  } else if (collectionId !== null) {
    clauses.push('e.qrcode_id IN (SELECT id FROM qrcodes WHERE collection_id = :collectionId)');
    params.collectionId = collectionId;
  }
  return { clauses, params };
}

/** Same scope applied to the qrcodes table (for all-time totals). */
function codeScopeWhere({ userId = null, codeId = null, collectionId = null }) {
  const clauses = [];
  if (userId !== null) clauses.push('q.user_id = :userId');
  if (codeId !== null) clauses.push('q.id = :codeId');
  if (collectionId === 'default') clauses.push('q.collection_id IS NULL');
  else if (collectionId !== null) clauses.push('q.collection_id = :collectionId');
  return clauses;
}

/** Build a WHERE for human scans in [from, to) within a scope. */
function periodWhere(scope, from, to, { bots = false } = {}) {
  const { clauses, params } = scopeWhere(scope);
  const all = [`e.is_bot = ${bots ? 1 : 0}`, ...clauses];
  if (from !== null) {
    all.push('e.scanned_at >= :from');
    params.from = toSqlDateTime(from);
  }
  if (to !== null) {
    all.push('e.scanned_at < :to');
    params.to = toSqlDateTime(to);
  }
  return { where: `WHERE ${all.join(' AND ')}`, params };
}

function localTime(offsetMinutes) {
  return `DATE_ADD(e.scanned_at, INTERVAL ${int(offsetMinutes)} MINUTE)`;
}

/** SQL for a scan's chart bucket key ("YYYY-MM-DD"); matches bucketKeys(). */
function bucketSql(bucket, offsetMinutes) {
  const local = localTime(offsetMinutes);
  if (bucket === 'week') return `DATE_SUB(DATE(${local}), INTERVAL WEEKDAY(${local}) DAY)`;
  if (bucket === 'month') return `DATE_FORMAT(${local}, '%Y-%m-01')`;
  return `DATE(${local})`;
}

function idList(ids) {
  return ids.map(int).join(',');
}

async function totals(where, params) {
  const [row] = await rows(
    `SELECT COUNT(*) AS scans, COUNT(DISTINCT e.visitor_hash) AS uniques FROM scan_events e ${where}`,
    params
  );
  return { scans: toNumber(row.scans), uniques: toNumber(row.uniques) };
}

async function breakdown(column, where, params, limit = LIST_LIMIT) {
  if (!BREAKDOWN_COLUMNS.has(column)) throw new Error(`Unknown column ${column}`);
  const result = await rows(
    `SELECT e.${column} AS label, COUNT(*) AS scans
     FROM scan_events e ${where}
     GROUP BY e.${column}
     ORDER BY scans DESC
     LIMIT ${int(limit)}`,
    params
  );
  return result.map((r) => ({ label: r.label ?? null, scans: toNumber(r.scans) }));
}

/** Scans per destination URL for one code, over all time. */
async function destinationHistory(codeId) {
  let history = await rows(
    `SELECT destination_url AS url, started_at AS startedAt
     FROM qrcode_destinations WHERE qrcode_id = :codeId
     ORDER BY started_at, id`,
    { codeId }
  );
  if (history.length === 0) {
    // Code created before history was kept and never changed since.
    history = await rows(
      'SELECT destination_url AS url, created_at AS startedAt FROM qrcodes WHERE id = :codeId',
      { codeId }
    );
  }

  const result = [];
  for (let i = 0; i < history.length; i++) {
    const startedAt = history[i].startedAt;
    const endedAt = history[i + 1]?.startedAt ?? null;
    const [row] = await rows(
      `SELECT COUNT(*) AS scans FROM scan_events e
       WHERE e.qrcode_id = :codeId AND e.is_bot = 0 AND e.scanned_at >= :startedAt
       ${endedAt ? 'AND e.scanned_at < :endedAt' : ''}`,
      { codeId, startedAt, endedAt }
    );
    result.push({
      url: history[i].url,
      startedAt: sqlToIso(startedAt),
      endedAt: sqlToIso(endedAt),
      scans: toNumber(row.scans),
    });
  }
  return result.reverse(); // newest first
}

/** Codes with the most scans in the period, with previous-period counts and a trend line. */
async function topCodes({ scope, periods, offsetMinutes, includeOwner }) {
  const { where, params } = periodWhere(scope, periods.from, periods.to);
  const top = await rows(
    `SELECT e.qrcode_id AS id, COUNT(*) AS scans
     FROM scan_events e ${where}
     GROUP BY e.qrcode_id ORDER BY scans DESC LIMIT ${TOP_LIMIT}`,
    params
  );
  if (top.length === 0) return [];
  const ids = idList(top.map((r) => r.id));

  const [details, trend, previous] = await Promise.all([
    rows(
      `SELECT q.id, q.title, q.short_id AS shortId, u.id AS ownerId, u.name AS ownerName, u.email AS ownerEmail
       FROM qrcodes q JOIN users u ON u.id = q.user_id WHERE q.id IN (${ids})`
    ),
    rows(
      `SELECT e.qrcode_id AS id, ${bucketSql(periods.bucket, offsetMinutes)} AS bucket, COUNT(*) AS scans
       FROM scan_events e ${where} AND e.qrcode_id IN (${ids})
       GROUP BY e.qrcode_id, bucket`,
      params
    ),
    periods.prevFrom === null
      ? []
      : (() => {
          const prev = periodWhere(scope, periods.prevFrom, periods.prevTo);
          return rows(
            `SELECT e.qrcode_id AS id, COUNT(*) AS scans
             FROM scan_events e ${prev.where} AND e.qrcode_id IN (${ids})
             GROUP BY e.qrcode_id`,
            prev.params
          );
        })(),
  ]);

  const keys = bucketKeys({ ...periods, offsetMinutes });
  const byId = new Map(details.map((d) => [d.id, d]));
  const prevById = new Map(previous.map((p) => [p.id, toNumber(p.scans)]));

  return top.map((r) => {
    const d = byId.get(r.id) || {};
    const counts = new Map(trend.filter((t) => t.id === r.id).map((t) => [t.bucket, toNumber(t.scans)]));
    return {
      id: r.id,
      title: d.title ?? 'Deleted code',
      shortId: d.shortId ?? null,
      scans: toNumber(r.scans),
      prevScans: periods.prevFrom === null ? null : prevById.get(r.id) ?? 0,
      trend: keys.map((k) => counts.get(k) ?? 0),
      owner: includeOwner && d.ownerId ? { id: d.ownerId, name: d.ownerName, email: d.ownerEmail } : undefined,
    };
  });
}

async function topAccounts(where, params) {
  const top = await rows(
    `SELECT e.user_id AS id, COUNT(*) AS scans
     FROM scan_events e ${where}
     GROUP BY e.user_id ORDER BY scans DESC LIMIT ${TOP_LIMIT}`,
    params
  );
  if (top.length === 0) return [];
  const users = await rows(`SELECT id, name, email FROM users WHERE id IN (${idList(top.map((r) => r.id))})`);
  const byId = new Map(users.map((u) => [u.id, u]));
  return top.map((r) => ({
    id: r.id,
    name: byId.get(r.id)?.name ?? 'Deleted account',
    email: byId.get(r.id)?.email ?? null,
    scans: toNumber(r.scans),
  }));
}

/**
 * Everything the analytics dashboard shows, in one object, or null when
 * the requested code doesn't exist.
 *
 * `scope` — see the top of this file. `admin` adds Top accounts and code
 * owners. `nowMs` is injectable for tests.
 */
export async function getScanAnalytics({ scope: rawScope, range, offsetMinutes, admin = false, nowMs = Date.now() }) {
  await ensureSchema();
  const scope = normalizeScope(rawScope);

  // The selected code, for the page title (and so admins can open any code).
  let code = null;
  if (scope.codeId !== null) {
    [code] = await rows(
      `SELECT q.id, q.title, q.short_id AS shortId, u.id AS ownerId, u.name AS ownerName, u.email AS ownerEmail
       FROM qrcodes q JOIN users u ON u.id = q.user_id WHERE q.id = :codeId`,
      { codeId: scope.codeId }
    );
    if (!code) return null;
  }

  // Totals across all time: how many scans have details, and since when.
  const all = periodWhere(scope, null, null);
  const codeClauses = codeScopeWhere(scope);
  const [[meta], [codeTotals]] = await Promise.all([
    rows(`SELECT COUNT(*) AS tracked, MIN(e.scanned_at) AS firstScan FROM scan_events e ${all.where}`, all.params),
    rows(
      `SELECT COALESCE(SUM(q.scan_count), 0) AS total FROM qrcodes q
       ${codeClauses.length ? `WHERE ${codeClauses.join(' AND ')}` : ''}`,
      all.params
    ),
  ]);
  const firstScan = sqlToIso(meta.firstScan);
  const periods = computePeriods(range, nowMs, offsetMinutes, firstScan ? Date.parse(firstScan) : null);

  const { where, params } = periodWhere(scope, periods.from, periods.to);
  const bots = periodWhere(scope, periods.from, periods.to, { bots: true });
  const local = localTime(offsetMinutes);

  const [
    current,
    previous,
    [botRow],
    seriesRows,
    countries,
    cities,
    devices,
    os,
    browsers,
    languages,
    heatmap,
    recent,
    codes,
    accounts,
    destinations,
  ] = await Promise.all([
    totals(where, params),
    periods.prevFrom === null
      ? null
      : (() => {
          const prev = periodWhere(scope, periods.prevFrom, periods.prevTo);
          return totals(prev.where, prev.params);
        })(),
    rows(`SELECT COUNT(*) AS scans FROM scan_events e ${bots.where}`, bots.params),
    rows(
      `SELECT ${bucketSql(periods.bucket, offsetMinutes)} AS bucket, COUNT(*) AS scans, COUNT(DISTINCT e.visitor_hash) AS uniques
       FROM scan_events e ${where} GROUP BY bucket`,
      params
    ),
    breakdown('country_code', where, params, PLACE_LIMIT),
    rows(
      `SELECT e.country_code AS countryCode, e.region, e.city, COUNT(*) AS scans
       FROM scan_events e ${where} AND e.city IS NOT NULL
       GROUP BY e.country_code, e.region, e.city
       ORDER BY scans DESC LIMIT ${PLACE_LIMIT}`,
      params
    ),
    breakdown('device_type', where, params),
    breakdown('os', where, params),
    breakdown('browser', where, params),
    breakdown('language', where, params),
    rows(
      `SELECT WEEKDAY(${local}) AS dow, HOUR(${local}) AS hour, COUNT(*) AS scans
       FROM scan_events e ${where} GROUP BY dow, hour`,
      params
    ),
    rows(
      `SELECT e.scanned_at AS scannedAt, e.country_code AS countryCode, e.region, e.city,
              e.device_type AS deviceType, e.os, e.browser, e.qrcode_id AS codeId, q.title AS codeTitle
       FROM scan_events e JOIN qrcodes q ON q.id = e.qrcode_id
       ${where}
       ORDER BY e.scanned_at DESC, e.id DESC LIMIT ${RECENT_LIMIT}`,
      params
    ),
    scope.codeId === null ? topCodes({ scope, periods, offsetMinutes, includeOwner: admin }) : null,
    admin && scope.userId === null ? topAccounts(where, params) : null,
    scope.codeId !== null ? destinationHistory(scope.codeId) : null,
  ]);

  const seriesByKey = new Map(seriesRows.map((r) => [r.bucket, r]));
  const tracked = toNumber(meta.tracked);

  return {
    range,
    code: code
      ? {
          id: code.id,
          title: code.title,
          shortId: code.shortId,
          owner: admin ? { id: code.ownerId, name: code.ownerName, email: code.ownerEmail } : undefined,
        }
      : null,
    bucket: periods.bucket,
    from: new Date(periods.from).toISOString(),
    to: new Date(periods.to).toISOString(),
    summary: {
      scans: current.scans,
      uniques: current.uniques,
      prevScans: previous ? previous.scans : null,
      prevUniques: previous ? previous.uniques : null,
      botsFiltered: toNumber(botRow.scans),
      trackedScans: tracked,
      // All-time scans with no details: from before analytics started, or pruned.
      untrackedScans: Math.max(0, toNumber(codeTotals.total) - tracked),
      trackingSince: firstScan,
    },
    series: bucketKeys({ ...periods, offsetMinutes }).map((key) => ({
      key,
      scans: toNumber(seriesByKey.get(key)?.scans),
      uniques: toNumber(seriesByKey.get(key)?.uniques),
    })),
    countries: countries.map((c) => ({ code: c.label, scans: c.scans })),
    cities: cities.map((c) => ({
      countryCode: c.countryCode,
      region: c.region,
      city: c.city,
      scans: toNumber(c.scans),
    })),
    devices,
    os,
    browsers,
    languages,
    heatmap: heatmap.map((h) => ({ dow: toNumber(h.dow), hour: toNumber(h.hour), scans: toNumber(h.scans) })),
    recent: recent.map((r) => ({ ...r, scannedAt: sqlToIso(r.scannedAt) })),
    topCodes: codes,
    topAccounts: accounts,
    destinations,
  };
}

/**
 * Human scans in [from, to) for the CSV export, oldest first, in batches so a
 * large export never holds every row in memory.
 */
export async function* scanEventBatches({ scope, from, to, admin = false }) {
  await ensureSchema();
  const { where, params } = periodWhere(normalizeScope(scope), from, to);
  let afterId = 0;
  for (;;) {
    const batch = await rows(
      `SELECT e.id, e.scanned_at AS scannedAt, e.country_code AS countryCode, e.region, e.city,
              e.device_type AS deviceType, e.os, e.browser, e.language,
              q.title AS codeTitle, q.short_id AS shortId
              ${admin ? ', u.name AS ownerName, u.email AS ownerEmail' : ''}
       FROM scan_events e
       JOIN qrcodes q ON q.id = e.qrcode_id
       ${admin ? 'JOIN users u ON u.id = e.user_id' : ''}
       ${where} AND e.id > :afterId
       ORDER BY e.id LIMIT ${EXPORT_BATCH}`,
      { ...params, afterId }
    );
    if (batch.length === 0) return;
    yield batch.map((r) => ({ ...r, scannedAt: sqlToIso(r.scannedAt) }));
    if (batch.length < EXPORT_BATCH) return;
    afterId = batch[batch.length - 1].id;
  }
}
