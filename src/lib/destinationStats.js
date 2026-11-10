/**
 * Where one code's scans went, for the Destinations card in analytics, its
 * destination filter and the CSV export's Destination column.
 *
 * A scan went either to the code's main destination or to a schedule's URL.
 * The main destination is split into periods: one per row of the code's
 * destination history that has started, each lasting until the next one
 * starts (a code with no history has one period, since it was created).
 *
 * Scans recorded since destinations were first recorded carry the URL they
 * were sent to and the schedule that sent them (none = the main destination).
 * Older scans carry neither. Schedules didn't exist then, so they went to the
 * main destination, and they count toward the URL of the period they fall in.
 * scanAnalytics.js does the same matching in SQL, so every scan lands in
 * exactly one row and the rows add up to the code's total.
 *
 * Shared by the server and the dashboard, so no server-only imports.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const toMs = (value) => (typeof value === 'number' ? value : Date.parse(value));
const toIso = (ms) => (ms === null ? null : new Date(ms).toISOString());

/**
 * The code's main-destination periods, oldest first, as
 * `{ key, id, url, startedAt, endedAt }` with times in ms (endedAt null for
 * the current one). `history` is the code's started history rows,
 * `{ id, url, startedAt }`, oldest first with ties in id order. With none,
 * the code has pointed at `code.url` since `code.createdAt`.
 *
 * `key` is the period's value for the destination filter: "period-<id>", or
 * "main" when there's only one period, since it then has every main scan.
 */
export function mainPeriods(history, code) {
  if (history.length === 0) {
    return [{ key: 'main', id: null, url: code.url, startedAt: toMs(code.createdAt), endedAt: null }];
  }
  return history.map((row, i) => ({
    key: history.length > 1 ? `period-${row.id}` : 'main',
    id: row.id,
    url: row.url,
    startedAt: toMs(row.startedAt),
    endedAt: i + 1 < history.length ? toMs(history[i + 1].startedAt) : null,
  }));
}

/**
 * Which period a scan at `ms` falls in: the last one that had started. A
 * period's start belongs to it. A scan before the first period counts toward
 * the first, so every scan has one.
 */
export function periodIndexAt(periods, ms) {
  let low = 0;
  let high = periods.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (periods[mid].startedAt <= ms) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** The main destination a scan at `ms` was sent to, for a scan recorded without one. */
export function mainUrlAt(periods, ms) {
  return periods[periodIndexAt(periods, toMs(ms))].url;
}

/** How long [start, end) and [from, to) overlap, in ms. null means no limit. */
function overlapMs(start, end, from, to) {
  const lo = from === null ? start : Math.max(start, from);
  const hi = to === null ? end : Math.min(end, to);
  return Math.max(0, hi - lo);
}

/** Could this schedule send scans during [from, to)? */
function inPlay(schedule, from, to) {
  if (!schedule.enabled) return false;
  if (schedule.kind !== 'range') return true;
  const start = toMs(schedule.startsAt);
  const end = toMs(schedule.endsAt);
  return end > (from ?? -Infinity) && start < to;
}

/**
 * The Destinations card's rows for one code over [from, to) (from null for
 * all time).
 *
 * - `periods`: from mainPeriods().
 * - `counts`: the scans in the range grouped as the SQL groups them:
 *   `{ period, scheduleId, url, scans, uniques }`, where `period` is the
 *   index of the main-destination period (null for a schedule's scans).
 * - `schedules`: the code's schedules as lib/db.js returns them. A scan whose
 *   schedule has since been deleted keeps its id; it shows with `schedule`
 *   null.
 *
 * Returns `{ main, schedules, scans }`:
 * - `main`: one row per period and URL, newest period first. Periods with no
 *   scans show when they overlap the range. `{ key, url, startedAt,
 *   endedAt, current, liveDays, scans, uniques, otherUrl }`; `otherUrl` marks
 *   scans recorded going somewhere other than the period's URL (only possible
 *   within a moment of a change).
 * - `schedules`: one row per schedule and URL, in the schedules' list order,
 *   deleted ones last. Switched-on schedules that could have been live show
 *   even with no scans. `{ key, scheduleId, schedule, url, scans, uniques,
 *   otherUrl }`; `otherUrl` marks scans sent to an earlier URL of the
 *   schedule.
 * - `scans`: every row's scans added up, which is the code's total.
 */
export function destinationRows({ periods, counts, schedules, from, to, nowMs }) {
  const main = new Map(); // `${period}\n${url}` → row
  const bySchedule = new Map(); // scheduleId → Map(url → row)
  let total = 0;

  for (const c of counts) {
    const scans = Number(c.scans) || 0;
    const uniques = Number(c.uniques) || 0;
    total += scans;
    if (c.scheduleId === null || c.scheduleId === undefined) {
      const index = Math.min(Math.max(0, Number(c.period) || 0), periods.length - 1);
      main.set(`${index}\n${c.url}`, { index, url: c.url, scans, uniques });
    } else {
      const id = Number(c.scheduleId);
      if (!bySchedule.has(id)) bySchedule.set(id, new Map());
      bySchedule.get(id).set(c.url, { url: c.url, scans, uniques });
    }
  }

  // Each period's own URL shows when it overlaps the range or got scans.
  periods.forEach((period, index) => {
    const key = `${index}\n${period.url}`;
    if (main.has(key)) return;
    const end = period.endedAt ?? nowMs;
    if (end > period.startedAt && overlapMs(period.startedAt, end, from, to) > 0) {
      main.set(key, { index, url: period.url, scans: 0, uniques: 0 });
    }
  });

  const mainRows = [...main.values()]
    .map(({ index, url, scans, uniques }) => {
      const period = periods[index];
      const end = period.endedAt ?? nowMs;
      return {
        key: period.key,
        url,
        startedAt: toIso(period.startedAt),
        endedAt: toIso(period.endedAt),
        current: period.endedAt === null,
        liveDays: overlapMs(period.startedAt, end, from, Math.min(to, nowMs)) / DAY_MS,
        scans,
        uniques,
        otherUrl: url !== period.url,
        index,
      };
    })
    .sort((a, b) => b.index - a.index || a.otherUrl - b.otherUrl || b.scans - a.scans)
    .map(({ index: _index, ...row }) => row);

  const known = new Map(schedules.map((s) => [s.id, s]));
  for (const s of schedules) {
    if (!bySchedule.has(s.id) && inPlay(s, from, to)) {
      bySchedule.set(s.id, new Map([[s.destinationUrl, { url: s.destinationUrl, scans: 0, uniques: 0 }]]));
    }
  }
  const order = new Map(schedules.map((s, i) => [s.id, i]));
  const scheduleRows = [...bySchedule.entries()]
    .sort(([a], [b]) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || a - b)
    .flatMap(([id, urls]) => {
      const schedule = known.get(id) ?? null;
      return [...urls.values()]
        .map((r) => ({
          key: `schedule-${id}`,
          scheduleId: id,
          schedule,
          url: r.url,
          scans: r.scans,
          uniques: r.uniques,
          otherUrl: schedule !== null && r.url !== schedule.destinationUrl,
        }))
        .sort((a, b) => a.otherUrl - b.otherUrl || b.scans - a.scans);
    });

  return { main: mainRows, schedules: scheduleRows, scans: total };
}
