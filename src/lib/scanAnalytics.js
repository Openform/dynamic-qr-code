/**
 * Read queries for the analytics dashboard and CSV export.
 *
 * Every query is limited to a "scope":
 *   { userId }                one account (null = every account, admin only)
 *   { codeId }                one code
 *   { collectionId }          a collection id, or 'default' for codes in none
 *   { destination }           with codeId: one destination of that code, from
 *                             resolveDestinationFilter()
 * Callers must check that the code/collection belongs to the user first.
 *
 * Bots are left out everywhere except the "filtered" count. Times are stored
 * in UTC and grouped in the viewer's timezone via `offsetMinutes`. Numbers
 * inlined into SQL (offset, limits, ids) are validated integers; everything
 * else goes through placeholders.
 */

import { computePeriods, bucketKeys, toSqlDateTime, sqlToIso, RANGES } from './analyticsFilters';
import { destinationRows, mainPeriods, mainUrlAt } from './destinationStats';
import { pool, ensureSchema, getSchedulesForCode } from './db';

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
function normalizeScope({ userId = null, codeId = null, collectionId = null, destination = null } = {}) {
  return { userId, codeId, collectionId, destination: codeId === null ? null : destination };
}

async function rows(sql, params) {
  const [result] = await pool.query(sql, params);
  return result;
}

/** WHERE clauses + params for a scope (without the time range). */
function scopeWhere({ userId = null, codeId = null, collectionId = null, destination = null }) {
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
  if (destination?.kind === 'schedule') {
    clauses.push('e.schedule_id = :destinationScheduleId');
    params.destinationScheduleId = int(destination.id);
  } else if (destination) {
    // The main destination, or one of its periods: scans no schedule sent.
    clauses.push('e.schedule_id IS NULL');
    if (destination.from !== undefined && destination.from !== null) {
      clauses.push('e.scanned_at >= :destinationFrom');
      params.destinationFrom = toSqlDateTime(destination.from);
    }
    if (destination.to !== undefined && destination.to !== null) {
      clauses.push('e.scanned_at < :destinationTo');
      params.destinationTo = toSqlDateTime(destination.to);
    }
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

/**
 * A code's main-destination periods (lib/destinationStats.js), from its
 * destination history rows that have started. `code` is `{ id, url,
 * createdAt }`, for a code with no history.
 */
async function codePeriods(code) {
  const history = await rows(
    `SELECT id, destination_url AS url, started_at AS startedAt
     FROM qrcode_destinations
     WHERE qrcode_id = :codeId AND started_at <= UTC_TIMESTAMP()
     ORDER BY started_at, id`,
    { codeId: code.id }
  );
  return mainPeriods(
    history.map((h) => ({ ...h, startedAt: sqlToIso(h.startedAt) })),
    { url: code.url, createdAt: sqlToIso(code.createdAt) }
  );
}

/**
 * A destination filter from parseDestination(), checked against the code and
 * ready for a scope: a period gets its time window as `from` and `to` (ms, to
 * null while it's current). Returns null when the code has no such period. A
 * schedule id isn't checked, so a deleted schedule's scans can still be shown;
 * the scope keeps it to this code's scans.
 */
export async function resolveDestinationFilter(codeId, destination) {
  if (!destination || destination.kind !== 'period') return destination;
  await ensureSchema();
  const [code] = await rows(
    'SELECT id, destination_url AS url, created_at AS createdAt FROM qrcodes WHERE id = :codeId',
    { codeId }
  );
  if (!code) return null;
  const period = (await codePeriods(code)).find((p) => p.id === destination.id);
  return period ? { ...destination, from: period.startedAt, to: period.endedAt } : null;
}

/**
 * SQL that puts a code's scan in its main-destination period: the index of
 * the period it falls in (lib/destinationStats.js periodIndexAt) and that
 * period's URL. Boundaries go in as placeholders.
 */
function periodSql(periods, params) {
  const index = [];
  const url = [];
  periods.forEach((period, i) => {
    params[`periodUrl${i}`] = period.url;
    if (i === periods.length - 1) return;
    params[`periodEnd${i}`] = toSqlDateTime(periods[i + 1].startedAt);
    index.push(`WHEN e.scanned_at < :periodEnd${i} THEN ${i}`);
    url.push(`WHEN e.scanned_at < :periodEnd${i} THEN :periodUrl${i}`);
  });
  const last = periods.length - 1;
  return {
    index: index.length ? `CASE ${index.join(' ')} ELSE ${last} END` : '0',
    url: url.length ? `CASE ${url.join(' ')} ELSE :periodUrl${last} END` : `:periodUrl${last}`,
  };
}

/**
 * The Destinations card for one code over the selected range: scans and
 * unique scanners per main-destination period and per schedule, by the URL
 * they were sent to, plus every period and schedule for the filter. Scans
 * recorded without a URL count toward the period they fall in.
 */
async function destinationBreakdown(code, scope, periods, range, nowMs) {
  const [mainPeriodList, schedules] = await Promise.all([codePeriods(code), getSchedulesForCode(code.id)]);
  const { where, params } = periodWhere({ ...scope, destination: null }, periods.from, periods.to);
  const period = periodSql(mainPeriodList, params);
  const counts = await rows(
    `SELECT CASE WHEN e.schedule_id IS NULL THEN ${period.index} END AS periodIndex,
            e.schedule_id AS scheduleId,
            COALESCE(e.destination_url, ${period.url}) AS url,
            COUNT(*) AS scans, COUNT(DISTINCT e.visitor_hash) AS uniques
     FROM scan_events e ${where}
     GROUP BY periodIndex, scheduleId, url`,
    params
  );
  const allTime = RANGES[range].days === null;
  const breakdown = destinationRows({
    periods: mainPeriodList,
    counts: counts.map((c) => ({
      period: c.periodIndex === null ? null : toNumber(c.periodIndex),
      scheduleId: c.scheduleId === null ? null : toNumber(c.scheduleId),
      url: c.url,
      scans: toNumber(c.scans),
      uniques: toNumber(c.uniques),
    })),
    schedules,
    from: allTime ? null : periods.from,
    to: periods.to,
    nowMs,
  });
  return {
    ...breakdown,
    periods: mainPeriodList.map((p) => ({
      key: p.key,
      url: p.url,
      startedAt: new Date(p.startedAt).toISOString(),
      endedAt: p.endedAt === null ? null : new Date(p.endedAt).toISOString(),
    })),
    scheduleList: schedules.map((s) => ({
      id: s.id,
      key: `schedule-${s.id}`,
      label: s.label,
      kind: s.kind,
      destinationUrl: s.destinationUrl,
      timeZone: s.timeZone,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      days: s.days,
      startTime: s.startTime,
      endTime: s.endTime,
      enabled: s.enabled,
    })),
  };
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
 * `scope` — see the top of this file. A destination filter narrows every
 * panel except Destinations, which always shows them all. `admin` adds Top
 * accounts and code owners. `nowMs` is injectable for tests.
 */
export async function getScanAnalytics({ scope: rawScope, range, offsetMinutes, admin = false, nowMs = Date.now() }) {
  await ensureSchema();
  const scope = normalizeScope(rawScope);

  // The selected code, for the page title (and so admins can open any code).
  let code = null;
  if (scope.codeId !== null) {
    [code] = await rows(
      `SELECT q.id, q.title, q.short_id AS shortId, q.destination_url AS url, q.created_at AS createdAt,
              u.id AS ownerId, u.name AS ownerName, u.email AS ownerEmail
       FROM qrcodes q JOIN users u ON u.id = q.user_id WHERE q.id = :codeId`,
      { codeId: scope.codeId }
    );
    if (!code) return null;
  }

  // Totals across all time: how many scans have details, and since when. Not
  // narrowed to a destination, so the scans without details stay right.
  const unfiltered = { ...scope, destination: null };
  const all = periodWhere(unfiltered, null, null);
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
    allDestinations,
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
    code ? destinationBreakdown(code, scope, periods, range, nowMs) : null,
    // The Destinations card's total, when the rest of the page is narrowed.
    code && scope.destination
      ? (() => {
          const any = periodWhere(unfiltered, periods.from, periods.to);
          return totals(any.where, any.params);
        })()
      : null,
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
    destination: scope.destination?.key ?? null,
    destinations: destinations && {
      main: destinations.main,
      schedules: destinations.schedules,
      total: {
        scans: destinations.scans,
        uniques: scope.destination ? allDestinations.uniques : current.uniques,
      },
      periods: destinations.periods,
      scheduleList: destinations.scheduleList,
    },
  };
}

/**
 * Main-destination periods for several codes at once, for the export:
 * `codes` maps a code id to `{ id, url, createdAt }`. Adds to `cache`.
 */
async function loadPeriods(codes, cache) {
  const ids = [...codes.keys()].filter((id) => !cache.has(id));
  if (ids.length === 0) return;
  const history = await rows(
    `SELECT qrcode_id AS codeId, id, destination_url AS url, started_at AS startedAt
     FROM qrcode_destinations
     WHERE qrcode_id IN (${idList(ids)}) AND started_at <= UTC_TIMESTAMP()
     ORDER BY qrcode_id, started_at, id`
  );
  for (const id of ids) {
    const code = codes.get(id);
    cache.set(
      id,
      mainPeriods(
        history.filter((h) => h.codeId === id).map((h) => ({ ...h, startedAt: sqlToIso(h.startedAt) })),
        { url: code.url, createdAt: sqlToIso(code.createdAt) }
      )
    );
  }
}

/**
 * Human scans in [from, to) for the CSV export, oldest first, in batches so a
 * large export never holds every row in memory.
 *
 * Each row has `destinationUrl`, where the scan was sent, and `scheduleLabel`,
 * the schedule that sent it (null for the main destination, "Deleted
 * schedule" once it's gone). A scan recorded without a URL gets the main
 * destination that was live at the time, as on the dashboard.
 */
export async function* scanEventBatches({ scope, from, to, admin = false }) {
  await ensureSchema();
  const { where, params } = periodWhere(normalizeScope(scope), from, to);
  const periodsByCode = new Map();
  let afterId = 0;
  for (;;) {
    const batch = await rows(
      `SELECT e.id, e.scanned_at AS scannedAt, e.country_code AS countryCode, e.region, e.city,
              e.device_type AS deviceType, e.os, e.browser, e.language,
              q.title AS codeTitle, q.short_id AS shortId,
              e.qrcode_id AS codeId, e.destination_url AS destinationUrl, e.schedule_id AS scheduleId,
              s.label AS scheduleLabel, q.destination_url AS codeUrl, q.created_at AS codeCreatedAt
              ${admin ? ', u.name AS ownerName, u.email AS ownerEmail' : ''}
       FROM scan_events e
       JOIN qrcodes q ON q.id = e.qrcode_id
       LEFT JOIN qrcode_schedules s ON s.id = e.schedule_id
       ${admin ? 'JOIN users u ON u.id = e.user_id' : ''}
       ${where} AND e.id > :afterId
       ORDER BY e.id LIMIT ${EXPORT_BATCH}`,
      { ...params, afterId }
    );
    if (batch.length === 0) return;

    const unrecorded = new Map();
    for (const r of batch) {
      if (r.destinationUrl === null) unrecorded.set(r.codeId, { id: r.codeId, url: r.codeUrl, createdAt: r.codeCreatedAt });
    }
    await loadPeriods(unrecorded, periodsByCode);

    yield batch.map(({ codeId, codeUrl: _url, codeCreatedAt: _created, scheduleId, scheduleLabel, destinationUrl, ...r }) => {
      const scannedAt = sqlToIso(r.scannedAt);
      return {
        ...r,
        scannedAt,
        destinationUrl: destinationUrl ?? mainUrlAt(periodsByCode.get(codeId), scannedAt),
        scheduleLabel: scheduleId === null ? null : (scheduleLabel ?? 'Deleted schedule'),
      };
    });
    if (batch.length < EXPORT_BATCH) return;
    afterId = batch[batch.length - 1].id;
  }
}
